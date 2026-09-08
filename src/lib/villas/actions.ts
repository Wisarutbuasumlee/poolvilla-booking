'use server';

import { revalidateTag } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { AuditLogModel } from '@/lib/db/models/reference';
import { VillaModel } from '@/lib/db/models/villa';
import { assertOwnsVilla, requireRole, type Actor } from '@/lib/auth/rbac';
import { processVillaImage, ImageRejected } from '@/lib/storage/image';
import { VillaFormSchema } from '@/lib/validation/villa';

/**
 * Villa mutations.
 *
 * Every one of these starts by establishing who is acting and whether they may
 * touch this villa. A Server Action is a public endpoint: anything that can
 * reach the site can post to it, so the check happens here and not in the page
 * that happens to render the button.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Field path to message, for the form to render inline. */
  errors?: Record<string, string>;
}

/** The base rates and content live on the villa; only staff may change them. */
async function requireOfficeActor(): Promise<Actor> {
  return requireRole('superadmin', 'staff');
}

export async function saveVillaAction(
  villaId: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOfficeActor();
  await connectToDatabase();

  const parsed = VillaFormSchema.safeParse(readVillaForm(formData));
  if (!parsed.success) {
    return { ok: false, errors: flattenIssues(parsed.error.issues) };
  }

  const data = parsed.data;

  // The code and slug are quoted to guests and printed on documents, so a
  // collision has to be refused rather than silently suffixed.
  const clash = await VillaModel.findOne({
    _id: { $ne: villaId ? new Types.ObjectId(villaId) : undefined },
    $or: [{ code: data.code }, { slug: data.slug }],
  })
    .select({ code: 1, slug: 1 })
    .lean();

  if (clash) {
    return {
      ok: false,
      errors:
        clash.code === data.code
          ? { code: 'รหัสนี้ถูกใช้แล้ว' }
          : { slug: 'slug นี้ถูกใช้แล้ว' },
    };
  }

  let saved;
  if (villaId) {
    await assertOwnsVilla(actor, villaId);
    const before = await VillaModel.findById(villaId).lean();
    saved = await VillaModel.findByIdAndUpdate(villaId, { $set: data }, { new: true }).lean();
    await writeAudit(actor, 'villa.update', villaId, before, saved);
  } else {
    saved = (await VillaModel.create({ ...data, createdBy: actor.id })).toObject();
    await writeAudit(actor, 'villa.create', String(saved._id), null, saved);
  }

  if (!saved) return { ok: false, message: 'ไม่พบบ้านที่ต้องการบันทึก' };

  // The public villa page caches its content by this tag.
  revalidateTag(`villa:${saved.code}`, 'max');
  revalidateTag('villa-list', 'max');

  // Locale-prefixed and admin-prefixed: the one shape both hostnames accept.
  redirect(`/${await getLocale()}/admin/villas/${String(saved._id)}?saved=1`);
}

export async function setVillaStatusAction(
  villaId: string,
  status: 'draft' | 'published' | 'hidden',
): Promise<ActionResult> {
  const actor = await requireOfficeActor();
  await connectToDatabase();
  await assertOwnsVilla(actor, villaId);

  const villa = await VillaModel.findByIdAndUpdate(
    villaId,
    { $set: { status } },
    { new: true },
  ).lean();

  if (!villa) return { ok: false, message: 'ไม่พบบ้าน' };

  // Publishing a villa with no photographs produces a search result that is a
  // grey rectangle, which is worse than not listing it at all.
  if (status === 'published' && (villa.images?.length ?? 0) === 0) {
    await VillaModel.findByIdAndUpdate(villaId, { $set: { status: 'draft' } });
    return { ok: false, message: 'ต้องมีรูปอย่างน้อยหนึ่งรูปก่อนเผยแพร่' };
  }

  await writeAudit(actor, `villa.${status}`, villaId, null, { status });
  revalidateTag(`villa:${villa.code}`, 'max');
  revalidateTag('villa-list', 'max');
  return { ok: true };
}

export async function uploadVillaImagesAction(
  villaId: string,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOfficeActor();
  await connectToDatabase();
  await assertOwnsVilla(actor, villaId);

  const villa = await VillaModel.findById(villaId).select({ code: 1, images: 1 }).lean();
  if (!villa) return { ok: false, message: 'ไม่พบบ้าน' };

  const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { ok: false, message: 'ไม่ได้เลือกไฟล์' };

  const added = [];
  const rejected: string[] = [];

  for (const file of files) {
    try {
      const processed = await processVillaImage(villa.code, {
        buffer: Buffer.from(await file.arrayBuffer()),
        type: file.type,
      });

      added.push({
        url: processed.url,
        thumbUrl: processed.thumbUrl,
        category: 'exterior' as const,
        order: (villa.images?.length ?? 0) + added.length,
        // Only the first photograph on an empty villa becomes the cover; a
        // later upload must not silently replace a chosen one.
        isCover: (villa.images?.length ?? 0) === 0 && added.length === 0,
        isSynthetic: false,
      });
    } catch (error) {
      rejected.push(
        `${file.name}: ${error instanceof ImageRejected ? rejectionMessage(error.reason) : 'อ่านไฟล์ไม่ได้'}`,
      );
    }
  }

  if (added.length > 0) {
    await VillaModel.findByIdAndUpdate(villaId, { $push: { images: { $each: added } } });
    await writeAudit(actor, 'villa.images.add', villaId, null, { count: added.length });
    revalidateTag(`villa:${villa.code}`, 'max');
  }

  return rejected.length === 0
    ? { ok: true }
    : { ok: added.length > 0, message: rejected.join('\n') };
}

