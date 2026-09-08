# CLAUDE.md — PoolVilla Booking Platform

เอกสารนี้คือสิ่งแรกที่ต้องอ่านก่อนแตะโค้ดในโปรเจกต์นี้ สเปกเต็มอยู่ที่ `poolvilla-booking-prompt.md`
ความจริงของโปรดักต์อยู่ที่ `PRODUCT.md` ข้อตัดสินใจทางเทคนิคอยู่ที่ `docs/DECISIONS.md`

## 1. ระบบนี้คืออะไร

เว็บจองพูลวิลล่ารายวันสำหรับตลาดไทย เน้นพัทยา รองรับหัวหิน เขาใหญ่ เชียงใหม่ ภูเก็ต

ผู้ใช้สามกลุ่ม

- **ลูกค้า** เข้าจากมือถือเป็นหลัก หาบ้านที่ว่างตรงวัน ดูราคา แล้วจองหรือทักไลน์
- **นายหน้าในเครือ** บริษัทแบ่งบ้านให้ไปขายต่อ แต่ละคนมีรหัสและราคาของตัวเอง มีพอร์ทัลแยก
- **แอดมินและสตาฟ** ดูแลข้อมูลบ้าน ราคาฐาน ปฏิทินรวม การจอง การตรวจสลิป และรายงาน

## 2. กฎธุรกิจที่ห้ามทำผิด

ผิดข้อใดข้อหนึ่งแปลว่าเงินหายหรือลูกค้าถูกจองซ้อน อ่านให้ครบก่อนแก้อะไรที่เกี่ยวกับราคาหรือปฏิทิน

1. **บ้านหนึ่งหลังมีนายหน้าหลายคน** ความสัมพันธ์เป็น many-to-many ผ่าน `villa_agents`
2. **ราคาเป็นสองชั้น** บริษัทตั้งราคาฐานที่ `villas.basePricing` นายหน้ากรอกเป็น **ยอดบวกเพิ่ม** ที่ `villa_agents.markup` ไม่ใช่ราคาเต็ม ราคาจริงของคืนหนึ่งคือ ราคาฐานที่ resolve แล้ว บวก ยอดบวกเพิ่มของประเภทวันนั้น
3. **ไม่มีรหัสนายหน้าติดมา ให้ใช้ราคาฐาน** ยอดบวกเพิ่มเป็นศูนย์
4. **ปฏิทินว่างเป็นของบ้าน ไม่ใช่ของนายหน้า** นายหน้า A จองแล้ว นายหน้า B ต้องเห็นเต็มทันที
5. **ประเภทวันมีสี่แบบ ตัดสินจากคืนที่เข้าพัก ไม่ใช่วันเช็คเอาท์** ลำดับความสำคัญคือ ช่วงเทศกาล มาก่อน วันหยุดนักขัตฤกษ์ มาก่อน เสาร์ มาก่อน ศุกร์ มาก่อน อาทิตย์ถึงพฤหัส
6. **ประกันความเสียหายไม่ใช่รายได้** ไม่เข้ายอดรวม ไม่เข้าค่าคอม ไม่เข้า ADR คืนวันเช็คเอาท์
7. **ทุกการจองต้อง snapshot ราคาทั้งก้อน** รายงานอ่านจาก snapshot ห้าม join กลับไปที่ `villa_agents`
8. **เขตเวลาคือ Asia/Bangkok ทั้งระบบ** และวันที่เก็บเป็นสตริง ไม่ใช่ `Date` ดูข้อ 7 ของหมวด Conventions
9. **สิทธิ์ตรวจที่เซิร์ฟเวอร์เสมอ** การซ่อนปุ่มไม่ใช่การป้องกัน นายหน้าเห็นได้แค่บ้านและยอดของตัวเอง

## 3. Tech stack

