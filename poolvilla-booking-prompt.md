# Prompt สำหรับ Claude Code — เว็บจองพูลวิลล่า (PoolVilla Booking Platform)

> **วิธีใช้:** เปิด Claude Code ในโฟลเดอร์โปรเจกต์เปล่า แล้ววางข้อความตั้งแต่บรรทัด `=== START PROMPT ===` เป็นต้นไปทั้งหมดเป็นข้อความแรก

---

=== START PROMPT ===

คุณคือ Senior Full-stack Developer + DevOps + Product Engineer ผมต้องการให้คุณสร้างเว็บแอปพลิเคชัน **ระบบจองบ้านพักพูลวิลล่า (Pool Villa Booking Platform)** สำหรับตลาดไทย โดยเน้นพัทยาเป็นหลักแต่ต้องรองรับแหล่งท่องเที่ยวอื่นได้ด้วย (หัวหิน เขาใหญ่ เชียงใหม่ ภูเก็ต ฯลฯ)

**โปรดใช้ skill `impeccable` ในการออกแบบ UI/UX ทั้งหมด และใช้ skill อื่น ๆ ที่มีอยู่ในเครื่องตามความเหมาะสม (frontend-design, testing-strategy, system-design, code-review, documentation ฯลฯ)**

---

## 0. ขั้นตอนการทำงานที่ต้องการ

1. **อ่านและสรุปความเข้าใจก่อน** — สรุป requirement ที่เข้าใจกลับมาเป็นข้อ ๆ สั้น ๆ
2. **ถามคำถามที่ยังคลุมเครือ** (ดูรายการใน §12) แล้วรอคำตอบก่อนเริ่มเขียนโค้ด
3. **สร้าง `CLAUDE.md`** และ `docs/ARCHITECTURE.md` + `docs/DATA-MODEL.md` ก่อนลงมือเขียนฟีเจอร์
4. **ทำเป็น Phase ตาม §11** จบแต่ละ Phase ให้หยุดสรุปสิ่งที่ทำ + วิธีทดสอบ + commit แล้วค่อยไปต่อ
5. ห้ามสร้างไฟล์ขนาดมหึมาไฟล์เดียว แยก module ให้อ่านง่าย เขียน TypeScript แบบ strict
6. เขียน commit message แบบ Conventional Commits (`feat:`, `fix:`, `chore:`)

---

## 1. Tech Stack ที่ต้องใช้

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | **Next.js 15+ (App Router) + TypeScript strict** |
| Styling | **Tailwind CSS v4** + **shadcn/ui** + lucide-react |
| Database | **MongoDB** + **Mongoose** (schema + index ครบ) |
| Auth | Auth.js (NextAuth v5) — Credentials + RBAC (superadmin / staff / agent) |
| i18n | **next-intl** — ไทย (ค่าเริ่มต้น) / English / 中文 |
| Theme | **next-themes** — Light (default) / Dark / System |
| Form + Validate | react-hook-form + **Zod** (ใช้ zod schema ร่วมกันทั้ง client/server) |
| Data fetching | Server Components + Server Actions เป็นหลัก, TanStack Query เฉพาะส่วน interactive |
| รูปภาพ | `sharp` resize/แปลง WebP + เก็บใน volume `./storage/uploads` (ออกแบบเป็น storage adapter เผื่อย้ายไป S3/MinIO ภายหลัง) |
| Chart | Recharts |
| Date | date-fns + date-fns-tz (timezone `Asia/Bangkok` ทั้งระบบ) |
| Test | Vitest (unit — โดยเฉพาะ pricing engine) + Playwright (e2e flow จอง) |
| Lint | ESLint + Prettier + Husky + lint-staged |

---

## 2. Environment / Docker (สำคัญ)

**แนวทาง: แอป Next.js รันด้วย `npm run dev` บนเครื่องปกติที่ port 3000 ส่วน "หลังบ้าน" (infrastructure) รันด้วย Docker**

สร้าง `docker-compose.yml` ที่มี:
- `mongodb` (mongo:7) — persist volume, ตั้ง root user/password จาก `.env`, expose `27017`
- `mongo-express` — UI ดู DB ที่ port `8081` (dev only)
- `redis` (optional แต่แนะนำ) — ใช้ทำ rate limit / cache / booking hold lock
- ไฟล์ `mongo-init.js` สร้าง database + user ของแอป

สิ่งที่ต้องมีเพิ่ม:
- `Dockerfile` (multi-stage, standalone output) สำหรับ production พร้อม `docker-compose.prod.yml` — แต่ **dev ให้ใช้ npm run dev ปกติ**
- `.env.example` ครบทุกตัวแปร พร้อมคอมเมนต์อธิบาย
- `Makefile` หรือ npm scripts: `db:up`, `db:down`, `db:seed`, `db:reset`, `dev`, `build`, `test`, `lint`
- ต้อง `docker compose up -d` แล้ว `npm install && npm run seed && npm run dev` แล้วใช้งานได้เลย เขียนไว้ใน README

