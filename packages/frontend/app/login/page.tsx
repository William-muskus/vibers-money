'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !value.includes('@')) {
      setMagicLinkError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setMagicLinkError('');
    try {
      const res = await signIn('resend', {
        email: value,
        callbackUrl: '/',
        redirect: false,
      });
      if (res?.error) {
        setMagicLinkError(res.error === 'EmailSignin' ? 'Could not send magic link. Check your email or try again.' : String(res.error));
        return;
      }
      setMagicLinkSent(true);
    } catch (err) {
      setMagicLinkError((err as Error).message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-[#0c0c12]">
      <h1 className="text-2xl font-semibold text-white">Sign in to vibers.money</h1>
      <p className="text-gray-400 text-center max-w-sm">
        Use GitHub, Google, or a magic link sent to your email.
      </p>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          type="button"
          onClick={() => signIn('github', { callbackUrl: '/' })}
          className="px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition"
        >
          Sign in with GitHub
        </button>
        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition"
        >
          Sign in with Google
        </button>

        <>
          <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/20" />
              </div>
              <span className="relative flex justify-center text-xs text-white/50">or</span>
            </div>
            {magicLinkSent ? (
              <p className="text-sm text-green-400 text-center">
                Check your inbox. We sent a sign-in link to <strong className="text-white">{email}</strong>. Click it to sign in.
              </p>
            ) : (
              <form onSubmit={handleMagicLink} className="flex flex-col gap-2">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  disabled={loading}
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition"
                >
                  {loading ? 'Sending…' : 'Send magic link'}
                </button>
                {magicLinkError && (
                  <p className="text-sm text-red-400">{magicLinkError}</p>
                )}
              </form>
            )}
        </>
      </div>
    </div>
  );
}
