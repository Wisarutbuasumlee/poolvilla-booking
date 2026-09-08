import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Placeholder photographs for development.
 *
 * These exist so the search page, the gallery and the villa cards have
 * something with real dimensions to lay out against. They are NOT photographs
 * and must never be mistaken for any: each one is a flat tinted panel with the
 * villa code and the word ตัวอย่าง printed across it, and every image record
 * that points at one carries isSynthetic so the back office labels it.
 *
 * Replacing them is the first thing to do once real photographs exist.
 */

const ROOT = resolve(process.env.STORAGE_LOCAL_PATH ?? './storage/uploads');

/** Muted, distinguishable, and obviously not a photograph. */
const TINTS = [
  { bg: '#123f3a', fg: '#8fd3c7' },
  { bg: '#1d3557', fg: '#9dc0e8' },
  { bg: '#3d2c46', fg: '#c9a8de' },
  { bg: '#4a3419', fg: '#dcbf8a' },
  { bg: '#2b3a2e', fg: '#a7c9ad' },
  { bg: '#42232a', fg: '#dda3ad' },
];

const SIZES = [320, 640, 1280] as const;

function panel(width: number, height: number, code: string, label: string, index: number): Buffer {
  const tint = TINTS[index % TINTS.length]!;
  const title = Math.round(width / 12);
  const caption = Math.round(width / 26);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${tint.bg}"/>
      <g fill="${tint.fg}" font-family="sans-serif" text-anchor="middle">
        <text x="50%" y="47%" font-size="${title}" font-weight="700">${code}</text>
        <text x="50%" y="47%" dy="${caption * 1.9}" font-size="${caption}" opacity="0.75">${label}</text>
      </g>
    </svg>`,
  );
}

/**
 * Writes the renditions for one villa and returns the image records to store.
 *
 * The filenames match what the real upload pipeline produces, so nothing
 * downstream has to know which kind it is looking at.
 */
export async function writePlaceholderImages(
  villaCode: string,
  count: number,
): Promise<{ url: string; thumbUrl: string; category: string; order: number; isCover: boolean; isSynthetic: true }[]> {
  const records = [];

  for (let index = 0; index < count; index += 1) {
    const category = index === 0 ? 'cover' : index < 3 ? 'pool' : index < 6 ? 'bedroom' : 'exterior';
    const urls: Record<number, string> = {};

    for (const width of SIZES) {
      const height = Math.round((width * 3) / 4);
      const webp = await sharp(panel(width, height, villaCode, `ตัวอย่าง ${index + 1}`, index))
        .webp({ quality: 80 })
        .toBuffer();

      const key = `villas/${villaCode}/placeholder-${index + 1}-${width}.webp`;
      const full = join(ROOT, key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, webp);
      urls[width] = `/api/uploads/${key}`;
    }

    records.push({
      url: urls[1280]!,
      thumbUrl: urls[320]!,
      category,
      order: index,
      isCover: index === 0,
      isSynthetic: true as const,
    });
  }

  return records;
}
