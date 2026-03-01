import ChatPageClient from '@/components/chat/ChatPageClient';

export default async function ChatPage(props: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { businessId } = await props.params;
  const searchParams = await props.searchParams;
  const initialMessage =
    typeof searchParams?.initialMessage === 'string'
      ? searchParams.initialMessage
      : Array.isArray(searchParams?.initialMessage)
        ? searchParams.initialMessage[0]
        : undefined;
  return (
    <ChatPageClient
      businessId={businessId ?? ''}
      initialMessage={initialMessage ?? undefined}
    />
  );
}
