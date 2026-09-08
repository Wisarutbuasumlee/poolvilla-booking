'use client';

import { GripVertical, ImagePlus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import {
  deleteVillaImageAction,
  reorderVillaImagesAction,
  setCoverImageAction,
  uploadVillaImagesAction,
} from '@/lib/villas/actions';
import { Badge, EmptyState } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ManagedImage {
  url: string;
  thumbUrl?: string;
  isCover: boolean;
  isSynthetic: boolean;
}

/**
 * Photo management for one villa.
 *
 * Reordering is native HTML drag and drop rather than a drag library. The list
 * is short, the interaction is one axis, and a library here would add more
 * kilobytes than the photographs it arranges.
 *
 * The order is persisted on drop, not on save. Staff reorder photos and then
 * navigate away without thinking about it, and losing that work to an unsaved
 * form is the kind of thing nobody reports and everybody resents.
 */
export function ImageManager({
  villaId,
  initialImages,
}: {
  villaId: string;
  initialImages: ManagedImage[];
}) {
  const t = useTranslations('admin.villas.images');
  const [images, setImages] = useState(initialImages);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const payload = new FormData();
    for (const file of files) payload.append('images', file);

    startTransition(async () => {
      const result = await uploadVillaImagesAction(villaId, payload);
      setError(result.message ?? null);
      // The action is the source of truth for what actually landed, so the
      // page is refreshed rather than the list being patched optimistically.
      if (result.ok) window.location.reload();
    });
  }

  function commitOrder(next: ManagedImage[]) {
    setImages(next);
    startTransition(async () => {
      // The new order is shown immediately and persisted in the background.
      // Reordering photos is not a decision anybody wants a spinner for, and
      // the server result adds nothing the list does not already show.
      await reorderVillaImagesAction(
        villaId,
        next.map((image) => image.url),
      );
    });
  }

  function handleDrop(targetUrl: string) {
    if (!dragging || dragging === targetUrl) return;
    const next = [...images];
    const from = next.findIndex((image) => image.url === dragging);
    const to = next.findIndex((image) => image.url === targetUrl);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setDragging(null);
    commitOrder(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-medium">{t('title')}</h2>
          <p className="text-sm text-[var(--fg-muted)]">{t('hint')}</p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          {pending ? t('uploading') : t('upload')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(event) => upload(event.target.files)}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="whitespace-pre-line rounded-[var(--radius-md)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}

      {images.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <li
              key={image.url}
              draggable
              onDragStart={() => setDragging(image.url)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(image.url)}
              className={cn(
                'group relative overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--bg-sunken)]',
                image.isCover ? 'border-[var(--accent)]' : 'border-[var(--border-default)]',
                dragging === image.url && 'opacity-40',
              )}
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={image.thumbUrl ?? image.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 20vw, 45vw"
                  className="object-cover"
                  unoptimized
                />
              </div>

              <div className="absolute left-2 top-2 flex gap-1">
                {image.isCover ? <Badge tone="accent">{t('cover')}</Badge> : null}
                {/* Placeholders must be visible as placeholders. Shipping one
                    to a guest as a real photograph of a real house is the
                    single most damaging thing this screen could allow. */}
                {image.isSynthetic ? <Badge tone="warning">{t('synthetic')}</Badge> : null}
              </div>

              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                {!image.isCover ? (
                  <button
                    type="button"
                    title={t('setCover')}
                    aria-label={t('setCover')}
                    className="rounded-[var(--radius-sm)] bg-[var(--bg-surface)]/90 p-1.5 hover:bg-[var(--bg-surface)]"
                    onClick={() =>
                      startTransition(async () => {
                        await setCoverImageAction(villaId, image.url);
                        setImages((current) =>
                          current.map((entry) => ({
                            ...entry,
                            isCover: entry.url === image.url,
                          })),
                        );
                      })
                    }
                  >
                    <Star className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}

                <button
                  type="button"
                  title={t('remove')}
                  aria-label={t('remove')}
                  className="rounded-[var(--radius-sm)] bg-[var(--bg-surface)]/90 p-1.5 text-[var(--color-danger)] hover:bg-[var(--bg-surface)]"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteVillaImageAction(villaId, image.url);
                      setImages((current) => {
                        const next = current.filter((entry) => entry.url !== image.url);
                        if (next.length > 0 && !next.some((entry) => entry.isCover)) {
                          next[0] = { ...next[0]!, isCover: true };
                        }
                        return next;
                      });
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <GripVertical
                className="absolute bottom-2 right-2 h-4 w-4 text-white/80 drop-shadow"
                aria-hidden
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
