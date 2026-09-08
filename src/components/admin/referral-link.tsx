'use client';

import { Check, Copy, QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * An agent's referral link, with a QR code.
 *
 * The origin arrives as a prop from the server, which reads it from the same
 * Host header the visitor's request carried. That matters for more than
 * tidiness: a staff member testing on a phone over the LAN needs the address
 * they can actually reach, and a hard-coded production origin would hand them
 * a link that resolves to nothing.
 *
 * The QR is generated in the browser, on demand. It is a picture of a URL
 * already on screen, so making the server draw it would be a round trip for
 * nothing, and loading the library up front would cost every page view.
 */
export function ReferralLink({ agentCode, origin }: { agentCode: string; origin: string }) {
  const t = useTranslations('admin.agents');
  const href = `${origin}/a/${agentCode}`;

  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!showQr || qr) return;
    let cancelled = false;

    void import('qrcode').then(async ({ default: QRCode }) => {
      const url = await QRCode.toDataURL(href, { width: 480, margin: 1 });
      if (!cancelled) setQr(url);
    });

    return () => {
      cancelled = true;
    };
  }, [showQr, href, qr]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some in-app browsers refuse clipboard access. The link is selectable
      // on screen, so there is nothing useful to say about it.
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="tnum flex-1 select-all truncate rounded-[var(--radius-md)] bg-[var(--bg-sunken)] px-3 py-2 text-sm">
          {href}
        </code>

        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? t('copied') : t('copyLink')}
        </Button>

        <Button type="button" size="sm" variant="ghost" onClick={() => setShowQr((on) => !on)}>
          <QrCode className="h-4 w-4" aria-hidden />
          {t('qr')}
        </Button>
      </div>

      {showQr && qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={t('qr')}
          width={200}
          height={200}
          className="rounded-[var(--radius-md)]"
        />
      ) : null}
    </div>
  );
}
