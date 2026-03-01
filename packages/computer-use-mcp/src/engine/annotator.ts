/**
 * Annotated screenshot: DOM query for interactive elements + canvas overlay with numbered markers.
 */
import { createCanvas, loadImage } from 'canvas';

/** Frame tree from Page.getFrameTree (nested). */
export interface CDPFrameTree {
  frame?: { id?: string; url?: string };
  childFrames?: CDPFrameTree[];
}

export interface CDPClient {
  Page?: {
    captureScreenshot(params: { format: string; quality?: number }): Promise<{ data: string }>;
    getFrameTree?(): Promise<{ frameTree?: CDPFrameTree }>;
    navigate?(params: { url: string }): Promise<void>;
  };
  Runtime?: {
    enable?(): Promise<void>;
    evaluate(params: { expression: string; executionContextId?: number }): Promise<{ result: { type: string; value?: string } }>;
  };
  Input?: {
    dispatchMouseEvent(params: { type: string; x: number; y: number; button: string; clickCount: number }): Promise<void>;
    dispatchKeyEvent(params: { type: string; text?: string }): Promise<void>;
  };
}

export interface ElementInfo {
  id: number;
  tag: string;
  text: string;
  type: string | null;
  placeholder?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  frame?: string;
}

const INTERACTIVE_SELECTOR = [
  'a[href]', 'button', 'input', 'textarea', 'select',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="checkbox"]',
  '[role="radio"]', '[contenteditable="true"]', '[onclick]', '[tabindex]',
  'label', 'summary', 'img[src*="captcha"]', 'canvas',
].join(',');

/** Viewport-relative element query (getBoundingClientRect = viewport coords). */
const QUERY_SCRIPT = `
(function() {
  const sel = ${JSON.stringify(INTERACTIVE_SELECTOR)};
  const list = Array.from(document.querySelectorAll(sel))
    .filter(el => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0
        && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
    })
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || el.alt || el.title || el.placeholder || '').slice(0, 80),
        type: el.type || null,
        placeholder: el.placeholder || null,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height)
      };
    });
  return JSON.stringify(list);
})();
`;

/** Returns iframe elements' viewport rects in document order (main frame only). */
const IFRAME_RECTS_SCRIPT = `
(function() {
  const iframes = Array.from(document.querySelectorAll('iframe'));
  return JSON.stringify(iframes.map(f => {
    const r = f.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }));
})();
`;

const MAX_CHILD_FRAMES = 10;

/** Flatten frame tree to [mainFrame, child1, child2, ...] (first-level children only). Exported for tests. */
export function flattenFrameTree(tree: CDPFrameTree | undefined): Array<{ id?: string }> {
  if (!tree?.frame) return [];
  const out: Array<{ id?: string }> = [tree.frame];
  const children = tree.childFrames ?? [];
  for (let i = 0; i < Math.min(children.length, MAX_CHILD_FRAMES); i++) {
    const childFrame = children[i]?.frame;
    if (childFrame) out.push(childFrame);
  }
  return out;
}

/** Collect execution context IDs per frame after Runtime.enable. */
async function getFrameContextIds(
  client: CDPClient,
): Promise<Map<string, number>> {
  const runtime = client.Runtime;
  const enable = runtime?.enable;
  if (!enable) return new Map();
  const clientWithEvents = client as CDPClient & { on?(event: string, handler: (p: unknown) => void): void };
  const map = new Map<string, number>();
  await new Promise<void>((resolve) => {
    const handler = (p: unknown) => {
      const params = p as { context?: { id: number; auxData?: { frameId?: string } } };
      const id = params.context?.id;
      const frameId = params.context?.auxData?.frameId;
      if (id !== undefined && frameId) map.set(frameId, id);
    };
    clientWithEvents.on?.('Runtime.executionContextCreated', handler);
    enable()
      .then(() => setTimeout(resolve, 80))
      .catch(() => setTimeout(resolve, 50));
  });
  return map;
}

function parseElementList(json: string, viewportOffsetX: number, viewportOffsetY: number, frameId?: string): Array<Omit<ElementInfo, 'id'>> {
  try {
    const arr = JSON.parse(json) as Array<Record<string, unknown>>;
    return arr.map((el) => ({
      tag: String(el.tag ?? 'unknown'),
      text: String(el.text ?? ''),
      type: (el.type as string | null) ?? null,
      placeholder: (el.placeholder as string | null | undefined) ?? null,
      x: (Number(el.x) || 0) + viewportOffsetX,
      y: (Number(el.y) || 0) + viewportOffsetY,
      w: Number(el.w) || 0,
      h: Number(el.h) || 0,
      frame: frameId,
    }));
  } catch {
    return [];
  }
}

