declare module 'qrcode' {
  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: { width?: number; margin?: number },
    callback?: (err: Error | null) => void,
  ): void;
}
