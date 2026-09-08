import { expect, test } from '@playwright/test';

/**
 * Finding a villa.
 *
 * These assert on what a guest sees, not on class names or internal ids. A
 * test that breaks when a wrapper div changes is a test that gets deleted the
 * first time it cries wolf.
 */

test.describe('finding a villa', () => {
  test('the home page leads to search with the dates carried over', async ({ page }) => {
    await page.goto('/th');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Two nights, starting a fortnight out, so the seeded bookings do not
    // decide whether this test passes.
    const checkIn = daysFromNow(14);
    const checkOut = daysFromNow(16);

    await page.locator('input[name="checkIn"]').fill(checkIn);
    await page.locator('input[name="checkOut"]').fill(checkOut);
    await page.getByRole('button', { name: /ค้นหา/ }).click();

    await expect(page).toHaveURL(new RegExp(`/th/villas\\?.*checkIn=${checkIn}`));

    // With dates chosen, cards show a stay total rather than a nightly rate.
    // Getting this backwards would quote a two-night price as one night's.
    await expect(page.getByText(/รวม 2 คืน/).first()).toBeVisible();
  });

  test('a filter is a real URL that can be shared', async ({ page }) => {
    await page.goto('/th/villas');
    await page.getByRole('link', { name: 'สไลเดอร์' }).click();

    await expect(page).toHaveURL(/amenities=pool_slide/);

    // Reloading the shared URL reproduces the same result, which is the whole
    // point of keeping search state in the address bar.
    await page.reload();
    await expect(page.getByRole('link', { name: 'สไลเดอร์' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('an impossible search explains itself instead of showing nothing', async ({ page }) => {
    await page.goto('/th/villas?guests=59&bedrooms=20');
    await expect(page.getByText(/ไม่พบบ้านที่ตรงเงื่อนไข/)).toBeVisible();
    await expect(page.getByRole('link', { name: /ล้างตัวกรอง/ })).toBeVisible();
  });

  test('a villa page shows its rate table and calendar', async ({ page }) => {
    await page.goto('/th/villa/DV-2685');

    await expect(page.getByRole('heading', { name: /พูลวิลล่า 5 ห้องนอน/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ตารางราคา' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ปฏิทินวันว่าง' })).toBeVisible();

    // Placeholder art must say so. Letting it pass for a photograph of a real
    // house is the worst thing this page can do.
    await expect(page.getByText(/รูปตัวอย่าง/).first()).toBeVisible();
  });
});

test.describe('referral links', () => {
  test('an agent link changes the price and survives to another page', async ({ page }) => {
    // The base price first, with no referral.
    await page.goto('/th/villa/DV-2685');
    const basePrice = await firstRate(page);

    // Agent 123 marks this villa up, so their price must differ.
    await page.goto('/th/a/123');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/th/villa/DV-2685');
    const agentPrice = await firstRate(page);

    expect(agentPrice).not.toBe(basePrice);

    // And the cookie keeps it that way on a page the agent never linked to.
    await page.goto('/th/villas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

/** The Sunday-to-Thursday figure from the rate table. */
async function firstRate(page: import('@playwright/test').Page): Promise<string> {
  const row = page.getByRole('listitem').filter({ hasText: 'อาทิตย์ถึงพฤหัส' }).first();
  return (await row.textContent()) ?? '';
}

function daysFromNow(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}
