import { expect, test } from '@playwright/test';

/**
 * The booking flow, end to end.
 *
 * This is the test that matters. Everything else in the suite proves a part
 * works; this proves a guest can get from a villa page to a booking number
 * with money owed, which is the only thing the business needs the site to do.
 *
 * It runs on desktop and on a phone, because most Thai guests book from one.
 */

test.describe('booking a villa', () => {
  test('a guest can book and reach the payment page', async ({ page }) => {
    // Far enough out that seeded bookings cannot take these nights, and a
    // fresh offset per run so repeated runs do not collide with each other.
    const offset = 120 + (Date.now() % 90);
    const checkIn = daysFromNow(offset);
    const checkOut = daysFromNow(offset + 2);

    await page.goto(`/th/booking/DV-2685?checkIn=${checkIn}&checkOut=${checkOut}&adults=10`);

    // The summary must price the stay before anything is filled in. A form
    // that asks for a name before showing a total is asking for trust it has
    // not earned yet.
    await expect(page.getByRole('heading', { name: 'ตรวจสอบ' })).toBeVisible();
    await expect(page.getByText('ยอดรวม')).toBeVisible();

    // The damage deposit is shown apart from the total, because it is held
    // rather than charged.
    await expect(page.getByText(/ประกันความเสียหาย/)).toBeVisible();

    await page.locator('#name').fill('ผู้ทดสอบ ระบบ');
    await page.locator('#phone').fill('081-234-5678');
    await page.locator('#lineId').fill('e2e-tester');
    await page.locator('input[name="acceptedTerms"]').check();

    await page.getByRole('button', { name: 'จองและไปหน้าชำระเงิน' }).click();

    // A booking number, and the deposit to pay.
    await expect(page).toHaveURL(/\/booking\/pay\/BK-\d{8}-\d{4}/);
    await expect(page.getByRole('heading', { name: 'ชำระมัดจำ' })).toBeVisible();
    await expect(page.getByText(/ระบบกันวันไว้ให้อีก/)).toBeVisible();
  });

  test('the same nights cannot be booked twice', async ({ page, context }) => {
    const offset = 220 + (Date.now() % 60);
    const checkIn = daysFromNow(offset);
    const checkOut = daysFromNow(offset + 1);
    const url = `/th/booking/DV-2701?checkIn=${checkIn}&checkOut=${checkOut}&adults=6`;

    await book(page, url, 'ผู้จองคนแรก');
    await expect(page).toHaveURL(/\/booking\/pay\//);

    // A second guest, with their own cookies, tries the same night.
    const second = await context.browser()!.newPage();
    await book(second, url, 'ผู้จองคนที่สอง');

    // They are refused with the date named, not left on a spinner.
    await expect(second.getByText(new RegExp(`${checkIn}.*ถูกจองไปแล้ว`))).toBeVisible();
    await second.close();
  });

  test('a booking can be looked up with its number and phone', async ({ page }) => {
    const offset = 300 + (Date.now() % 40);
    await book(
      page,
      `/th/booking/DV-2712?checkIn=${daysFromNow(offset)}&checkOut=${daysFromNow(offset + 1)}&adults=6`,
      'ผู้ตรวจสอบ การจอง',
    );

    const bookingNo = new URL(page.url()).pathname.split('/').pop()!;

    await page.goto('/th/booking/lookup');
    await page.locator('#bookingNo').fill(bookingNo);
    await page.locator('#phone').fill('081-234-5678');
    await page.getByRole('button', { name: 'ตรวจสอบ' }).click();

    await expect(page.getByText(bookingNo)).toBeVisible();
    await expect(page.getByText('รอชำระมัดจำ')).toBeVisible();
  });

  test('the wrong phone number reveals nothing', async ({ page }) => {
    await page.goto('/th/booking/lookup');
    await page.locator('#bookingNo').fill('BK-20260101-0001');
    await page.locator('#phone').fill('099-999-9999');
    await page.getByRole('button', { name: 'ตรวจสอบ' }).click();

    // One message for a wrong number and a wrong phone alike. Distinguishing
    // them would confirm which booking numbers exist.
    await expect(page.getByText(/ไม่พบการจอง/)).toBeVisible();
  });
});

async function book(page: import('@playwright/test').Page, url: string, name: string) {
  await page.goto(url);
  await page.locator('#name').fill(name);
  await page.locator('#phone').fill('081-234-5678');
  await page.locator('#lineId').fill('e2e-tester');
  await page.locator('input[name="acceptedTerms"]').check();
  await page.getByRole('button', { name: 'จองและไปหน้าชำระเงิน' }).click();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
