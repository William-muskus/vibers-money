/**
 * AgentProcess: spawns Vibe with --resume, maintains conversation via session,
 * queues real prompts, detects ask_user_question, idles when no work.
 */
import { spawn, execSync, type ChildProcess } from 'child_process';
import { openSync, closeSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import stripAnsi from 'strip-ansi';
import type { Response } from 'express';
import { RingBuffer } from './ring-buffer.js';
import type { NDJSONMessage, StreamEvent, AskUserQuestion, AgentConfig } from './types.js';
import { logger } from './logger.js';
import { unregisterAgent } from './registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getWindowsVibePath(): string | null {
  try {
    const out = execSync('py -3 -c "import sys, os; p=os.path.join(os.path.dirname(sys.executable), \'Scripts\', \'vibe.exe\'); print(p)"', {
      encoding: 'utf-8',
      windowsHide: true,
    });
    const path = out?.trim();
    if (path && path.length > 0) return path;
  } catch {
    // ignore
  }
  return null;
}

const ACTIVITY_LOG_SIZE = 500;
const MODE_SWITCH_TERMINAL_MS = 10_000;
const POLL_INTERVAL_MS = 60_000;

const vibeNotFoundHintLogged = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vibe streaming output doesn't include session_id (gh#mistralai/mistral-vibe#208).
 * Fallback: read the most recent session from disk after process exits.
 */
