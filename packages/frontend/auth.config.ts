/**
 * Shared NextAuth config (providers, pages, callbacks). No adapter — adapter is added in the API route only (Node), so middleware (Edge) never loads db.
 */

import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';

const resendFrom = process.env.EMAIL_FROM ?? process.env.AUTH_RESEND_FROM ?? 'vibers.money <onboarding@resend.dev>';
const resendKey = process.env.AUTH_RESEND_KEY;

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub,
    Google,
    ...(resendKey
      ? [
          Resend({
            from: resendFrom,
            apiKey: resendKey,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = (token.id as string) ?? (token.sub ?? '');
      return session;
    },
  },
};
