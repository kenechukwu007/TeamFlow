import { test, expect } from '@playwright/test';

test('sign in, create a project and ticket, comment, edit, filter and delete', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill(process.env.DEMO_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Alex.' })).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('Browser test project');
  await page.getByLabel('Description', { exact: true }).fill('Built through the browser.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Browser test project', exact: true }).click();
  await page.getByRole('button', { name: 'New ticket', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('A complete user journey');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Check persistence, editing, and comments.');
  await page.getByRole('button', { name: 'Create ticket', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A complete user journey' })).toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: 'A complete user journey' }) })
    .click();
  await page.getByLabel('Comment', { exact: true }).fill('Everything is looking good.');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(page.getByText('Everything is looking good.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('done');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.locator('.board-column.done').getByRole('heading', { name: 'A complete user journey' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hello, Alex.' })).toBeVisible();
  await page.getByRole('button', { name: 'All tickets', exact: false }).first().click();
  await page.getByLabel('Search tickets').fill('A complete user journey');
  await expect(page.locator('.ticket-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('.table-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Browser test project', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser test project' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('mobile navigation and registration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Full name').fill('New Teammate');
  await page.getByLabel('Email address').fill('browser@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-browser-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, New.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Team members', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The people behind the work' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
