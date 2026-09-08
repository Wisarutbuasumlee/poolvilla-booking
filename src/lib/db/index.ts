/**
 * The only module server code imports for database access.
 *
 * Importing a model file directly works, but going through this barrel means
 * every schema is registered before the first query runs. A ref to a model
 * that has not been compiled yet fails at populate time with a message that
 * points at the wrong file.
 *
 * Import this ONLY from Server Components, Server Actions, route handlers and
 * scripts. src/proxy.ts and src/lib/pricing must never reach it, and ESLint
 * enforces both.
 */

export { connectToDatabase, disconnectFromDatabase } from './connect';
export { withTransaction } from './session';

export { VillaModel, VILLA_CARD_PROJECTION, AMENITIES, IMAGE_CATEGORIES } from './models/villa';
export type { Villa } from './models/villa';

export { AgentModel } from './models/agent';
export type { Agent } from './models/agent';

export { VillaAgentModel } from './models/villa-agent';
export type { VillaAgent } from './models/villa-agent';

export { AvailabilityModel, AVAILABILITY_STATUSES } from './models/availability';
export type { Availability, AvailabilityStatus } from './models/availability';

export { BookingModel, BOOKING_STATUSES } from './models/booking';
export type { Booking } from './models/booking';

export {
  HolidayModel,
  CounterModel,
  UserModel,
  PromotionModel,
  ReviewModel,
  InquiryModel,
  SettingModel,
  AuditLogModel,
  ROLES,
} from './models/reference';
export type {
  Holiday,
  Counter,
  User,
  Role,
  Promotion,
  Review,
  Inquiry,
  Setting,
  AuditLog,
} from './models/reference';

export { DAY_TYPES, OVERRIDE_DAY_TYPES } from './models/shared';