function findLatestSessionId(vibeHome: string): string | null {
  try {
    const sessionDir = join(vibeHome, 'logs', 'session');
    const entries = readdirSync(sessionDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('session_'))
      .map((e) => ({ name: e.name, path: join(sessionDir, e.name), mtime: statSync(join(sessionDir, e.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (entries.length === 0) return null;
    const metaPath = join(entries[0].path, 'meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as { session_id?: string };
    return meta.session_id ?? null;
  } catch {
    return null;
  }
}

export class AgentProcess {
  key: string;
  businessId: string;
  agentId: string;
  config: AgentConfig;
  mode: 'terminal' | 'browser' = 'terminal';
  activityLog: RingBuffer<NDJSONMessage>;
  subscribers: Set<Response> = new Set();
  process: ChildProcess | null = null;
  private running = false;
  private lastBrowserToolTime = 0;
  sessionId: string | null = null;

  private seenMessageIds = new Set<string>();

  /** Queue of real prompts (founder messages, swarm bus events). */
  private pendingPrompts: string[] = [];

  /** Resolves to wake the agent from idle sleep. */
  private wakeResolve: (() => void) | null = null;

  /** When true, the loop does not start a new cycle until resume() is called. */
  private paused = false;

  /** Resolves when resume() is called so the loop can continue. */
  private resumeResolve: (() => void) | null = null;

  /** True when the agent last used ask_user_question and is waiting for an answer. */
  private waitingForUserAnswer = false;

  constructor(
    agentId: string,
    businessId: string,
    config: AgentConfig,
  ) {
    this.agentId = agentId;
    this.businessId = businessId;
    this.key = `${businessId}--${agentId}`;
    this.config = config;
    this.activityLog = new RingBuffer<NDJSONMessage>(ACTIVITY_LOG_SIZE);
  }

  broadcast(event: StreamEvent): void {
    const data = JSON.stringify(event);
    let sent = 0;
    for (const sub of this.subscribers) {
      try {
        sub.write(`data: ${data}\n\n`);
        sent++;
      } catch {
        this.subscribers.delete(sub);
      }
    }
    logger.debug('broadcast', { key: this.key, type: event.type, subscribers: sent });
  }

  handleMessage(msg: NDJSONMessage): void {
    const sid = msg.session_id ?? (msg as { sessionId?: string }).sessionId;
    if (typeof sid === 'string' && sid && !this.sessionId) {
      this.sessionId = sid;
      logger.info('vibe_session_id', { key: this.key, sessionId: sid });
    }

    const mid = (msg as { message_id?: string }).message_id;
    if (typeof mid === 'string' && mid) {
      if (this.seenMessageIds.has(mid)) {
        return;
      }
      this.seenMessageIds.add(mid);
    }

    if (msg.role === 'system') return;

    // Detect ask_user_question tool calls
    if (msg.type === 'tool_use' && msg.name === 'ask_user_question') {
      this.waitingForUserAnswer = true;
      const args = (msg as { arguments?: string }).arguments;
      let questions: AskUserQuestion[] = [];
      try {
        const parsed = typeof args === 'string' ? JSON.parse(args) : args;
        questions = (parsed as { questions?: AskUserQuestion[] }).questions ?? [];
      } catch { /* ignore */ }
      logger.info('ask_user_question', { key: this.key, questionCount: questions.length });
      this.broadcast({ type: 'ask_user', questions, agent: this.key });
    }

    this.activityLog.push(msg);

    if (msg.type === 'tool_use' && typeof msg.name === 'string' && msg.name.startsWith('mcp_computer_')) {
      this.lastBrowserToolTime = Date.now();
      if (this.mode !== 'browser') {
        this.mode = 'browser';
        logger.info('mode_switch', { key: this.key, mode: 'browser', tool: msg.name });
        this.broadcast({ type: 'mode_switch', mode: 'browser', agent: this.key });
      }
    }

    if (msg.type === 'tool_use' && typeof msg.name === 'string' && !msg.name.startsWith('mcp_computer_')) {
      if (this.mode === 'browser' && Date.now() - this.lastBrowserToolTime > MODE_SWITCH_TERMINAL_MS) {
        this.mode = 'terminal';
        logger.info('mode_switch', { key: this.key, mode: 'terminal' });
        this.broadcast({ type: 'mode_switch', mode: 'terminal', agent: this.key });
      }
    }

    const role = msg.role as string | undefined;
    if (role === 'assistant' || role === 'user') {
      logger.info('broadcast_activity', {
        key: this.key,
        role,
        contentPreview: String(msg.content ?? '').slice(0, 60),
        subscriberCount: this.subscribers.size,
      });
      // When CEO sends a substantive assistant message, assume they're waiting for founder reply
      // (e.g. clarifying questions). Avoid spawning "Check your messages" until user responds.
      if (role === 'assistant' && this.agentId === 'ceo') {
        const content = msg.content;
        const text = typeof content === 'string' ? content : Array.isArray(content)
          ? (content as { text?: string }[]).map((p) => p?.text ?? '').join('')
          : '';
        if (text.trim().length > 20) this.waitingForUserAnswer = true;
      }
    }
    this.broadcast({ type: 'activity', msg, agent: this.key });
  }

  subscribe(sseResponse: Response): void {
    const backfill = this.activityLog.getAll();
    for (const msg of backfill) {
      sseResponse.write(`data: ${JSON.stringify({ type: 'activity', msg, agent: this.key } as StreamEvent)}\n\n`);
    }
    sseResponse.write(`data: ${JSON.stringify({ type: 'mode_switch', mode: this.mode, agent: this.key } as StreamEvent)}\n\n`);
    this.subscribers.add(sseResponse);
    logger.info('sse_subscribe', { key: this.key, backfillCount: backfill.length, subscriberCount: this.subscribers.size });
    sseResponse.on('close', () => {
      this.subscribers.delete(sseResponse);
      logger.debug('sse_unsubscribe', { key: this.key, subscriberCount: this.subscribers.size });
    });
  }

  /**
   * Enqueue a real prompt (founder message, swarm bus event) and wake the agent.
   */
  enqueuePrompt(text: string): void {
    this.pendingPrompts.push(text);
    this.waitingForUserAnswer = false;
    this.wake();
  }

  /**
   * Wake the agent from idle sleep.
   */
  wake(): void {
    if (this.wakeResolve) {
      logger.info('agent_wake', { key: this.key });
      this.wakeResolve();
      this.wakeResolve = null;
    }
  }

  /** Put the infinite loop on hold; no new cycle until resume(). */
  pause(): void {
    this.paused = true;
    this.wake();
    logger.info('agent_pause', { key: this.key });
  }

  /** Resume the loop after pause(). */
  resume(): void {
    this.paused = false;
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
    logger.info('agent_resume', { key: this.key });
  }

  isPaused(): boolean {
    return this.paused;
  }

  async start(): Promise<void> {
    this.running = true;
    const { workdir, vibeHome, apiKey, maxTurns = 100, maxPrice = '1.00' } = this.config;

    while (this.running) {
      // When paused, wait until resume() is called (keeps the loop on hold without killing the process).
      if (this.paused) {
        await new Promise<void>((resolve) => { this.resumeResolve = resolve; });
        this.resumeResolve = null;
        continue;
      }

      // --- Determine prompt for this cycle ---
      let prompt: string;

      if (!this.sessionId && !this.waitingForUserAnswer) {
        // First cycle: use the initial prompt from config
        // Skip if waitingForUserAnswer — Vibe programmatic mode may not emit session_id,
        // so we'd otherwise keep respawning with the same prompt. Idle until user replies.
        prompt = this.config.initialPrompt
          ?? 'Read your AGENTS.md and begin your work. Check your messages and todos.';
      } else if (this.pendingPrompts.length > 0) {
        prompt = this.pendingPrompts.shift()!;
      } else {
        // No work — idle until woken or poll interval
        logger.info('agent_idle', { key: this.key, waitingForUserAnswer: this.waitingForUserAnswer, pollMs: POLL_INTERVAL_MS });

        await Promise.race([
          sleep(POLL_INTERVAL_MS),
          new Promise<void>((resolve) => { this.wakeResolve = resolve; }),
        ]);
        this.wakeResolve = null;
        if (!this.running) break;
        if (this.paused) continue;

        if (this.pendingPrompts.length > 0) {
          prompt = this.pendingPrompts.shift()!;
        } else if (this.waitingForUserAnswer) {
          // Still waiting for the founder — don't pester, keep idling
          continue;
        } else if (this.agentId === 'ceo') {
          prompt =
            'Check your swarm bus inbox (swarm_check_inbox) and respond to your team. Keep responses concise. Synthesize updates and give brief next steps or acknowledgments.';
        } else {
          prompt =
            'Check your messages and todos. If you have new instructions from the CEO, follow them. Otherwise: work from your objectives — create new tasks with todo_add from your macro objectives, execute work with todo_complete, use your tools. Only report to the CEO when you have new progress or completed a milestone; do not send the same status update repeatedly.';
        }
      }

      // --- Build args ---
      const args: string[] = [
        '--workdir', workdir,
        '--output', 'streaming',
        '--agent', 'auto-approve',
        '--max-turns', String(maxTurns),
        '--max-price', maxPrice,
      ];

      if (this.sessionId) {
        args.unshift('--resume', this.sessionId);
      }

      args.push('--prompt', prompt);

      const env = {
        ...process.env,
        VIBE_HOME: vibeHome,
        PYTHONIOENCODING: 'utf-8',
        TERM: 'dumb',       // Disable rich terminal UI so we get NDJSON not ANSI
        NO_COLOR: '1',
        ...(apiKey && { MISTRAL_API_KEY: apiKey }),
      };

      let vibeCmd: string;
      let vibeArgs = [...args];

      if (process.env.VIBE_USE_PYTHON_MODULE === '1' || process.env.VIBE_USE_PYTHON_MODULE === 'true') {
        // Run via Python module instead of vibe.exe. On Windows, vibe.exe may attach a console
        // and emit Textual/ANSI output; py -m avoids that and yields NDJSON to pipes.
        vibeCmd = process.platform === 'win32' ? 'py' : 'python3';
        const pyVer = process.env.VIBE_PYTHON_VERSION ?? '-3';
        vibeArgs = [pyVer, '-m', 'vibe.cli.entrypoint', ...vibeArgs];
        logger.info('vibe_spawn_python_module', { key: this.key, pyVer });
      } else {
        vibeCmd = process.env.VIBE_CLI ?? '';
        if (!vibeCmd && process.platform === 'win32') {
          vibeCmd = getWindowsVibePath() ?? 'vibe';
        }
        if (!vibeCmd) vibeCmd = 'vibe';
      }

      logger.info('vibe_spawn', {
        key: this.key,
        cmd: vibeCmd,
        argsPreview: vibeArgs.slice(0, 4).join(' '),
        prompt: prompt.slice(0, 120),
        hasSession: !!this.sessionId,
      });

      // Spawn vibe directly (no bat on Windows). Bat was causing ANSI output instead of NDJSON.
      // Use NUL for stdin to avoid blocking on sys.stdin.read().
      // On Windows: CREATE_NO_WINDOW (0x08000000) prevents the child from attaching to a console;
      // without a console, Vibe/Textual skips TTY UI and outputs NDJSON instead of ANSI escape codes.
      const nullDevice = process.platform === 'win32' ? '\\\\.\\NUL' : '/dev/null';
      const nullFd = openSync(nullDevice, 'r');
      const spawnOpts: Parameters<typeof spawn>[2] = {
        env: env as NodeJS.ProcessEnv,
        stdio: [nullFd, 'pipe', 'pipe'],
        cwd: workdir,
      };
      if (process.platform === 'win32') {
        (spawnOpts as { creationFlags?: number }).creationFlags = 0x08000000; // CREATE_NO_WINDOW
      }
      try {
        this.process = spawn(vibeCmd, vibeArgs, spawnOpts);
      } finally {
        closeSync(nullFd);
      }

      // --- Process NDJSON stdout ---
      let lineBuffer = '';
      let stderrBuffer = '';
      this.waitingForUserAnswer = false;
      let hasReceivedStdout = false;
      const NO_OUTPUT_TIMEOUT_MS = 45_000; // Kill if no stdout after 45s (unblocks loop for retry)
      const noOutputTimer = setTimeout(() => {
        if (!hasReceivedStdout && this.process) {
          logger.warn('vibe_no_output_timeout', { key: this.key, action: 'killing_process' });
          this.process.kill();
        }
      }, NO_OUTPUT_TIMEOUT_MS);

      this.process.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (!hasReceivedStdout) {
          logger.info('vibe_first_stdout', {
            key: this.key,
            bytes: chunk.length,
            preview: text.slice(0, 150),
            startsWithBrace: text.trimStart().startsWith('{'),
          });
        }
        hasReceivedStdout = true;
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const stripped = stripAnsi(line).trim();
          if (!stripped) continue;
          // Skip lines that don't look like JSON (Vibe may output ANSI terminal UI interleaved)
          if (!stripped.startsWith('{')) continue;
          try {
            const msg = JSON.parse(stripped) as NDJSONMessage;
            this.handleMessage(msg);
          } catch {
            logger.debug('ndjson_parse_fail', { key: this.key, line: stripped.slice(0, 100) });
          }
        }
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        // Vibe CLI may emit "Session termination failed: 404" when resuming (session already gone) — harmless
        const isHarmlessSession404 = /Session termination failed:\s*404/i.test(text);
        if (isHarmlessSession404) {
          logger.debug('vibe_stderr', { key: this.key, data: text.slice(0, 80), suppressed: 'session_termination_404' });
          return;
        }
        const isNotFound =
          /not recognized|n'est pas reconnu|not found|command not found|ENOENT/i.test(text);
        if (isNotFound && !vibeNotFoundHintLogged.has(this.key)) {
          vibeNotFoundHintLogged.add(this.key);
          logger.error('vibe_not_found', {
            key: this.key,
            hint: 'Set VIBE_CLI in .env to the full path of the Mistral Vibe CLI.',
          });
        }
        logger.warn('vibe_stderr', { key: this.key, data: text.slice(0, 200) });
        this.broadcast({ type: 'error', data: text, agent: this.key });
      });

      const exitCode = await new Promise<number | null>((resolve) => {
        this.process?.on('exit', resolve);
      });

      clearTimeout(noOutputTimer);

      if (exitCode !== 0 && exitCode !== null && stderrBuffer.trim()) {
        logger.warn('vibe_exit_stderr', { key: this.key, exitCode, stderr: stderrBuffer.trim().slice(0, 500) });
      }

      this.process = null;

      // Vibe streaming doesn't emit session_id; read from disk for --resume on next cycle
      if (!this.sessionId && this.config.vibeHome) {
        const sid = findLatestSessionId(this.config.vibeHome);
        if (sid) {
          this.sessionId = sid;
          logger.info('vibe_session_id_from_disk', { key: this.key, sessionId: sid });
        }
      }

      if (this.config.lifecycle === 'task_based') {
        logger.info('vibe_exit', { key: this.key, exitCode, restartIn: 'never (task_based)' });
        return;
      }

      const hasWork = this.pendingPrompts.length > 0;
      logger.info('vibe_exit', {
        key: this.key,
        exitCode,
        waitingForUser: this.waitingForUserAnswer,
        pendingPrompts: this.pendingPrompts.length,
        nextAction: exitCode !== 0 ? 'retry 5s' : hasWork ? 'immediate (has work)' : 'idle',
      });

      if (exitCode !== 0) {
        await sleep(5000);
      } else {
        await sleep(2000);
      }
    }
  }

  isRunningCycle(): boolean {
    return this.process !== null;
  }

  stop(): void {
    logger.info('agent_stop', { key: this.key });
    this.running = false;
    this.wake();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    unregisterAgent(this);
  }
}
