import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PLSummary from './PLSummary';

describe('PLSummary', () => {
  it('renders P&L summary with defaults', () => {
    render(<PLSummary />);
    expect(screen.getByText(/P&L summary/)).toBeInTheDocument();
    const zeros = screen.getAllByText('$0.00');
    expect(zeros.length).toBe(4);
  });

  it('renders net positive in green', () => {
    render(<PLSummary totalAllocated={100} totalSpent={40} revenue={80} />);
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    const forty = screen.getAllByText('$40.00');
    expect(forty).toHaveLength(2); // Spent and Net
    expect(screen.getByText('Net').nextElementSibling).toHaveClass('text-green-600');
  });
});