export async function getAnnotatedScreenshot(client: CDPClient): Promise<{
  image: string;
  elements: ElementInfo[];
  url: string;
  title: string;
}> {
  const [page, runtime] = [client.Page, client.Runtime];
  if (!page || !runtime) throw new Error('CDP Page or Runtime not available');

  const frameTreeResult = await page.getFrameTree?.().catch(() => ({ frameTree: undefined }));
  const frames = flattenFrameTree(frameTreeResult?.frameTree);
  const mainFrameId = frames[0]?.id ?? null;
  const childFrames = frames.slice(1);
  const hasIframes = childFrames.length > 0;

  let allParts: Array<Omit<ElementInfo, 'id'>> = [];
  let iframeRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  let mainContextId: number | undefined;

  if (!hasIframes) {
    // Fast path: no iframes — main frame only, no Runtime.enable / context collection
    try {
      const { result } = await runtime.evaluate({ expression: QUERY_SCRIPT });
      if (result.type === 'string' && result.value) {
        allParts.push(...parseElementList(result.value, 0, 0, mainFrameId ?? undefined));
      }
    } catch {
      // non-fatal
    }
  } else {
    // Multi-frame path: iframes (e.g. captcha) present — enable Runtime, collect contexts, query all frames
    await runtime.enable?.();
    const contextIds = await getFrameContextIds(client);
    mainContextId = mainFrameId ? contextIds.get(mainFrameId) : undefined;

    try {
      const evalParams = mainContextId !== undefined ? { expression: QUERY_SCRIPT, executionContextId: mainContextId } : { expression: QUERY_SCRIPT };
      const { result } = await runtime.evaluate(evalParams);
      if (result.type === 'string' && result.value) {
        allParts.push(...parseElementList(result.value, 0, 0, mainFrameId ?? undefined));
      }
      const rectsParams = mainContextId !== undefined ? { expression: IFRAME_RECTS_SCRIPT, executionContextId: mainContextId } : { expression: IFRAME_RECTS_SCRIPT };
      const rectsResult = await runtime.evaluate(rectsParams);
      if (rectsResult.result.type === 'string' && rectsResult.result.value) {
        try {
          iframeRects = JSON.parse(rectsResult.result.value) as Array<{ x: number; y: number; w: number; h: number }>;
        } catch {
          // ignore
        }
      }
    } catch {
      // non-fatal
    }

    for (let i = 0; i < childFrames.length && i < iframeRects.length; i++) {
      const frame = childFrames[i];
      const ctxId = frame?.id ? contextIds.get(frame.id) : undefined;
      const rect = iframeRects[i];
      if (ctxId === undefined || !rect) continue;
      try {
        const { result } = await runtime.evaluate({ expression: QUERY_SCRIPT, executionContextId: ctxId });
        if (result.type === 'string' && result.value) {
          const parts = parseElementList(result.value, rect.x, rect.y, frame?.id);
          allParts.push(...parts);
        }
      } catch {
        // cross-origin or unavailable frame
      }
    }
  }

  let id = 0;
  const elList: ElementInfo[] = allParts.map((p) => ({
    id: ++id,
    tag: p.tag,
    text: p.text,
    type: p.type,
    placeholder: p.placeholder,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    frame: p.frame,
  }));

  const { data } = await page.captureScreenshot({ format: 'jpeg', quality: 85 });

  let imageWithOverlay = data;
  if (elList.length > 0) {
    try {
      const img = await loadImage(Buffer.from(data, 'base64'));
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const markerRadius = Math.max(12, Math.min(20, Math.min(img.width, img.height) / 80));
      ctx.font = `bold ${Math.round(markerRadius * 1.2)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const el of elList) {
        const cx = el.x + markerRadius;
        const cy = el.y + markerRadius;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, markerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.fillText(String(el.id), cx, cy);
      }
      imageWithOverlay = canvas.toBuffer('image/jpeg', { quality: 0.85 }).toString('base64');
    } catch {
      // fallback to unannotated image
    }
  }

  let url = '';
  let title = '';
  try {
    if (frameTreeResult?.frameTree?.frame) {
      url = frameTreeResult.frameTree.frame.url ?? '';
    }
  } catch {
    // ignore
  }
  try {
    const evalParams = mainContextId !== undefined ? { expression: 'document.title', executionContextId: mainContextId } : { expression: 'document.title' };
    const { result } = await runtime.evaluate(evalParams);
    if (result.type === 'string' && result.value) title = result.value;
  } catch {
    // ignore
  }

  return { image: imageWithOverlay, elements: elList, url, title };
}

export function getElementCenter(elementId: number, elements: ElementInfo[]): { x: number; y: number } | null {
  const el = elements.find((e) => e.id === elementId);
  if (!el) return null;
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 };
}

/** Get current page URL and title. */
export async function getPageInfo(client: CDPClient): Promise<{ url: string; title: string }> {
  const page = client.Page;
  const runtime = client.Runtime;
  if (!page) return { url: '', title: '' };
  let url = '';
  let title = '';
  try {
    const frameTree = await page.getFrameTree?.();
    url = frameTree?.frameTree?.frame?.url ?? '';
  } catch {
    // ignore
  }
  try {
    if (runtime?.evaluate) {
      const { result } = await runtime.evaluate({ expression: 'document.title' });
      if (result.type === 'string' && result.value) title = result.value;
    }
  } catch {
    // ignore
  }
  return { url, title };
}
