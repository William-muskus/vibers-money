import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalletBalance from './WalletBalance';

describe('WalletBalance', () => {
  it('renders default balance as $0.00', () => {
    render(<WalletBalance />);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('Wallet balance')).toBeInTheDocument();
  });

  it('renders custom balance', () => {
    render(<WalletBalance balance={123.45} />);
    expect(screen.getByText('$123.45')).toBeInTheDocument();
  });
});
