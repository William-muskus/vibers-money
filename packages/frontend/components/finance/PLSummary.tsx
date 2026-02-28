'use client';

type PLSummaryProps = {
  totalAllocated?: number;
  totalSpent?: number;
  revenue?: number;
};

export default function PLSummary({ totalAllocated = 0, totalSpent = 0, revenue = 0 }: PLSummaryProps) {
  const net = revenue - totalSpent;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">P&amp;L summary</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-600 dark:text-gray-400">Budget allocated</span>
          <p className="font-semibold text-gray-900 dark:text-white">${totalAllocated.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Spent</span>
          <p className="font-semibold text-gray-900 dark:text-white">${totalSpent.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Revenue</span>
          <p className="font-semibold text-gray-900 dark:text-white">${revenue.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Net</span>
          <p className={`font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>${net.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