---

## 3. โครงสร้างระบบ (Domain / Subdomain)

- `localhost:3000` → **เว็บฝั่งลูกค้า (Public)**
- `admin.localhost:3000` → **หลังบ้าน (Admin + Agent Portal)** แยกด้วย **Next.js middleware ตรวจ hostname** แล้ว rewrite ไป route group `(admin)`
- ต้องมี fallback path `/admin` สำหรับกรณี dev ที่ตั้ง subdomain ไม่ได้ (ควบคุมด้วย env `ENABLE_ADMIN_PATH_FALLBACK`)
- โครง route group: `src/app/(public)/[locale]/...` และ `src/app/(admin)/[locale]/...`
- เขียนวิธีตั้งค่า subdomain ใน dev (`/etc/hosts` หรือใช้ `admin.localhost` ที่ Chrome รองรับอยู่แล้ว) ไว้ใน README

---

## 4. โมเดลธุรกิจที่ต้องเข้าใจให้ถูก (สำคัญที่สุด)

### 4.1 ความสัมพันธ์ บ้าน ↔ นายหน้า
- **บ้าน 1 หลัง มีนายหน้าได้หลายคน** (many-to-many ผ่าน collection `villa_agents`)
- นายหน้ามี **รหัสนายหน้า** ของตัวเอง เช่น `123`
- บ้านมี **รหัสที่พัก** เช่น `DV-2685`
- **นายหน้าแต่ละคนตั้งราคาบ้านหลังเดียวกันได้ไม่เท่ากัน** → ราคาผูกกับคู่ (บ้าน × นายหน้า) ไม่ใช่ผูกกับบ้านอย่างเดียว
- ลิงก์อ้างอิงนายหน้า: `/villa/DV-2685?ref=123` และหน้ารวมของนายหน้า `/a/123`
  - เมื่อมี `ref` → เก็บลง cookie 30 วัน และ **แสดงราคาของนายหน้าคนนั้น** ตลอด session
  - เมื่อไม่มี `ref` → ใช้ราคาอ้างอิงกลาง (default: ราคาต่ำสุดที่ active — ให้ทำเป็น setting เลือกได้: `lowest` / `primary_agent` / `base_price`)
  - ทุก booking ต้องบันทึกว่ามาจากนายหน้าคนไหน + snapshot ราคาและค่าคอม ณ เวลานั้น

### 4.2 ปฏิทินว่าง (สำคัญ)
- **ปฏิทินว่าง/ไม่ว่างเป็นของ "บ้าน" ไม่ใช่ของนายหน้า** — นายหน้า A จองวันที่ 10 แล้ว นายหน้า B ต้องเห็นว่าวันที่ 10 เต็มทันที
- ต้องมีกลไก **hold** (จองค้างชั่วคราว 15–30 นาที ระหว่างรอชำระ) และป้องกัน double booking ด้วย unique index + transaction

### 4.3 โครงสร้างราคา
ราคาคิดเป็น **ต่อคืน** และแยกตามประเภทวัน (ตัดสินจาก "คืนที่เข้าพัก"):
| ประเภท | เงื่อนไข |
|---|---|
| `SUN_THU` | คืนวันอาทิตย์–พฤหัสบดี |
| `FRI` | คืนวันศุกร์ |
| `SAT` | คืนวันเสาร์ |
| `HOLIDAY` | คืนวันหยุดนักขัตฤกษ์ / วันก่อนวันหยุดยาว (จาก collection `holidays` ที่แก้ไขได้ในหลังบ้าน) |

**ลำดับความสำคัญ:** `Date Override (ช่วงเทศกาล/พีคซีซั่น)` > `HOLIDAY` > `SAT` > `FRI` > `SUN_THU`

สูตรคำนวณ:
```
ยอดค่าที่พัก   = Σ ราคาของแต่ละคืน
ค่าคนเกิน      = (จำนวนคนทั้งหมด − จำนวนคนมาตรฐาน) × ค่าคนเกินต่อคน × จำนวนคืน
                 (เด็กต่ำกว่า 10 ขวบ นอนกับผู้ปกครอง ฟรีตามโควตาที่บ้านกำหนด)
ค่าบริการเสริม  = น้ำแข็ง / ถ่าน / ฯลฯ (add-on)
ส่วนลด         = โค้ดโปรโมชั่น (ถ้ามี)
─────────────────────────────
ยอดรวมที่ต้องชำระ = ค่าที่พัก + คนเกิน + เสริม − ส่วนลด
ประกันความเสียหาย  = แยกต่างหาก คืนวันเช็คเอาท์ (ไม่รวมในยอดขาย/รายได้)
มัดจำ            = % ของยอดรวม (ตั้งค่าได้)
```
> **ต้องแยก pricing engine เป็น pure function ใน `src/lib/pricing/` และเขียน unit test ครอบคลุมทุกเคส** (คร่อมสัปดาห์, คร่อมวันหยุด, ทับช่วง override, ขั้นต่ำจำนวนคืน, คนเกิน, เด็กฟรี)

