/**
 * navigate, wait
 */
import { z } from 'zod';
import { getIdentity } from '../context.js';
import { isAllowed } from '../security/allowlist.js';
import { getPageForAgent } from '../chrome/tab-manager.js';
import { getAnnotatedScreenshot } from '../engine/annotator.js';
import { logger } from '../logger.js';

export function createNavigationTools() {
  return {
    navigate: {
      description: 'Navigate to a URL. Must be on your approved domain list.',
      inputSchema: { url: z.string().describe('Full URL to open') },
      handler: async (args: { url: string }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'navigate', agentId, url: args.url });
        if (!isAllowed(agentId, args.url)) {
          throw new Error(`URL not on approved domain list for this agent: ${args.url}`);
        }
        const client = await getPageForAgent(agentId);
        const page = client.Page;
        if (!page?.navigate) throw new Error('CDP Page not available');
        await page.navigate({ url: args.url });
        logger.debug('navigate_done', { agentId, url: args.url });
        await new Promise((r) => setTimeout(r, 1500));
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
    wait: {
      description: 'Wait for page update, then take new annotated screenshot.',
      inputSchema: { seconds: z.number().optional().describe('Default: 2') },
      handler: async (args: { seconds?: number }) => {
        const { agentId } = getIdentity();
        const sec = args.seconds ?? 2;
        logger.info('tool', { tool: 'wait', agentId, seconds: sec });
        await new Promise((r) => setTimeout(r, sec * 1000));
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
  };
}
