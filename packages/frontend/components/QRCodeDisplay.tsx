'use client';

import { useEffect, useRef, useState } from 'react';

export default function QRCodeDisplay({ url, size = 160 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!url || !canvas) return;
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvas, url, { width: size, margin: 2 }, (err) => {
        if (err) setError(true);
      });
    }).catch(() => setError(true));
  }, [url, size]);

  if (error) return <p className="text-xs text-gray-500">QR unavailable</p>;
  return <canvas ref={canvasRef} width={size} height={size} className="rounded border border-gray-200 bg-white" />;
}
