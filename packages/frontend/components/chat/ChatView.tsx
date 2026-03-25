'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { sendMessage, businessStreamUrl } from '@/lib/api';
import { subscribeBusinessStream } from '@/lib/sse';
import {
  getCeoChatMessagesFromIdb,
  setCeoChatMessagesInIdb,
  type ChatMessage,
  type AskUserQuestion,
} from '@/lib/idb-ceo-chat';
import ToolActivityBlock from './ToolActivityBlock';
import MessageBubble from './MessageBubble';
import AssistantMessageBubble from './AssistantMessageBubble';
import Composer from './Composer';
import { extractAssistantParts, mergeStreamText, textFromMsgContent } from '@/lib/chat-content';

function streamRole(role: unknown): 'user' | 'assistant' | 'system' | 'other' {
  const r = typeof role === 'string' ? role.toLowerCase().trim() : '';
  if (r === 'user' || r === 'human') return 'user';
  if (r === 'assistant' || r === 'model') return 'assistant';
  if (r === 'system') return 'system';
  return 'other';
}

function newClientKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function QuestionCard({
  q,
  onAnswer,
}: {
  q: AskUserQuestion;
  onAnswer: (answer: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl rounded-bl-md border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-indigo-400/20 dark:bg-indigo-950/50">
      {q.header && (
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          {q.header}
        </p>
      )}
      <p className="text-sm font-medium text-gray-900 dark:text-white">{q.question}</p>
      {q.options && q.options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt, oi) => (
            <button
              key={opt.label ? String(opt.label) : `opt-${oi}`}
              type="button"
              onClick={() => onAnswer(opt.label)}
              className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-[#14151c]/80 dark:text-indigo-300 dark:hover:bg-indigo-400/20"
            >
              {opt.label}
              {opt.description && (
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  — {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Type your answer in the box below and send.
        </p>
      )}
    </div>
  );
}

export default function ChatView({
  businessId,
  initialMessage,
}: {
  businessId: string;
  initialMessage?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessage?.trim()
      ? [{ kind: 'text', clientKey: newClientKey(), role: 'user', content: initialMessage.trim() }]
      : [],
  );

  /** After landing with ?initialMessage=, router.replace clears the query; don't let IDB restore wipe the first user message. */
  const landingThreadRef = useRef(false);
  useLayoutEffect(() => {
    if (initialMessage?.trim()) landingThreadRef.current = true;
  }, [initialMessage]);

  /** Latest thread length for IDB race guard (async get may finish after user sends — must not clobber). */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Load full thread from IndexedDB (all user + CEO messages); restore on mount / business change.
  // Skip restore when coming from landing with initialMessage — otherwise stale IDB overwrites the new thread and SSE never matches UI.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialMessage?.trim()) return;
    if (landingThreadRef.current) return;
    let cancelled = false;
    getCeoChatMessagesFromIdb(businessId).then((stored) => {
      if (cancelled) return;
      // User already has messages this session (e.g. sent before IDB read completed) — never replace.
      if (messagesRef.current.length > 0) return;
      if (stored.length > 0) {
        stored.forEach((m) => {
          if (m.kind === 'text') {
            const id = m.id;
            if (id) seenIdsRef.current.add(id);
          } else if (m.kind === 'activity') {
            const doc = m.msg as { type?: string; name?: string; message_id?: string };
            const mid =
              typeof doc.message_id === 'string' ? doc.message_id : typeof m.id === 'string' ? m.id : '';
            const msgType = typeof doc.type === 'string' ? doc.type : '';
            const name = typeof doc.name === 'string' ? doc.name : '';
            const dedupeKey = mid ? `${mid}:${msgType}:${name}` : '';
            if (dedupeKey) seenToolIdsRef.current.add(dedupeKey);
          }
        });
        const withKeys = stored.map((m, idx) => {
          if (m.kind === 'text') {
            const t = m;
            if (t.clientKey) return t;
            return { ...t, clientKey: t.id ?? `legacy-${idx}-${t.role}` };
          }
          if (m.kind === 'activity') {
            const a = m;
            if (a.clientKey) return a;
            return { ...a, clientKey: a.id ?? `legacy-act-${idx}` };
          }
          return m;
        }) as ChatMessage[];
        setMessages(withKeys);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, initialMessage]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const [progressStage, setProgressStage] = useState<'agent_spawning' | 'agent_tools_loaded' | 'agent_thinking' | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  /** Dedupe tool_use / tool_result replays on reconnect (message_id + type + name). */
  const seenToolIdsRef = useRef(new Set<string>());
  /** One business-level SSE stream; we filter to the CEO agent only (reliable vs per-agent URL). */
  const streamUrl = businessStreamUrl(businessId);
  const ceoAgentKey = `${businessId}--ceo`;

  /** Clear “waiting” as soon as the CEO assistant bubble has any streamed text (content or reasoning). */
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (
      last?.kind === 'text' &&
      last.role === 'assistant' &&
      (last.content.trim().length > 0 || (last.reasoning && last.reasoning.trim().length > 0))
    ) {
      setWaitingForReply(false);
      setProgressStage(null);
    }
  }, [messages]);

  // Seed seen IDs from restored cache so we don't duplicate assistant messages from stream
  const seededRef = useRef(false);
  if (!seededRef.current && messages.length > 0) {
    seededRef.current = true;
    messages.forEach((m) => {
      if (m.kind === 'text') {
        if (m.id) seenIdsRef.current.add(m.id);
      } else if (m.kind === 'activity') {
        const doc = m.msg as { type?: string; name?: string; message_id?: string };
        const mid =
          typeof doc.message_id === 'string' ? doc.message_id : typeof m.id === 'string' ? m.id : '';
        const msgType = typeof doc.type === 'string' ? doc.type : '';
        const name = typeof doc.name === 'string' ? doc.name : '';
        const dedupeKey = mid ? `${mid}:${msgType}:${name}` : '';
        if (dedupeKey) seenToolIdsRef.current.add(dedupeKey);
      }
    });
  }

  const handleAnswer = useCallback(
    async (answer: string) => {
      setMessages((prev) => [...prev, { kind: 'text', clientKey: newClientKey(), role: 'user', content: answer }]);
      setSending(true);
      setWaitingForReply(true);
      try {
        await sendMessage(businessId, answer);
      } catch (err) {
        setWaitingForReply(false);
        setMessages((prev) => [
          ...prev,
          { kind: 'text', clientKey: newClientKey(), role: 'assistant', content: 'Error: ' + (err as Error).message },
        ]);
      } finally {
        setSending(false);
      }
    },
    [businessId],
  );

  useEffect(() => {
    setConnectionFailed(false);
    const unsubscribe = subscribeBusinessStream(
      businessId,
      streamUrl,
      (event) => {
        setConnected(true);
        const agent = (event as { agent?: string }).agent;
        if (agent && agent !== ceoAgentKey) return;

        if (process.env.NODE_ENV === 'development') {
          console.debug('[stream]', event.type, event.type === 'activity' ? (event as { msg?: { role?: string; content?: unknown } }).msg?.role : '', (event as { msg?: { content?: unknown } }).msg?.content ? String((event as { msg?: { content?: unknown } }).msg?.content).slice(0, 80) : '');
        }

        if (event.type === 'lifecycle') {
          const stage = (event as { stage?: string }).stage;
          if (stage === 'agent_spawning' || stage === 'agent_tools_loaded' || stage === 'agent_thinking') {
            setProgressStage(stage);
          }
          return;
        }

        if (event.type === 'ask_user') {
          const questions = (event as { questions?: AskUserQuestion[] }).questions;
          if (questions && questions.length > 0) {
            setWaitingForReply(false);
            setMessages((prev) => [...prev, { kind: 'ask_user', questions }]);
          }
          return;
        }

        if (event.type !== 'activity' || !event.msg) return;

        const msg = event.msg;
        const msgRecord = msg as Record<string, unknown>;
        const msgType = typeof msgRecord.type === 'string' ? msgRecord.type : '';

        if (msgType === 'tool_use' || msgType === 'tool_result') {
          const mid = typeof msgRecord.message_id === 'string' ? msgRecord.message_id : '';
          const name = typeof msgRecord.name === 'string' ? msgRecord.name : '';
          const dedupeKey = mid ? `${mid}:${msgType}:${name}` : '';
          if (dedupeKey && seenToolIdsRef.current.has(dedupeKey)) return;
          if (dedupeKey) seenToolIdsRef.current.add(dedupeKey);

          const serializable: Record<string, unknown> = {};
          for (const k of ['type', 'name', 'role', 'input', 'arguments', 'content', 'message_id', 'data', 'output'] as const) {
            if (msgRecord[k] !== undefined) serializable[k] = msgRecord[k];
          }

          setMessages((prev) => [
            ...prev,
            {
              kind: 'activity' as const,
              clientKey: newClientKey(),
              id: mid || undefined,
              msg: serializable,
            },
          ]);
          setWaitingForReply(false);
          setProgressStage(null);
          return;
        }

        const chatRole = streamRole(msg.role);
        const messageId = (msg as { message_id?: string }).message_id;

        if (chatRole === 'system') return;
        if (chatRole !== 'user' && chatRole !== 'assistant') return;

        if (chatRole === 'user') {
          const userText = textFromMsgContent((msg as { content?: unknown }).content);
          if (!userText.trim()) return;
          // CEO stream echoes "The founder sent you a message: \"...\"" — that's the inject to the agent, not a chat message.
          const founderMatch = userText.match(/The founder sent you a message:\s*"([^"]*)"/);
          if (founderMatch) {
            if (messageId) seenIdsRef.current.add(messageId);
            return;
          }
          if (/^Continue\.?\s*$/i.test(userText.trim())) return;
          if (/Read your AGENTS\.md/i.test(userText)) return;
          if (/Check your messages and todos/i.test(userText)) return;
          return;
        }

        // Assistant: merge NDJSON chunks (delta or cumulative) for smooth streaming
        const raw = extractAssistantParts(msg as Record<string, unknown>);
        const now = Date.now();

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const pendingNoAnswer =
            last?.kind === 'text' && last.role === 'assistant' && !last.content.trim();

          const mergeIntoLast =
            last?.kind === 'text' &&
            last.role === 'assistant' &&
            (pendingNoAnswer ||
              (messageId && last.id === messageId) ||
              (messageId && seenIdsRef.current.has(messageId) && (last.id === messageId || !last.id)));

          const nextA =
            mergeIntoLast && last.kind === 'text'
              ? mergeStreamText(last.content, raw.answer)
              : raw.answer;
          const nextR =
            mergeIntoLast && last.kind === 'text'
              ? mergeStreamText(last.reasoning ?? '', raw.reasoning)
              : raw.reasoning;

          if (!nextA.trim() && !nextR.trim()) return prev;

          const mergeAssistantInto = (
            base: ChatMessage & { kind: 'text' },
            explicitId?: string,
          ): ChatMessage & { kind: 'text' } => {
            const lastR = (base.reasoning ?? '').trim();
            const lastA = base.content.trim();
            const nextRTrim = nextR.trim();
            const nextATrim = nextA.trim();
            const thoughtStartedAt =
              base.thoughtStartedAt ?? (nextRTrim && !lastR ? now : undefined);
            const thoughtEndedAt =
              base.thoughtEndedAt ?? (nextATrim && !lastA ? now : undefined);
            return {
              ...base,
              id: explicitId ?? base.id ?? messageId,
              content: nextA,
              reasoning: nextRTrim ? nextR : undefined,
              thoughtStartedAt,
              thoughtEndedAt,
            };
          };

          // Same model message_id: update in place
          if (messageId && seenIdsRef.current.has(messageId)) {
            if (last?.kind === 'text' && last.role === 'assistant' && last.id === messageId) {
              return [...prev.slice(0, -1), mergeAssistantInto(last)];
            }
            if (pendingNoAnswer) {
              return [...prev.slice(0, -1), mergeAssistantInto(last as ChatMessage & { kind: 'text' }, messageId)];
            }
            const orphan: ChatMessage & { kind: 'text' } = {
              kind: 'text',
              clientKey: newClientKey(),
              id: messageId,
              role: 'assistant',
              content: nextA,
              reasoning: nextR.trim() ? nextR : undefined,
              thoughtStartedAt: nextR.trim() ? now : undefined,
              thoughtEndedAt: nextA.trim() ? now : undefined,
            };
            return [...prev, orphan];
          }

          if (messageId) seenIdsRef.current.add(messageId);

          if (pendingNoAnswer) {
            return [...prev.slice(0, -1), mergeAssistantInto(last as ChatMessage & { kind: 'text' }, messageId)];
          }

          const fresh: ChatMessage & { kind: 'text' } = {
            kind: 'text',
            clientKey: newClientKey(),
            id: messageId,
            role: 'assistant',
            content: nextA,
            reasoning: nextR.trim() ? nextR : undefined,
            thoughtStartedAt: nextR.trim() ? now : undefined,
            thoughtEndedAt: nextA.trim() ? now : undefined,
          };
          return [...prev, fresh];
        });
      },
      () => setConnectionFailed(true),
    );
    return unsubscribe;
  }, [businessId, streamUrl]);

  // Persist full thread (all user + CEO messages) in IndexedDB
  useEffect(() => {
    if (messages.length === 0) return;
    setCeoChatMessagesInIdb(businessId, messages).catch(() => {});
  }, [businessId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Waiting state when opening from landing with initialMessage (stream replaces status row on first chunk)
  useEffect(() => {
    if (!initialMessage?.trim()) return;
    setWaitingForReply(true);
  }, [initialMessage]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { kind: 'text', clientKey: newClientKey(), role: 'user', content: text }]);
    setSending(true);
    setWaitingForReply(true);
    try {
      await sendMessage(businessId, text);
    } catch (err) {
      setWaitingForReply(false);
      setMessages((prev) => [
        ...prev,
        { kind: 'text', clientKey: newClientKey(), role: 'assistant', content: 'Error: ' + (err as Error).message },
      ]);
    } finally {
      setSending(false);
    }
  }, [businessId, input, sending]);

  const hasMessages = messages.length > 0;
  const showEmptyState = !hasMessages && !connectionFailed;
  const hasAssistantReply = messages.some((m) => m.kind === 'text' && m.role === 'assistant');
  /** One combined status row: avoid duplicate “Thinking…” + lifecycle bubbles (screenshot 1). */
  const showAgentStatusRow =
    sending ||
    waitingForReply ||
    (progressStage != null && !hasAssistantReply);

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div ref={threadRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-10 align-bottom">
          {connectionFailed ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
              <p className="animate-fade-in text-sm text-amber-600 dark:text-amber-400">
                Can&apos;t connect — business may not exist or services aren&apos;t running.
              </p>
              <Link href="/" className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400">
                Go home and create a business
              </Link>
            </div>
          ) : (
            <div className="contents">
              {showEmptyState && (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-2xl">
                    What business we launching today?
                  </h2>
                  {!connected && !progressStage && (
                    <p className="animate-soft-pulse text-sm text-gray-500 dark:text-gray-400">
                      Connecting to CEO...
                    </p>
                  )}
                  {/* Lifecycle status lives in showAgentStatusRow below — avoid duplicating here */}
                </div>
              )}
              <div className="flex flex-col gap-6">
                {messages.map((m, i) =>
                  m.kind === 'ask_user' ? (
                    <div key={`ask-${i}`} className="animate-scale-in flex flex-col gap-2">
                      {m.questions.map((q, qi) => (
                        <QuestionCard key={qi} q={q} onAnswer={handleAnswer} />
                      ))}
                    </div>
                  ) : m.kind === 'activity' ? (
                    <div
                      key={m.clientKey ?? m.id ?? `act-${i}`}
                      className="animate-fade-in flex w-full justify-end"
                    >
                      <div className="max-w-[min(100%,52rem)]">
                        <ToolActivityBlock
                          msg={
                            m.msg as {
                              role?: string;
                              content?: string;
                              reasoning_content?: string;
                              type?: string;
                              name?: string;
                              input?: unknown;
                              arguments?: string;
                              data?: string;
                              output?: unknown;
                            }
                          }
                        />
                      </div>
                    </div>
                  ) : m.kind === 'text' && m.role === 'assistant' ? (
                    <AssistantMessageBubble
                      key={m.clientKey ?? m.id ?? `a-${i}`}
                      content={m.content}
                      reasoning={m.reasoning}
                      thoughtStartedAt={m.thoughtStartedAt}
                      thoughtEndedAt={m.thoughtEndedAt}
                    />
                  ) : m.kind === 'text' ? (
                    <MessageBubble key={m.clientKey ?? m.id ?? `u-${i}`} role={m.role} content={m.content} />
                  ) : null,
                )}
                {showAgentStatusRow && (
                  <div className="flex w-full justify-end">
                    <div className="flex items-start gap-3 animate-fade-in">
                      <div className="rounded-2xl rounded-br-md border border-indigo-200/80 bg-indigo-50/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-indigo-400/25 dark:bg-indigo-950/60">
                        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                          {progressStage ? (
                            <>
                              {progressStage === 'agent_spawning' && 'Starting CEO agent...'}
                              {progressStage === 'agent_tools_loaded' && 'Loading tools...'}
                              {progressStage === 'agent_thinking' && 'Thinking about your business...'}
                            </>
                          ) : sending ? (
                            'Sending...'
                          ) : (
                            'Thinking...'
                          )}
                        </span>
                      </div>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/25 dark:bg-indigo-400/25 ring-2 ring-indigo-400/30 dark:ring-indigo-300/30">
                        <span className="animate-soft-pulse text-sm font-medium text-indigo-600 dark:text-indigo-300">…</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {!connectionFailed && (
        <div className="shrink-0 px-4 py-4 text-transparent">
          <div className="mx-auto max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={sending}
              placeholder="Ask anything"
            />
          </div>
        </div>
      )}
    </div>
  );
}
