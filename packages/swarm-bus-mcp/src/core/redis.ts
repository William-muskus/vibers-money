/**
 * Redis client for swarm-bus persistence. When REDIS_URL is unset, getRedis() returns null
 * and callers use in-memory fallback (local dev).
 */
import { Redis } from 'ioredis';
import { logger } from '../logger.js';

let client: Redis | null = null;
let connectPromise: Promise<Redis | null> | null = null;

export async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === '') return null;
  if (client) return client;
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    try {
      client = new Redis(url, { maxRetriesPerRequest: 2 });
      client.on('error', (err: Error) => logger.warn('redis_error', { error: String(err.message) }));
      await client.ping();
      logger.info('redis_connected', {});
      return client;
    } catch (err) {
      logger.warn('redis_connect_failed', { error: String((err as Error).message) });
      client = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();
  return connectPromise;
}

export function isRedisEnabled(): boolean {
  const url = process.env.REDIS_URL;
  return !!url && url.trim() !== '';
}
