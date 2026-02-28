/**
 * screenshot, get_page_info
 */
import { getIdentity } from '../context.js';
import { getPageForAgent } from '../chrome/tab-manager.js';
import { getAnnotatedScreenshot, getPageInfo } from '../engine/annotator.js';
import { logger } from '../logger.js';

export function createVisionTools() {
  return {
    screenshot: {
      description: 'Take an annotated screenshot. Every interactive element is labeled with a number. Returns the image and a text element list.',
      inputSchema: {},
      handler: async () => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'screenshot', agentId });
        const client = await getPageForAgent(agentId);
        const result = await getAnnotatedScreenshot(client);
        logger.debug('screenshot_done', { agentId, elementCount: result.elements?.length });
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
    get_page_info: {
      description: 'Get current page URL, title, and frames. No screenshot.',
      inputSchema: {},
      handler: async () => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'get_page_info', agentId });
        const client = await getPageForAgent(agentId);
        const info = await getPageInfo(client);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
        };
      },
    },
  };
}