---

## 5. Data Model (MongoDB — ออกแบบให้ครบและใส่ index)

ให้สร้าง Mongoose schema พร้อม TypeScript type อย่างน้อยดังนี้:

**`villas`** — ข้อมูลกลางของบ้าน (ไม่มีราคา)
```
code (unique, เช่น "DV-2685"), slug, status(draft|published|hidden),
name/description/highlights: { th, en, zh },
location: { province, district, zone, landmark, latitude, longitude,
            distanceToBeachKm, googleMapUrl },
capacity: { bedrooms, bathrooms, baseGuests, maxExtraGuests, extraGuestFee,
            freeChildUnder10Quota },
damageDeposit,
pool: { isPrivate, system(chlorine|saltwater), widthM, lengthM, depthM,
        hasSlider, sliderHeightM, hasKidPool },
amenities: [key]  // karaoke, snooker, disco_light, bbq_grill, wifi, pool_floats,
                  // extra_mattress, water_heater, life_jacket_kids, projector ...
bedroomDetails: [{ index, beds:[{sizeFt, count, type}], sleeps, hasEnsuite, note }],
extraMattressSleeps,
kitchen: { available:[key], unavailable:[key] },
rules: { checkInFrom, checkOutBefore, petAllowed, petNote,
         loudMusicAllowed, loudMusicNote, smokingPolicy, partyPolicy },
parking: { inHouse, garage },
extraCharges: [{ key, label:{th,en,zh}, price, unit }],
additionalNotes: { th, en, zh },
images: [{ url, thumbUrl, category(cover|pool|bedroom|kitchen|living|bathroom|exterior),
           order, alt:{th,en,zh}, isCover }],
seo: { title:{...}, description:{...} },
stats: { viewCount, bookingCount, avgRating },
createdBy, timestamps
```
index: `code` unique, `slug` unique, `status`, `location.zone`, `capacity.bedrooms`, text index บนชื่อ

**`agents`** — `agentCode` (unique, เช่น "123"), name, phone, lineId, email, avatar, `commissionRate`, bankInfo, status, userId(ref users), timestamps

**`villa_agents`** — ตารางเชื่อม + ราคา (unique compound index `{villaId, agentId}`)
```
villaId, agentId, isActive, isPrimary,
pricing: { sunThu, fri, sat, holiday },
priceOverrides: [{ label:{th,en,zh}, startDate, endDate,
                   dayTypes:[SUN_THU|FRI|SAT|HOLIDAY|ALL], price, minNights }],
minNights, extraGuestFeeOverride, damageDepositOverride,
commissionRateOverride, contactOverride, note
```

**`holidays`** — date, name:{th,en,zh}, type(public|substitution|long_weekend|custom), year, isActive

**`availability`** — `{ villaId, date }` unique compound
`status(available|held|booked|blocked|maintenance)`, bookingId, holdExpiresAt, source, note

**`bookings`**
```
bookingNo (เช่น BK-20260908-0001), villaId, villaCodeSnapshot,
agentId, agentCodeSnapshot,
customer: { name, phone, email, lineId, country },
checkIn, checkOut, nights,
guests: { adults, children, childrenUnder10, totalGuests, extraGuests },
priceBreakdown: {
  nights: [{ date, dayType, price, ruleApplied }],
  accommodationTotal, extraGuestTotal,
  addOns:[{ key, label, qty, unitPrice, total }],
  discount:{ code, amount }, grandTotal,
  damageDeposit, depositRequired, currency
},
commission: { rate, amount },
payment: { method(bank_transfer|promptpay|card), depositStatus, depositPaidAt,
           balanceStatus, slips:[{url, amount, uploadedAt, verifiedBy, verifiedAt}] },
status: pending|awaiting_payment|confirmed|checked_in|completed|cancelled|no_show|expired,
source: web|agent_link|manual|walk_in,
cancellation: { reason, at, by, refundAmount },
internalNotes, timeline:[{at, by, action, detail}], timestamps
```

**`users`** — email, passwordHash(bcrypt/argon2), name, role(superadmin|staff|agent), agentId?, isActive, lastLoginAt

**อื่น ๆ:** `promotions` (โค้ดส่วนลด), `reviews`, `inquiries` (ลูกค้าทักถาม/lead), `settings` (singleton: ชื่อเว็บ, ติดต่อ, บัญชีธนาคาร, % มัดจำ, นโยบายยกเลิก, SEO, social), `audit_logs`, `favorites` (ถ้ามี user)

