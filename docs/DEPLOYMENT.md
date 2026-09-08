# Deployment

สแตกโปรดักชันเป็นคอนเทนเนอร์ทั้งหมด nginx, แอป, MongoDB, Redis เหมือนโครงของ TCS ERP
อิมเมจถูก build และ push จากเครื่องพัฒนา เซิร์ฟเวอร์แค่ pull แล้ว up

## สองสภาพแวดล้อม อย่าสับสน

| ไฟล์ | ใช้เมื่อไหร่ | รันอะไร |
|---|---|---|
| ไม่มีไฟล์ compose | ตอนพัฒนา | ไม่มี container เลย แอปรันด้วย `npm run dev` และต่อเข้า MongoDB ตัวที่รันอยู่บนเครื่อง ดู D-004 |
| `docker-compose.prod.yml` | ตอนขึ้นจริง | ทุกอย่างเป็นคอนเทนเนอร์ รวมแอปและ nginx |

## ผังของสแตกจริง

```
              :80 :443
                 │
            ┌────▼─────┐
            │  nginx   │  TLS termination, forward Host header
            └────┬─────┘
                 │ app:3000
            ┌────▼─────┐
            │   app    │  Next.js standalone, ผู้ใช้ nextjs uid 1001
            └──┬────┬──┘
     mongodb:27017  redis:6379
        │           │
   ┌────▼────┐  ┌───▼───┐
   │ mongodb │  │ redis │   ไม่เปิดพอร์ตออกนอกสแตกทั้งคู่
   └─────────┘  └───────┘
```

nginx เป็นคอนเทนเนอร์เดียวที่เปิดพอร์ตออกภายนอก ฐานข้อมูลไม่มี `ports` เลย ถ้าจะต่อ Compass ให้ทำ ssh tunnel แทนการเปิดพอร์ต

## จุดที่พลาดแล้วหลังบ้านหาย

`nginx.conf` มีบรรทัด `proxy_set_header Host $host;` บรรทัดนี้ห้ามแก้

แอปตัดสินว่าจะเสิร์ฟหน้าบ้านหรือหลังบ้านจาก Host header ใน `src/proxy.ts` ถ้าเปลี่ยนเป็นชื่อ upstream ทุกคำขอจะกลายเป็นหน้าบ้านหมด และ `admin.<โดเมน>` จะเข้าไม่ได้อีกเลย

ต้องตั้ง DNS ให้ทั้งสองชื่อชี้มาที่เซิร์ฟเวอร์เดียวกัน และใบรับรองต้องครอบคลุมทั้งคู่

```
example.com        A   <ip>
admin.example.com  A   <ip>
```

แล้วใส่ `ADMIN_HOSTNAMES=admin.example.com` ใน `.env` ให้ตรงกับที่คนพิมพ์จริง

## build และ push จากเครื่องพัฒนา

```bash
npm run docker:build     # สร้างทั้ง poolvilla-app และ poolvilla-web
docker login
npm run docker:push
```

ใช้ registry อื่นได้ด้วยการสั่ง docker ตรง ๆ

```bash
docker build --target app -t ghcr.io/<user>/poolvilla-app:latest .
docker build --target web -t ghcr.io/<user>/poolvilla-web:latest .
```

แล้วตั้ง `REGISTRY` กับ `TAG` ใน `.env` บนเซิร์ฟเวอร์ให้ตรงกัน

**stage builder ต้องต่อเน็ตได้** เพราะ next/font ดาวน์โหลด Geist กับ Noto Sans Thai ตอน build แล้วฝังลงในผลลัพธ์ ตัวอิมเมจที่รันจริงไม่ต้องต่อเน็ตเพื่อเรื่องนี้

## ติดตั้งบนเซิร์ฟเวอร์

```bash
mkdir -p poolvilla/nginx/certs && cd poolvilla

# วางสามไฟล์นี้
#   docker-compose.prod.yml
#   .env                      (คัดจาก .env.production.example แล้วเติมค่า)
#   nginx/certs/poolvilla.pem และ poolvilla.key

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
```

ใบรับรองแบบ self-signed สำหรับทดสอบ ครอบคลุมทั้งสองชื่อ

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout nginx/certs/poolvilla.key -out nginx/certs/poolvilla.pem \
  -subj "/CN=poolvilla.local" \
  -addext "subjectAltName=DNS:poolvilla.local,DNS:admin.poolvilla.local"
