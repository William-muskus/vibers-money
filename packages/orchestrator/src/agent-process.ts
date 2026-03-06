/**
 * AgentProcess: spawns Vibe with --resume, maintains conversation via session,
 * queues real prompts (founder chat, swarm bus), idles when no work.
 */
import { spawn, execSync, type ChildProcess } from 'child_process';
import { openSync, closeSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import stripAnsi from 'strip-ansi';
import type { Response } from 'express';
import { RingBuffer } from './ring-buffer.js';
import type { NDJSONMessage, StreamEvent, AgentConfig } from './types.js';
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

  /** Consecutive non-zero exits; reset on success. Used for exponential backoff and circuit breaker. */
  private consecutiveFailures = 0;

  /** For cold-start UX: emit lifecycle events; reset each cycle. */
  private cycleLifecycleThinkingEmitted = false;

  private static readonly MAX_CONSECUTIVE_FAILURES = 5;
  private static readonly BACKOFF_BASE_MS = 5000;
  private static readonly BACKOFF_CAP_MS = 120000;

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
    const role = msg.role as string | undefined;
    // Dedupe by message_id for non-assistant so we don't repeat injects; allow multiple assistant chunks (streaming) with same id
    if (typeof mid === 'string' && mid && role !== 'assistant') {
      if (this.seenMessageIds.has(mid)) {
        return;
      }
      this.seenMessageIds.add(mid);
    }
    if (typeof mid === 'string' && mid && role === 'assistant') {
      this.seenMessageIds.add(mid);
    }

    if (msg.role === 'system') return;

    if (!this.cycleLifecycleThinkingEmitted) {
      this.cycleLifecycleThinkingEmitted = true;
      this.broadcast({ type: 'lifecycle', stage: 'agent_thinking', agent: this.key });
    }

    // ask_user_question is CEO-only (founder questions); in this product the CEO has it disabled
    // and asks in message content. Other agents use Swarm Bus to ask each other. No detection here.

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

    if (role === 'assistant' || role === 'user') {
      logger.info('broadcast_activity', {
        key: this.key,
        role,
        contentPreview: String(msg.content ?? '').slice(0, 60),
        subscriberCount: this.subscribers.size,
      });
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

      if (!this.sessionId) {
        // First cycle: use the initial prompt from config
        prompt = this.config.initialPrompt
          ?? 'Read your AGENTS.md and begin your work. Check your messages and todos.';
      } else if (this.pendingPrompts.length > 0) {
        prompt = this.pendingPrompts.shift()!;
      } else {
        // No work — idle until woken or poll interval
        logger.info('agent_idle', { key: this.key, pollMs: POLL_INTERVAL_MS });

        await Promise.race([
          sleep(POLL_INTERVAL_MS),
          new Promise<void>((resolve) => { this.wakeResolve = resolve; }),
        ]);
        this.wakeResolve = null;
        if (!this.running) break;
        if (this.paused) continue;

        if (this.pendingPrompts.length > 0) {
          prompt = this.pendingPrompts.shift()!;
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

      const { bedrockGatewayApiKey } = this.config;
      const env = {
        ...process.env,
        VIBE_HOME: vibeHome,
        PYTHONIOENCODING: 'utf-8',
        TERM: 'dumb',       // Disable rich terminal UI so we get NDJSON not ANSI
        NO_COLOR: '1',
        ...(apiKey && { MISTRAL_API_KEY: apiKey }),
        ...(bedrockGatewayApiKey && { BEDROCK_GATEWAY_API_KEY: bedrockGatewayApiKey }),
      };

      let vibeCmd: string;
      let vibeArgs = [...args];

      if (process.env.VIBE_USE_PYTHON_MODULE === '1' || process.env.VIBE_USE_PYTHON_MODULE === 'true') {
        // Run via Python module instead of vibe.exe. On Windows, vibe.exe may attach a console
        // and emit Textual/ANSI output; py -m avoids that and yields NDJSON to pipes.
        // VIBE_PYTHON overrides the executable when "py" is not in PATH (e.g. Node spawn on Windows).
        const explicitPython = process.env.VIBE_PYTHON?.trim();
        if (explicitPython) {
          vibeCmd = explicitPython;
          vibeArgs = ['-m', 'vibe.cli.entrypoint', ...vibeArgs];
          logger.info('vibe_spawn_python_module', { key: this.key, cmd: vibeCmd });
        } else {
          vibeCmd = process.platform === 'win32' ? 'py' : 'python3';
          const pyVer = process.env.VIBE_PYTHON_VERSION ?? '-3';
          vibeArgs = [pyVer, '-m', 'vibe.cli.entrypoint', ...vibeArgs];
          logger.info('vibe_spawn_python_module', { key: this.key, pyVer });
        }
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

      this.cycleLifecycleThinkingEmitted = false;
      this.broadcast({ type: 'lifecycle', stage: 'agent_spawning', agent: this.key });

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
      let hasReceivedStdout = false;

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

      if (exitCode !== 0 && exitCode !== null) {
        this.consecutiveFailures += 1;
        const delay = Math.min(
          AgentProcess.BACKOFF_BASE_MS * Math.pow(2, this.consecutiveFailures - 1),
          AgentProcess.BACKOFF_CAP_MS,
        );
        logger.info('vibe_exit', {
          key: this.key,
          exitCode,
          consecutiveFailures: this.consecutiveFailures,
          backoffMs: delay,
          nextAction: this.consecutiveFailures >= AgentProcess.MAX_CONSECUTIVE_FAILURES ? 'circuit_break' : 'retry',
        });
        if (this.consecutiveFailures >= AgentProcess.MAX_CONSECUTIVE_FAILURES) {
          this.pause();
          try {
            await this.config.onCircuitBreak?.(this.businessId, this.key, this.agentId, this.consecutiveFailures);
          } catch (err) {
            logger.warn('onCircuitBreak_error', { key: this.key, error: String((err as Error).message) });
          }
          return;
        }
        await sleep(delay);
      } else {
        this.consecutiveFailures = 0;
        logger.info('vibe_exit', {
          key: this.key,
          exitCode,
          pendingPrompts: this.pendingPrompts.length,
          nextAction: hasWork ? 'immediate (has work)' : 'idle',
        });
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
