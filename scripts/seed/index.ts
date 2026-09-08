import { config } from 'dotenv';
import { hash } from '@node-rs/argon2';
import mongoose, { Types } from 'mongoose';

config({ path: ['.env.local', '.env'], quiet: true });

import { connectToDatabase, disconnectFromDatabase } from '../../src/lib/db/connect';
import { AgentModel } from '../../src/lib/db/models/agent';
import { AvailabilityModel } from '../../src/lib/db/models/availability';
import { BookingModel } from '../../src/lib/db/models/booking';
import {
  CounterModel,
  HolidayModel,
  ReviewModel,
  SettingModel,
  UserModel,
} from '../../src/lib/db/models/reference';
import { VillaModel } from '../../src/lib/db/models/villa';
import { VillaAgentModel } from '../../src/lib/db/models/villa-agent';
import { addDays, asDateKey, baht, quote, todayBangkok } from '../../src/lib/pricing';
import type { DateKey, RateCard, Satang } from '../../src/lib/pricing';
import { buildHolidays, LUNAR_HOLIDAYS_TO_ENTER } from './holidays';
import { writePlaceholderImages } from './placeholders';
import { SEED_AGENTS, SEED_VILLAS } from './villas';

/**
 * Sample data for development.
 *
 * Wipes the collections it owns and rebuilds them, so it is safe to run again
 * and again. It refuses to run against a database whose name does not look
 * like a development one, because "npm run seed" pointed at production would
 * be unrecoverable.
 *
 * What it deliberately does NOT create: fake reviews presented as real guest
 * reviews, invented occupancy statistics, or photographs. Every image is a
 * placeholder flagged isSynthetic, and reviews are marked as staff-entered.
 */

// Baht to satang, through the pricing engine's own helper so the branded
// Satang type flows all the way into the seeded documents.
const B = baht;
const ADMIN_EMAIL = 'admin@poolvilla.local';
const ADMIN_PASSWORD = 'poolvilla-dev-2026';
const AGENT_EMAIL = 'agent123@poolvilla.local';
const AGENT_PASSWORD = 'poolvilla-agent-2026';

