import { expect, test } from '@playwright/test';
import { resetFakeSeafile, signIn } from './helpers';

test.beforeEach(async ({ page }) => resetFakeSeafile(page));

test('reports the Seafile connection and rejects invalid credentials', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Seafile Web API connected')).toBeVisible();
  await page.getByLabel('Email or username').fill('designer@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('The email, username, or password is incorrect.')).toBeVisible();
});

test('signs in with Seafile and signs out from the profile menu', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('link', { name: 'Manage profile' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Seafile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('uses a decimal storage quota', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('34 MB of 50 GB')).toBeVisible();
});
