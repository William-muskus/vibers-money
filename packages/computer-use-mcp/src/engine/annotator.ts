/**
 * Annotated screenshot: DOM query for interactive elements + canvas overlay with numbered markers.
 */
import { createCanvas, loadImage } from 'canvas';

export interface CDPClient {
  Page?: {
    captureScreenshot(params: { format: string; quality?: number }): Promise<{ data: string }>;
    getFrameTree?(): Promise<{ frameTree?: { frame?: { url?: string } } }>;
    navigate?(params: { url: string }): Promise<void>;
  };
  Runtime?: {
    evaluate(params: { expression: string }): Promise<{ result: { type: string; value?: string } }>;
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
        x: Math.round(r.x + window.scrollX),
        y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height)
      };
    });
  return JSON.stringify(list);
})();
`;

export async function getAnnotatedScreenshot(client: CDPClient): Promise<{
  image: string;
  elements: ElementInfo[];
  url: string;
  title: string;
}> {
  const [page, runtime] = [client.Page, client.Runtime];
  if (!page || !runtime) throw new Error('CDP Page or Runtime not available');

  let elements: Array<Record<string, unknown>> = [];
  try {
    const { result } = await runtime.evaluate({ expression: QUERY_SCRIPT });
    if (result.type === 'string' && result.value) {
      const arr = JSON.parse(result.value) as Array<Record<string, unknown>>;
      elements = arr.map((el, i) => ({
        id: i + 1,
        tag: el.tag ?? 'unknown',
        text: el.text ?? '',
        type: el.type ?? null,
        placeholder: el.placeholder ?? null,
        x: Number(el.x) || 0,
        y: Number(el.y) || 0,
        w: Number(el.w) || 0,
        h: Number(el.h) || 0,
      }));
    }
  } catch {
    // non-fatal
  }

  const { data } = await page.captureScreenshot({ format: 'jpeg', quality: 85 });
  const elList: ElementInfo[] = elements.map((e) => ({
    id: e.id as number,
    tag: e.tag as string,
    text: e.text as string,
    type: e.type as string | null,
    placeholder: e.placeholder as string | null | undefined,
    x: e.x as number,
    y: e.y as number,
    w: e.w as number,
    h: e.h as number,
  }));

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
    const frameTree = await page.getFrameTree?.();
    if (frameTree?.frameTree?.frame) {
      url = frameTree.frameTree.frame.url ?? '';
    }
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
