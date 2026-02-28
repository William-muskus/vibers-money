import FinancePageClient from '@/components/finance/FinancePageClient';

export default async function FinancePage(props: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await props.params;
  return <FinancePageClient businessId={businessId ?? ''} />;
}
