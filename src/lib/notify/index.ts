/**
 * Outbound notifications.
 *
 * Every channel is an adapter that is skipped when its variables are unset,
 * and a failure in any of them NEVER fails the operation that triggered it. A
 * booking that succeeded and a notification that did not is an annoyance; a
 * booking rejected because an SMTP host was down is lost money.
 */

export interface NotificationPayload {
  title: string;
  lines: string[];
  url?: string;
}

interface Channel {
  name: string;
  enabled(): boolean;
  send(payload: NotificationPayload): Promise<void>;
}

const line: Channel = {
  name: 'line',
  enabled: () =>
    process.env.NOTIFY_LINE_ENABLED === 'true' && Boolean(process.env.LINE_NOTIFY_TOKEN),
  async send(payload) {
    const body = new URLSearchParams({
      message: `\n${payload.title}\n${payload.lines.join('\n')}${payload.url ? `\n${payload.url}` : ''}`,
    });

    await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LINE_NOTIFY_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      // Without this a hung provider holds a Server Action open until the
      // platform's own timeout, which the guest experiences as a dead button.
      signal: AbortSignal.timeout(8_000),
    });
  },
};

const telegram: Channel = {
  name: 'telegram',
  enabled: () =>
    process.env.NOTIFY_TELEGRAM_ENABLED === 'true' &&
    Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  async send(payload) {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: [payload.title, ...payload.lines, payload.url].filter(Boolean).join('\n'),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  },
};

const email: Channel = {
  name: 'email',
  enabled: () => process.env.NOTIFY_EMAIL_ENABLED === 'true' && Boolean(process.env.SMTP_HOST),
  async send(payload) {
    // Imported lazily so nodemailer is not loaded on every request that never
    // sends mail, which is nearly all of them.
    const { createTransport } = await import('nodemailer');

    const transport = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SMTP_USER,
      subject: payload.title,
      text: [...payload.lines, payload.url].filter(Boolean).join('\n'),
    });
  },
};

const CHANNELS = [line, telegram, email];

/**
 * Sends on every enabled channel and reports what happened.
 *
 * Never throws. Callers do not check the result; it exists so a failure is
 * visible in the logs rather than silent.
 */
export async function notifyStaff(payload: NotificationPayload): Promise<void> {
  const active = CHANNELS.filter((channel) => channel.enabled());
  if (active.length === 0) return;

  const results = await Promise.allSettled(active.map((channel) => channel.send(payload)));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `[notify] ${active[index]!.name} failed:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  });
}
