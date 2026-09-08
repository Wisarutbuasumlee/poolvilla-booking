import { cache } from 'react';
import { cookies } from 'next/headers';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { AgentModel } from '@/lib/db/models/agent';
import { SettingModel } from '@/lib/db/models/reference';

/**
 * Who, if anyone, referred this visitor.
 *
 * This lives outside src/lib/pricing because it reads cookies and the
 * database. The engine itself stays pure; this is the layer that hands it the
 * numbers.
 */

export type PriceFallback = 'base_price' | 'lowest' | 'primary_agent';

export interface PricingContext {
  agentId: Types.ObjectId | null;
  agentCode: string | null;
  agentName: string | null;
  agentPhone: string | null;
  agentLineId: string | null;
  fallback: PriceFallback;
}

const AGENT_CODE = /^[A-Za-z0-9_-]{2,16}$/;

/**
 * Resolved once per request, however many components ask.
 *
 * React.cache is what makes this safe to call from the villa card, the sticky
 * booking box, the agent card and the JSON-LD generator without four lookups.
 */
export const getPricingContext = cache(async (): Promise<PricingContext> => {
  const settings = await getSiteSettings();
  const fallback = (settings?.priceFallback as PriceFallback) ?? 'base_price';

  const code = (await cookies()).get('pv_ref')?.value ?? null;

  // src/proxy.ts only checks the SHAPE of the code, because it cannot reach
  // the database. Whether the agent exists and is still active is decided
  // here, where it can be.
  if (!code || !AGENT_CODE.test(code)) return anonymous(fallback);

  await connectToDatabase();
  const agent = await AgentModel.findOne(
    { agentCode: code, status: 'active' },
    { agentCode: 1, name: 1, phone: 1, lineId: 1 },
  ).lean();

  // An unknown or suspended agent falls back silently. Showing an error, or
  // worse a price of zero, would punish a guest for a link somebody else sent.
  if (!agent) return anonymous(fallback);

  return {
    agentId: agent._id,
    agentCode: agent.agentCode,
    agentName: agent.name,
    agentPhone: agent.phone,
    agentLineId: agent.lineId ?? null,
    fallback,
  };
});

export const getSiteSettings = cache(async () => {
  await connectToDatabase();
  return SettingModel.findById('site').lean();
});

function anonymous(fallback: PriceFallback): PricingContext {
  return {
    agentId: null,
    agentCode: null,
    agentName: null,
    agentPhone: null,
    agentLineId: null,
    fallback,
  };
}
