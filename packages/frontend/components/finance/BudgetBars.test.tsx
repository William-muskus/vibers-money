import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BudgetBars from './BudgetBars';

describe('BudgetBars', () => {
  it('renders empty state', () => {
    render(<BudgetBars />);
    expect(screen.getByText('No budget data.')).toBeInTheDocument();
  });

  it('renders budget bars', () => {
    render(
      <BudgetBars
        budgets={[
          { role: 'ceo', allocated: 100, spent: 30 },
          { role: 'mkt', allocated: 50, spent: 50 },
        ]}
      />,
    );
    expect(screen.getByText('ceo')).toBeInTheDocument();
    expect(screen.getByText('mkt')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === '$30 / $100')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === '$50 / $50')).toBeInTheDocument();
  });
});
