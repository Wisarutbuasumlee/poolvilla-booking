'use server';

import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import { routing, type Locale } from '@/i18n/routing';
import { clientIdentifier, rateLimit } from '@/lib/rate-limit';

/**
 * Authentication actions.
 *
 * These live in a module-level 'use server' file rather than as closures
 * inside the page. An inline action defined in a component gets an identifier
 * derived from that component's build output, and a page reached through the
 * hostname rewrite does not always resolve back to the same one, which shows
 * up as "Failed to find Server Action" on submit. A top-level action module
 * has a stable identifier and does not care how the page was routed.
 */

function localeOf(value: FormDataEntryValue | null): Locale {
  const candidate = String(value ?? '');
  return (routing.locales as readonly string[]).includes(candidate)
    ? (candidate as Locale)
    : routing.defaultLocale;
}

/**
 * Only ever redirect to a path on this site.
 *
 * callbackUrl comes from the query string. An absolute URL here would let
 * anyone send a staff member a sign-in link that lands them somewhere the
 * attacker controls, carrying whatever the form just posted.
 */
function safeCallback(value: FormDataEntryValue | null, locale: Locale): string {
  const candidate = String(value ?? '');
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return `/${locale}/admin`;
  return candidate;
}

export async function signInAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData.get('locale'));
  const target = safeCallback(formData.get('callbackUrl'), locale);

  // Ten attempts in fifteen minutes per address. The back office has a handful
  // of accounts, so this costs a staff member who mistypes nothing and costs
  // somebody working through a password list everything.
  const limit = await rateLimit('signin', await clientIdentifier(), 10, 900);
  if (!limit.allowed) {
    redirect(`/${locale}/login?error=throttled`);
  }

  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: target,
    });
  } catch (cause) {
    // A successful sign-in throws a redirect, which has to be allowed out.
    if (cause instanceof Error && cause.message.includes('NEXT_REDIRECT')) throw cause;

    // One message for every failure. Telling the visitor whether the account
    // exists turns this form into an account enumeration oracle.
    redirect(`/${locale}/login?error=1&callbackUrl=${encodeURIComponent(target)}`);
  }
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData.get('locale'));
  await signOut({ redirectTo: `/${locale}/login` });
}
