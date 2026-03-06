import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db, authSchema } from '@/lib/db';

/** NextAuth with DB adapter (magic link verification tokens). Only this route loads db — not middleware. */
const { handlers } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, authSchema),
});

export const { GET, POST } = handlers;
