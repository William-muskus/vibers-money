'use client';

type ActivityMsg = {
  role?: string;
  content?: string;
  type?: string;
  name?: string;
  input?: unknown;
  arguments?: string;
  data?: string;
};

const MAX_CMD_LEN = 220;
const MAX_GENERIC_LEN = 100;

const lineBase = 'text-[13px] leading-relaxed';

function getToolArgs(msg: ActivityMsg): Record<string, unknown> {
  if (msg.input && typeof msg.input === 'object' && !Array.isArray(msg.input)) {
    return msg.input as Record<string, unknown>;
  }
  const raw = msg.arguments ?? (msg as { args?: string }).args;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export default function ActivityLine({ msg }: { msg: ActivityMsg }) {
  if (msg.role === 'assistant' && msg.content) {
    const s = String(msg.content).slice(0, 120);
    const more = (msg.content as string).length > 120 ? '…' : '';
    return (
      <div className={`${lineBase} text-white/85`}>
        {s}{more}
      </div>
    );
  }
  if (msg.type === 'tool_use' && msg.name) {
    const args = getToolArgs(msg);
    const name = msg.name;

    if (name === 'bash' || name === 'run_terminal_cmd') {
      const cmd = (args.command ?? args.cmd ?? args.command_line ?? '') as string;
      const display = String(cmd).trim().slice(0, MAX_CMD_LEN);
      const more = String(cmd).length > MAX_CMD_LEN ? '…' : '';
      return (
        <div className={`${lineBase} font-mono text-amber-400/95`}>
          <span className="text-amber-500/80">$</span> {display}{more}
        </div>
      );
    }
    if (name === 'write_file' || name === 'write') {
      const path = (args.path ?? args.file_path ?? args.file ?? '') as string;
      const label = path ? ` ${path}` : '';
      return (
        <div className={`${lineBase} text-sky-400/95`}>
          <span className="text-sky-500/70">▶</span> {name}:{label || ' (file)'}
        </div>
      );
    }
    if (name === 'read_file' || name === 'read') {
      const path = (args.path ?? args.file_path ?? args.file ?? '') as string;
      return (
        <div className={`${lineBase} text-slate-400`}>
          <span className="text-slate-500/80">▶</span> {name}: {path || '…'}
        </div>
      );
    }

    const generic = JSON.stringify(args).slice(0, MAX_GENERIC_LEN);
    const more = JSON.stringify(args).length > MAX_GENERIC_LEN ? '…' : '';
    return (
      <div className={`${lineBase} text-sky-400/95`}>
        <span className="text-sky-500/70">▶</span> {name}({generic}{more})
      </div>
    );
  }
  if (msg.type === 'tool_result' && msg.name) {
    return (
      <div className={`${lineBase} text-emerald-400/95`}>
        <span className="text-emerald-500/80">✓</span> {msg.name} completed
      </div>
    );
  }
  if (msg.type === 'raw' || msg.type === 'error') {
    return (
      <div className={`${lineBase} text-white/50`}>
        {msg.type}: {msg.data?.slice(0, 80)}
      </div>
    );
  }
  return null;
}
