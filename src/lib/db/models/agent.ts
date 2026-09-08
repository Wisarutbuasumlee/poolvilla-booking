import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * An in-network agent who resells the company's villas.
 *
 * Their income is the markup they set on each villa-agent link, not this
 * commission rate, which stays at zero until the company decides what it is
 * for. See the open question in docs/DECISIONS.md D-001.
 */
const AgentSchema = new Schema(
  {
    agentCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    lineId: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    avatar: { type: String, trim: true },

    /** 0..1, applied to the company share of a booking. */
    commissionRate: { type: Number, min: 0, max: 1, default: 0 },

    bankInfo: {
      bankName: { type: String, trim: true },
      accountName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
    },

    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },

    stats: {
      linkClicks: { type: Number, default: 0 },
      bookingCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'agents' },
);

AgentSchema.index({ agentCode: 1 }, { unique: true, name: 'uniq_agent_code' });
AgentSchema.index({ status: 1 }, { name: 'by_status' });

export type Agent = InferSchemaType<typeof AgentSchema>;

export const AgentModel: Model<Agent> =
  (mongoose.models.Agent as Model<Agent> | undefined) ??
  mongoose.model<Agent>('Agent', AgentSchema);
