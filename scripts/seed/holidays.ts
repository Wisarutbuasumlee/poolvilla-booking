/**
 * Thai public holidays.
 *
 * ---------------------------------------------------------------------------
 * What is here and what is deliberately not
 * ---------------------------------------------------------------------------
 * Only FIXED-DATE holidays are seeded. Thailand's Buddhist holidays follow the
 * lunar calendar, and their Gregorian dates move every year: Makha Bucha,
 * Visakha Bucha, Asalha Bucha and Khao Phansa are announced annually and
 * cannot be derived from a formula.
 *
 * Inventing plausible dates for those would be worse than omitting them. A
 * wrong holiday silently reprices real bookings at the holiday rate, and
 * nobody would notice until a guest disputed a bill. So they are listed as
 * work for an admin, and the seed prints that list.
 *
 * Long-weekend eves are generated from the holidays that ARE known, because
 * that rule is mechanical: the night before a run of holidays prices as a
 * holiday, since that is when guests actually travel.
 */

export interface SeedHoliday {
  dateKey: string;
  name: { th: string; en: string; zh: string };
  type: 'public' | 'substitution' | 'long_weekend' | 'custom';
}

/** Month and day, with the same name every year. */
const FIXED = [
  { md: '01-01', th: 'วันขึ้นปีใหม่', en: "New Year's Day", zh: '元旦' },
  { md: '04-06', th: 'วันจักรี', en: 'Chakri Memorial Day', zh: '却克里王朝纪念日' },
  { md: '04-13', th: 'วันสงกรานต์', en: 'Songkran', zh: '宋干节' },
  { md: '04-14', th: 'วันสงกรานต์', en: 'Songkran', zh: '宋干节' },
  { md: '04-15', th: 'วันสงกรานต์', en: 'Songkran', zh: '宋干节' },
  { md: '05-01', th: 'วันแรงงานแห่งชาติ', en: 'Labour Day', zh: '劳动节' },
  { md: '05-04', th: 'วันฉัตรมงคล', en: 'Coronation Day', zh: '加冕日' },
  { md: '06-03', th: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี', en: "Queen's Birthday", zh: '王后诞辰' },
  { md: '07-28', th: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', en: "King's Birthday", zh: '国王诞辰' },
  { md: '08-12', th: 'วันแม่แห่งชาติ', en: "Mother's Day", zh: '母亲节' },
  { md: '10-13', th: 'วันนวมินทรมหาราช', en: 'King Bhumibol Memorial Day', zh: '普密蓬国王纪念日' },
  { md: '10-23', th: 'วันปิยมหาราช', en: 'Chulalongkorn Day', zh: '五世王纪念日' },
  { md: '12-05', th: 'วันพ่อแห่งชาติ', en: "Father's Day", zh: '父亲节' },
  { md: '12-10', th: 'วันรัฐธรรมนูญ', en: 'Constitution Day', zh: '宪法日' },
  { md: '12-31', th: 'วันสิ้นปี', en: "New Year's Eve", zh: '除夕' },
] as const;

/** Announced annually against the lunar calendar. An admin has to enter these. */
export const LUNAR_HOLIDAYS_TO_ENTER = [
  'มาฆบูชา (Makha Bucha)',
  'วิสาขบูชา (Visakha Bucha)',
  'อาสาฬหบูชา (Asalha Bucha)',
  'วันเข้าพรรษา (Khao Phansa)',
] as const;

function addDays(dateKey: string, days: number): string {
  const next = new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

export function buildHolidays(years: readonly number[]): SeedHoliday[] {
  const byDate = new Map<string, SeedHoliday>();

  for (const year of years) {
    for (const entry of FIXED) {
      const dateKey = `${year}-${entry.md}`;
      byDate.set(dateKey, {
        dateKey,
        name: { th: entry.th, en: entry.en, zh: entry.zh },
        type: 'public',
      });
    }
  }

  // The night before a run of holidays prices as a holiday, because that is
  // the night people travel. Only the FIRST day of a run gets an eve; adding
  // one before every holiday in a run would just re-flag days already covered.
  for (const dateKey of [...byDate.keys()]) {
    const previous = addDays(dateKey, -1);
    if (byDate.has(previous)) continue;

    byDate.set(previous, {
      dateKey: previous,
      name: {
        th: 'คืนก่อนวันหยุดยาว',
        en: 'Long weekend eve',
        zh: '长假前夜',
      },
      type: 'long_weekend',
    });
  }

  return [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
