import { AlertCircle, PartyPopper } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { currentActor } from '@/lib/auth/rbac';
import { signInAction } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Card } from '@/components/ui/surface';
import type { Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Staff sign-in.
 *
 * Lives inside the admin tree but outside the (protected) group, so it renders
 * without a session. src/proxy.ts also exempts this path from its token check;
 * without that exemption, signing in would redirect to itself forever.
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { callbackUrl, error } = await searchParams;
  const t = await getTranslations('admin.login');
  const common = await getTranslations('common');

  const fallbackTarget = await defaultTarget(locale);

  // Already signed in: no reason to show this page.
  if (await currentActor()) redirect(`/${locale}/admin`);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-sunken)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <PartyPopper className="h-6 w-6 text-[var(--accent)]" aria-hidden />
          <span className="text-lg font-semibold">{common('brand')}</span>
        </div>

        <Card className="p-6">
          <h1 className="text-lg font-semibold">{t('title')}</h1>

          {error ? (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error === 'throttled' ? t('throttled') : t('failed')}
            </p>
          ) : null}

          <form action={signInAction} className="mt-5 space-y-4">
            <input type="hidden" name="locale" value={locale} />
            {/* Where to land after signing in.
                On the admin hostname the back office IS the site root, so the
                default is /{locale}; the proxy folds an explicit /admin away
                on that host anyway. On the development path fallback there is
                no such implication and /{locale} would be the public site. */}
            <input
              type="hidden"
              name="callbackUrl"
              value={callbackUrl ?? fallbackTarget}
            />

            <Field label={t('email')} htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
              />
            </Field>

            <Field label={t('password')} htmlFor="password" required>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>

            <Button type="submit" block size="lg">
              {t('submit')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

/** The admin root as seen from whichever hostname the visitor arrived on. */
async function defaultTarget(locale: Locale): Promise<string> {
  const requestHeaders = await headers();
  const host = (
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    ''
  ).toLowerCase();

  const adminHosts = (process.env.ADMIN_HOSTNAMES ?? 'admin.localhost:3200')
    .split(',')
    .map((entry) => entry.trim().toLowerCase());

  return adminHosts.includes(host) ? `/${locale}` : `/${locale}/admin`;
}
