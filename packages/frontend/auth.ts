import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

/** Used by middleware and getServerSession (Edge/Node). No adapter so Edge never loads db. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
});
