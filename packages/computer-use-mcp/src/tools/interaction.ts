/**
 * click, type (P0). Uses CDP Input domain. Click uses Bezier cursor movement.
 */
import { z } from 'zod';
import { getIdentity } from '../context.js';
import { getPageForAgent } from '../chrome/tab-manager.js';
import { getAnnotatedScreenshot, getElementCenter } from '../engine/annotator.js';
import type { CDPClient } from '../engine/annotator.js';
import { logger } from '../logger.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const lastCursorByAgent = new Map<string, { x: number; y: number }>();

/** Cubic Bezier from (0,0) to (1,1) with control points. t in [0,1]. */
function bezierPoint(t: number, cpx1: number, cpy1: number, cpx2: number, cpy2: number): number {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return 3 * mt2 * t * cpx1 + 3 * mt * t2 * cpx2 + t3;
}

async function bezierMove(
  client: CDPClient,
  agentId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  const input = client.Input;
  if (!input) return;
  const steps = 15 + Math.floor(Math.random() * 11);
  const durationMs = 300 + Math.floor(Math.random() * 301);
  const stepMs = durationMs / steps;
  const cpx1 = 0.2 + Math.random() * 0.3;
  const cpy1 = 0.1 + Math.random() * 0.4;
  const cpx2 = 0.6 + Math.random() * 0.3;
  const cpy2 = 0.5 + Math.random() * 0.4;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const bx = bezierPoint(t, cpx1, cpy1, cpx2, cpy2);
    const by = bezierPoint(t, cpy1, cpx1, cpy2, cpx2);
    const x = Math.round(fromX + (toX - fromX) * bx);
    const y = Math.round(fromY + (toY - fromY) * by);
    await input.dispatchMouseEvent({
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      clickCount: 0,
    });
    await sleep(stepMs);
  }
  lastCursorByAgent.set(agentId, { x: toX, y: toY });
}

export function createInteractionTools() {
  return {
    click: {
      description: 'Click element by annotation number. Human-like cursor motion.',
      inputSchema: { element_id: z.number().describe('Number from screenshot elements list') },
      handler: async (args: { element_id: number }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'click', agentId, element_id: args.element_id });
        const client = await getPageForAgent(agentId);
        const screenshot = await getAnnotatedScreenshot(client);
        const center = getElementCenter(args.element_id, screenshot.elements);
        if (!center) throw new Error(`Element ${args.element_id} not found`);
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        const last = lastCursorByAgent.get(agentId);
        const fromX = last?.x ?? center.x;
        const fromY = last?.y ?? center.y;
        await bezierMove(client, agentId, fromX, fromY, center.x, center.y);
        await input.dispatchMouseEvent({
          type: 'mousePressed',
          x: center.x,
          y: center.y,
          button: 'left',
          clickCount: 1,
        });
        await sleep(80);
        await input.dispatchMouseEvent({
          type: 'mouseReleased',
          x: center.x,
          y: center.y,
          button: 'left',
          clickCount: 1,
        });
        await sleep(500);
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
    type: {
      description: 'Type text with human-like timing. Click an input first to focus it.',
      inputSchema: {
        text: z.string().describe('Text to type'),
        clear_first: z.boolean().optional().describe('Clear field before typing'),
      },
      handler: async (args: { text: string; clear_first?: boolean }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'type', agentId, textLength: args.text?.length });
        const client = await getPageForAgent(agentId);
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        const text = args.text ?? '';
        for (const char of text) {
          await input.dispatchKeyEvent({
            type: 'keyChar',
            text: char,
          });
          await sleep(30 + Math.random() * 90);
        }
        await sleep(300);
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
