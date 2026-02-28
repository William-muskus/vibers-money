/**
 * tab_list, tab_open, tab_switch, tab_close — per-agent tab management.
 */
import { z } from 'zod';
import { getIdentity } from '../context.js';
import {
  listTabsForAgent,
  openTabForAgent,
  switchTabForAgent,
  closeTabForAgent,
  getPageForAgent,
} from '../chrome/tab-manager.js';
import { getAnnotatedScreenshot } from '../engine/annotator.js';
import { isAllowed } from '../security/allowlist.js';
import { logger } from '../logger.js';

export function createTabTools() {
  return {
    tab_list: {
      description: 'List your browser tabs. Returns array of targetId.',
      inputSchema: {},
      handler: async () => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'tab_list', agentId });
        const tabs = await listTabsForAgent(agentId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ tabs }, null, 2) }],
        };
      },
    },
    tab_open: {
      description: 'Open a new tab. Optionally navigate to url (must be on approved domain list).',
      inputSchema: { url: z.string().optional().describe('URL to open in the new tab') },
      handler: async (args: { url?: string }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'tab_open', agentId, url: args.url });
        if (args.url && !isAllowed(agentId, args.url)) {
          throw new Error(`URL not on approved domain list: ${args.url}`);
        }
        const targetId = await openTabForAgent(agentId);
        const client = await getPageForAgent(agentId);
        if (args.url && client.Page?.navigate) {
          await client.Page.navigate({ url: args.url });
          await new Promise((r) => setTimeout(r, 1500));
        }
        const result = await getAnnotatedScreenshot(client);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              targetId,
              image: result.image,
              url: result.url,
              title: result.title,
              elements: result.elements,
            }, null, 2),
          }],
        };
      },
    },
    tab_switch: {
      description: 'Switch to another tab by targetId (from tab_list).',
      inputSchema: { target_id: z.string().describe('Target ID from tab_list') },
      handler: async (args: { target_id: string }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'tab_switch', agentId, target_id: args.target_id });
        await switchTabForAgent(agentId, args.target_id);
        const client = await getPageForAgent(agentId);
        const result = await getAnnotatedScreenshot(client);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              image: result.image,
              url: result.url,
              title: result.title,
              elements: result.elements,
            }, null, 2),
          }],
        };
      },
    },
    tab_close: {
      description: 'Close a tab by targetId.',
      inputSchema: { target_id: z.string().describe('Target ID from tab_list') },
      handler: async (args: { target_id: string }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'tab_close', agentId, target_id: args.target_id });
        await closeTabForAgent(agentId, args.target_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ closed: true, target_id: args.target_id }) }],
        };
      },
    },
  };
}
