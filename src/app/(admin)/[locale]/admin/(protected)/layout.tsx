import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { signOutAction } from '@/lib/auth/actions';
import { currentActor } from '@/lib/auth/rbac';
import type { Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * The authenticated part of the back office.
 *
 * The sign-in page sits one level up, outside this group, because it has to
 * render without a session. Everything inside here has one.
 *
 * This layout is a convenience, not the security boundary. It stops a signed
 * out visitor seeing a broken shell; the real checks live in every page and
 * Server Action, since a layout guard does nothing for an action invoked
 * directly.
 */
export default async function ProtectedAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await currentActor();
  if (!actor) redirect(`/${locale}/login`);

  return (
    <AdminShell actorName={actor.name} actorRole={actor.role} signOutAction={signOutAction}
      locale={locale}>
      {children}
    </AdminShell>
  );
}
