import Link from 'next/link';

export default async function StripeReturnPage(props: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await props.params;
  const id = businessId ?? '';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Payout setup complete
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          When someone funds this business, payments will go to your connected bank or card.
        </p>
        <Link
          href={`/finance/${encodeURIComponent(id)}`}
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to Finance
        </Link>
      </div>
    </div>
  );
}