---

## 6. เว็บฝั่งลูกค้า (Public Site)

### หน้า Home `/[locale]`
- Hero + **search bar**: จุดหมาย/โซน, วันเช็คอิน–เช็คเอาท์, จำนวนผู้เข้าพัก, จำนวนห้องนอน
- Quick filter chips: มีสไลเดอร์ / คาราโอเกะ / โต๊ะสนุ๊ก / รับสัตว์เลี้ยง / ติดทะเล / เสียงดังได้
- Section: บ้านแนะนำ, บ้านมาใหม่, ยอดนิยม, แยกตามโซน (พัทยา/จอมเทียน/บางเสร่/หัวหิน/เขาใหญ่...)
- Section รีวิว, วิธีการจอง 4 ขั้นตอน, FAQ, CTA ติดต่อ (โทร/LINE/Messenger — floating button บนมือถือ)

### หน้าค้นหา `/[locale]/villas`
- Filter: ช่วงราคา/คืน (slider), ห้องนอน, ห้องน้ำ, จำนวนคน, โซน, ระยะห่างทะเล, สิ่งอำนวยความสะดวก (checkbox), ประเภทสระ, มีสไลเดอร์, สัตว์เลี้ยง, ราคาตามประเภทวัน
- Sort: ราคาต่ำ→สูง, สูง→ต่ำ, ยอดนิยม, ใหม่ล่าสุด
- Card แสดง: รูปปก (carousel ในการ์ด), ชื่อ, รหัสบ้าน, โซน, ห้องนอน/ห้องน้ำ/คน, ราคาเริ่มต้น/คืน, badge (สไลเดอร์/คาราโอเกะ), ปุ่มหัวใจ (wishlist)
- **แสดงราคาตามวันที่ที่ผู้ใช้เลือก** ถ้าเลือกวันแล้ว (ราคารวมจริง) และซ่อนบ้านที่ไม่ว่าง
- URL sync กับ filter (shareable), pagination หรือ infinite scroll, skeleton loading, empty state สวย ๆ
- Toggle มุมมอง List / Map (Leaflet หรือ Google Maps)

### หน้ารายละเอียดบ้าน `/[locale]/villa/[code]`
ต้องแสดงข้อมูลครบตามตัวอย่างจริงด้านล่าง จัดกลุ่มเป็น section พร้อมไอคอน:
- **Gallery**: grid รูปหลัก + lightbox (keyboard nav, swipe, ซูม), แยกหมวดรูป
- **สรุปหัวข้อ**: รหัสที่พัก, ห้องนอน, ห้องน้ำ, จำนวนคนพักได้
- คนเกิน + ค่าคนเกิน + จำนวนสูงสุด
- ประกันความเสียหาย + เงื่อนไขคืนเงิน
- โลเคชั่น + แผนที่ + ระยะห่างทะเล
- รายละเอียดสระว่ายน้ำ (ขนาด, ลึก, ระบบน้ำ, สไลเดอร์, สระเด็ก)
- ฟังก์ชั่นที่พัก (grid ไอคอน)
- นโยบายสัตว์เลี้ยง / เสียงดัง / สูบบุหรี่
- เวลาเช็คอิน–เช็คเอาท์
- ที่จอดรถ
- **ตารางจำนวนที่นอน** (แยกตามห้องนอน + ที่นอนเสริม)
- อุปกรณ์ในครัว (แยก "มี" / "ไม่มี" ให้ชัด)
- ค่าใช้จ่ายเพิ่มเติม (ตาราง)
- รายละเอียดเพิ่มเติม / ของใช้ที่จัดให้
- **ตารางราคาแยกประเภทวัน** (อา.–พฤ. / ศ. / ส. / วันหยุดนักขัตฤกษ์)
- **ปฏิทินว่าง** 2 เดือน แสดงราคาในแต่ละวัน + วันที่เต็มเป็นสีเทา
- **กล่องจองแบบ sticky**: เลือกวัน → คำนวณราคาสดทันที แสดง breakdown ทีละคืน → ปุ่ม "จองเลย" / "สอบถาม LINE"
- การ์ดนายหน้าผู้ดูแล (ชื่อ, รหัส, โทร, LINE)
- บ้านใกล้เคียง / บ้านที่คล้ายกัน, ปุ่มแชร์, ปุ่มเปรียบเทียบ
- SEO: metadata ต่อภาษา + JSON-LD `LodgingBusiness` + OG image