function log(step: string, detail: string) {
  console.log(`  ${step.padEnd(14)} ${detail}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Copy .env.example to .env.local.');

  const dbName = new URL(uri.replace('mongodb://', 'http://')).pathname.slice(1) || '(default)';
  if (/prod|production|live/i.test(dbName)) {
    throw new Error(`Refusing to seed a database named "${dbName}".`);
  }

  console.log(`\nSeeding ${dbName}\n`);
  await connectToDatabase();

  // autoIndex is off at runtime, so nothing has built these yet. The unique
  // index on availability is the entire double-booking protection; seeding
  // without it would produce a database that looks fine and is not.
  await Promise.all([
    VillaModel.syncIndexes(),
    AgentModel.syncIndexes(),
    VillaAgentModel.syncIndexes(),
    AvailabilityModel.syncIndexes(),
    BookingModel.syncIndexes(),
    HolidayModel.syncIndexes(),
    UserModel.syncIndexes(),
    ReviewModel.syncIndexes(),
  ]);
  log('indexes', 'built');

  await Promise.all([
    VillaModel.deleteMany({}),
    AgentModel.deleteMany({}),
    VillaAgentModel.deleteMany({}),
    AvailabilityModel.deleteMany({}),
    BookingModel.deleteMany({}),
    HolidayModel.deleteMany({}),
    ReviewModel.deleteMany({}),
    CounterModel.deleteMany({}),
    UserModel.deleteMany({}),
    SettingModel.deleteMany({}),
  ]);
  log('cleared', 'all seeded collections');

  // --- holidays ------------------------------------------------------------
  const thisYear = Number(todayBangkok().slice(0, 4));
  const holidays = buildHolidays([thisYear, thisYear + 1]);
  await HolidayModel.insertMany(
    holidays.map((h) => ({ ...h, year: Number(h.dateKey.slice(0, 4)), isActive: true })),
  );
  const holidaySet = new Set<DateKey>(holidays.map((h) => asDateKey(h.dateKey)));
  log('holidays', `${holidays.length} rows across ${thisYear} and ${thisYear + 1}`);

  // --- settings ------------------------------------------------------------
  await SettingModel.create({
    _id: 'site',
    siteName: { th: 'พูลวิลล่า', en: 'PoolVilla', zh: '泳池别墅' },
    contact: { phone: '038-000-000', lineId: '@poolvilla', email: 'hello@poolvilla.local' },
    bankAccounts: [
      {
        bankName: 'กสิกรไทย',
        accountName: 'บริษัท พูลวิลล่า จำกัด',
        accountNumber: '000-0-00000-0',
        promptPayId: process.env.PROMPTPAY_ID ?? '0812345678',
      },
    ],
    depositPercent: Number(process.env.DEFAULT_DEPOSIT_PERCENT ?? 30),
    holdMinutes: Number(process.env.BOOKING_HOLD_MINUTES ?? 30),
    priceFallback: 'base_price',
    cancellationPolicy: {
      th: 'เมื่อชำระมัดจำแล้ว ขอสงวนสิทธิ์ไม่คืนเงินมัดจำทุกกรณี สามารถเลื่อนวันเข้าพักได้ตามเงื่อนไขที่ตกลงกับเจ้าหน้าที่',
      en: 'The deposit is non-refundable. Dates may be moved by arrangement with our staff.',
      zh: '订金一经支付概不退还。入住日期可与工作人员协商更改。',
    },
  });
  log('settings', 'created');

  // --- users ---------------------------------------------------------------
  const passwordHash = await hash(ADMIN_PASSWORD);
  const admin = await UserModel.create({
    email: ADMIN_EMAIL,
    passwordHash,
    name: 'ผู้ดูแลระบบ',
    role: 'superadmin',
  });
  log('users', '1 superadmin');

  // --- villas --------------------------------------------------------------
  // Real files on disk, so the gallery and the cards have something with
  // genuine dimensions to lay out against. They are flat tinted panels with
  // the villa code printed on them, and every record carries isSynthetic, so
  // nothing here can pass for a photograph of a real house.
  const villaPayloads = [];
  for (const villa of SEED_VILLAS) {
    villaPayloads.push({
      ...villa,
      location: {
        ...villa.location,
        // 999 is the inland sentinel used by the variant builder.
        distanceToBeachKm:
          villa.location.distanceToBeachKm >= 999 ? undefined : villa.location.distanceToBeachKm,
      },
      images: await writePlaceholderImages(villa.code, villa.imageCount),
      createdBy: admin._id,
    });
  }

  const villaDocs = await VillaModel.insertMany(villaPayloads);
  log('villas', `${villaDocs.length}, including DV-2685 from the spec`);
  log('images', `${villaPayloads.reduce((n, v) => n + v.images.length, 0)} placeholder renditions written`);

  // --- agents and their markups -------------------------------------------
  const agentDocs = await AgentModel.insertMany(
    SEED_AGENTS.map((agent) => ({
      agentCode: agent.agentCode,
      name: agent.name,
      phone: agent.phone,
      lineId: agent.lineId,
      commissionRate: agent.commissionRate,
      status: 'active',
    })),
  );

  const links = [];
  for (const [agentIndex, agent] of SEED_AGENTS.entries()) {
    const agentDoc = agentDocs[agentIndex]!;
    // Not every agent holds every villa, which is what makes the /a/<code>
    // page and the agent portal worth testing.
    const held = villaDocs.filter((_, i) => (i + agentIndex) % 3 !== 2);

    for (const villa of held) {
      links.push({
        villaId: villa._id,
        agentId: agentDoc._id,
        isActive: true,
        isPrimary: agentIndex === 0,
        markup: {
          sunThu: B(agent.markup.sunThu),
          fri: B(agent.markup.fri),
          sat: B(agent.markup.sat),
          holiday: B(agent.markup.holiday),
        },
        markupOverrides: [],
        canBlockDates: agent.canBlockDates,
      });
    }
  }
  await VillaAgentModel.insertMany(links);
  log('agents', `${agentDocs.length} with ${links.length} villa links at different markups`);

  // A login for the first agent, so the portal can be exercised. The other two
  // stay without one: an agent who only ever sends a referral link does not
  // need an account, and seeding accounts nobody uses would misrepresent how
  // the system is meant to work.
  const firstAgent = agentDocs[0]!;
  await UserModel.create({
    email: AGENT_EMAIL,
    passwordHash: await hash(AGENT_PASSWORD),
    name: firstAgent.name,
    role: 'agent',
    agentId: firstAgent._id,
  });
  await AgentModel.updateOne(
    { _id: firstAgent._id },
    { $set: { userId: (await UserModel.findOne({ email: AGENT_EMAIL }).lean())!._id } },
  );
  log('agent login', `${AGENT_EMAIL} for agent ${firstAgent.agentCode}`);

  // --- a festival window on the busiest villa ------------------------------
  const flagship = villaDocs[0]!;
  const songkranStart = asDateKey(`${thisYear + 1}-04-12`);
  const songkranEnd = asDateKey(`${thisYear + 1}-04-15`);
  await VillaModel.updateOne(
    { _id: flagship._id },
    {
      $set: {
        baseOverrides: [
          {
            label: { th: 'ช่วงสงกรานต์', en: 'Songkran period', zh: '宋干节期间' },
            startDate: songkranStart,
            endDate: songkranEnd,
            dayTypes: ['ALL'],
            price: B(22000),
            minNights: 3,
          },
        ],
      },
    },
  );
  log('overrides', `Songkran window on ${flagship.code}, 3-night minimum`);

  // --- bookings ------------------------------------------------------------
  const bookings = await seedBookings(villaDocs, agentDocs, holidaySet);
  log('bookings', `${bookings} across the last 90 days and the next 60`);

  // --- reviews -------------------------------------------------------------
  const reviews = villaDocs.slice(0, 6).map((villa, i) => ({
    villaId: villa._id,
    // Staff-entered, and stored as such. A seeded review must never be able to
    // masquerade as a verified guest review.
    source: 'admin' as const,
    authorName: ['คุณเอ', 'คุณบี', 'คุณซี', 'คุณดี', 'คุณอี', 'คุณเอฟ'][i]!,
    rating: 4 + (i % 2),
    body: {
      th: 'บ้านสะอาด สระใหญ่ ทีมงานตอบไลน์เร็ว',
      en: 'Clean house, big pool, quick replies on LINE.',
      zh: '房子干净，泳池很大，LINE 回复很快。',
    },
    isPublished: true,
  }));
  await ReviewModel.insertMany(reviews);
  log('reviews', `${reviews.length}, all marked as staff-entered`);

  console.log('\n  Sign-in');
  console.log(`    admin      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`    agent 123  ${AGENT_EMAIL} / ${AGENT_PASSWORD}`);
  console.log('\n  Still to enter by hand: lunar-calendar holidays');
  for (const name of LUNAR_HOLIDAYS_TO_ENTER) console.log(`    - ${name}`);
  console.log(
    '\n  Their Gregorian dates move every year and are announced annually,\n  so seeding a guess would silently reprice real bookings.\n',
  );

  await disconnectFromDatabase();
}

