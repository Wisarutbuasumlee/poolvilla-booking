'use client';

import { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyPoint } from '@/lib/reports/queries';

/**
 * Revenue by night.
 *
 * An area chart rather than bars: this is a continuous quantity over time, and
 * across ninety days bars become a picket fence nobody can read.
 *
 * Every day in the range is present, including the empty ones. A chart that
 * skips quiet days draws a straight line through them and hides exactly the
 * weeks somebody needs to see.
 */
export function RevenueChart({ points }: { points: DailyPoint[] }) {
  const t = useTranslations('admin.dashboard');

  const data = points.map((point) => ({
    ...point,
    // Recharts works in the unit it is given, so baht here rather than satang.
    baht: point.revenue / 100,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--border-default)" vertical={false} />

          <XAxis
            dataKey="date"
            stroke="var(--fg-subtle)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            // Day and month only. Full ISO dates on a ninety-day axis overlap
            // into an unreadable smear.
            tickFormatter={(value: string) => value.slice(5)}
            minTickGap={28}
          />

          <YAxis
            stroke="var(--fg-subtle)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={56}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
            }
          />

          <Tooltip
            cursor={{ stroke: 'var(--border-strong)' }}
            contentStyle={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--fg-muted)' }}
            formatter={(value) => [
              `฿${Number(value ?? 0).toLocaleString('en-US')}`,
              t('revenue'),
            ]}
          />

          <Area
            type="monotone"
            dataKey="baht"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
