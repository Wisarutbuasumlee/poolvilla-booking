/**
 * Villa vocabulary shared by the database, the validation schemas and the
 * browser.
 *
 * These live here rather than on the Mongoose model on purpose. A client
 * component that imported them from the model would pull Mongoose, and through
 * it the MongoDB driver, into the browser bundle. That fails the build with
 * "Can't resolve 'tls'", which points at node_modules and says nothing about
 * the one import that caused it.
 *
 * Nothing in this file may import anything.
 */

export const AMENITIES = [
  'karaoke',
  'snooker',
  'pool_slide',
  'disco_light',
  'bbq_grill',
  'wifi',
  'pool_floats',
  'extra_mattress',
  'water_heater',
  'life_jacket_kids',
  'projector',
  'kids_pool',
  'jacuzzi',
  'garden',
] as const;

export type Amenity = (typeof AMENITIES)[number];

export const IMAGE_CATEGORIES = [
  'cover',
  'pool',
  'bedroom',
  'kitchen',
  'living',
  'bathroom',
  'exterior',
] as const;

export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export const VILLA_STATUSES = ['draft', 'published', 'hidden'] as const;
export type VillaStatus = (typeof VILLA_STATUSES)[number];

export const POOL_SYSTEMS = ['chlorine', 'saltwater'] as const;
export const SMOKING_POLICIES = ['not_allowed', 'outdoor_only', 'allowed'] as const;
export const PARTY_POLICIES = ['not_allowed', 'allowed', 'on_request'] as const;
export const BED_TYPES = ['single', 'double', 'bunk', 'extra'] as const;
