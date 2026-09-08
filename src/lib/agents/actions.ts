'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';

import { connectToDatabase } from '@/lib/db/connect';
import { AgentModel } from '@/lib/db/models/agent';
import { AuditLogModel, UserModel } from '@/lib/db/models/reference';
import { VillaAgentModel } from '@/lib/db/models/villa-agent';
import { assertOwnsVilla, requireRole, type Actor } from '@/lib/auth/rbac';
import { hashPassword } from '@/lib/auth/password';

/**
 * Agent management.
 *
 * Two different people use these. Staff create agents and hand them villas.
 * Agents set their own markups on the villas they hold, and nothing else: the
 * base rate is the company's, and an agent must never be able to sell below it
 * by editing a number that is not theirs.
 */

export type AgentActionResult =
  | { ok: true }
  | { ok: false; message: string }
  | { ok: false; errors: Record<string, string> };

const AgentSchema = z.object({
  agentCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,16}$/, 'ใช้ได้เฉพาะตัวอักษร ตัวเลข ขีดกลางและขีดล่าง'),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  lineId: z.string().trim().max(60).optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  commissionRate: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(['active', 'suspended']).default('active'),
});

export async function saveAgentAction(
  agentId: string | null,
  formData: FormData,
): Promise<AgentActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  const parsed = AgentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join('.')] ??= issue.message;
    return { ok: false, errors };
  }

  const data = parsed.data;

  // The code appears in every referral link an agent has ever sent. Two
  // agents sharing one would silently reassign each other's bookings.
  const clash = await AgentModel.findOne({
    agentCode: data.agentCode,
    ...(agentId ? { _id: { $ne: new Types.ObjectId(agentId) } } : {}),
  })
    .select({ _id: 1 })
    .lean();

  if (clash) return { ok: false, errors: { agentCode: 'รหัสนายหน้านี้ถูกใช้แล้ว' } };

  const document = {
    agentCode: data.agentCode,
    name: data.name,
    phone: data.phone,
    lineId: data.lineId || undefined,
    email: data.email || undefined,
    // Entered as a percentage, stored as a fraction. Storing 10 where 0.1 was
    // meant would pay an agent ten times the booking.
    commissionRate: data.commissionRate / 100,
    status: data.status,
  };

  if (agentId) {
    await AgentModel.updateOne({ _id: agentId }, { $set: document });
    await audit(actor, 'agent.update', agentId, document);
  } else {
    const created = await AgentModel.create(document);
    await audit(actor, 'agent.create', String(created._id), document);
  }

  revalidatePath('/admin/agents');
  return { ok: true };
}

/** Gives an agent a villa to sell, or takes it back. */
export async function setVillaAgentLinkAction(
  villaId: string,
  agentId: string,
  enabled: boolean,
): Promise<AgentActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  if (enabled) {
    await VillaAgentModel.updateOne(
      { villaId: new Types.ObjectId(villaId), agentId: new Types.ObjectId(agentId) },
      {
        $set: { isActive: true },
        // A new link starts at zero markup, selling at the company's own rate.
        // Any other default would invent a price nobody chose.
        $setOnInsert: {
          markup: { sunThu: 0, fri: 0, sat: 0, holiday: 0 },
          markupOverrides: [],
          canBlockDates: false,
          isPrimary: false,
        },
      },
      { upsert: true },
    );
  } else {
    // Deactivated, not deleted. The markup history stays, and a booking made
    // through this link keeps a link record to point at.
    await VillaAgentModel.updateOne(
      { villaId: new Types.ObjectId(villaId), agentId: new Types.ObjectId(agentId) },
      { $set: { isActive: false } },
    );
  }

  await audit(actor, enabled ? 'agent.villa.grant' : 'agent.villa.revoke', agentId, { villaId });
  revalidatePath('/admin/agents');
  return { ok: true };
}

const MarkupSchema = z.object({
  sunThu: z.coerce.number().min(0).max(1_000_000),
  fri: z.coerce.number().min(0).max(1_000_000),
  sat: z.coerce.number().min(0).max(1_000_000),
  holiday: z.coerce.number().min(0).max(1_000_000),
});

