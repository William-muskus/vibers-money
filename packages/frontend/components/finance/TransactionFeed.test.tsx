import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TransactionFeed from './TransactionFeed';

describe('TransactionFeed', () => {
  it('renders empty state', () => {
    render(<TransactionFeed />);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('renders transactions', () => {
    render(
      <TransactionFeed
        transactions={[
          { id: '1', amount: 10, description: 'Ads', timestamp: '' },
          { id: '2', amount: -5, description: 'Refund', timestamp: '' },
        ]}
      />,
    );
    expect(screen.getByText('Ads')).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
    expect(screen.getByText('+$10.00')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === '$-5.00')).toBeInTheDocument();
  });
});
