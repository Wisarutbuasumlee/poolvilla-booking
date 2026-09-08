import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { loadMessages } from '@/messages';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    // Every date, time and price in the product is Bangkok-local. Setting it
    // here means a UTC server formats the same string a Bangkok laptop does.
    timeZone: 'Asia/Bangkok',
    now: new Date(),
    formats: {
      number: {
        thb: { style: 'currency', currency: 'THB', maximumFractionDigits: 0 },
      },
    },
  };
});
