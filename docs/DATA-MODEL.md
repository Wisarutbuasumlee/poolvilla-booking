# Data model

Schema จริงอยู่ที่ `src/lib/db/models/` เอกสารนี้คือรูปทรงที่ตกลงไว้และเหตุผลของ index แต่ละตัว
Phase 1 เป็นคนเขียน schema ตามนี้

## กติกาที่ใช้ทั้งฐานข้อมูล

- **เงินเก็บเป็นจำนวนเต็มสตางค์** `฿12,500` คือ `1250000` ไม่มี float ในเส้นทางของเงิน
- **วันที่เชิงปฏิทินเก็บเป็น `dateKey` สตริง `'YYYY-MM-DD'` ตามเวลาไทย** ไม่ใช่ `Date` การเรียงตัวอักษรตรงกับการเรียงตามเวลา index จึงใช้ได้ ส่วน `Date` ใช้ได้กับ timestamp ที่เป็นช่วงเวลาจริง เช่น `createdAt` และ `holdExpiresAt`
- **ข้อความที่ผู้ใช้เห็นเป็นออบเจกต์สามภาษา** `{ th, en, zh }` ไทยบังคับ อีกสองภาษาเว้นได้แล้ว fallback มาไทย
- **enum เก็บเป็น key ภาษาอังกฤษ** คำแปลอยู่ในไฟล์ messages ไม่ใช่ในฐานข้อมูล

---

## `villas`

ข้อมูลกลางของบ้าน **พร้อมราคาฐานของบริษัท** ซึ่งต่างจากสเปกตั้งต้นที่ให้บ้านไม่มีราคา ดู DECISIONS D-001

```
code                unique  เช่น "DV-2685"
slug                unique
status              draft | published | hidden
name/description/highlights   { th, en, zh }

location            { province, district, zone, landmark, latitude, longitude,
                      distanceToBeachKm, googleMapUrl }

capacity            { bedrooms, bathrooms, baseGuests, maxExtraGuests,
                      extraGuestFee, freeChildUnder10Quota }

basePricing         { sunThu, fri, sat, holiday }        ← ราคาฐานของบริษัท ขายได้จริง
baseOverrides       [{ label:{th,en,zh}, startDate, endDate,
                       dayTypes:[SUN_THU|FRI|SAT|HOLIDAY|ALL],
                       price, minNights }]
minNights
damageDeposit
depositPercentOverride                                    ← ทับค่ากลาง 30% ได้

pool                { isPrivate, system(chlorine|saltwater),
                      widthM, lengthM, depthM, hasSlider, sliderHeightM, hasKidPool }
amenities           [key]
bedroomDetails      [{ index, beds:[{sizeFt, count, type}], sleeps, hasEnsuite, note }]
extraMattressSleeps
kitchen             { available:[key], unavailable:[key] }
rules               { checkInFrom, checkOutBefore, petAllowed, petNote,
                      loudMusicAllowed, loudMusicNote, smokingPolicy, partyPolicy }
parking             { inHouse, garage }
extraCharges        [{ key, label:{th,en,zh}, price, unit }]
additionalNotes     { th, en, zh }
nearbyAttractions   [{ name:{th,en,zh}, distanceKm, category }]
images              [{ url, thumbUrl, category, order, alt:{th,en,zh}, isCover,
                       isSynthetic }]
seo                 { title:{...}, description:{...} }
stats               { viewCount, bookingCount, avgRating }
createdBy, timestamps
```

`images[].isSynthetic` มีไว้เพราะตอนนี้ยังไม่มีรูปถ่ายจริง รูปที่สร้างขึ้นระหว่างพัฒนาต้องติดธงนี้ และหน้าเว็บต้องไม่แสดงรูปสังเคราะห์เป็นของจริง

**Index**

| index | ทำไม |
|---|---|
| `{code:1}` unique | รหัสที่พักเป็นตัวชี้ที่คนใช้จริง |
| `{slug:1}` unique | URL |
| `{status:1, 'location.zone':1}` | หน้าค้นหากรองด้วยสองอันนี้เกือบทุกครั้ง |
| `{status:1, 'capacity.bedrooms':1}` | ตัวกรองห้องนอน |
| text index บน `name` | ค้นด้วยคำ |