/**
 * Past and upcoming bookings, priced by the real engine.
 *
 * Every one of them holds its nights through the same unique index the live
 * booking flow uses, so the seeded calendar is internally consistent and the
 * dashboard has something honest to aggregate.
 */
async function seedBookings(
  villas: { _id: Types.ObjectId; code: string; basePricing: unknown; capacity: unknown }[],
  agents: { _id: Types.ObjectId; agentCode: string }[],
  holidays: ReadonlySet<DateKey>,
): Promise<number> {
  const today = todayBangkok();
  const names = ['คุณกิตติ', 'คุณนภา', 'คุณวีระ', 'คุณสุดา', 'คุณอนันต์', 'คุณมาลี', 'คุณพงษ์', 'คุณรัตนา'];
  let created = 0;

  // Deterministic pseudo-random, so two runs produce the same data and a bug
  // found today can be reproduced tomorrow.
  let seed = 20260908;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  for (let i = 0; i < 44; i += 1) {
    const villa = villas[next(villas.length)]!;
    const agent = next(4) === 0 ? null : agents[next(agents.length)]!;

    const offset = next(150) - 90;
    const checkIn = addDays(today, offset);
    const nights = 1 + next(3);
    const checkOut = addDays(checkIn, nights);

    const villaRecord = villa as unknown as {
      basePricing: RateCard['base'];
      capacity: {
        baseGuests: number;
        maxExtraGuests: number;
        extraGuestFee: Satang;
        freeChildUnder10Quota: number;
      };
      damageDeposit: Satang;
      minNights: number;
    };

    const rateCard: RateCard = {
      villaId: villa._id.toString(),
      agentId: agent?._id.toString() ?? null,
      agentCode: agent?.agentCode ?? null,
      source: agent ? 'agent' : 'base_price',
      base: villaRecord.basePricing,
      baseOverrides: [],
      markup: agent
        ? { sunThu: B(1000), fri: B(1500), sat: B(2000), holiday: B(3000) }
        : { sunThu: B(0), fri: B(0), sat: B(0), holiday: B(0) },
      markupOverrides: [],
      minNights: villaRecord.minNights,
      extraGuestFee: villaRecord.capacity.extraGuestFee,
      damageDeposit: villaRecord.damageDeposit,
      commissionRate: 0,
    };

    const adults = villaRecord.capacity.baseGuests - next(3);
    const priced = quote({
      checkIn,
      checkOut,
      rateCard,
      capacity: villaRecord.capacity,
      holidays,
      guests: { adults, children: next(3), childrenUnder10: next(2) },
      settings: { depositPercent: 30, currency: 'THB' },
    });

    const bookingId = new Types.ObjectId();

    // Claim the nights through the same index the live flow uses. A clash with
    // an earlier seeded booking simply means this one is skipped.
    const claim = await AvailabilityModel.bulkWrite(
      priced.lines.map((line) => ({
        updateOne: {
          filter: { villaId: villa._id, dateKey: line.date, status: 'available' as const },
          update: {
            $set: { status: 'booked' as const, bookingId, source: 'web' as const },
            $setOnInsert: { villaId: villa._id, dateKey: line.date },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    ).catch(() => null);

    const claimed = (claim?.upsertedCount ?? 0) + (claim?.modifiedCount ?? 0);
    if (claimed !== priced.lines.length) {
      await AvailabilityModel.deleteMany({ villaId: villa._id, bookingId });
      continue;
    }

    const status = offset < -nights ? 'completed' : offset < 0 ? 'checked_in' : 'confirmed';
    const dateStamp = checkIn.replace(/-/g, '');
    const counter = await CounterModel.findOneAndUpdate(
      { _id: `BK-${dateStamp}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );

    await BookingModel.create({
      _id: bookingId,
      bookingNo: `BK-${dateStamp}-${String(counter!.seq).padStart(4, '0')}`,
      villaId: villa._id,
      villaCodeSnapshot: villa.code,
      agentId: agent?._id ?? null,
      agentCodeSnapshot: agent?.agentCode ?? null,
      customer: {
        name: names[next(names.length)]!,
        phone: `08${next(9)}-${String(next(900) + 100)}-${String(next(9000) + 1000)}`,
        lineId: 'line-user',
      },
      checkIn,
      checkOut,
      nights: priced.nights,
      guests: {
        adults,
        children: priced.guests.total - adults,
        childrenUnder10: 0,
        totalGuests: priced.guests.total,
        extraGuests: priced.guests.extraGuests,
      },
      priceBreakdown: {
        nights: priced.lines.map((line) => ({
          dateKey: line.date,
          dayType: line.dayType,
          basePrice: line.basePrice,
          markup: line.markup,
          price: line.price,
          baseRule: line.baseRule,
          markupRule: line.markupRule,
        })),
        accommodationTotal: priced.accommodationTotal,
        baseAccommodationTotal: priced.baseAccommodationTotal,
        markupTotal: priced.markupTotal,
        extraGuestTotal: priced.extraGuestTotal,
        addOns: [],
        addOnTotal: 0,
        subtotal: priced.subtotal,
        discount: { code: null, amount: 0 },
        grandTotal: priced.grandTotal,
        damageDeposit: priced.damageDeposit,
        depositRequired: priced.depositRequired,
        balanceDue: priced.balanceDue,
        currency: 'THB',
      },
      rateCardSnapshot: {
        base: rateCard.base,
        baseOverrides: [],
        markup: rateCard.markup,
        markupOverrides: [],
        extraGuestFee: rateCard.extraGuestFee,
        minNights: rateCard.minNights,
        source: rateCard.source,
      },
      pricingEngineVersion: priced.engineVersion,
      commission: priced.commission,
      payment: {
        method: 'bank_transfer',
        depositStatus: 'paid',
        depositPaidAt: new Date(),
        balanceStatus: status === 'confirmed' ? 'unpaid' : 'paid',
      },
      status,
      source: agent ? 'agent_link' : 'web',
      timeline: [{ at: new Date(), by: 'seed', action: 'created' }],
    });

    created += 1;
  }

  return created;
}

main().catch(async (error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
