'use client';

import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

export type ChatMarkdownVariant = 'user' | 'assistant';

function buildComponents(variant: ChatMarkdownVariant): Components {
  const link =
    variant === 'user'
      ? 'font-medium text-white underline decoration-white/70 underline-offset-2 hover:decoration-white'
      : 'font-medium text-indigo-600 underline decoration-indigo-400/50 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300';

  const codeInline =
    variant === 'user'
      ? 'rounded bg-white/25 px-1.5 py-0.5 font-mono text-[0.9em] text-white'
      : 'rounded bg-black/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-gray-900 dark:bg-white/10 dark:text-gray-100';

  const codeBlock =
    variant === 'user'
      ? 'block w-full overflow-x-auto rounded-lg bg-black/20 p-3 font-mono text-[13px] leading-relaxed text-white'
      : 'block w-full overflow-x-auto rounded-lg bg-black/[0.06] p-3 font-mono text-[13px] leading-relaxed text-gray-900 dark:bg-white/[0.06] dark:text-gray-100';

  const thTd =
    variant === 'user'
      ? 'border border-white/25 px-2 py-1.5 text-left align-top'
      : 'border border-black/10 px-2 py-1.5 text-left align-top dark:border-white/15';

  return {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed [&:first-child]:mt-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0 [&>li]:mt-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0 [&>li]:mt-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => (
      <a href={href} className={link} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    h1: ({ children }) => <h1 className="mb-2 text-lg font-semibold leading-snug">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 text-base font-semibold leading-snug">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1.5 text-[15px] font-semibold leading-snug">{children}</h3>,
    hr: () => (
      <hr
        className={
          variant === 'user'
            ? 'my-3 border-white/30'
            : 'my-3 border-gray-200 dark:border-white/15'
        }
      />
    ),
    blockquote: ({ children }) => (
      <blockquote
        className={
          variant === 'user'
            ? 'mb-2 border-l-2 border-white/50 pl-3 text-white/95 last:mb-0'
            : 'mb-2 border-l-2 border-gray-300 pl-3 text-gray-700 last:mb-0 dark:border-gray-600 dark:text-gray-300'
        }
      >
        {children}
      </blockquote>
    ),
    code: ({ className, children }) => {
      const isBlock = /\blanguage-/.test(className ?? '');
      if (isBlock) {
        return <code className={`${codeBlock} ${className ?? ''}`.trim()}>{children}</code>;
      }
      return <code className={codeInline}>{children}</code>;
    },
    pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
    table: ({ children }) => (
      <div className="mb-2 max-w-full overflow-x-auto last:mb-0">
        <table className="w-full min-w-[12rem] border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className={variant === 'user' ? 'bg-white/10' : 'bg-black/[0.04] dark:bg-white/[0.06]'}>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => <th className={thTd}>{children}</th>,
    td: ({ children }) => <td className={thTd}>{children}</td>,
  };
}

type ChatMarkdownProps = {
  content: string;
  variant: ChatMarkdownVariant;
  className?: string;
};

export default function ChatMarkdown({ content, variant, className }: ChatMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={buildComponents(variant)}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