### Flow การจอง `/[locale]/booking/...`
1. เลือกวัน/จำนวนคน (validate ขั้นต่ำจำนวนคืน + ความจุ)
2. กรอกข้อมูลผู้จอง (ชื่อ, เบอร์, LINE, อีเมล) + เลือกบริการเสริม + ใส่โค้ดส่วนลด
3. สรุปรายการ + ยอมรับเงื่อนไข → สร้าง booking สถานะ `awaiting_payment` + hold ปฏิทิน 30 นาที (มี countdown)
4. หน้าชำระเงิน: แสดงบัญชีธนาคาร/PromptPay QR + **อัปโหลดสลิป**
5. หน้าสำเร็จ: เลขที่จอง + สรุป + ปุ่มบันทึกเป็นรูป/PDF + เพิ่มลงปฏิทิน (.ics)
- `/[locale]/booking/lookup` — ตรวจสอบสถานะการจองด้วยเลขที่จอง + เบอร์โทร

### หน้าอื่น
`/a/[agentCode]` (หน้ารวมบ้านของนายหน้า + ติดต่อ), `/about`, `/contact`, `/faq`, `/terms`, `/privacy`, `/compare`, `/wishlist`, หน้า 404/500 ที่ออกแบบสวย

---

## 7. หลังบ้าน (Admin — `admin.localhost:3000`)

RBAC 3 ระดับ: **superadmin** (ทุกอย่าง) / **staff** (จัดการบ้าน+จอง ไม่เห็นการเงินรวม) / **agent** (เห็นเฉพาะบ้านและยอดของตัวเอง)

### Dashboard
- KPI cards: ยอดขายรวม, จำนวนการจอง, อัตราการเข้าพัก (occupancy %), ราคาเฉลี่ยต่อคืน (ADR), ค่าคอมมิชชั่นรวม, ยอดรอชำระ
- กราฟ: รายได้รายวัน/เดือน, การจองแยกตามนายหน้า, บ้านขายดี Top 10, สัดส่วนประเภทวัน, funnel (เข้าชม → สอบถาม → จอง)
- ตัวกรองช่วงวันที่ + เปรียบเทียบกับช่วงก่อนหน้า
- รายการจองล่าสุด, เช็คอินวันนี้/พรุ่งนี้, สลิปรอตรวจสอบ

### จัดการบ้าน
- ตาราง + ค้นหา + filter + bulk action (publish/hide/ลบ)
- ฟอร์มเพิ่ม/แก้ไขบ้าน แบบ **แบ่ง step/tab**: ข้อมูลทั่วไป → ที่ตั้ง → ความจุ&ที่นอน → สระ&สิ่งอำนวยความสะดวก → ครัว → กฎ&เวลา → ค่าใช้จ่ายเพิ่ม → รูปภาพ → นายหน้า&ราคา → SEO
- ทุก field ที่เป็นข้อความมี **tab ไทย/EN/中文** (บังคับกรอกไทย, อีกสองภาษาเว้นได้แล้ว fallback)
- **Image manager**: อัปโหลดหลายไฟล์พร้อมกัน (drag & drop), ลากจัดลำดับ, ตั้งรูปปก, ครอป, จัดหมวด, ลบ, auto-optimize เป็น WebP หลายขนาด
- ปุ่ม "Duplicate villa" สำหรับสร้างบ้านใหม่จากหลังเดิม
- Preview หน้าเว็บจริงก่อน publish

### จัดการนายหน้า
- CRUD นายหน้า + กำหนดรหัสนายหน้า + % คอมมิชชั่น
- ผูก/ถอนบ้านให้นายหน้า, ตั้งราคาแทนนายหน้าได้
- ดูยอดขายและค่าคอมรายคน + ลิงก์อ้างอิงพร้อม copy + QR code

### Agent Portal (นายหน้าล็อกอินเอง)
- เห็นเฉพาะบ้านที่ตัวเองดูแล
- **ตั้งราคาเองได้ทั้ง 4 ประเภทวัน + สร้าง override ช่วงเทศกาลได้เอง**
- ดูปฏิทินว่างของบ้าน, บล็อกวันได้ (ถ้าอนุญาต)
- ดูรายการจองของตัวเอง + ค่าคอมที่ได้ + สถานะจ่าย
- สร้างการจองแทนลูกค้า (manual booking)
- ลิงก์/QR ของตัวเอง + สรุปสถิติคลิก

### จัดการการจอง
- ตาราง + Kanban ตามสถานะ, ค้นหาด้วยเลขจอง/เบอร์/ชื่อ
- เปลี่ยนสถานะ, ตรวจสอบสลิป (ดูรูปเทียบยอด), บันทึกรับเงินมัดจำ/ยอดคงเหลือ, คืนประกัน, ยกเลิก+เหตุผล
- แก้ไขวัน/ราคาแบบ manual (มี audit log)
- พิมพ์ใบยืนยันการจอง / ใบเสร็จ (PDF)

