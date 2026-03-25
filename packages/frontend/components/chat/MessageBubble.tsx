'use client';

import ChatMarkdown from './ChatMarkdown';

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  content: string;
};

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex w-full justify-start">
        <div className="animate-scale-in max-w-[85%] rounded-2xl rounded-bl-md bg-indigo-500 px-4 py-2.5 text-base shadow-lg shadow-indigo-500/20 transition-shadow duration-300 dark:bg-indigo-400 dark:shadow-indigo-400/20">
          <ChatMarkdown
            content={content}
            variant="user"
            className="wrap-break-word text-pretty text-base text-white dark:text-gray-900"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-end">
      <div className="flex max-w-[85%] flex-col gap-2">
        <div className="animate-scale-in rounded-2xl rounded-br-md border border-white/60 bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-sm transition-all duration-300 dark:border-white/10 dark:bg-[#14151c]/90">
          <ChatMarkdown
            content={content}
            variant="assistant"
            className="wrap-break-word text-pretty text-base text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
}
