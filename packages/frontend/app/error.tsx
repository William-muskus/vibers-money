'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  const isAuthError =
    error?.message?.includes('fetch') ||
    error?.message?.includes('session') ||
    (error?.digest && String(error.digest).toLowerCase().includes('auth'));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-[#0c0c12] text-white font-sans">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      {isAuthError ? (
        <p className="text-center text-gray-400 max-w-md">
          Auth failed to load. Check that <code className="bg-white/10 px-1 rounded">NEXTAUTH_URL</code> is set to this app’s URL (e.g. http://localhost:3001) and <code className="bg-white/10 px-1 rounded">AUTH_SECRET</code> is set in the frontend env.
        </p>
      ) : (
        <p className="text-center text-gray-400 max-w-md">{error?.message || 'An unexpected error occurred.'}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
      >
        Try again
      </button>
    </div>
  );
}