### ปฏิทินรวม
- มุมมองเดือน แบบ multi-villa (แกน Y = บ้าน, แกน X = วัน) — เห็นทั้งหมดในจอเดียว
- คลิก/ลากเพื่อบล็อกวัน หรือปรับราคาเฉพาะวัน
- Export/Import iCal (เผื่อ sync กับ Airbnb/Booking.com ภายหลัง)

### อื่น ๆ
- จัดการวันหยุดนักขัตฤกษ์ (import รายการวันหยุดไทยรายปี)
- จัดการโปรโมชั่น/โค้ดส่วนลด
- กล่องข้อความสอบถาม (inquiries/leads)
- รายงาน + export CSV/Excel
- ตั้งค่าเว็บ (ข้อมูลติดต่อ, บัญชีธนาคาร, % มัดจำ, นโยบายยกเลิก, โลโก้, SEO, ลิงก์โซเชียล)
- จัดการผู้ใช้ + Audit log
- แจ้งเตือนเมื่อมีการจองใหม่ (email + **LINE Notify / Telegram webhook** — ทำเป็น adapter ปิด/เปิดได้)

---

## 8. Design Direction (ใช้ skill `impeccable`)

- **ธีมขาวเป็นค่าเริ่มต้น + สลับ Dark ได้** (ปุ่มสลับอยู่บน header, จำค่าไว้, ไม่มี flash ตอนโหลด)
- โทน: สะอาด โปร่ง พรีเมียม รีสอร์ต — พื้นขาว/ครีม, accent สีเขียวน้ำทะเล (teal) หรือทรายอุ่น ๆ, เงานุ่ม, มุมโค้งพอดี, ระยะห่างโปร่ง, **ให้รูปภาพเป็นพระเอก**
- อย่าให้ออกมาเหมือน template Bootstrap ทั่วไป — ต้องมีเอกลักษณ์ ดูแพงกว่าเว็บจองบ้านพักทั่วไปในไทย
- ฟอนต์: ไทย = LINE Seed Sans TH / Noto Sans Thai, อังกฤษ = Inter หรือ Geist, จีน = Noto Sans SC — ตั้ง font stack ต่อ locale
- ตั้ง **design token** (สี, spacing, radius, shadow, typography scale) เป็น CSS variable ใน `globals.css` ให้เปลี่ยนธีมทั้งเว็บได้จากที่เดียว
- **Mobile-first** — ลูกค้าไทยส่วนใหญ่ใช้มือถือ: bottom sheet filter, sticky booking bar ล่างจอ, ปุ่มโทร/LINE ลอย
- Motion เบา ๆ (Framer Motion): fade/slide ตอน scroll, hover การ์ดยกเล็กน้อย, page transition นุ่ม — ห้ามหวือหวาเกิน
- Accessibility WCAG 2.1 AA: contrast, focus ring, aria-label, keyboard nav ใน gallery/date picker, `prefers-reduced-motion`
- Loading = skeleton ไม่ใช่ spinner, Error state และ Empty state ออกแบบมาอย่างดี
- สร้างหน้า `/style-guide` (dev only) รวม component ทั้งหมดไว้ดู

---

## 9. i18n (ไทย / English / 中文)

- Routing `/(th|en|zh)/...` ค่าเริ่มต้น `th`, มี language switcher, `hreflang` ครบ
- แยกไฟล์แปลเป็น namespace (`common`, `home`, `villa`, `booking`, `admin`) ห้าม hardcode ข้อความในคอมโพเนนต์
- เนื้อหาจาก DB เป็น multilingual object `{th, en, zh}` + fallback ไป `th` เมื่อไม่มีคำแปล
- วันที่: ไทยใช้ พ.ศ. + ชื่อเดือนไทย, อังกฤษ/จีนใช้ ค.ศ.
- ตัวเลข/สกุลเงิน: THB `฿1,234` เป็นหลัก (เตรียมโครงสำหรับแสดงสกุลอื่นในอนาคต)
- ต้องแปลครบทุกหน้า รวมถึงข้อความ error, validation, email template

---

## 10. Non-functional Requirements