---

## `agents`

```
agentCode           unique  เช่น "123"
name, phone, lineId, email, avatar
commissionRate      0..1   ค่าเริ่มต้น 0 ดู DECISIONS D-001 ที่ยังค้าง
bankInfo
status              active | suspended
userId              ref users
timestamps
```

**Index** `{agentCode:1}` unique, `{status:1}`

---

## `villa_agents`

ตารางเชื่อมบ้านกับนายหน้า **ถือยอดบวกเพิ่ม ไม่ใช่ราคาเต็ม**

```
villaId, agentId
isActive, isPrimary
markup              { sunThu, fri, sat, holiday }   ← บวกเพิ่มต่อคืน หน่วยสตางค์
markupOverrides     [{ label:{th,en,zh}, startDate, endDate,
                       dayTypes:[...], amount, minNights }]
minNightsOverride
extraGuestFeeOverride
damageDepositOverride
commissionRateOverride
canBlockDates       boolean   ← เปิดสิทธิ์บล็อกวันเป็นรายบ้าน
contactOverride
note
timestamps
```

**Index**

| index | ทำไม |
|---|---|
| `{villaId:1, agentId:1}` unique | นายหน้าหนึ่งคนผูกกับบ้านหนึ่งหลังได้ครั้งเดียว |
| `{agentId:1, isActive:1}` | หน้ารวมบ้านของนายหน้า `/a/123` และพอร์ทัล |
| `{villaId:1, isActive:1}` | resolve ราคาแบบ batch ในหน้าค้นหา |

---

## `availability`

**การไม่มีเอกสารแปลว่าว่าง** เก็บเฉพาะวันที่ไม่ว่าง

```
villaId
dateKey             'YYYY-MM-DD' ตามเวลาไทย
status              available | held | booked | blocked | maintenance
bookingId           ref bookings, null ได้
holdExpiresAt       Date, ตั้งเมื่อ status === 'held' เท่านั้น
priceOverride       สตางค์, ปรับราคาเฉพาะวันจากปฏิทินหลังบ้าน
source              web | agent | admin | ical | system
note
timestamps
```

**Index**

| index | ทำไม |
|---|---|
| `{villaId:1, dateKey:1}` unique | **นี่คือกลไกกันจองชน** ไม่มีอย่างอื่นที่ทำหน้าที่นี้ |
| `{holdExpiresAt:1}` partial `status:'held'` | ตัวกวาดล้าง hold ที่หมดอายุ partial ทำให้ index เล็ก |
| `{dateKey:1, villaId:1}` partial สถานะที่ไม่ว่าง | ปฏิทินรวมหลายบ้าน และการซ่อนบ้านที่ไม่ว่างในหน้าค้นหา |

**ห้ามใส่ TTL index บน `holdExpiresAt`** ดู DECISIONS D-003

---

## `bookings`

```
bookingNo           unique  "BK-20260908-0001"
villaId, villaCodeSnapshot
agentId, agentCodeSnapshot
customer            { name, phone, email, lineId, country }
checkIn, checkOut   dateKey
nights
guests              { adults, children, childrenUnder10, totalGuests, extraGuests }

priceBreakdown      { nights:[{ dateKey, dayType, basePrice, markup, price,
                                ruleApplied, overrideId }],
                      accommodationTotal, extraGuestTotal,
                      addOns:[{ key, label, qty, unitPrice, total }],
                      discount:{ code, amount },
                      grandTotal, damageDeposit, depositRequired, balanceDue,
                      currency }
rateCardSnapshot    ราคาฐานและ markup ที่ใช้จริง รวม override ทั้งหมด
pricingEngineVersion
commission          { rate, amount }

payment             { method(bank_transfer|promptpay|card),
                      depositStatus, depositPaidAt,
                      balanceStatus,
                      slips:[{url, amount, uploadedAt, verifiedBy, verifiedAt}] }
status              pending | awaiting_payment | confirmed | checked_in |
                    completed | cancelled | no_show | expired
holdExpiresAt       Date, มีเฉพาะตอน awaiting_payment
source              web | agent_link | manual | walk_in
cancellation        { reason, at, by, refundAmount }
internalNotes
timeline            [{ at, by, action, detail }]
timestamps
```

