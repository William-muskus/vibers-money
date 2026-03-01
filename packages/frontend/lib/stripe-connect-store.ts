/**
 * Persist Stripe Connect Express account IDs per business_id.
 * Uses a JSON file under project root data/ (gitignored). For serverless/production
 * you may replace this with a DB or external store via env.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DEFAULT_FILE = join(process.cwd(), 'data', 'stripe-connect.json');

const storePath = process.env.STRIPE_CONNECT_DATA_PATH || DEFAULT_FILE;

export type StoredAccount = { accountId: string };

let cache: Record<string, StoredAccount> | null = null;

async function ensureDir(): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
}

export async function getConnectAccountId(businessId: string): Promise<string | null> {
  if (cache !== null) return cache[businessId]?.accountId ?? null;
  try {
    const raw = await readFile(storePath, 'utf-8');
    cache = JSON.parse(raw) as Record<string, StoredAccount>;
    return cache[businessId]?.accountId ?? null;
  } catch {
    cache = {};
    return null;
  }
}

export async function setConnectAccountId(businessId: string, accountId: string): Promise<void> {
  if (cache === null) {
    try {
      const raw = await readFile(storePath, 'utf-8');
      cache = JSON.parse(raw) as Record<string, StoredAccount>;
    } catch {
      cache = {};
    }
  }
  cache[businessId] = { accountId };
  await ensureDir();
  await writeFile(storePath, JSON.stringify(cache, null, 2), 'utf-8');
}