- **Security**: Zod validate ทุก input, RBAC ตรวจซ้ำที่ server ทุกครั้ง, rate limit (login/booking/upload), sanitize HTML, ตรวจ MIME + ขนาดไฟล์อัปโหลด, httpOnly secure cookie, hash password ด้วย argon2/bcrypt, ไม่ leak ข้อมูลติดต่อเจ้าของบ้านออกหน้าเว็บ, CSRF protection ใน server action
- **Performance**: `next/image` ทุกที่, lazy load gallery, ISR/revalidate หน้า villa, index MongoDB ให้ครบ, ไม่ N+1 query, Lighthouse ≥ 90 ทั้ง 4 หมวดบน mobile
- **SEO**: sitemap.xml, robots.txt, canonical, structured data, slug อ่านง่าย
- **Reliability**: transaction ตอนสร้าง booking, cron/route ล้าง hold ที่หมดอายุ, error boundary, structured logging
- **Testing**: unit test pricing + availability ให้ครอบคลุมจริงจัง, e2e flow "ค้นหา → ดูบ้าน → จอง → อัปโหลดสลิป → แอดมินยืนยัน"
- **Seed data**: สร้างข้อมูลตัวอย่าง — บ้าน 8–10 หลัง (รวม `DV-2685` ตามข้อมูลจริงใน §13), นายหน้า 3 คน (รหัส 123, 124, 125) ที่ตั้งราคาบ้านหลังเดียวกันต่างกัน, การจองย้อนหลัง 30–50 รายการเพื่อให้ dashboard มีข้อมูล, วันหยุดนักขัตฤกษ์ไทย 2 ปี, admin user 1 คน (แสดง credential ใน console ตอน seed)

---

## 11. แผนการทำงานเป็น Phase

| Phase | สิ่งที่ต้องส่ง |
|---|---|
| **0** | `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, init Next.js, Tailwind, shadcn, ESLint/Prettier, docker-compose (mongo/mongo-express/redis), `.env.example`, README, design token + style guide |
| **1** | Mongoose models ครบ + index + seed script + **pricing engine + unit tests** + availability service (hold/book/release) |
| **2** | Middleware subdomain, Auth + RBAC, layout หลังบ้าน, CRUD บ้าน + image manager |
| **3** | หน้า Public: home, search + filter, villa detail + gallery + ปฏิทินราคา |
| **4** | Booking flow ครบ + สลิป + email/LINE แจ้งเตือน + booking lookup |
| **5** | ระบบนายหน้า: villa_agents, ราคาต่อนายหน้า, ref link + cookie, Agent Portal, ค่าคอม |
| **6** | Dashboard + รายงาน + export + ปฏิทินรวม + จัดการวันหยุด/โปรโมชั่น |
| **7** | i18n ครบ 3 ภาษา + Dark mode ขัดเกลา + SEO + a11y + responsive audit |
| **8** | E2E tests, hardening, Dockerfile production, deployment guide, สรุปงานที่เหลือ |

จบแต่ละ Phase ให้: สรุปสิ่งที่ทำ → วิธีรัน/ทดสอบ → สิ่งที่ต้องตัดสินใจต่อ → commit

---

## 12. คำถามที่ต้องถามผมก่อนเริ่มเขียนโค้ด

1. ราคาที่แสดงบนหน้าเว็บสาธารณะเมื่อ **ไม่มี** รหัสนายหน้า ให้ใช้ ราคาต่ำสุด / ราคาของนายหน้าหลัก / ราคากลางที่แอดมินตั้ง?
2. นายหน้ามีสิทธิ์ **บล็อกวันในปฏิทิน** ของบ้านเองได้ไหม หรือแอดมินเท่านั้น?
3. รับชำระเงินแบบ **โอน+แนบสลิป** อย่างเดียวก่อน หรือจะต่อ payment gateway (Omise / GB Prime Pay / 2C2P) ด้วย?
4. มัดจำกี่เปอร์เซ็นต์ และนโยบายยกเลิก/คืนเงินเป็นอย่างไร?
5. ลูกค้าต้อง **สมัครสมาชิก** ไหม หรือ guest checkout อย่างเดียวพอ?
6. โดเมนจริงที่จะใช้คืออะไร (เพื่อวางโครง subdomain และ SEO)?
7. ต้องการรีวิว/ให้ดาวจากลูกค้าจริงไหม หรือแอดมินเป็นคนใส่รีวิวเอง?

**ถ้าผมยังไม่ตอบ ให้เลือกค่าเริ่มต้นที่สมเหตุสมผลที่สุด บันทึกไว้ใน `docs/DECISIONS.md` แล้วทำต่อได้เลย ไม่ต้องรอ**

---

## 13. ข้อมูลบ้านตัวอย่างจริง (ใช้เป็น seed + เป็นเกณฑ์ว่าหน้ารายละเอียดต้องรองรับ field ครบ)

```
รหัสที่พัก : DV-2685
5 ห้องนอน 4 ห้องน้ำ
คนเกินเสริมท่านละ 200 บาท/คืน
เกินจากจำนวนคนปกติ เสริมได้สูงสุด 15 ท่าน
ประกันความเสียหาย 3000 บาท (คืนวันออก ถ้าไม่มีอะไรเสียหาย)

โลเคชั่น: อ่างเก็บน้ำมาบประชัน — ห่างทะเล 10.5 กม.

สระว่ายน้ำ: สระส่วนตัว (ระบบคลอรีน)
 - สไลเดอร์ (2 เมตร)
 - กว้าง 4 ม. ยาว 10 ม. ลึก 1.5 ม.
 - ไม่มีสระเด็ก