`priceBreakdown.nights[]` แยก `basePrice` กับ `markup` ออกจากกัน เพื่อให้ตอบได้ว่าเงินส่วนไหนเป็นของบริษัทและส่วนไหนเป็นของนายหน้า โดยไม่ต้องคำนวณย้อน

**Index**

| index | ทำไม |
|---|---|
| `{bookingNo:1}` unique | |
| `{holdExpiresAt:1}` partial `status:'awaiting_payment'` | ตัวกวาดล้าง |
| `{villaId:1, checkIn:1}` | ปฏิทินของบ้าน |
| `{agentId:1, createdAt:-1}` | พอร์ทัลนายหน้า |
| `{status:1, createdAt:-1}` | ตารางและ kanban หลังบ้าน |
| `{'customer.phone':1}` | หน้าตรวจสอบการจอง |
| `{checkIn:1, status:1}` | เช็คอินวันนี้และพรุ่งนี้ |

---

## `holidays`

```
dateKey             'YYYY-MM-DD'
name                { th, en, zh }
type                public | substitution | long_weekend | custom
year
isActive
```

`long_weekend` คือวันก่อนวันหยุดยาวที่ถูกคิดราคาแบบวันหยุด **เก็บเป็นแถวจริง** ไม่ให้เอนจินราคาเดาเอง แอดมินแก้ได้และตรวจย้อนหลังได้

**Index** `{dateKey:1}` unique, `{year:1, isActive:1}`

---

## `counters`

ออกเลขที่จองแบบ atomic

```
_id                 "BK-20260908"
seq                 number
```

`findOneAndUpdate({_id}, {$inc:{seq:1}}, {upsert:true, returnDocument:'after'})` เป็น atomic บนเอกสารเดียว **ห้ามใช้ `countDocuments() + 1`** เพราะสองคำขอพร้อมกันจะได้เลขเดียวกัน

---

## `users`

```
email               unique
passwordHash        argon2id
name
role                superadmin | staff | agent
agentId             ref agents, มีเมื่อ role === 'agent'
isActive
lastLoginAt
timestamps
```

**Index** `{email:1}` unique, `{role:1, isActive:1}`

---

## ตารางที่เหลือ

| collection | เก็บอะไร | index ที่สำคัญ |
|---|---|---|
| `promotions` | โค้ดส่วนลด เงื่อนไข ช่วงเวลา | `{code:1}` unique, `{isActive:1, startsAt:1, endsAt:1}` |
| `reviews` | รีวิว มี `source: admin \| guest` | `{villaId:1, isPublished:1}` |
| `inquiries` | ลูกค้าทักถามและ lead | `{status:1, createdAt:-1}` |
| `settings` | singleton ข้อมูลติดต่อ บัญชีธนาคาร มัดจำ นโยบายยกเลิก SEO โซเชียล และค่า `priceFallback` | `_id` เดียว |
| `audit_logs` | ใครทำอะไรกับเงินหรือปฏิทิน | `{createdAt:-1}`, `{actorId:1, createdAt:-1}` |
| `favorites` | wishlist | `{sessionId:1}` |

---

## ความสัมพันธ์

```
villas ──┬─< villa_agents >─── agents ───< users
         │        (ราคาบวกเพิ่ม)
         ├─< availability          (ปฏิทินของบ้าน ใช้ร่วมกันทุกนายหน้า)
         ├─< bookings >──────────── agents  (snapshot ไว้ ไม่ join กลับ)
         ├─< reviews
         └─< images (embedded)

holidays ── อ่านโดยเอนจินราคา ไม่มีความสัมพันธ์เชิงคีย์
```

จุดที่ต้องเข้าใจให้ถูก **ราคาเดินผ่าน `villa_agents` แต่ปฏิทินไม่เดิน** ปฏิทินผูกกับ `villaId` ตรง ๆ เท่านั้น
