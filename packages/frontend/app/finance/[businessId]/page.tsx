import FinancePageClient from '@/components/finance/FinancePageClient';

export default async function FinancePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return <FinancePageClient businessId={businessId ?? ''} />;
}
