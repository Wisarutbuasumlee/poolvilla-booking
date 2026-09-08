'use client';

import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PartyPopper,
  ScrollText,
  Settings,
  Sun,
  Tags,
  Users,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/common/locale-switcher';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/db/models/reference';

/**
 * The back-office chrome.
 *
 * Navigation is filtered by role, but that is a convenience and never a
 * permission: every page and Server Action re-checks with requireRole. Hiding
 * a link stops a colleague wandering into a page they cannot use; it does not
 * stop anyone who types the URL, and it is not meant to.
 *
 * The href values are internal paths WITHOUT the /admin prefix, because
 * src/proxy.ts rewrites the admin hostname onto that prefix. On the path
 * fallback used in development, next-intl's Link resolves them the same way.
 */

interface NavItem {
  href: string;
  key: string;
  Icon: typeof LayoutDashboard;
  roles: readonly Role[];
}

const ALL: readonly Role[] = ['superadmin', 'staff', 'agent'];
const OFFICE: readonly Role[] = ['superadmin', 'staff'];
const OWNER: readonly Role[] = ['superadmin'];

const NAV: NavItem[] = [
  { href: '/admin', key: 'dashboard', Icon: LayoutDashboard, roles: ALL },
  { href: '/admin/villas', key: 'villas', Icon: Building2, roles: ALL },
  { href: '/admin/bookings', key: 'bookings', Icon: ClipboardList, roles: ALL },
  { href: '/admin/calendar', key: 'calendar', Icon: CalendarDays, roles: ALL },
  { href: '/admin/agents', key: 'agents', Icon: UsersRound, roles: OFFICE },
  { href: '/admin/holidays', key: 'holidays', Icon: Sun, roles: OFFICE },
  { href: '/admin/promotions', key: 'promotions', Icon: Tags, roles: OFFICE },
  { href: '/admin/inquiries', key: 'inquiries', Icon: MessageSquare, roles: OFFICE },
  { href: '/admin/reports', key: 'reports', Icon: BarChart3, roles: OFFICE },
  { href: '/admin/settings', key: 'settings', Icon: Settings, roles: OWNER },
  { href: '/admin/users', key: 'users', Icon: Users, roles: OWNER },
  { href: '/admin/audit', key: 'audit', Icon: ScrollText, roles: OWNER },
];

export function AdminShell({
  children,
  actorName,
  actorRole,
  signOutAction,
  locale,
}: {
  children: ReactNode;
  actorName: string;
  actorRole: Role;
  signOutAction: (formData: FormData) => Promise<void>;
  locale: string;
}) {
  const t = useTranslations('admin.nav');
  const common = useTranslations('common');
  const pathname = usePathname();

  const items = NAV.filter((item) => item.roles.includes(actorRole));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4 lg:px-5">
          <PartyPopper className="h-5 w-5 text-[var(--accent)]" aria-hidden />
          <span className="font-semibold">{common('brand')}</span>
        </div>

        {/* Horizontal and scrollable on small screens: agents work from a
            phone, and a collapsed hamburger would hide the one link they
            open forty times a day. */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
          {items.map(({ href, key, Icon }) => {
            const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-[var(--accent-subtle)] font-medium text-[var(--accent)]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--fg-default)]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 lg:px-8">
          <span className="mr-auto truncate text-sm text-[var(--fg-muted)]">{actorName}</span>
          <LocaleSwitcher />
          <ThemeToggle />
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="flex h-9 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--fg-default)]"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{common('action.signOut')}</span>
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
