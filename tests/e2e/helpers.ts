import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export async function resetFakeSeafile(page: Page) {
  // Production rate limiting keys off the proxy-provided client address. Give each isolated
  // browser context a unique key so separate Playwright projects cannot share a rate bucket.
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `e2e-${randomUUID()}` });
  await page.request.post('http://127.0.0.1:4100/__reset');
}

export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email or username').fill('designer@example.com');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Quarterly Report', { exact: true })).toBeVisible();
}

export async function openItemMenu(page: Page, filename: string) {
  await page.getByRole('button', { name: `Actions for ${filename}` }).click();
}
