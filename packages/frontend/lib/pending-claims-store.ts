/**
 * Pending claims: after Stripe checkout we store payer email -> business_ids.
 * When the user signs in (with that email), we link those businesses to their account.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import Redis from 'ioredis';

const DEFAULT_FILE = join(process.cwd(), 'data', 'pending-claims.json');
const storePath = process.env.PENDING_CLAIMS_DATA_PATH || DEFAULT_FILE;
const REDIS_PREFIX = 'vibers:pending_claims:';

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

let cache: Record<string, string[]> | null = null;

async function ensureDir(): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
}

function normalizeEmail(email: string): string {
  return email?.trim()?.toLowerCase() ?? '';
}

export async function addPendingClaim(email: string, businessId: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key || !businessId?.trim()) return;
  const id = businessId.trim();
  const redis = await getRedis();
  if (redis) {
    await redis.sadd(`${REDIS_PREFIX}${key}`, id);
    return;
  }
  if (cache === null) {
    try {
      const raw = await readFile(storePath, 'utf-8');
      cache = JSON.parse(raw) as Record<string, string[]>;
    } catch {
      cache = {};
    }
  }
  if (!cache[key]) cache[key] = [];
  if (!cache[key].includes(id)) cache[key].push(id);
  await ensureDir();
  await writeFile(storePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export async function getPendingClaims(email: string): Promise<string[]> {
  const key = normalizeEmail(email);
  if (!key) return [];
  const redis = await getRedis();
  if (redis) {
    const ids = await redis.smembers(`${REDIS_PREFIX}${key}`);
    return ids ?? [];
  }
  if (cache === null) {
    try {
      const raw = await readFile(storePath, 'utf-8');
      cache = JSON.parse(raw) as Record<string, string[]>;
    } catch {
      return [];
    }
  }
  return cache[key] ?? [];
}

export async function clearPendingClaims(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;
  const redis = await getRedis();
  if (redis) {
    await redis.del(`${REDIS_PREFIX}${key}`);
    return;
  }
  if (cache === null) {
    try {
      const raw = await readFile(storePath, 'utf-8');
      cache = JSON.parse(raw) as Record<string, string[]>;
    } catch {
      cache = {};
    }
  }
  delete cache[key];
  await ensureDir();
  await writeFile(storePath, JSON.stringify(cache, null, 2), 'utf-8');
}
