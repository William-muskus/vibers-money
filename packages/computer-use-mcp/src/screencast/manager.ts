/**
 * CDP Page.startScreencast -> POST frames to Orchestrator for agent SSE.
 */
import type { CDPClient } from '../engine/annotator.js';
import { logger } from '../logger.js';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';
const FPS = 6;
const FRAME_INTERVAL_MS = 1000 / FPS; // ~166ms
const started = new WeakSet<object>();
const lastFrameTimeByAgent = new Map<string, number>();

export async function startScreencastForAgent(client: CDPClient, agentId: string): Promise<void> {
  if (started.has(client as unknown as object)) return;
  const page = client.Page as { startScreencast?(params: { format: string; quality: number; maxWidth: number; maxHeight: number }): Promise<void>; on?(event: string, cb: (params: { data: string; sessionId: string }) => void): void } | undefined;
  if (!page?.startScreencast) return;
  try {
    await page.startScreencast({
      format: 'jpeg',
      quality: 50,
      maxWidth: 960,
      maxHeight: 540,
    });
    started.add(client as unknown as object);
    logger.info('screencast_started', { agentId });
    page.on?.('Page.screencastFrame', (params: { data: string; sessionId: string }) => {
      const now = Date.now();
      const last = lastFrameTimeByAgent.get(agentId) ?? 0;
      const p = client.Page as { screencastFrameAck?(params: { sessionId: string }): Promise<void> };
      p.screencastFrameAck?.({ sessionId: params.sessionId }).catch(() => {});
      if (now - last < FRAME_INTERVAL_MS) return;
      lastFrameTimeByAgent.set(agentId, now);
      logger.debug('screencast_frame', { agentId, frameLength: params.data?.length });
      fetch(`${ORCHESTRATOR_URL}/api/agents/${encodeURIComponent(agentId)}/screencast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: params.data }),
      }).catch(() => {});
    });
  } catch (err) {
    logger.warn('screencast_start_failed', { agentId, error: String((err as Error).message) });
  }
}