ฟังก์ชั่นที่พัก: คาราโอเกะ / โต๊ะสนุ๊ก / ห่วงยางแฟนซี / ไฟเธค /
ที่นอนเสริมคนเกิน / สไลเดอร์ / เตาปิ้งย่าง / Free Wifi

สัตว์เลี้ยง: ไม่อนุญาต
เช็คอิน 14:00 น. / เช็คเอาท์ ก่อน 12:00 น.
ที่จอดรถ: ในบ้าน 4 คัน, ในโรงจอด 10 คัน

จำนวนที่นอน
 - ห้องนอน 1: เตียง 6 ฟุต 1 เตียง — นอนได้ 2 คน
 - ห้องนอน 2: เตียง 6 ฟุต 2 เตียง — นอนได้ 4 คน
 - ห้องนอน 3: เตียง 2 ชั้น (ล่าง 5 ฟุต / บน 4 ฟุต) — นอนได้ 3 คน
 - ห้องนอน 4: เตียง 6 ฟุต 1 เตียง + เตียงเสริม 3 ฟุต 1 เตียง, ห้องน้ำในตัว — นอนได้ 3 คน
 - ห้องนอน 5: เตียง 6 ฟุต 1 เตียง, ห้องน้ำในตัว — นอนได้ 2 คน
 - ที่นอนเสริมอีก 6 คน

อุปกรณ์ในครัว
 - ไม่มี: เตาปิ้งขนมปัง, ซึ้ง, เครื่องปั่น
 - มี: กระทะ, จานชาม, ช้อน, แก้วน้ำ, เขียง, มีด, ครก, ไมโครเวฟ, ถังน้ำแข็ง,
       หม้อ+กระทะชาบู, หม้อหุงข้าว 1.5–2 ลิตร, หม้อ, เตาไฟฟ้า, เตาแก๊ส

ค่าใช้จ่ายเพิ่มเติม
 - น้ำแข็ง 8-10 กก. ถุงละ 50 บาท
 - ถ่าน ถุงละ 20 บาท

รายละเอียดเพิ่มเติม
 - เด็กต่ำกว่า 10 ขวบ พักฟรีได้ 5 ท่าน (นอนกับผู้ปกครอง)
 - ผ้าเช็ดตัว / สบู่เหลว เจลล้างมือ ยาสระผม / เครื่องทำน้ำอุ่น / ชูชีพเด็ก 3 ตัว
 - ใช้เสียงดังได้ทั้งคืน
```

---

## 14. ไฟล์ `CLAUDE.md` ที่ต้องสร้าง

สร้าง `CLAUDE.md` ที่ root ให้ Claude Code ในเซสชันถัดไปอ่านแล้วทำงานต่อได้ทันที ต้องมีอย่างน้อย:

1. **Project Overview** — ระบบคืออะไร ใครใช้ (ลูกค้า / แอดมิน / นายหน้า)
2. **Business Rules ที่ห้ามทำผิด** — บ้าน 1 หลังหลายนายหน้า, ราคาผูกกับคู่ villa×agent, ปฏิทินว่างใช้ร่วมกัน, ประเภทวัน 4 แบบ + ลำดับความสำคัญ, ประกันความเสียหายไม่นับเป็นรายได้, timezone Asia/Bangkok
3. **Tech Stack & Versions**
4. **Commands** — `docker compose up -d`, `npm run dev`, `npm run seed`, `npm test`, `npm run lint`
5. **Project Structure** — อธิบายทุกโฟลเดอร์สำคัญว่าใส่อะไร
6. **Data Model summary** + ที่อยู่ของ schema
7. **Conventions** — ชื่อไฟล์/ตัวแปร, Server Component เป็นค่าเริ่มต้น, ใช้ Server Action สำหรับ mutation, Zod schema อยู่ที่ไหน, error handling pattern, การเพิ่มคำแปลใหม่, การเพิ่ม amenity ใหม่
8. **Design System** — token, ฟอนต์, กติกาการใช้สี, ห้าม inline style, ต้องรองรับ dark mode ทุกคอมโพเนนต์
9. **i18n rules** — ห้าม hardcode string, ต้องเพิ่มครบ 3 ภาษา
10. **Security checklist** ที่ต้องเช็คทุกครั้งที่เพิ่ม endpoint
11. **Environment variables** ทั้งหมด + ความหมาย
12. **Do / Don't** สำหรับ AI agent
13. **Roadmap / TODO** ตาม Phase พร้อม checkbox
14. **Known issues & decisions** (ลิงก์ไป `docs/DECISIONS.md`)

---

เริ่มจากสรุปความเข้าใจ + ถามคำถามใน §12 ก่อน แล้วค่อยเริ่ม Phase 0 ครับ

=== END PROMPT ===
