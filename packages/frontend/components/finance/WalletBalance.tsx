'use client';

export default function WalletBalance({ balance = 0 }: { balance?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Wallet balance</h3>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">${balance.toFixed(2)}</p>
    </div>
  );
}
