# PoolVilla Booking Platform

ระบบจองบ้านพักพูลวิลล่ารายวันสำหรับตลาดไทย เน้นพัทยา รองรับหัวหิน เขาใหญ่ เชียงใหม่ ภูเก็ต

บ้านหนึ่งหลังขายผ่านนายหน้าในเครือได้หลายคน แต่ละคนขายคนละราคา โดยที่ปฏิทินว่างใช้ร่วมกันทั้งหมด

## เริ่มใช้งาน

ต้องมี Node.js 20.9 ขึ้นไป และ Docker

```bash
cp .env.example .env.local     # แล้วใส่ AUTH_SECRET
npx auth secret                # สร้างค่า AUTH_SECRET

npm install
npm run db:up                  # mongo + mongo-express + redis
npm run seed                   # ข้อมูลตัวอย่าง พิมพ์บัญชีแอดมินออกมาให้
npm run dev
```

| ที่อยู่ | คืออะไร |
|---|---|
| http://localhost:3000 | เว็บฝั่งลูกค้า |
| http://admin.localhost:3000 | หลังบ้านและพอร์ทัลนายหน้า |
| http://localhost:8081 | mongo-express ดูฐานข้อมูล |

**เรื่อง `admin.localhost`** Chrome, Edge และ Firefox รุ่นใหม่ resolve `*.localhost` เป็น `127.0.0.1` ให้เองอยู่แล้ว ไม่ต้องแก้ไฟล์ hosts ถ้าเบราว์เซอร์หรือเครื่องมือของคุณไม่รองรับ ให้เปิด `ENABLE_ADMIN_PATH_FALLBACK=true` ใน `.env.local` แล้วเข้าที่ http://localhost:3000/th/admin แทน อย่าเปิดค่านี้บนเครื่องจริง

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รันแอปที่พอร์ต 3000 |
| `npm run build` | build โปรดักชัน |
| `npm run lint` | ESLint |
| `npm run typecheck` | ตรวจชนิดข้อมูล |
| `npm test` | unit test |
| `npm run test:e2e` | Playwright |
| `npm run db:up` / `db:down` | ยกและปิด infrastructure |
| `npm run db:reset` | ล้าง volume แล้วยกใหม่ |
| `npm run seed` | เติมข้อมูลตัวอย่าง |

แอปรันบนเครื่องปกติ Docker ใช้เฉพาะ MongoDB, mongo-express และ Redis

## สถาปัตยกรรมที่ควรรู้ก่อนแก้โค้ด

**MongoDB รันเป็น single-node replica set** ไม่ใช่ standalone เพราะ standalone ทำ transaction ไม่ได้เลย รายละเอียดและเหตุผลอยู่ที่ `docs/DECISIONS.md` ข้อ D-003 และ D-004

**หลังบ้านอยู่ที่ path ภายใน `/{locale}/admin/...` เสมอ** hostname เป็นแค่ทางเข้า `src/proxy.ts` เป็นคนตัดสิน อ่านคอมเมนต์ในไฟล์นั้นก่อนแก้ มันเป็นจุดที่เปราะที่สุดของโปรเจกต์

**วันที่ทุกตัวเป็นสตริง `'YYYY-MM-DD'` ตามเวลาไทย** ไม่ใช่ `Date` ดู D-002

**ราคาเป็นสองชั้น** บริษัทตั้งราคาฐานที่ตัวบ้าน นายหน้าบวกเพิ่มทับ ดู D-001

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| `CLAUDE.md` | คู่มือสำหรับ AI agent และคนที่เพิ่งเข้าโปรเจกต์ กฎที่ห้ามทำผิดอยู่ในนั้น |
| `PRODUCT.md` | ความจริงของโปรดักต์ ผู้ใช้ จุดยืน ข้อจำกัด |
| `docs/ARCHITECTURE.md` | โครงระบบ routing แคช และการไหลของข้อมูล |
| `docs/DATA-MODEL.md` | schema ทุกตัวและ index |
| `docs/DECISIONS.md` | ข้อตัดสินใจพร้อมเหตุผล อ่านก่อนย้อนอันใดอันหนึ่ง |
| `poolvilla-booking-prompt.md` | สเปกตั้งต้นฉบับเต็ม |
| `.impeccable/surfaces/` | สัญญาทิศทางการออกแบบของแต่ละหน้า |

## สถานะ

Phase 0 เสร็จแล้ว ฐานราก โครง route สองราก โทเคนดีไซน์ docker และเอกสาร
Phase ถัดไปคือ Mongoose models เอนจินราคาพร้อมเทสต์ และบริการปฏิทินว่าง

ดูรายการเต็มที่หัวข้อ Roadmap ใน `CLAUDE.md`
