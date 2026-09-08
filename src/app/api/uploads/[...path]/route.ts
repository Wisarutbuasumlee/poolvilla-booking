import { NextResponse } from 'next/server';
import { localStorage } from '@/lib/storage/local';

export const runtime = 'nodejs';

/**
 * Serves uploaded files.
 *
 * They are served from here rather than public/ for three reasons: the volume
 * survives a redeploy while public/ is baked into the image, access can be
 * checked per file when private documents (payment slips) arrive in Phase 4,
 * and the cache headers are set deliberately instead of inherited.
 *
 * Every rendition filename contains a hash of its own bytes, so a given URL
 * can never point at different content and may be cached forever.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join('/');

  let file;
  try {
    // Throws on a traversal attempt rather than returning something.
    file = await localStorage.get(key);
  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }

  if (!file) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.body.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
