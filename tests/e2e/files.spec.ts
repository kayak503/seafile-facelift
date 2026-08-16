import { expect, test } from '@playwright/test';
import { openItemMenu, resetFakeSeafile, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetFakeSeafile(page);
  await signIn(page);
});

test('separates the file extension from the displayed name', async ({ page }) => {
  const row = page.getByRole('row', { name: /Quarterly Report\.pdf/ });
  await expect(row.getByText('Quarterly Report', { exact: true })).toBeVisible();
  await expect(row.getByRole('gridcell', { name: 'PDF', exact: true })).toBeVisible();
});

test('grid tiles open while their checkboxes exclusively control selection', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid view' }).click();
  await page.getByRole('checkbox', { name: 'Select Quarterly Report.pdf' }).click();
  await expect(page.getByText('1 item selected')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Preview/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Deselect Quarterly Report.pdf' }).click();
  await page.getByText('Quarterly Report', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Preview Quarterly Report.pdf' })).toBeVisible();
});

test('persists grid view and dark mode across reloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid view' }).click();
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('renames only the basename and Enter does not open the file', async ({ page }) => {
  await openItemMenu(page, 'Quarterly Report.pdf');
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const editor = page.getByRole('textbox', { name: 'Rename Quarterly Report.pdf' });
  await expect(editor).toHaveValue('Quarterly Report');
  await editor.fill('Board Report');
  await editor.press('Enter');
  await expect(page.getByText('Board Report', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Preview/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Board Report\.pdf/ })).toBeVisible();
});

test('Escape cancels rename and blur accepts it', async ({ page }) => {
  await openItemMenu(page, 'Release Notes.txt');
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const editor = page.getByRole('textbox', { name: 'Rename Release Notes.txt' });
  await editor.fill('Discarded Name');
  await editor.press('Escape');
  await expect(page.getByText('Release Notes', { exact: true })).toBeVisible();

  await openItemMenu(page, 'Release Notes.txt');
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Rename Release Notes.txt' }).fill('Published Notes');
  await page.getByRole('button', { name: 'My Library', exact: true }).click();
  await expect(page.getByText('Published Notes', { exact: true })).toBeVisible();
});

test('creates a folder from the New menu', async ({ page }) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Launch Assets');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Launch Assets', { exact: true })).toBeVisible();
});

test('exposes bulk actions after selecting multiple items', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Select Quarterly Report.pdf' }).click();
  await page.getByRole('checkbox', { name: 'Select Release Notes.txt' }).click();
  await expect(page.getByText('2 items selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Trash' })).toBeVisible();
});
