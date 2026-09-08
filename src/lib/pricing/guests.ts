import type { GuestCounts, ResolvedGuests, VillaCapacity } from './types';

/**
 * Turns the guest counts into the numbers the price depends on.
 *
 * The subtle rule is how free children interact with capacity. Under-10s
 * sleeping with a guardian come off the TOP, up to the villa's quota: they do
 * not occupy a base slot and they do not count toward the extra-guest maximum.
 *
 * The alternative reading, where free children fill base slots first, makes
 * ten adults plus five free children cost extra in a villa that sleeps ten.
 * No Thai pool villa operator charges that way, and it would be the single
 * most likely source of a "your calculator is wrong" complaint.
 */
export function resolveGuests(guests: GuestCounts, capacity: VillaCapacity): ResolvedGuests {
  const total = guests.adults + guests.children;

  const freeChildrenApplied = Math.min(
    Math.max(guests.childrenUnder10, 0),
    Math.max(capacity.freeChildUnder10Quota, 0),
  );

  const chargeableGuests = Math.max(total - freeChildrenApplied, 0);
  const extraGuests = Math.max(chargeableGuests - capacity.baseGuests, 0);
  const overCapacityBy = Math.max(
    chargeableGuests - (capacity.baseGuests + capacity.maxExtraGuests),
    0,
  );

  return { total, freeChildrenApplied, chargeableGuests, extraGuests, overCapacityBy };
}