| ส่วน | ตัวที่ใช้ | หมายเหตุ |
|---|---|---|
| Framework | Next.js **16.3.4** App Router | Turbopack เป็นค่าเริ่มต้น ไม่ต้องใส่ `--turbopack` |
| React | 19.2 | |
| Styling | Tailwind CSS v4 | CSS-first ไม่มี `tailwind.config.ts` |
| Database | MongoDB 7 + Mongoose 9 | รันเป็น single-node replica set |
| Auth | Auth.js v5 beta (ล็อกเลขตายตัว) | |
| i18n | next-intl 4 | ไทย อังกฤษ จีน |
| Theme | next-themes | สว่างเป็นค่าเริ่มต้น |
| Validation | Zod 4 + `@hookform/resolvers` 5 | ต้องคู่กัน |
| Date | date-fns 4 + **`@date-fns/tz`** | ห้ามใช้ `date-fns-tz` ตัวนั้นสร้างมาสำหรับ date-fns 3 |
| Password | `@node-rs/argon2` | ไบนารีสำเร็จรูป ไม่ต้อง node-gyp บน Windows |
| Test | Vitest 4 + Playwright | |
| Lint | ESLint **9** + typescript-eslint 8 | ESLint 10 ยังใช้ไม่ได้ ดู DECISIONS |

TypeScript ล็อกที่ 5.9.3 เพราะ typescript-eslint ยังไม่รองรับ TypeScript 7

## 4. คำสั่ง

```bash
npm run db:up        # docker compose ยก mongo, mongo-express, redis
npm run dev          # แอปที่ localhost:3000 และ admin.localhost:3000
npm run seed         # ข้อมูลตัวอย่าง
npm run build        # ต้องผ่านก่อนปิดทุก Phase
npm run lint         # ต้องผ่านก่อนปิดทุก Phase
npm run typecheck
npm test             # unit
npm run test:e2e     # playwright
npm run db:reset     # ล้าง volume แล้วยกใหม่
```

`admin.localhost` ใช้ได้เลยใน Chrome และ Edge โดยไม่ต้องแก้ hosts

## 5. โครงสร้างโฟลเดอร์

```
src/
  app/(public)/[locale]/        หน้าบ้าน root layout ตัวที่หนึ่ง
  app/(admin)/[locale]/admin/   หลังบ้าน root layout ตัวที่สอง
  proxy.ts                      routing สามชั้น hostname + locale + auth
  i18n/                         routing, request, navigation, fonts
  messages/{th,en,zh}/          ไฟล์แปลแยกตาม namespace
  lib/pricing/                  เอนจินราคา ฟังก์ชันบริสุทธิ์ ห้ามแตะ db
  lib/availability/             hold, confirm, release, กันจองชน
  lib/db/models/                Mongoose schema ทั้งหมด
  lib/booking/                  server actions และ snapshot
  lib/storage/                  storage adapter, sharp pipeline
  lib/validation/               Zod schema ใช้ร่วม client และ server
  components/ui/                shadcn primitives ห้ามแก้
  components/{public,admin,booking,common}/
  styles/globals.css            design token ทั้งเว็บ
docs/                           ARCHITECTURE, DATA-MODEL, DECISIONS
.impeccable/surfaces/           direction contract ของแต่ละหน้า
```

**ไม่มี `src/app/layout.tsx` โดยตั้งใจ** เพราะใช้ root layout สองอัน การเพิ่มไฟล์นั้นจะทำให้เกิด `<html>` ซ้อนกันทันที

## 6. Data model โดยย่อ

schema อยู่ที่ `src/lib/db/models/` รายละเอียดเต็มอยู่ที่ `docs/DATA-MODEL.md`

- `villas` ข้อมูลบ้าน **พร้อมราคาฐานของบริษัท**
- `agents` นายหน้า รหัส ค่าคอม
- `villa_agents` ตารางเชื่อม **ถือยอดบวกเพิ่ม** unique compound `{villaId, agentId}`
- `availability` `{villaId, dateKey}` unique compound คือกลไกกันจองชน
- `bookings` snapshot ราคาทั้งก้อน
- `holidays` วันหยุดและวันหยุดต่อเนื่อง เก็บเป็นแถวจริง ไม่ให้เอนจินเดา
- `counters` ออกเลขที่จองแบบ atomic
- `users` `promotions` `reviews` `inquiries` `settings` `audit_logs`

## 7. Conventions

