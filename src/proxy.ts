import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing, locales } from '@/i18n/routing';

/**
 * Request routing for both surfaces.
 *
 * Next.js 16 renamed `middleware` to `proxy` and runs it on the Node runtime.
 * That removes the Edge/Node split that used to make auth here awkward, but it
 * does NOT make this a place for database work: this function runs before every
 * page render, so it stays to routing decisions only.
 *
 * ---------------------------------------------------------------------------
 * The one rule that makes this tractable
 * ---------------------------------------------------------------------------
 * Admin always lives at the internal path `/{locale}/admin/...`, no matter how
 * it was reached. The hostname is only a transport. Because of that, the
 * (public) and (admin) route groups can never resolve to the same URL.
 *
 *   admin.localhost:3000/bookings      -> rewrite  /th/admin/bookings
 *   admin.localhost:3000/en/bookings   -> rewrite  /en/admin/bookings
 *   localhost:3000/th/admin/bookings   -> pass through, only when the path
 *                                         fallback env is on, else 404
 *   localhost:3000/th/villas           -> pass through
 *
 * ---------------------------------------------------------------------------
 * Why the steps run in this order
 * ---------------------------------------------------------------------------
 * A single pass can emit a redirect OR a rewrite, never both. next-intl wants
 * to redirect (to add the locale prefix) and the admin host wants to rewrite,
 * so intl has to go first and be allowed to terminate the pass. Rewriting
 * first would also show next-intl a path containing `/admin`, which leaks into
 * hreflang and the language switcher.
 */

const intlMiddleware = createIntlMiddleware(routing);

const ADMIN_HOSTS = (process.env.ADMIN_HOSTNAMES ?? 'admin.localhost:3000')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const PATH_FALLBACK = process.env.ENABLE_ADMIN_PATH_FALLBACK === 'true';

/** Agent codes are short and alphanumeric. Anything else is not a referral. */
const AGENT_CODE = /^[A-Za-z0-9_-]{2,16}$/;
const REF_COOKIE = 'pv_ref';
const REF_MAX_AGE = 60 * 60 * 24 * 30;

const LOCALE_SEGMENT = locales.join('|');
const ADMIN_PATH = new RegExp(`^/(?:(?:${LOCALE_SEGMENT})/)?admin(?:/|$)`);

function isLocale(segment: string | undefined): segment is (typeof locales)[number] {
  return segment !== undefined && (locales as readonly string[]).includes(segment);
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  // --- Step 0: hard bypass. Neither intl nor the rewrite should ever see
  // API routes, build assets, or files with an extension.
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // A proxy sits in front of the app in production, so the forwarded host is
  // the one the visitor actually typed.
  const host = (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    ''
  ).toLowerCase();
  const isAdminHost = ADMIN_HOSTS.includes(host);
  const looksLikeAdminPath = ADMIN_PATH.test(pathname);

  // --- Step 1: settle the admin path before intl touches it.
  if (!isAdminHost && looksLikeAdminPath && !PATH_FALLBACK) {
    // The internal path exists but is not a public entrance. Say not-found
    // rather than redirecting, which would confirm the path is real. The
    // target is an unmatched path under the public locale segment, so it
    // renders that surface's own not-found page rather than a bare 404.
    const first = pathname.split('/')[1];
    const localeHint = isLocale(first) ? first : routing.defaultLocale;
    return NextResponse.rewrite(new URL(`/${localeHint}/_404`, request.url), { status: 404 });
  }

  if (isAdminHost && looksLikeAdminPath) {
    // On the admin host `/admin` is already implied. Typing it would produce
    // /th/admin/admin after the rewrite, so fold it away once.
    const stripped = pathname.replace(new RegExp(`^(/(?:${LOCALE_SEGMENT}))?/admin`), '$1') || '/';
    return withRefCookie(
      NextResponse.redirect(new URL(stripped + request.nextUrl.search, request.url)),
      searchParams,
    );
  }

  // --- Step 2: intl decides the locale, on the original request.
  const intlResponse = intlMiddleware(request);

  // A redirect terminates the pass. Attaching a rewrite to a response that
  // already carries a Location header silently drops the rewrite.
  if (intlResponse.headers.has('location')) {
    return withRefCookie(intlResponse, searchParams);
  }

  // localePrefix is 'always', so once intl has passed the request through, the
  // first segment is guaranteed to be a locale.
  const locale = pathname.split('/')[1] ?? routing.defaultLocale;

  // --- Step 3: authentication for the admin surface.
  // Added in Phase 2 alongside Auth.js. It belongs here, between intl and the
  // rewrite: it needs the locale to build the sign-in URL, and it may redirect,
  // which cannot coexist with the rewrite below. Note that even then this is
  // only a coarse gate; every Server Action re-checks the role, so an auth
  // regression here degrades to a routing bug and not to a data leak.

  // --- Step 4: the rewrite, applied last so it carries intl's state forward.
  if (isAdminHost) {
    const rest = pathname.slice(`/${locale}`.length);
    const target = new URL(`/${locale}/admin${rest}`, request.url);
    target.search = request.nextUrl.search;

    const rewritten = NextResponse.rewrite(target, {
      // Without forwarding intl's request headers the rewritten tree loses the
      // resolved locale and every useTranslations call throws.
      request: { headers: new Headers(intlResponse.headers) },
    });
    carryOver(intlResponse, rewritten);
    rewritten.headers.set('x-pv-surface', 'admin');
    return withRefCookie(rewritten, searchParams);
  }

  intlResponse.headers.set('x-pv-surface', 'public');
  return withRefCookie(intlResponse, searchParams);
}

/** Moves next-intl's cookies and routing headers onto the rewritten response. */
function carryOver(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  from.headers.forEach((value, key) => {
    if (key.startsWith('x-middleware-') || key === 'link' || key === 'vary') {
      to.headers.set(key, value);
    }
  });
}

/**
 * Captures `?ref=<agentCode>` into a 30-day cookie.
 *
 * This runs on EVERY exit path, including the locale redirect. A shared link
 * is almost always `/villa/DV-2685?ref=123` with no locale prefix, so the very
 * first thing that happens to it is a redirect. Setting the cookie only on the
 * pass-through path would lose the referral on exactly the links agents send.
 *
 * The code is only shape-checked here. Whether that agent exists and is active
 * is decided by the pricing layer, which can reach the database.
 */
function withRefCookie(response: NextResponse, searchParams: URLSearchParams): NextResponse {
  const ref = searchParams.get('ref');
  if (ref && AGENT_CODE.test(ref)) {
    response.cookies.set(REF_COOKIE, ref, {
      maxAge: REF_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