/**
 * Sets what an agent adds on top of the company rate for one villa.
 *
 * Agents call this for their own villas; staff can call it for anyone. The
 * numbers are entered in baht and stored in satang, and they can never be
 * negative: an agent undercutting the company's own price is not a markup.
 */
export async function setMarkupAction(
  villaId: string,
  agentId: string,
  formData: FormData,
): Promise<AgentActionResult> {
  const actor = await requireRole('superadmin', 'staff', 'agent');
  await connectToDatabase();

  // An agent may only price their own villas. Both halves matter: the villa
  // has to be theirs, and the agent id has to be them.
  if (actor.role === 'agent') {
    if (actor.agentId !== agentId) return { ok: false, message: 'ไม่มีสิทธิ์แก้ราคาของนายหน้าคนอื่น' };
    await assertOwnsVilla(actor, villaId);
  }

  const parsed = MarkupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: 'ยอดบวกเพิ่มต้องเป็นตัวเลขและไม่ติดลบ' };
  }

  const markup = {
    sunThu: Math.round(parsed.data.sunThu * 100),
    fri: Math.round(parsed.data.fri * 100),
    sat: Math.round(parsed.data.sat * 100),
    holiday: Math.round(parsed.data.holiday * 100),
  };

  const result = await VillaAgentModel.updateOne(
    {
      villaId: new Types.ObjectId(villaId),
      agentId: new Types.ObjectId(agentId),
      isActive: true,
    },
    { $set: { markup } },
  );

  if (result.matchedCount === 0) return { ok: false, message: 'ไม่พบการผูกบ้านกับนายหน้าคนนี้' };

  await audit(actor, 'agent.markup.set', agentId, { villaId, markup });
  revalidatePath('/admin/agents');
  revalidatePath('/admin/portal');
  return { ok: true };
}

/** Whether an agent may block dates on one villa's shared calendar. */
export async function setBlockPermissionAction(
  villaId: string,
  agentId: string,
  allowed: boolean,
): Promise<AgentActionResult> {
  // Only the office grants this. An agent granting it to themselves would
  // make the permission meaningless.
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  await VillaAgentModel.updateOne(
    { villaId: new Types.ObjectId(villaId), agentId: new Types.ObjectId(agentId) },
    { $set: { canBlockDates: allowed } },
  );

  await audit(actor, 'agent.blockPermission', agentId, { villaId, allowed });
  revalidatePath('/admin/agents');
  return { ok: true };
}

/**
 * Creates the login an agent uses for the portal.
 *
 * The password is set here and shown once to the staff member who created it.
 * Emailing a plaintext password would leave it sitting in two inboxes forever.
 */
export async function createAgentLoginAction(
  agentId: string,
  formData: FormData,
): Promise<AgentActionResult> {
  const actor = await requireRole('superadmin');
  await connectToDatabase();

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email.includes('@')) return { ok: false, message: 'อีเมลไม่ถูกต้อง' };
  if (password.length < 10) return { ok: false, message: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร' };

  const agent = await AgentModel.findById(agentId).lean();
  if (!agent) return { ok: false, message: 'ไม่พบนายหน้า' };

  const existing = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
  if (existing) return { ok: false, message: 'อีเมลนี้มีบัญชีอยู่แล้ว' };

  const user = await UserModel.create({
    email,
    passwordHash: await hashPassword(password),
    name: agent.name,
    role: 'agent',
    agentId: agent._id,
  });

  await AgentModel.updateOne({ _id: agent._id }, { $set: { userId: user._id } });
  await audit(actor, 'agent.login.create', agentId, { email });

  revalidatePath('/admin/agents');
  return { ok: true };
}

async function audit(actor: Actor, action: string, entityId: string, after: unknown) {
  await AuditLogModel.create({
    actorId: new Types.ObjectId(actor.id),
    actorLabel: `${actor.name} <${actor.email}>`,
    action,
    entity: 'agent',
    entityId,
    after,
  }).catch(() => {
    // An audit write must never fail the operation it records.
  });
}
