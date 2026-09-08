import type { Locale } from '@/i18n/routing';

/**
 * Translation namespaces. One file per namespace per locale, so a translator
 * working on the booking flow never opens the admin file and merge conflicts
 * stay local.
 *
 * Adding a namespace means adding it here and creating the file in all three
 * locales. Thai is authoritative; en and zh fall back to it key by key.
 */
export const NAMESPACES = ['common', 'home', 'villa', 'booking', 'admin', 'errors'] as const;

export type Namespace = (typeof NAMESPACES)[number];

type Messages = Record<string, unknown>;

async function loadNamespace(locale: Locale, ns: Namespace): Promise<Messages> {
  try {
    return (await import(`./${locale}/${ns}.json`)).default as Messages;
  } catch {
    // A missing non-Thai file is expected while translation is in progress.
    // A missing Thai file is a real error and surfaces on the next line.
    if (locale === 'th') throw new Error(`Missing Thai messages for namespace "${ns}"`);
    return {};
  }
}

/**
 * Deep-merges Thai under the requested locale so an untranslated key renders
 * the Thai string instead of the raw key path. Showing "villa.pool.slider" to
 * a visitor is worse than showing them Thai.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

function isPlainObject(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const thai = Object.fromEntries(
    await Promise.all(NAMESPACES.map(async (ns) => [ns, await loadNamespace('th', ns)] as const)),
  );

  if (locale === 'th') return thai;

  const translated = Object.fromEntries(
    await Promise.all(
      NAMESPACES.map(async (ns) => [ns, await loadNamespace(locale, ns)] as const),
    ),
  );

  return deepMerge(thai, translated);
}