```

ของจริงใช้ Let's Encrypt แล้ววาง fullchain เป็น `poolvilla.pem` กับ private key เป็น `poolvilla.key`

## ค่าที่ compose บังคับว่าต้องมี

compose จะไม่ยอมสตาร์ตถ้าขาดตัวใดตัวหนึ่ง ซึ่งตั้งใจให้เป็นแบบนั้น จะได้ไม่รันด้วยค่าเริ่มต้นที่ไม่มีใครตั้ง

`MONGO_USER` `MONGO_PASS` `ADMIN_HOSTNAMES` `NEXT_PUBLIC_SITE_URL` `AUTH_SECRET` `CRON_SECRET`

`AUTH_SECRET` สร้างด้วย `npx auth secret`

## เรื่อง MongoDB ที่ต้องรู้

**รันเป็น single-node replica set พร้อม auth** ไม่ใช่ standalone

เหตุผลคือความถูกต้องของการกันจองซ้อนมาจาก unique index ไม่ใช่จาก transaction ดู `DECISIONS.md` ข้อ D-003 แต่เราอยากได้ transaction เป็นชั้นเสริม และอยากให้ dev กับ prod เดินเส้นทางเดียวกัน จะได้ไม่มีบั๊กที่โผล่เฉพาะบนเซิร์ฟเวอร์

การเปิด auth พร้อม replSet บังคับให้ต้องมี keyfile สิทธิ์ 0400 เจ้าของเป็น user mongodb จึงมี service `mongo-keyfile` ที่รันครั้งเดียวแล้วจบ ทำหน้าที่สร้าง keyfile ลง named volume ให้สิทธิ์ถูกต้องบนทุกโฮสต์

**`MONGO_USER` และ `MONGO_PASS` มีผลเฉพาะตอน volume ยังว่าง** อิมเมจ mongo สร้าง root user แค่ครั้งแรกครั้งเดียว ถ้าจะเปลี่ยนทีหลังต้องเข้า mongosh ไปเปลี่ยน หรือ `down -v` ซึ่งลบข้อมูลทิ้งหมด

ถ้าอยากปิด transaction ให้ตั้ง `MONGODB_TRANSACTIONS=false` ระบบยังกันจองซ้อนได้เหมือนเดิม

## ข้อมูลที่ต้องสำรอง

มีสองอย่างเท่านั้น แต่ขาดอันใดอันหนึ่งไม่ได้

```bash
# ฐานข้อมูล
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongodump --username "$MONGO_USER" --password "$MONGO_PASS" \
  --authenticationDatabase admin --archive --gzip > backup-$(date +%F).gz

# รูปภาพที่อัปโหลด
docker run --rm -v poolvilla_uploads:/src -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /src .
```

volume `poolvilla_uploads` คือรูปวิลล่าทั้งหมด ถ้าหายคือหายจริง ไม่มีที่อื่นเก็บไว้

## อัปเดตเวอร์ชัน

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```

`restart: unless-stopped` ทำให้ทุกคอนเทนเนอร์ขึ้นเองหลังเครื่องรีบูต

## ตัวกวาดล้างการจองค้าง

การจองที่ยังไม่จ่ายจะกันวันไว้ 30 นาที ต้องมีอะไรมาเรียก route กวาดล้างเป็นระยะ

```
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://example.com/api/cron/sweep-holds
```

ถึงตัวกวาดล้างจะตาย ลูกค้าจริงก็ไม่โดนบล็อก เพราะฝั่งอ่านถือว่า hold ที่หมดอายุแล้วเท่ากับว่าง แต่หน้าปฏิทินจะดูสกปรกจนกว่าจะมีคนมากวาด

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ |
|---|---|
| `admin.<โดเมน>` ขึ้นหน้าบ้าน | `ADMIN_HOSTNAMES` ไม่ตรงกับที่พิมพ์จริง หรือ nginx ไม่ได้ forward Host |
| nginx ขึ้นไม่ได้ | ไม่มีไฟล์ใบรับรองใน `nginx/certs/` |
| แอปขึ้นไม่ได้ ฟ้อง `MONGO_USER` | ยังไม่ได้สร้าง `.env` ข้างไฟล์ compose |
| mongo วน unhealthy | รหัสผ่านไม่ตรงกับที่สร้าง root user ไว้ตอน volume ยังว่าง |
| อัปโหลดรูปแล้วขึ้น 413 | `client_max_body_size` ใน nginx.conf ต่ำกว่าขนาดไฟล์ |
