import type { Locale } from '@/i18n/routing';

/**
 * JSON-LD for a villa page.
 *
 * Everything here is a claim to a search engine, so everything here has to be
 * true. Two things are deliberately absent:
 *
 *   - aggregateRating. The reviews on this site are entered by staff, and
 *     marking them up as aggregated guest ratings would be a false claim in a
 *     format designed to be trusted.
 *
 *   - price, when the visitor arrived through a referral. That number is one
 *     agent's price, and publishing it as THE price would misrepresent the
 *     other agents selling the same house.
 */

export interface VillaStructuredData {
  code: string;
  name: string;
  description?: string;
  url: string;
  images: string[];
  province?: string;
  zone?: string;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  maxGuests?: number;
  /** The company's base nightly rate in satang, never an agent's. */
  basePriceSatang?: number;
  amenities?: string[];
}

export function villaJsonLd(villa: VillaStructuredData, locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    '@id': villa.url,
    name: villa.name,
    ...(villa.description ? { description: villa.description } : {}),
    url: villa.url,
    identifier: villa.code,
    inLanguage: locale,
    ...(villa.images.length > 0 ? { image: villa.images } : {}),

    address: {
      '@type': 'PostalAddress',
      addressCountry: 'TH',
      ...(villa.province ? { addressRegion: villa.province } : {}),
      ...(villa.zone ? { addressLocality: villa.zone } : {}),
    },

    ...(villa.latitude !== undefined && villa.longitude !== undefined
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: villa.latitude,
            longitude: villa.longitude,
          },
        }
      : {}),

    ...(villa.bedrooms ? { numberOfRooms: villa.bedrooms } : {}),
    ...(villa.maxGuests
      ? {
          occupancy: {
            '@type': 'QuantitativeValue',
            maxValue: villa.maxGuests,
            unitCode: 'C62',
          },
        }
      : {}),

    ...(villa.basePriceSatang
      ? {
          priceRange: `฿${Math.round(villa.basePriceSatang / 100).toLocaleString('en-US')}+`,
        }
      : {}),

    ...(villa.amenities?.length
      ? {
          amenityFeature: villa.amenities.map((amenity) => ({
            '@type': 'LocationFeatureSpecification',
            name: amenity,
            value: true,
          })),
        }
      : {}),
  };
}

/** Escapes a JSON-LD payload so it cannot break out of the script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
