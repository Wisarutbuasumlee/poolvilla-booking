import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { DayRatesSchema, PriceOverrideSchema, optionalSatangField } from './shared';

/**
 * The link between a villa and an agent, carrying that agent's MARKUP.
 *
 * `markup` is what this agent adds per night on top of the company's base
 * rate, by day type. It is not their selling price. Storing the margin rather
 * than the total means a base-rate rise reaches every agent automatically, and
 * no agent is left quietly selling below cost because they forgot to update a
 * number. See docs/DECISIONS.md D-001.
 *
 * Note what is NOT here: availability. The calendar belongs to the villa and
 * is shared by every agent, so one agent's booking closes the date for all of
 * them.
 */
const VillaAgentSchema = new Schema(
  {
    villaId: { type: Schema.Types.ObjectId, ref: 'Villa', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },

    isActive: { type: Boolean, default: true },
    /** The fallback shown when a villa has no referring agent, if configured. */
    isPrimary: { type: Boolean, default: false },

    /** Added to the base rate, per night, by day type. Zero is valid. */
    markup: { type: DayRatesSchema, required: true },
    /** Dated markup windows this agent set for themselves. */
    markupOverrides: { type: [PriceOverrideSchema], default: [] },

    minNightsOverride: { type: Number, min: 1 },
    extraGuestFeeOverride: optionalSatangField,
    damageDepositOverride: optionalSatangField,
    commissionRateOverride: { type: Number, min: 0, max: 1 },

    /**
     * Whether this agent may block dates on this villa's shared calendar.
     * Granted per villa, and every block is written to the audit log.
     */
    canBlockDates: { type: Boolean, default: false },

    contactOverride: {
      phone: { type: String, trim: true },
      lineId: { type: String, trim: true },
    },
    note: { type: String, trim: true },
  },
  { timestamps: true, collection: 'villa_agents' },
);

// One agent holds a villa once. Without this, a duplicate link would make
// price resolution non-deterministic.
VillaAgentSchema.index({ villaId: 1, agentId: 1 }, { unique: true, name: 'uniq_villa_agent' });
// The agent portal and the /a/<code> page.
VillaAgentSchema.index({ agentId: 1, isActive: 1 }, { name: 'by_agent' });
// The batch markup lookup behind a 20-villa search page.
VillaAgentSchema.index({ villaId: 1, isActive: 1 }, { name: 'by_villa' });

export type VillaAgent = InferSchemaType<typeof VillaAgentSchema>;

export const VillaAgentModel: Model<VillaAgent> =
  (mongoose.models.VillaAgent as Model<VillaAgent> | undefined) ??
  mongoose.model<VillaAgent>('VillaAgent', VillaAgentSchema);
