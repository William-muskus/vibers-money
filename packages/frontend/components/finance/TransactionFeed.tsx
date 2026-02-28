'use client';

type Tx = { id: string; amount: number; description: string; timestamp: string };

export default function TransactionFeed({ transactions = [] }: { transactions?: Tx[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Recent transactions</h3>
      <ul className="mt-2 space-y-2">
        {transactions.slice(0, 10).map((tx) => (
          <li key={tx.id} className="flex justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">{tx.description}</span>
            <span className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
              {tx.amount >= 0 ? '+' : ''}${tx.amount.toFixed(2)}
            </span>
          </li>
        ))}
        {transactions.length === 0 && <li className="text-sm text-gray-500">No transactions yet.</li>}
      </ul>
    </div>
  );
}