1. **Server Component เป็นค่าเริ่มต้น** ใส่ `'use client'` เฉพาะเมื่อต้องการ state หรือ event handler จริง
2. **Mutation ทุกตัวเป็น Server Action** อยู่ใน `src/lib/**/actions.ts` ขึ้นต้นด้วย `'use server'`
3. **Component ใน `components/` รับข้อมูลผ่าน props ห้าม fetch เอง** การ์ดบ้านที่ query เองคือ N+1 ในหน้าค้นหา
4. **import จาก `@/lib/db` ได้เฉพาะ Server Component และ Server Action**
5. **`src/lib/pricing/` ห้าม import `@/lib/db` หรือ mongoose** ESLint บังคับไว้แล้ว
6. **เงินเก็บเป็นจำนวนเต็มสตางค์** `฿12,500` คือ `1250000` ปัดครึ่งขึ้นตอนท้ายของแต่ละยอด ไม่ปัดกลางทาง
7. **วันที่คือ `DateKey` สตริง `'YYYY-MM-DD'` ตามเวลาไทย** ห้ามใช้ `getDay` `getMonth` `getDate` นอก `src/lib/pricing/dates.ts` ESLint บังคับไว้แล้ว หาวันในสัปดาห์ด้วย `new Date(key + 'T00:00:00Z').getUTCDay()`
8. **คืนที่พักคือช่วง `[checkIn, checkOut)`** วันเช็คเอาท์ไม่เคยถูกกัน ทำให้เช็คเอาท์เช้าเช็คอินบ่ายวันเดียวกันทำงานได้เอง
9. **ทุก page และ layout เรียก `setRequestLocale(locale)` เป็นบรรทัดแรก** ไม่งั้น next-intl บังคับทั้ง subtree เป็น dynamic
10. **`params` และ `searchParams` เป็น Promise** ต้อง `await` ทุกครั้ง เช่นเดียวกับ `cookies()` `headers()`
11. **เพิ่มคำแปลใหม่** สร้าง key ในไฟล์ไทยก่อนเสมอ แล้วค่อยเติม en และ zh ระบบ fallback มาไทยให้อัตโนมัติ ห้าม hardcode ข้อความในคอมโพเนนต์
12. **เพิ่ม amenity ใหม่** เพิ่ม key ใน enum ของ schema เพิ่มไอคอน แล้วเพิ่มคำแปลสามภาษา

## 8. Design system

ทิศทางถูกเลือกโดยผู้ใช้เมื่อ 8 กันยายน 2026 คือ **มาตรฐานของหมวดจองที่พัก ทำให้ถึงระดับฝีมือของ Airbnb และ Agoda** ห้ามเสนอโลกภาพทางเลือกอีกเว้นแต่ผู้ใช้ขอเอง สัญญาทิศทางของแต่ละหน้าอยู่ที่ `.impeccable/surfaces/`

- **โทเคนทั้งหมดอยู่ที่ `src/styles/globals.css`** สีที่ hardcode เป็น hex ในคอมโพเนนต์คือของที่หลุดออกจากระบบ
- คอมโพเนนต์อ้าง `var(--fg-muted)` `var(--bg-surface)` ไม่ใช่ ramp ดิบอย่าง `--color-ink-500`
- **ทุกคอมโพเนนต์ต้องผ่านทั้งสองธีม** ธีมมืดไม่ใช่การกลับสี มันมีค่าของตัวเองใน `.dark`
- accent เขียวน้ำทะเลสงวนไว้ให้ปุ่มหลักและสถานะว่างเท่านั้น ห้ามใช้เป็นสีตกแต่ง
- สีเขียว LINE `--color-line` ใช้ได้เฉพาะปุ่ม LINE ห้ามปรับเฉด
- ราคาใช้คลาส `.tnum` เสมอ ตัวเลขที่ไม่ตรงคอลัมน์อ่านเหมือนระบบคำนวณผิด
- ภาพบ้านเป็นพระเอก chrome เงียบ เงามีสองระดับเท่านั้น
- Loading เป็น skeleton ไม่ใช่ spinner Empty state และ Error state ต้องออกแบบ

## 9. i18n

