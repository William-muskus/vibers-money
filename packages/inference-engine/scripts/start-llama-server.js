/**
 * Start llama-server with tunable performance flags.
 * Model paths (MODEL_PATH, DRAFT_MODEL_PATH) are relative to repo root.
 * Binary: LLAMA_CPP_PATH or "llama-server" from PATH.
 * Loads repo root .env so MODEL_PATH etc. are set when run via npm run dev:inference.
 *
 * Throughput: largest levers are LLAMA_CONTEXT_SIZE (smaller = faster decode),
 * LLAMA_PARALLEL (fewer slots = less KV pressure for one active agent),
 * LLAMA_LOAD_DRAFT=0 if your model disables speculative decoding anyway,
 * and LLAMA_CACHE_TYPE_*=f16 if you have VRAM (q4_0 saves RAM, can cost speed on GPU).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
config({ path: path.join(REPO_ROOT, '.env') });

function resolveModelPath(rel) {
  if (!rel) return null;
  if (path.isAbsolute(rel)) return rel;
  return path.join(REPO_ROOT, rel);
}

function truthyEnv(name) {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
}

const MODEL_PATH = (process.env.MODEL_PATH || '').trim();
const DRAFT_MODEL_PATH = (process.env.DRAFT_MODEL_PATH || '').trim();
const LLAMA_LOAD_DRAFT = (process.env.LLAMA_LOAD_DRAFT || '1').trim().toLowerCase();
const draftPath = DRAFT_MODEL_PATH ? resolveModelPath(DRAFT_MODEL_PATH) : null;
const useDraftModel =
  !['0', 'false', 'no', 'off'].includes(LLAMA_LOAD_DRAFT) && !!draftPath;
const LLAMA_CPP_PATH = (process.env.LLAMA_CPP_PATH || '').trim();

const LLAMA_CONTEXT_SIZE = parseInt(process.env.LLAMA_CONTEXT_SIZE || '32768', 10) || 32768;
const LLAMA_PORT = parseInt(process.env.LLAMA_PORT || '8080', 10) || 8080;

/** Parallel slots: unset = omit flag (llama-server default -1 = auto). Set 1 for max single-stream tok/s when one agent talks at a time. */
const LLAMA_PARALLEL_RAW = (process.env.LLAMA_PARALLEL ?? '').trim();

const mainPath = resolveModelPath(MODEL_PATH);

if (!mainPath || !MODEL_PATH) {
  console.error('Set MODEL_PATH (e.g. models/Qwen3.5-4B.Q4_K_M.gguf) in .env');
  process.exit(1);
}

const binary = LLAMA_CPP_PATH || 'llama-server';

const ngl = (process.env.LLAMA_N_GPU_LAYERS ?? 'all').trim() || 'all';
const ctk = (process.env.LLAMA_CACHE_TYPE_K ?? 'q4_0').trim() || 'q4_0';
const ctv = (process.env.LLAMA_CACHE_TYPE_V ?? 'q4_0').trim() || 'q4_0';
const flashAttn = (process.env.LLAMA_FLASH_ATTN ?? 'on').trim() || 'on';

const args = [
  '-m',
  mainPath,
  '--port',
  String(LLAMA_PORT),
  '-c',
  String(LLAMA_CONTEXT_SIZE),
  '-fa',
  flashAttn,
  '--kv-unified',
  '--cache-type-k',
  ctk,
  '--cache-type-v',
  ctv,
  '-ngl',
  ngl,
];

if (LLAMA_PARALLEL_RAW !== '') {
  const np = parseInt(LLAMA_PARALLEL_RAW, 10);
  if (!Number.isNaN(np)) {
    args.push('-np', String(np));
  }
}

const batch = (process.env.LLAMA_BATCH ?? '').trim();
if (batch !== '') {
  const b = parseInt(batch, 10);
  if (!Number.isNaN(b) && b > 0) args.push('-b', String(b));
}
const ubatch = (process.env.LLAMA_UBATCH ?? '').trim();
if (ubatch !== '') {
  const ub = parseInt(ubatch, 10);
  if (!Number.isNaN(ub) && ub > 0) args.push('-ub', String(ub));
}

const threads = (process.env.LLAMA_THREADS ?? '').trim();
if (threads !== '') {
  const t = parseInt(threads, 10);
  if (!Number.isNaN(t) && t > 0) args.push('-t', String(t));
}
const threadsBatch = (process.env.LLAMA_THREADS_BATCH ?? '').trim();
if (threadsBatch !== '') {
  const tb = parseInt(threadsBatch, 10);
  if (!Number.isNaN(tb) && tb > 0) args.push('-tb', String(tb));
}

if (truthyEnv('LLAMA_NO_WEBUI')) {
  args.push('--no-webui');
}
if (truthyEnv('LLAMA_PERF')) {
  args.push('--perf');
}

if (useDraftModel && draftPath) {
  const ngld = (process.env.LLAMA_N_GPU_LAYERS_DRAFT ?? 'all').trim() || 'all';
  const draftMax = (process.env.LLAMA_DRAFT_MAX ?? '16').trim() || '16';
  const draftMin = (process.env.LLAMA_DRAFT_MIN ?? '5').trim() || '5';
  args.push('--draft-max', draftMax, '--draft-min', draftMin, '-md', draftPath, '-ngld', ngld);
}

const proc = spawn(binary, args, {
  stdio: 'inherit',
  cwd: REPO_ROOT,
  shell: process.platform === 'win32',
});

proc.on('error', (err) => {
  console.error('Failed to start llama-server:', err.message);
  if (err.code === 'ENOENT' && !LLAMA_CPP_PATH) {
    console.error('Install llama.cpp and add llama-server to PATH, or set LLAMA_CPP_PATH to the binary.');
  }
  process.exit(1);
});

proc.on('exit', (code, signal) => {
  if (code != null && code !== 0) process.exit(code);
  if (signal) process.exit(1);
});
