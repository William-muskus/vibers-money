/**
 * Optionally spawn Chrome with --remote-debugging-port when dev starts (local CDP only).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { CDP_HOST, CDP_PORT } from './cdp-config.js';
import { logger } from './logger.js';

let launchedChrome: ChildProcess | null = null;

function isLocalCdpHost(host: string): boolean {
  const h = (host || 'localhost').trim().toLowerCase();
  return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/** Prefer 127.0.0.1 for checks when host is localhost (IPv4 CDP bind). */
function tcpHost(host: string): string {
  const h = host.trim();
  if (h === '' || h === 'localhost') return '127.0.0.1';
  return h;
}

function isPortListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: tcpHost(host), port, timeout: 800 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function resolveChromeExecutable(): string | null {
  const explicit = process.env.CHROME_PATH?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    );
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function waitForPort(host: string, port: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isPortListening(host, port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * If COMPUTER_USE_AUTO_CHROME is not 0, CDP_HOST is local, and nothing listens on CDP_PORT,
 * start Chrome with a dedicated user-data-dir so CDP is available.
 */
export async function ensureChromeWithRemoteDebugging(): Promise<void> {
  if (process.env.COMPUTER_USE_AUTO_CHROME?.trim() === '0') {
    logger.info('chrome_auto_skip', { reason: 'COMPUTER_USE_AUTO_CHROME=0' });
    return;
  }
  if (!isLocalCdpHost(CDP_HOST)) {
    logger.info('chrome_auto_skip', { reason: 'CDP_HOST_not_local', host: CDP_HOST });
    return;
  }

  if (await isPortListening(CDP_HOST, CDP_PORT)) {
    logger.info('chrome_auto_skip', { reason: 'cdp_port_already_listening', port: CDP_PORT });
    return;
  }

  const chromePath = resolveChromeExecutable();
  if (!chromePath) {
    logger.warn('chrome_auto_skip', {
      reason: 'chrome_executable_not_found',
      hint: 'Set CHROME_PATH or install Google Chrome',
    });
    return;
  }

  const userDataDir =
    process.env.CHROME_USER_DATA_DIR?.trim() ||
    path.join(os.homedir(), '.vibers-computer-use-chrome-profile');

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];

  try {
    launchedChrome = spawn(chromePath, args, {
      detached: false,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
  } catch (e) {
    logger.error('chrome_spawn_failed', { error: String((e as Error).message) });
    return;
  }

  launchedChrome.on('error', (err) => {
    logger.error('chrome_process_error', { error: String(err) });
  });

  logger.info('chrome_auto_launched', {
    chromePath,
    port: CDP_PORT,
    userDataDir,
  });

  const ok = await waitForPort(CDP_HOST, CDP_PORT, 10_000);
  if (!ok) {
    logger.warn('chrome_auto_wait_timeout', { port: CDP_PORT, host: CDP_HOST });
  }
}

export function killLaunchedChrome(): void {
  if (!launchedChrome?.pid) return;
  try {
    launchedChrome.kill();
  } catch {
    // ignore
  }
  launchedChrome = null;
}
