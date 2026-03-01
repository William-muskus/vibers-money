import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  flattenFrameTree,
  getElementCenter,
  getAnnotatedScreenshot,
  type CDPClient,
  type CDPFrameTree,
  type ElementInfo,
} from '../src/engine/annotator.js';

describe('annotator flattenFrameTree', () => {
  it('returns empty array for undefined tree', () => {
    expect(flattenFrameTree(undefined)).toEqual([]);
  });

  it('returns empty array for tree without frame', () => {
    expect(flattenFrameTree({})).toEqual([]);
  });

  it('returns main frame only when no children', () => {
    const tree: CDPFrameTree = { frame: { id: 'main', url: 'https://example.com' } };
    expect(flattenFrameTree(tree)).toEqual([{ id: 'main', url: 'https://example.com' }]);
  });

  it('returns main frame and first-level children in order', () => {
    const tree: CDPFrameTree = {
      frame: { id: 'main' },
      childFrames: [
        { frame: { id: 'child1' } },
        { frame: { id: 'child2' } },
      ],
    };
    expect(flattenFrameTree(tree)).toHaveLength(3);
    expect(flattenFrameTree(tree)[0].id).toBe('main');
    expect(flattenFrameTree(tree)[1].id).toBe('child1');
    expect(flattenFrameTree(tree)[2].id).toBe('child2');
  });

  it('caps child frames at MAX_CHILD_FRAMES (10)', () => {
    const childFrames = Array.from({ length: 15 }, (_, i) => ({ frame: { id: `child${i}` } }));
    const tree: CDPFrameTree = { frame: { id: 'main' }, childFrames };
    const flat = flattenFrameTree(tree);
    expect(flat).toHaveLength(11);
    expect(flat[0].id).toBe('main');
    expect(flat[10].id).toBe('child9');
  });
});

describe('annotator getElementCenter', () => {
  it('returns null for empty elements', () => {
    expect(getElementCenter(1, [])).toBeNull();
  });

  it('returns null when element id not found', () => {
    const elements: ElementInfo[] = [{ id: 1, tag: 'button', text: 'OK', type: null, x: 10, y: 20, w: 100, h: 40 }];
    expect(getElementCenter(2, elements)).toBeNull();
  });

  it('returns viewport center of element (x + w/2, y + h/2)', () => {
    const elements: ElementInfo[] = [{ id: 1, tag: 'button', text: 'OK', type: null, x: 10, y: 20, w: 100, h: 40 }];
    expect(getElementCenter(1, elements)).toEqual({ x: 60, y: 40 });
  });
});

describe('annotator getAnnotatedScreenshot', () => {
  it('returns main-frame elements and screenshot when no frame tree (fallback)', async () => {
    const elementsJson = JSON.stringify([{ tag: 'button', text: 'Click', type: null, x: 50, y: 100, w: 80, h: 30 }]);
    const client: CDPClient = {
      Page: {
        getFrameTree: vi.fn().mockResolvedValue({ frameTree: undefined }),
        captureScreenshot: vi.fn().mockResolvedValue({ data: 'base64placeholder' }),
      },
      Runtime: {
        enable: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation((params: { expression: string }) => {
          if (params.expression.includes('querySelectorAll')) {
            return Promise.resolve({ result: { type: 'string', value: elementsJson } });
          }
          if (params.expression.includes('iframe')) {
            return Promise.resolve({ result: { type: 'string', value: '[]' } });
          }
          return Promise.resolve({ result: { type: 'string', value: '' } });
        }),
      },
    };
    const result = await getAnnotatedScreenshot(client);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].x).toBe(50);
    expect(result.elements[0].y).toBe(100);
    expect(result.elements[0].tag).toBe('button');
    expect(result.image).toBe('base64placeholder');
  });

  it('uses viewport coordinates (no scroll) for main frame elements', async () => {
    const elementsJson = JSON.stringify([
      { tag: 'input', text: '', type: 'text', x: 10, y: 20, w: 200, h: 24 },
    ]);
    const client: CDPClient = {
      Page: {
        getFrameTree: vi.fn().mockResolvedValue({ frameTree: { frame: { id: 'main' } } }),
        captureScreenshot: vi.fn().mockResolvedValue({ data: 'base64placeholder' }),
      },
      Runtime: {
        enable: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation((params: { expression: string }) => {
          if (params.expression.includes('querySelectorAll')) {
            return Promise.resolve({ result: { type: 'string', value: elementsJson } });
          }
          if (params.expression.includes('iframe')) {
            return Promise.resolve({ result: { type: 'string', value: '[]' } });
          }
          return Promise.resolve({ result: { type: 'string', value: '' } });
        }),
      },
    };
    const result = await getAnnotatedScreenshot(client);
    expect(result.elements[0].x).toBe(10);
    expect(result.elements[0].y).toBe(20);
  });
});
