import { forbidden, unauthorized } from 'next/navigation';
import { Types } from 'mongoose';
import { auth } from '@/auth';
import { VillaAgentModel } from '@/lib/db/models/villa-agent';
import type { Role } from '@/lib/db/models/reference';

/**
 * Server-side authorisation.
 *
 * ---------------------------------------------------------------------------
 * These are the real gate, not src/proxy.ts
 * ---------------------------------------------------------------------------
 * The proxy check is coarse and exists to send an anonymous visitor to the
 * sign-in page. Every Server Action and every page that reads privileged data
 * calls one of these as its first statement. That way a routing regression in
 * the proxy degrades into a UX bug rather than a data leak, and hiding a
 * button in the UI is never mistaken for a permission.
 */

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Set only for role 'agent'. */
  agentId: string | null;
}

/** The signed-in actor, or null. Use this when absence is a normal outcome. */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role,
    agentId: session.user.agentId,
  };
}

/** The signed-in actor, or a 401. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) unauthorized();
  return actor;
}

/**
 * The signed-in actor, or a 403 when their role is not in the allowed set.
 *
 * Call this at the top of the function that does the work, not in the layout
 * that renders around it. A layout guard protects the page a visitor asked
 * for; it does nothing for a Server Action invoked directly.
 */
export async function requireRole(...allowed: readonly Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!allowed.includes(actor.role)) forbidden();
  return actor;
}

export const isAdmin = (actor: Actor) => actor.role === 'superadmin' || actor.role === 'staff';

/**
 * Confirms this actor may act on this villa.
 *
 * Staff and superadmins may act on any villa. An agent may act only on the
 * villas linked to them, and the check is a query rather than something read
 * off the session, because a link can be revoked while a token is still valid.
 */
export async function assertOwnsVilla(actor: Actor, villaId: string | Types.ObjectId): Promise<void> {
  if (isAdmin(actor)) return;

  if (actor.role !== 'agent' || !actor.agentId) forbidden();

  const link = await VillaAgentModel.exists({
    villaId: new Types.ObjectId(String(villaId)),
    agentId: new Types.ObjectId(actor.agentId),
    isActive: true,
  });

  if (!link) forbidden();
}

/**
 * Confirms this actor may block dates on this villa's shared calendar.
 *
 * The calendar is shared by every agent selling the villa, so blocking a date
 * takes it away from all of them. Permission is granted per villa on the
 * villa-agent link and is never implied by simply holding the villa.
 */
export async function assertCanBlockDates(
  actor: Actor,
  villaId: string | Types.ObjectId,
): Promise<void> {
  if (isAdmin(actor)) return;

  if (actor.role !== 'agent' || !actor.agentId) forbidden();

  const allowed = await VillaAgentModel.exists({
    villaId: new Types.ObjectId(String(villaId)),
    agentId: new Types.ObjectId(actor.agentId),
    isActive: true,
    canBlockDates: true,
  });

  if (!allowed) forbidden();
}

/**
 * A filter that scopes a villa query to what this actor may see.
 *
 * Returned rather than applied, so the caller composes it into their own
 * query and cannot accidentally run an unscoped one first.
 */
export async function villaScopeFilter(actor: Actor): Promise<Record<string, unknown>> {
  if (isAdmin(actor)) return {};
  if (actor.role !== 'agent' || !actor.agentId) return { _id: null };

  const links = await VillaAgentModel.find(
    { agentId: new Types.ObjectId(actor.agentId), isActive: true },
    { villaId: 1 },
  ).lean();

  return { _id: { $in: links.map((link) => link.villaId) } };
}
