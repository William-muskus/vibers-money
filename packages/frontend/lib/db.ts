/**
 * SQLite DB for NextAuth (magic link verification tokens, optional user/account/session storage).
 * Uses better-sqlite3; file is stored in data/auth.sqlite (create data/ if missing).
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as schema from './auth-schema';

const dir = join(process.cwd(), 'data');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const dbPath = join(dir, 'auth.sqlite');
const sqlite = new Database(dbPath);

// Create tables if they don't exist (idempotent)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    email TEXT UNIQUE,
    emailVerified INTEGER,
    image TEXT
  );
  CREATE TABLE IF NOT EXISTS account (
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, providerAccountId)
  );
  CREATE TABLE IF NOT EXISTS session (
    sessionToken TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS verificationToken (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (identifier, token)
  );
`);

export const db = drizzle(sqlite, { schema });
export { user, account, session, verificationToken } from './auth-schema';

/** Tables for @auth/drizzle-adapter (same shape as adapter expects). */
export const authSchema = {
  usersTable: schema.user,
  accountsTable: schema.account,
  sessionsTable: schema.session,
  verificationTokensTable: schema.verificationToken,
};
