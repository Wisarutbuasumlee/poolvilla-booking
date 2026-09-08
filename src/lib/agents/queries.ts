import { Types } from 'mongoose';
import { cache } from 'react';
import { connectToDatabase } from '@/lib/db/connect';
import { AgentModel } from '@/lib/db/models/agent';
import { BookingModel } from '@/lib/db/models/booking';
import { VillaModel } from '@/lib/db/models/villa';
import { VillaAgentModel } from '@/lib/db/models/villa-agent';
import type { Actor } from '@/lib/auth/rbac';

/**
 * Reads for the agent screens, in the back office and on the public
 * /a/<code> page.
 *
 * Money figures come from the booking snapshots, never from a live join to
 * villa_agents. A payout report that re-derived commission from today's rates
 * would restate history every time somebody edited a markup.
 */

export interface AgentSummary {
  id: string;
  agentCode: string;
  name: string;
  phone: string;
  lineId: string | null;
  status: 'active' | 'suspended';
  villaCount: number;
  bookingCount: number;
  /** Revenue on bookings that actually happened, in satang. */
  revenue: number;
  /** The company's commission, from the snapshots. */
  commission: number;
  /** What this agent earned as markup, from the snapshots. */
  markupEarned: number;
}

/** Bookings that count as real money: cancelled and expired ones do not. */
const EARNING_STATUSES = ['confirmed', 'checked_in', 'completed'] as const;

export async function listAgents(): Promise<AgentSummary[]> {
  await connectToDatabase();

  const agents = await AgentModel.find({}).sort({ agentCode: 1 }).lean();
  if (agents.length === 0) return [];

  const ids = agents.map((agent) => agent._id);

  // Two aggregations for the whole table rather than three queries per row.
  const [villaCounts, bookingTotals] = await Promise.all([
    VillaAgentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { agentId: { $in: ids }, isActive: true } },
      { $group: { _id: '$agentId', n: { $sum: 1 } } },
    ]),
    BookingModel.aggregate<{
      _id: Types.ObjectId;
      bookings: number;
      revenue: number;
      commission: number;
      markup: number;
    }>([
      { $match: { agentId: { $in: ids }, status: { $in: EARNING_STATUSES } } },
      {
        $group: {
          _id: '$agentId',
          bookings: { $sum: 1 },
          revenue: { $sum: '$priceBreakdown.grandTotal' },
          commission: { $sum: '$commission.amount' },
          markup: { $sum: '$priceBreakdown.markupTotal' },
        },
      },
    ]),
  ]);

  const villasBy = new Map(villaCounts.map((row) => [row._id.toString(), row.n]));
  const totalsBy = new Map(bookingTotals.map((row) => [row._id.toString(), row]));

  return agents.map((agent) => {
    const id = agent._id.toString();
    const totals = totalsBy.get(id);

    return {
      id,
      agentCode: agent.agentCode,
      name: agent.name,
      phone: agent.phone,
      lineId: agent.lineId ?? null,
      status: agent.status as 'active' | 'suspended',
      villaCount: villasBy.get(id) ?? 0,
      bookingCount: totals?.bookings ?? 0,
      revenue: totals?.revenue ?? 0,
      commission: totals?.commission ?? 0,
      markupEarned: totals?.markup ?? 0,
    };
  });
}

/** One agent with the villas they hold and what they charge for each. */
export async function getAgentDetail(agentId: string) {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(agentId)) return null;

  const agent = await AgentModel.findById(agentId).lean();
  if (!agent) return null;

  const links = await VillaAgentModel.find({ agentId: agent._id }).lean();
  const villas = await VillaModel.find(
    { _id: { $in: links.map((link) => link.villaId) } },
    { code: 1, name: 1, basePricing: 1, 'location.zone': 1, status: 1 },
  ).lean();

  const villaBy = new Map(villas.map((villa) => [villa._id.toString(), villa]));

  return {
    agent,
    links: links.map((link) => {
      const villa = villaBy.get(link.villaId.toString());
      return {
        id: link._id.toString(),
        villaId: link.villaId.toString(),
        code: villa?.code ?? '',
        name: villa?.name?.th ?? '',
        zone: villa?.location?.zone ?? '',
        isActive: link.isActive,
        canBlockDates: link.canBlockDates,
        markup: link.markup,
        base: villa?.basePricing,
        // What the guest actually pays, which is the only number the agent
        // cares about and the one they would otherwise compute by hand.
        selling: villa?.basePricing
          ? {
              sunThu: villa.basePricing.sunThu + link.markup.sunThu,
              fri: villa.basePricing.fri + link.markup.fri,
              sat: villa.basePricing.sat + link.markup.sat,
              holiday: villa.basePricing.holiday + link.markup.holiday,
            }
          : null,
      };
    }),
  };
}

/** The villas an agent sells, for their public /a/<code> page. */
export const getAgentByCode = cache(async (agentCode: string) => {
  await connectToDatabase();

  const agent = await AgentModel.findOne({ agentCode, status: 'active' }).lean();
  if (!agent) return null;

  const links = await VillaAgentModel.find(
    { agentId: agent._id, isActive: true },
    { villaId: 1 },
  ).lean();

  return { agent, villaIds: links.map((link) => link.villaId) };
});

/** Bookings that belong to the signed-in agent, or all of them for staff. */
export async function listBookingsForActor(actor: Actor, limit = 50) {
  await connectToDatabase();

  const query =
    actor.role === 'agent'
      ? { agentId: actor.agentId ? new Types.ObjectId(actor.agentId) : null }
      : {};

  return BookingModel.find(query)
    .select({
      bookingNo: 1,
      villaCodeSnapshot: 1,
      agentCodeSnapshot: 1,
      checkIn: 1,
      checkOut: 1,
      nights: 1,
      status: 1,
      'customer.name': 1,
      'customer.phone': 1,
      'priceBreakdown.grandTotal': 1,
      'priceBreakdown.markupTotal': 1,
      'payment.depositStatus': 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
