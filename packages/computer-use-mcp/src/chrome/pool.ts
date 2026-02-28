/**
 * CDP connection pool. Connects to Chrome at port 9222.
 * Supports default client and per-target clients (for TabManager).
 */
// @ts-expect-error no types for chrome-remote-interface
import CDP from 'chrome-remote-interface';
import { logger } from '../logger.js';

export const CDP_PORT = Number(process.env.CDP_PORT) || 9222;

let defaultClient: Awaited<ReturnType<typeof CDP>> | null = null;

export async function getClient(): Promise<Awaited<ReturnType<typeof CDP>>> {
  if (defaultClient) return defaultClient;
  try {
    logger.info('cdp_connect', { port: CDP_PORT });
    defaultClient = await CDP({ port: CDP_PORT });
    logger.info('cdp_connected', { port: CDP_PORT });
    return defaultClient;
  } catch (err) {
    logger.error('cdp_connect_failed', { port: CDP_PORT, error: String((err as Error).message) });
    throw new Error(`Cannot connect to Chrome CDP at port ${CDP_PORT}. Start Chrome with --remote-debugging-port=${CDP_PORT}. Error: ${(err as Error).message}`);
  }
}

/** Create a new browser target (tab). */
export async function createTarget(options: { url?: string } = {}): Promise<{ id: string; target: { id: string } }> {
  const target = await CDP.New({ port: CDP_PORT });
  return { id: target.id, target };
}

/** Connect a CDP client to an existing target. */
export async function connectToTarget(target: { id: string }): Promise<Awaited<ReturnType<typeof CDP>>> {
  const client = await CDP({ port: CDP_PORT, target });
  return client;
}

/** Close a target by id. */
export async function closeTarget(targetId: string): Promise<void> {
  await CDP.Close({ id: targetId });
}

export async function close(): Promise<void> {
  if (defaultClient) {
    logger.debug('cdp_close');
    try {
      await defaultClient.close();
    } catch {
      // ignore
    }
    defaultClient = null;
  }
}
