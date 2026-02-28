'use client';

type Budget = { role: string; allocated: number; spent: number };

export default function BudgetBars({ budgets = [] }: { budgets?: Budget[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Budget by agent</h3>
      <div className="mt-2 space-y-2">
        {budgets.map((b) => {
          const pct = b.allocated > 0 ? (b.spent / b.allocated) * 100 : 0;
          return (
            <div key={b.role}>
              <div className="flex justify-between text-xs">
                <span className="text-gray-700 dark:text-gray-300">{b.role}</span>
                <span>${b.spent.toFixed(0)} / ${b.allocated.toFixed(0)}</span>
              </div>
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-600">
                <div className="h-2 rounded bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </div>
          );
        })}
        {budgets.length === 0 && <p className="text-sm text-gray-500">No budget data.</p>}
      </div>
    </div>
  );
}
