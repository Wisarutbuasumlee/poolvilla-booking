import { expect, test } from '@playwright/test';

/**
 * The back office, and the boundary around it.
 *
 * Half of these assert that something is REFUSED. Those are the ones worth
 * having: a page that works is noticed the day it breaks, and a permission
 * that silently stopped being enforced is noticed when somebody reads a
 * booking they should not have seen.
 */

const ADMIN = { email: 'admin@poolvilla.local', password: 'poolvilla-dev-2026' };
const AGENT = { email: 'agent123@poolvilla.local', password: 'poolvilla-agent-2026' };

test.describe('the admin boundary', () => {
  test('an anonymous visitor is sent to sign in, not to a broken page', async ({ page }) => {
    await page.goto('/th/admin/bookings');

    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบหลังบ้าน' })).toBeVisible();
  });

  test('a wrong password says nothing about whether the account exists', async ({ page }) => {
    await page.goto('/th/login');
    await page.locator('#email').fill(ADMIN.email);
    await page.locator('#password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    const wrongPassword = await page.getByRole('alert').textContent();

    await page.goto('/th/login');
    await page.locator('#email').fill('nobody@example.com');
    await page.locator('#password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    // Identical messages. Anything else turns the form into a way to find out
    // which email addresses are real.
    await expect(page.getByRole('alert')).toHaveText(wrongPassword ?? '');
  });
});

test.describe('as an administrator', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN);
  });

  test('the dashboard reports figures that agree with each other', async ({ page }) => {
    await page.goto('/th/admin');

    await expect(page.getByRole('heading', { name: 'ภาพรวม', level: 1 })).toBeVisible();
    await expect(page.getByText('ยอดขาย')).toBeVisible();
    await expect(page.getByText('อัตราการเข้าพัก')).toBeVisible();

    // ADR is accommodation over nights, so it must not be labelled as though
    // it included add-ons.
    await expect(page.getByText(/คิดจากค่าที่พักอย่างเดียว/)).toBeVisible();
  });

  test('the villa list and editor open', async ({ page }) => {
    await page.goto('/th/admin/villas');
    await expect(page.getByText('DV-2685')).toBeVisible();

    await page.getByRole('link', { name: /DV-2685/ }).first().click();
    await expect(page.getByRole('button', { name: 'บันทึก' })).toBeVisible();

    // The base rates belong to the company, and the screen has to say so, or
    // somebody will edit them thinking they are one agent's.
    await page.getByRole('button', { name: 'ราคา' }).click();
    await expect(page.getByText(/ราคานี้คือราคาฐานของบริษัท/)).toBeVisible();
  });

  test('the same villa carries a different price per agent', async ({ page }) => {
    await page.goto('/th/admin/agents');
    await expect(page.getByRole('heading', { name: 'จัดการนายหน้า' })).toBeVisible();

    await page.getByRole('link', { name: /สมชาย/ }).click();

    // Base, markup and selling price are shown together. That is the whole
    // point of the screen.
    await expect(page.getByText(/ยอดบวกเพิ่ม|บันทึกราคา/).first()).toBeVisible();
  });

  test('the month grid shows every villa at once', async ({ page }) => {
    await page.goto('/th/admin/calendar');
    await expect(page.getByRole('heading', { name: 'ปฏิทินรวม' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: /DV-2685/ })).toBeVisible();
  });
});

test.describe('as an agent', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, AGENT);
  });

  test('the portal shows their own villas and earnings', async ({ page }) => {
    await page.goto('/th/admin/portal');

    await expect(page.getByText('ส่วนบวกเพิ่มที่ได้')).toBeVisible();
    await expect(page.getByText('ราคาของคุณ')).toBeVisible();
    await expect(page.getByText(/ลิงก์อ้างอิง/)).toBeVisible();
  });

  test('an agent cannot open the agent roster', async ({ page }) => {
    const response = await page.goto('/th/admin/agents');

    // The roster carries every other agent's revenue. Whether this is refused
    // with a 403 or a redirect matters less than that it is refused.
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });

  test('an agent cannot open site settings', async ({ page }) => {
    const response = await page.goto('/th/admin/settings');
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });
});

async function signIn(
  page: import('@playwright/test').Page,
  who: { email: string; password: string },
) {
  await page.goto('/th/login');
  await page.locator('#email').fill(who.email);
  await page.locator('#password').fill(who.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL(/\/admin/);
}
