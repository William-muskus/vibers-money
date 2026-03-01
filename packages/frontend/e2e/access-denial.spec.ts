import { test, expect } from '@playwright/test';

test.describe('Access denial', () => {
  test('visiting /chat/:id for unknown business shows no-access and link home', async ({ page }) => {
    const unknownId = 'unknown-business-' + Date.now();
    await page.goto(`/chat/${unknownId}`);
    const link = page.getByRole('link', { name: 'Go home' });
    await expect(link).toBeVisible({ timeout: 25000 });
    await expect(link).toHaveAttribute('href', '/');
  });

  test('visiting /finance/:id for unknown business shows no-access and link home', async ({ page }) => {
    const unknownId = 'unknown-finance-' + Date.now();
    await page.goto(`/finance/${unknownId}`);
    const link = page.getByRole('link', { name: 'Go home' });
    await expect(link).toBeVisible({ timeout: 25000 });
    await expect(link).toHaveAttribute('href', '/');
  });
});
