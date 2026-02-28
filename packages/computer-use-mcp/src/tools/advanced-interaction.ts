/**
 * double_click, hover, press, scroll, drag, drag_offset, select_option.
 */
import { z } from 'zod';
import { getIdentity } from '../context.js';
import { getPageForAgent } from '../chrome/tab-manager.js';
import { getAnnotatedScreenshot, getElementCenter } from '../engine/annotator.js';
import type { CDPClient } from '../engine/annotator.js';
import type { ElementInfo } from '../engine/annotator.js';
import { logger } from '../logger.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function doClick(
  client: CDPClient,
  elementId: number,
  elements: ElementInfo[],
  clickCount: number,
): Promise<void> {
  const center = getElementCenter(elementId, elements);
  if (!center) throw new Error(`Element ${elementId} not found`);
  const input = client.Input;
  if (!input) throw new Error('CDP Input not available');
  await input.dispatchMouseEvent({
    type: 'mousePressed',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount,
  });
  await sleep(80);
  await input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: center.x,
    y: center.y,
    button: 'left',
    clickCount,
  });
  await sleep(300);
}

export function createAdvancedInteractionTools() {
  return {
    double_click: {
      description: 'Double-click element by annotation number.',
      inputSchema: { element_id: z.number().describe('Number from screenshot elements list') },
      handler: async (args: { element_id: number }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'double_click', agentId, element_id: args.element_id });
        const client = await getPageForAgent(agentId);
        const screenshot = await getAnnotatedScreenshot(client);
        await doClick(client, args.element_id, screenshot.elements, 2);
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
    hover: {
      description: 'Move mouse over element by annotation number (hover).',
      inputSchema: { element_id: z.number().describe('Number from screenshot elements list') },
      handler: async (args: { element_id: number }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'hover', agentId, element_id: args.element_id });
        const client = await getPageForAgent(agentId);
        const screenshot = await getAnnotatedScreenshot(client);
        const center = getElementCenter(args.element_id, screenshot.elements);
        if (!center) throw new Error(`Element ${args.element_id} not found`);
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        await input.dispatchMouseEvent({
          type: 'mouseMoved',
          x: center.x,
          y: center.y,
          button: 'none',
          clickCount: 0,
        });
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
    press: {
      description: 'Press a key (Enter, Tab, Escape, Backspace, etc.). Use "type" for text.',
      inputSchema: { key: z.string().describe('Key name: Enter, Tab, Escape, Backspace, ArrowDown, etc.') },
      handler: async (args: { key: string }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'press', agentId, key: args.key });
        const client = await getPageForAgent(agentId);
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        const key = args.key ?? 'Enter';
        await (input as unknown as { dispatchKeyEvent(p: { type: string; key?: string }): Promise<void> }).dispatchKeyEvent({ type: 'rawKeyDown', key });
        await sleep(30);
        await (input as unknown as { dispatchKeyEvent(p: { type: string; key?: string }): Promise<void> }).dispatchKeyEvent({ type: 'keyUp', key });
        await sleep(200);
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
    scroll: {
      description: 'Scroll the page by delta pixels. Positive deltaY = scroll down.',
      inputSchema: {
        delta_x: z.number().optional().describe('Horizontal scroll (default 0)'),
        delta_y: z.number().optional().describe('Vertical scroll (default 300)'),
      },
      handler: async (args: { delta_x?: number; delta_y?: number }) => {
        const { agentId } = getIdentity();
        const dx = args.delta_x ?? 0;
        const dy = args.delta_y ?? 300;
        logger.info('tool', { tool: 'scroll', agentId, delta_x: dx, delta_y: dy });
        const client = await getPageForAgent(agentId);
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        const page = client.Page as { getLayoutMetrics?(): Promise<{ layoutViewport?: { clientWidth: number; clientHeight: number } }> } | undefined;
        let x = 400;
        let y = 300;
        if (page?.getLayoutMetrics) {
          const m = await page.getLayoutMetrics();
          if (m.layoutViewport) {
            x = m.layoutViewport.clientWidth / 2;
            y = m.layoutViewport.clientHeight / 2;
          }
        }
        await (input as unknown as { dispatchMouseEvent(params: { type: string; x: number; y: number; deltaX?: number; deltaY?: number; button: string; clickCount: number }): Promise<void> }).dispatchMouseEvent({
          type: 'mouseWheel',
          x,
          y,
          deltaX: dx,
          deltaY: dy,
          button: 'none',
          clickCount: 0,
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
    drag: {
      description: 'Drag from source element to target element by annotation numbers.',
      inputSchema: {
        from_element_id: z.number(),
        to_element_id: z.number(),
      },
      handler: async (args: { from_element_id: number; to_element_id: number }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'drag', agentId, from: args.from_element_id, to: args.to_element_id });
        const client = await getPageForAgent(agentId);
        const screenshot = await getAnnotatedScreenshot(client);
        const from = getElementCenter(args.from_element_id, screenshot.elements);
        const to = getElementCenter(args.to_element_id, screenshot.elements);
        if (!from || !to) throw new Error('Element not found');
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        await input.dispatchMouseEvent({ type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
        await sleep(50);
        await input.dispatchMouseEvent({ type: 'mouseMoved', x: to.x, y: to.y, button: 'left', clickCount: 0 });
        await sleep(100);
        await input.dispatchMouseEvent({ type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
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
    drag_offset: {
      description: 'Drag from element by pixel offset (delta_x, delta_y).',
      inputSchema: {
        element_id: z.number(),
        delta_x: z.number(),
        delta_y: z.number(),
      },
      handler: async (args: { element_id: number; delta_x: number; delta_y: number }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'drag_offset', agentId, element_id: args.element_id });
        const client = await getPageForAgent(agentId);
        const screenshot = await getAnnotatedScreenshot(client);
        const from = getElementCenter(args.element_id, screenshot.elements);
        if (!from) throw new Error(`Element ${args.element_id} not found`);
        const to = { x: from.x + args.delta_x, y: from.y + args.delta_y };
        const input = client.Input;
        if (!input) throw new Error('CDP Input not available');
        await input.dispatchMouseEvent({ type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
        await sleep(50);
        await input.dispatchMouseEvent({ type: 'mouseMoved', x: to.x, y: to.y, button: 'left', clickCount: 0 });
        await sleep(100);
        await input.dispatchMouseEvent({ type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
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
    select_option: {
      description: 'Select an option in a dropdown (select element) by element_id and option value.',
      inputSchema: {
        element_id: z.number().describe('Annotation number of the select element from screenshot'),
        value: z.string().describe('Option value attribute to select'),
      },
      handler: async (args: { element_id: number; value: string }) => {
        const { agentId } = getIdentity();
        logger.info('tool', { tool: 'select_option', agentId, element_id: args.element_id, value: args.value });
        const client = await getPageForAgent(agentId);
        const runtime = client.Runtime;
        if (!runtime?.evaluate) throw new Error('CDP Runtime not available');
        const selector = 'a[href],button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"],[contenteditable="true"],[onclick],[tabindex],label,summary';
        const idx = args.element_id - 1;
        const expr = `(function(){ const list = Array.from(document.querySelectorAll("${selector}")).filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.display!=="none" && s.visibility!=="hidden"; }); const el = list[${idx}]; if(!el || el.tagName !== "SELECT") return "element not found or not a select"; el.value = ${JSON.stringify(args.value)}; el.dispatchEvent(new Event("change", { bubbles: true })); return "ok"; })()`;
        const { result } = await runtime.evaluate({ expression: expr });
        if (result.type === 'string' && result.value && result.value !== 'ok') {
          throw new Error(result.value);
        }
        await sleep(300);
        const result2 = await getAnnotatedScreenshot(client);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              image: result2.image,
              url: result2.url,
              title: result2.title,
              elements: result2.elements,
            }, null, 2),
          }],
        };
      },
    },
  };
}