export async function reorderVillaImagesAction(
  villaId: string,
  orderedUrls: string[],
): Promise<ActionResult> {
  const actor = await requireOfficeActor();
  await connectToDatabase();
  await assertOwnsVilla(actor, villaId);

  const villa = await VillaModel.findById(villaId).select({ code: 1, images: 1 }).lean();
  if (!villa) return { ok: false, message: 'ไม่พบบ้าน' };

  const position = new Map(orderedUrls.map((url, index) => [url, index]));
  const reordered = [...(villa.images ?? [])]
    .map((image) => ({ ...image, order: position.get(image.url) ?? 999 }))
    .sort((a, b) => a.order - b.order);

  await VillaModel.findByIdAndUpdate(villaId, { $set: { images: reordered } });
  revalidateTag(`villa:${villa.code}`, 'max');
  return { ok: true };
}

export async function setCoverImageAction(villaId: string, url: string): Promise<ActionResult> {
  const actor = await requireOfficeActor();
  await connectToDatabase();
  await assertOwnsVilla(actor, villaId);

  const villa = await VillaModel.findById(villaId).select({ code: 1, images: 1 }).lean();
  if (!villa) return { ok: false, message: 'ไม่พบบ้าน' };

  const images = (villa.images ?? []).map((image) => ({
    ...image,
    isCover: image.url === url,
  }));

  await VillaModel.findByIdAndUpdate(villaId, { $set: { images } });
  revalidateTag(`villa:${villa.code}`, 'max');
  return { ok: true };
}

export async function deleteVillaImageAction(villaId: string, url: string): Promise<ActionResult> {
  const actor = await requireOfficeActor();
  await connectToDatabase();
  await assertOwnsVilla(actor, villaId);

  const villa = await VillaModel.findById(villaId).select({ code: 1, images: 1 }).lean();
  if (!villa) return { ok: false, message: 'ไม่พบบ้าน' };

  const remaining = (villa.images ?? []).filter((image) => image.url !== url);

  // Losing the cover would leave the card with no image at all, so promote the
  // next one rather than leaving the villa without one.
  if (remaining.length > 0 && !remaining.some((image) => image.isCover)) {
    remaining[0]!.isCover = true;
  }

  await VillaModel.findByIdAndUpdate(villaId, { $set: { images: remaining } });
  await writeAudit(actor, 'villa.images.delete', villaId, { url }, null);

  // The stored renditions are deliberately left on disk. They are named by a
  // hash of their own bytes, so an identical photo re-uploaded later reuses
  // them, and an orphan costs a few kilobytes. Deleting here would break any
  // page still holding the old URL.
  revalidateTag(`villa:${villa.code}`, 'max');
  return { ok: true };
}

// ---------------------------------------------------------------------------

function rejectionMessage(reason: ImageRejected['reason']): string {
  switch (reason) {
    case 'too_large':
      return 'ไฟล์ใหญ่เกิน 12 MB';
    case 'unsupported':
      return 'รองรับเฉพาะ JPEG, PNG, WebP และ AVIF';
    case 'too_small':
      return 'ภาพเล็กเกินไป ต้องกว้างอย่างน้อย 640 พิกเซล';
    case 'corrupt':
      return 'ไฟล์เสียหรือไม่ใช่รูปภาพ';
  }
}

function flattenIssues(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    out[key] ??= issue.message;
  }
  return out;
}

async function writeAudit(
  actor: Actor,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await AuditLogModel.create({
    actorId: new Types.ObjectId(actor.id),
    actorLabel: `${actor.name} <${actor.email}>`,
    action,
    entity: 'villa',
    entityId,
    before,
    after,
  }).catch(() => {
    // An audit write must never fail the operation it is recording. A missing
    // log line is bad; a villa that could not be saved because of one is worse.
  });
}

/**
 * Rebuilds the nested villa object from flat form fields.
 *
 * The form posts `capacity.bedrooms` and `basePricing.sat`; this turns those
 * dotted names back into the shape the schema expects, so the form markup and
 * the schema stay readable independently.
 */
function readVillaForm(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [name, value] of formData.entries()) {
    if (value instanceof File) continue;
    if (name.startsWith('$ACTION')) continue;

    // Repeated names (checkbox groups) become arrays.
    const all = formData.getAll(name).filter((entry) => !(entry instanceof File));
    assignPath(out, name, all.length > 1 ? all.map(String) : String(value));
  }

  // JSON-encoded repeaters: overrides, bedrooms, extra charges.
  for (const key of ['baseOverrides', 'bedroomDetails', 'extraCharges', 'amenities', 'kitchen']) {
    const raw = formData.get(`${key}Json`);
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        // Leave it out; the schema will report the missing field rather than
        // the parse error, which is more useful to whoever is filling the form.
      }
    }
  }

  return out;
}

function assignPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;

  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[parts.at(-1)!] = value;
}
