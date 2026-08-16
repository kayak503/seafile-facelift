import { expect, test } from '@playwright/test';
import { resetFakeSeafile, signIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetFakeSeafile(page);
  await signIn(page);
});

test('mobile navigation remains usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('complementary').getByRole('button', { name: 'Close navigation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Recent', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
});

test('mobile file rows retain selection controls', async ({ page }) => {
  await expect(page.getByRole('checkbox', { name: 'Select Quarterly Report.pdf' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select Quarterly Report.pdf' }).click();
  await expect(page.getByText('1 item selected')).toBeVisible();
});
