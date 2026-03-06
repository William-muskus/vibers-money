/**
 * Persist Stripe Connect Express account IDs per business_id.
 * Uses Redis when REDIS_URL is set, otherwise a JSON file under data/ (gitignored).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import Redis from 'ioredis';

const DEFAULT_FILE = join(process.cwd(), 'data', 'stripe-connect.json');
const storePath = process.env.STRIPE_CONNECT_DATA_PATH || DEFAULT_FILE;
const REDIS_PREFIX = 'vibers:stripe_connect:';

export type StoredAccount = { accountId: string };

let redisClient: Redis | null = null;
let redisPromise: Promise<Redis | null> | null = null;

async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL;
  if (!url?.trim()) return null;
  if (redisClient) return redisClient;
  if (redisPromise) return redisPromise;
  redisPromise = (async () => {
    try {
      const client = new Redis(url, { maxRetriesPerRequest: 2 });
      await client.ping();
      redisClient = client;
      return client;
    } catch {
      return null;
    } finally {
      redisPromise = null;
    }
  })();
  return redisPromise;
}

let cache: Record<string, StoredAccount> | null = null;

async function ensureDir(): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
}

export async function getConnectAccountId(businessId: string): Promise<string | null> {
  const redis = await getRedis();
  if (redis) {
    const accountId = await redis.get(`${REDIS_PREFIX}${businessId}`);
    return accountId ?? null;
  }
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
  const redis = await getRedis();
  if (redis) {
    await redis.set(`${REDIS_PREFIX}${businessId}`, accountId);
    return;
  }
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
