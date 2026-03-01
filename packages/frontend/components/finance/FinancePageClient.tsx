'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import WalletBalance from '@/components/finance/WalletBalance';
import BudgetBars from '@/components/finance/BudgetBars';
import TransactionFeed from '@/components/finance/TransactionFeed';
import PLSummary from '@/components/finance/PLSummary';
import { canAccessBusiness, canAccessBusinessAsync } from '@/lib/local-businesses';
import { getStripeConnectStatus, startStripeConnectOnboarding } from '@/lib/api';

type Budget = { role: string; allocated: number; spent: number };
type Tx = { id: string; amount: number; description: string; timestamp: string };

function PayoutsCard({
  businessId,
  connectStatus,
  loading,
  onStartOnboarding,
}: {
  businessId: string;
  connectStatus: { hasAccount: boolean; chargesEnabled: boolean; detailsSubmitted: boolean } | null;
  loading: boolean;
  onStartOnboarding: () => void;
}) {
  const ready = connectStatus?.chargesEnabled;
  const needsSetup = connectStatus?.hasAccount && !connectStatus?.chargesEnabled;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Payouts (Stripe)</h3>
      {connectStatus === null ? (
        <p className="mt-1 text-sm text-gray-500">Checking…</p>
      ) : ready ? (
        <p className="mt-1 text-sm text-green-600 dark:text-green-400">Bank account connected. Payments to this business go to your Stripe Express account.</p>
      ) : needsSetup ? (
        <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Finish adding your bank or card to receive payments.</p>
      ) : (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Add a bank account or card to receive funding for this business.</p>
      )}
      {!ready && (
        <button
          type="button"
          onClick={onStartOnboarding}
          disabled={loading}
          className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Redirecting…' : needsSetup ? 'Complete payout setup' : 'Set up payouts'}
        </button>
      )}
    </div>
  );
}

export default function FinancePageClient({ businessId }: { businessId: string }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [connectStatus, setConnectStatus] = useState<{ hasAccount: boolean; chargesEnabled: boolean; detailsSubmitted: boolean } | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!businessId) {
      setAllowed(false);
      return;
    }
    if (canAccessBusiness(businessId)) {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    canAccessBusinessAsync(businessId).then((ok) => {
      if (!cancelled) setAllowed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/budgets?business_id=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load budgets'))))
      .then((data: { budgets: Budget[] }) => {
        setBudgets(data.budgets || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    getStripeConnectStatus(businessId).then(setConnectStatus).catch(() => setConnectStatus(null));
  }, [businessId, searchParams.get('stripe')]);

  const totalAllocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  if (!businessId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-gray-600 dark:text-gray-400">Missing business ID.</p>
        <Link href="/" className="text-blue-600 underline">Go home</Link>
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-gray-600 dark:text-gray-400">You don’t have access to this business.</p>
        <Link href="/" className="text-blue-600 underline">Go home</Link>
      </div>
    );
  }

  if (allowed === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-gray-500 dark:text-gray-500">Checking access…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <Link href={`/chat/${businessId}`} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          ← Chat
        </Link>
        <h1 className="flex-1 text-lg font-semibold text-gray-900 dark:text-white">
          Finance — {businessId}
        </h1>
      </header>
      <main className="p-4">
        {error && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <WalletBalance balance={walletBalance} />
            <PayoutsCard
              businessId={businessId}
              connectStatus={connectStatus}
              loading={connectLoading}
              onStartOnboarding={async () => {
                setConnectLoading(true);
                try {
                  const { url } = await startStripeConnectOnboarding(businessId);
                  window.location.href = url;
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to start payout setup');
                } finally {
                  setConnectLoading(false);
                }
              }}
            />
            <PLSummary totalAllocated={totalAllocated} totalSpent={totalSpent} revenue={walletBalance} />
            <div className="md:col-span-2 lg:col-span-1">
              <BudgetBars budgets={budgets} />
            </div>
            <div className="md:col-span-2">
              <TransactionFeed transactions={transactions} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
