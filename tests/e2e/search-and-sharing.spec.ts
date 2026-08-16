import { expect, test } from '@playwright/test';
import { openItemMenu, resetFakeSeafile, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetFakeSeafile(page);
  await signIn(page);
});

test('finds partial names and extensions', async ({ page }) => {
  const search = page.getByRole('textbox', { name: 'Search files and folders' });
  await search.fill('port');
  await expect(page.getByText('Quarterly Report', { exact: true })).toBeVisible();
  await search.fill('.pdf');
  await expect(page.getByText('Quarterly Report', { exact: true })).toBeVisible();
  await expect(page.getByText('Release Notes', { exact: true })).toHaveCount(0);
});

test('applies advanced file type filters', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Search files and folders' }).fill('e');
  await page.getByRole('button', { name: 'Advanced search' }).click();
  await page.getByLabel('File type').selectOption('text');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('Release Notes', { exact: true })).toBeVisible();
  await expect(page.getByText('Quarterly Report', { exact: true })).toHaveCount(0);
});

test('stars an item and renders it on the Starred page', async ({ page }) => {
  await page.getByRole('button', { name: 'Star Release Notes.txt' }).click();
  await expect(page.getByText('Added to Starred')).toBeVisible();
  await page.getByRole('button', { name: 'Starred', exact: true }).click();
  await expect(page.getByText('Release Notes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Release Notes/ })).toBeVisible();
});

test('opens share creation with supported options', async ({ page }) => {
  await openItemMenu(page, 'Quarterly Report.pdf');
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Share “Quarterly Report”' })).toBeVisible();
  await expect(page.getByLabel('Optional password')).toBeVisible();
  await expect(page.getByLabel('Link expires')).toBeVisible();
  await expect(page.getByText('Allow downloads')).toBeVisible();
  await expect(page.getByText('Allow editing when supported')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage shares' })).toBeVisible();
});

test('lists and revokes existing external links', async ({ page }) => {
  await openItemMenu(page, 'Quarterly Report.pdf');
  await page.getByRole('menuitem', { name: 'Manage shares' }).click();
  await expect(page.getByRole('heading', { name: 'Manage shares' })).toBeVisible();
  await expect(page.getByText('External share link')).toBeVisible();
  await expect(page.getByText(/Internal user and group shares are intentionally hidden/)).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('No external links')).toBeVisible();
});
