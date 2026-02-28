'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { sendMessage, businessStreamUrl } from '@/lib/api';
import { subscribeBusinessStream } from '@/lib/sse';
import MessageBubble from './MessageBubble';

type ChatMessage =
  | { kind: 'text'; id?: string; role: 'user' | 'assistant'; content: string }
  | { kind: 'ask_user'; id?: string; questions: AskUserQuestion[] };

interface AskUserQuestion {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multi_select?: boolean;
}

function QuestionCard({
  q,
  onAnswer,
}: {
  q: AskUserQuestion;
  onAnswer: (answer: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl rounded-bl-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
      {q.header && (
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          {q.header}
        </p>
      )}
      <p className="text-sm font-medium text-gray-900 dark:text-white">{q.question}</p>
      <div className="flex flex-wrap gap-2">
        {q.options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onAnswer(opt.label)}
            className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-600 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700"
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
    </div>
  );
}

export default function ChatView({ businessId }: { businessId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const streamUrl = businessStreamUrl(businessId);

  const handleAnswer = useCallback(
    async (answer: string) => {
      setMessages((prev) => [...prev, { kind: 'text', role: 'user', content: answer }]);
      setSending(true);
      try {
        await sendMessage(businessId, answer);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { kind: 'text', role: 'assistant', content: 'Error: ' + (err as Error).message },
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
        if (process.env.NODE_ENV === 'development') {
          console.debug('[stream]', event.type, event.type === 'activity' ? (event as { msg?: { role?: string; content?: unknown } }).msg?.role : '', (event as { msg?: { content?: unknown } }).msg?.content ? String((event as { msg?: { content?: unknown } }).msg?.content).slice(0, 80) : '');
        }

      if (event.type === 'ask_user') {
        const questions = (event as { questions?: AskUserQuestion[] }).questions;
        if (questions && questions.length > 0) {
          setMessages((prev) => [...prev, { kind: 'ask_user', questions }]);
        }
        return;
      }

      if (event.type !== 'activity' || !event.msg) return;

      const msg = event.msg;
      const role = msg.role as string | undefined;
      const rawContent = msg.content;
      // Vibe may send content as string or array of {type:'text', text:string}
      const content =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? (rawContent as { type?: string; text?: string }[])
                .map((p) => (p?.type === 'text' && typeof p?.text === 'string' ? p.text : ''))
                .join('')
            : '';
      const messageId = (msg as { message_id?: string }).message_id;

      if (role === 'system') return;
      if (role === 'user' && /^Continue\.?\s*$/i.test(content.trim())) return;

      if (!content.trim()) return;
      if (role !== 'user' && role !== 'assistant') return;

      if (messageId) {
        if (seenIdsRef.current.has(messageId)) return;
        seenIdsRef.current.add(messageId);
      }

      setMessages((prev) => [...prev, { kind: 'text', id: messageId, role, content }]);
    },
      () => setConnectionFailed(true),
    );
    return unsubscribe;
  }, [businessId, streamUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { kind: 'text', role: 'user', content: text }]);
    setSending(true);
    try {
      await sendMessage(businessId, text);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { kind: 'text', role: 'assistant', content: 'Error: ' + (err as Error).message },
      ]);
    } finally {
      setSending(false);
    }
  }, [businessId, input, sending]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 self-center text-center">
            {connectionFailed ? (
              <>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Can&apos;t connect — business may not exist or services aren&apos;t running.
                </p>
                <Link href="/" className="text-sm text-blue-600 underline dark:text-blue-400">
                  Go home and create a business
                </Link>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {connected ? 'Say hello to your CEO.' : 'Connecting to CEO stream...'}
              </p>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.kind === 'ask_user' ? (
            <div key={`ask-${i}`} className="flex flex-col gap-2">
              {m.questions.map((q, qi) => (
                <QuestionCard key={qi} q={q} onAnswer={handleAnswer} />
              ))}
            </div>
          ) : (
            <MessageBubble key={m.id ?? `msg-${i}`} role={m.role} content={m.content} />
          ),
        )}
        {sending && (
          <div className="self-start rounded-2xl rounded-bl-md bg-gray-200 px-4 py-2 dark:bg-gray-700">
            <span className="text-sm text-gray-500">Sending...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form
        className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-700"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message CEO... (Shift+Enter for new line)"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
