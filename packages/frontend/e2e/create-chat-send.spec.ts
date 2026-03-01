import { test, expect } from '@playwright/test';

/**
 * Happy path: create business -> open chat -> send message.
 * Requires orchestrator running (e.g. npm run dev:orchestrator) so POST /api/orchestrator/business/create succeeds.
 */
test.describe('Create business and chat', () => {
  test('create business, navigate to chat, send message', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /what business are we launching/i })).toBeVisible({ timeout: 10000 });

    const placeholder = 'I want to launch a dog meme newsletter';
    const input = page.getByPlaceholder(placeholder);
    await input.fill('E2E Test Co');
    await input.press('Enter');

    await expect(page).toHaveURL(/\/chat\/e2e-test-co/, { timeout: 15000 });

    const chatComposer = page.getByPlaceholder(/ask anything/i);
    await chatComposer.waitFor({ state: 'visible', timeout: 5000 });
    await chatComposer.fill('Hello from E2E');
    await chatComposer.press('Enter');

    await page.waitForTimeout(1500);
    const body = page.locator('body');
    await expect(body.getByText(/Hello from E2E|founder|connected/i)).toBeVisible({ timeout: 8000 });
  });
});
