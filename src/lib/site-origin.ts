import { headers } from 'next/headers';

/**
 * The origin a referral link should point at.
 *
 * Read from the request rather than from an env var, because the answer
 * depends on who is asking. A staff member on admin.example.com must be given
 * example.com, and one testing over the LAN at 192.168.1.129:3000 must be
 * given that, or the link they copy resolves to nothing on the phone they
 * paste it into.
 */
export async function publicOrigin(): Promise<string> {
  const requestHeaders = await headers();

  const host = (
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    ''
  ).toLowerCase();

  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');

  // A referral link is for guests, so it must never carry the admin hostname.
  const adminHosts = (process.env.ADMIN_HOSTNAMES ?? 'admin.localhost:3000')
    .split(',')
    .map((entry) => entry.trim().toLowerCase());

  const publicHost = adminHosts.includes(host) ? host.replace(/^admin\./, '') : host;

  return `${protocol}://${publicHost}`;
}