- routing `/{th|en|zh}/...` ค่าเริ่มต้น `th` และ prefix เสมอ
- ห้าม hardcode ข้อความ ทุกอย่างผ่าน `useTranslations` หรือ `getTranslations`
- เนื้อหาจาก DB เป็นออบเจกต์ `{th, en, zh}` fallback มาไทย
- วันที่ภาษาไทยเป็น พ.ศ. พร้อมชื่อเดือนไทย อังกฤษและจีนเป็น ค.ศ.
- ต้องแปลครบรวมถึงข้อความ error, validation และเทมเพลตอีเมล
- ใช้ `Link` จาก `@/i18n/navigation` ไม่ใช่ `next/link` ตัวหลังทำ locale prefix หาย

## 10. Security checklist ทุกครั้งที่เพิ่ม endpoint หรือ action

- [ ] Zod parse input ทุกตัว ไม่เชื่อราคาหรือ agentId ที่ client ส่งมา
- [ ] เรียก `requireRole()` ที่ต้นฟังก์ชัน ไม่ใช่แค่ซ่อน UI
- [ ] นายหน้าเข้าถึงได้เฉพาะบ้านของตัวเอง ตรวจด้วย `assertOwnsVilla()`
- [ ] rate limit สำหรับ login, booking, upload
- [ ] ตรวจ MIME และขนาดไฟล์อัปโหลด ไม่เชื่อนามสกุล
- [ ] ไม่ leak เบอร์เจ้าของบ้านหรือข้อมูลนายหน้าคนอื่นออกหน้าเว็บ
- [ ] เขียน `audit_logs` สำหรับทุกการกระทำที่เปลี่ยนเงินหรือปฏิทิน

## 11. Environment variables

ดู `.env.example` ทุกตัวมีคอมเมนต์อธิบายอยู่ในไฟล์นั้น ตัวที่ต้องตั้งเองคือ `AUTH_SECRET` สร้างด้วย `npx auth secret`

## 12. Do / Don't

**Do**

- อ่าน direction contract ใน `.impeccable/surfaces/` ก่อนแก้หน้าใด ๆ
- เปิดแอปจริงดูก่อนบอกว่างาน UI เสร็จ ไม่ใช่ดูแค่โค้ด
- แยก module ให้เล็ก ไฟล์เดียวจบทุกอย่างคือของที่แก้ไม่ได้
- commit แบบ Conventional Commits

**Don't**

- อย่าเพิ่ม `src/app/layout.tsx`
- อย่าใส่ `Date` ลงในตรรกะราคาหรือปฏิทิน
- อย่าใช้ `count() + 1` ออกเลขที่จอง มันแข่งกันแล้วได้เลขซ้ำ
- อย่าใส่ TTL index บน `availability.holdExpiresAt` มันจะลบวันที่แอดมินบล็อกไว้เงียบ ๆ
- อย่าเชื่อว่า transaction คือกลไกกันจองชน กลไกจริงคือ unique index
- อย่าแก้ business logic หรือ schema เพราะงาน UI ชิ้นเดียว
- อย่าสร้างรีวิว ลูกค้าอ้างอิง หรือตัวเลขสถิติปลอมขึ้นบนหน้าเว็บจริง

## 13. Roadmap

- [x] **Phase 0** ฐานราก โครง route สองราก design token docker docs
- [x] **Phase 1** Mongoose models, เอนจินราคา + unit tests, availability service, seed
- [ ] **Phase 2** proxy auth, Auth.js + RBAC, layout หลังบ้าน, CRUD บ้าน, image manager
- [ ] **Phase 3** หน้าแรก หน้าค้นหา หน้ารายละเอียดบ้าน
- [ ] **Phase 4** booking flow, สลิป, แจ้งเตือน, booking lookup
- [ ] **Phase 5** ระบบนายหน้า ref link พอร์ทัล ค่าคอม
- [ ] **Phase 6** dashboard รายงาน ปฏิทินรวม วันหยุด โปรโมชั่น
- [ ] **Phase 7** i18n ครบ dark mode SEO a11y responsive audit
- [ ] **Phase 8** E2E, hardening, Dockerfile production, deployment guide

## 14. Known issues และข้อตัดสินใจ

ดู `docs/DECISIONS.md` ประเด็นที่ยังค้างคือบทบาทของ `commissionRate` เมื่อรายได้หลักของนายหน้าคือส่วนบวกเพิ่ม จะยืนยันตอน Phase 5

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
