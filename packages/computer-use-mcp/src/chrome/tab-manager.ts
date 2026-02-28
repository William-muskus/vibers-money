/**
 * Per-agent tab ownership. Each agent has one or more CDP targets (tabs); one is active.
 */
import type { CDPClient } from '../engine/annotator.js';
import { createTarget, connectToTarget, closeTarget } from './pool.js';
import { startScreencastForAgent } from '../screencast/manager.js';
import { logger } from '../logger.js';

interface TabEntry {
  targetId: string;
  target: { id: string };
  client: Awaited<ReturnType<typeof connectToTarget>>;
}

interface AgentTabs {
  tabs: TabEntry[];
  activeIndex: number;
}

const agentTabs = new Map<string, AgentTabs>();

async function ensurePageEnabled(client: Awaited<ReturnType<typeof connectToTarget>>): Promise<void> {
  const page = (client as unknown as { Page?: { enable?(): Promise<void> } }).Page;
  await page?.enable?.();
}

/** Get the active page client for an agent. Creates one tab if none exist. */
export async function getPageForAgent(agentId: string): Promise<CDPClient> {
  let state = agentTabs.get(agentId);
  if (!state || state.tabs.length === 0) {
    const { id: targetId, target } = await createTarget();
    const newClient = await connectToTarget(target);
    await ensurePageEnabled(newClient);
    state = { tabs: [{ targetId, target, client: newClient }], activeIndex: 0 };
    agentTabs.set(agentId, state);
    logger.info('tab_created_for_agent', { agentId, targetId });
    const client = newClient as unknown as CDPClient;
    startScreencastForAgent(client, agentId).catch(() => {});
    return client;
  }
  const tab = state.tabs[state.activeIndex];
  const client = tab.client as unknown as CDPClient;
  startScreencastForAgent(client, agentId).catch(() => {});
  return client;
}

/** List tabs for an agent. Returns array of { targetId }. */
export async function listTabsForAgent(agentId: string): Promise<{ targetId: string }[]> {
  const state = agentTabs.get(agentId);
  if (!state) return [];
  return state.tabs.map((t) => ({ targetId: t.targetId }));
}

/** Open a new tab for the agent. Optionally navigate to url. Returns targetId. */
export async function openTabForAgent(agentId: string, url?: string): Promise<string> {
  const { id: targetId, target } = await createTarget({ url });
  const client = await connectToTarget(target);
  await ensurePageEnabled(client);
  let state = agentTabs.get(agentId);
  if (!state) {
    state = { tabs: [], activeIndex: 0 };
    agentTabs.set(agentId, state);
  }
  state.tabs.push({ targetId, target, client });
  state.activeIndex = state.tabs.length - 1;
  logger.info('tab_open', { agentId, targetId, url });
  return targetId;
}

/** Switch agent's active tab to the given targetId. */
export async function switchTabForAgent(agentId: string, targetId: string): Promise<void> {
  const state = agentTabs.get(agentId);
  if (!state) throw new Error('No tabs for agent');
  const idx = state.tabs.findIndex((t) => t.targetId === targetId);
  if (idx === -1) throw new Error('Tab not found');
  state.activeIndex = idx;
  logger.debug('tab_switch', { agentId, targetId });
}

/** Close a tab and remove it from the agent's list. */
export async function closeTabForAgent(agentId: string, targetId: string): Promise<void> {
  const state = agentTabs.get(agentId);
  if (!state) throw new Error('No tabs for agent');
  const idx = state.tabs.findIndex((t) => t.targetId === targetId);
  if (idx === -1) throw new Error('Tab not found');
  const [entry] = state.tabs.splice(idx, 1);
  try {
    await closeTarget(entry.targetId);
  } catch (err) {
    logger.warn('tab_close_failed', { agentId, targetId, error: String((err as Error).message) });
  }
  if (state.activeIndex >= state.tabs.length) state.activeIndex = Math.max(0, state.tabs.length - 1);
  logger.info('tab_close', { agentId, targetId });
}
