# Muffin Time เว็บเกม — Next.js + Supabase Foundation Design Spec

วันที่: 2026-08-31

## บริบท

โปรเจกต์นี้เดิมวางแผนไว้ตาม `docs/superpowers/specs/2026-08-31-muffin-time-web-design.md`: static web app ธรรมดา (HTML/CSS/JS ไม่มี build step) + Firebase Realtime Database + Firebase Hosting, ไม่มีเฟรมเวิร์ก การ implement จริงได้ engine เกม (`src/engine/*.js`) เป็น pure function ที่ผ่าน vitest test ครบแล้ว รวมถึง card loading pipeline (`src/cards/loadCards.js`, `parseCsv.js`) ที่ดึงจาก Google Sheets CSV แบบมี fallback เป็น `data/cards.json`

ตอนนี้ตัดสินใจเปลี่ยนสแตกเป็น **Next.js + React + TypeScript + Tailwind CSS + Supabase** แทน static JS + Firebase สเปกนี้ครอบคลุมเฉพาะ **ฐานราก (foundation)** ของการเปลี่ยนสแตก — schema, ระบบ realtime, โครงโฟลเดอร์, และแผนพอร์ต engine เท่านั้น ส่วน UI components และ multiplayer/room flow แบบละเอียด (สร้างห้อง/เข้าห้อง/lobby ฯลฯ) จะแยกเป็นสเปกถัดไปหลังฐานรากนี้เสร็จ

สเปกนี้ **ไม่ล้ม** decision อื่นๆ ในสเปกเดิมที่ยังใช้ได้อยู่: client-authoritative logic, ไม่มีระบบสมัครสมาชิก, เล่นกับเพื่อนที่เชื่อใจกัน (ไม่ทำความปลอดภัยระดับ production), ภาษา UI ไทยอย่างเดียว, ขอบเขต v1 เดิมทั้งหมด

## สถาปัตยกรรม

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Hosting:** Vercel (free tier) — แทนที่ Firebase Hosting ในตำแหน่งเดิมพอดี ผูกกับ Next.js โดยตรงไม่ต้อง config เพิ่ม
- **Backend/state:** ไม่มีเซิร์ฟเวอร์แยก (เหมือนเดิม) — ใช้ **Supabase (Postgres + Supabase Realtime)** แทน Firebase Realtime Database
- **Logic:** รันฝั่ง client ทั้งหมดเหมือนเดิม ไม่มี Edge Functions/Cloud Functions ใน v1
- **ความปลอดภัย/กันโกง:** ยอมรับ trade-off เดิม — เล่นกับเพื่อนที่เชื่อใจกัน ไม่ใช้ Supabase Auth ไม่มีระบบบัญชี

## Supabase Schema

Engine เดิมทำงานกับ state ทั้งก้อนเป็น object เดียว (`state.players[playerId].hand` ฯลฯ) ทุกฟังก์ชันรับ state ทั้งต้นไม้แล้วคืน state ทั้งต้นไม้ใหม่ — ตรงกับโครงสร้าง `/rooms/{roomCode}` ของ Firebase เดิมทุกประการ ดังนั้น schema จึงมีตารางเดียว ไม่ normalize:

```sql
create table rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now()
);
```

`state` เก็บโครงสร้างเดียวกับที่เอกสารสเปกเดิมระบุไว้ทุกอย่าง (status, hostId, turnOrder, direction, muffinTimeTarget, drawPile, discardPile, log, players map ฯลฯ) — ฟังก์ชัน engine ที่พอร์ตมาไม่ต้องแก้โครงสร้างข้อมูลเลย

**การเขียน (write) พร้อม optimistic concurrency guard:**

```sql
update rooms
set state = $1, version = version + 1
where code = $2 and version = $3;
```

ถ้า affected rows = 0 แปลว่ามีคนอื่นเขียนไปก่อนแล้ว (อาจเกิดตอนช่วง "เปิด Counter" ที่หลายคนกดพร้อมกัน) — client ต้อง re-read state ล่าสุดแล้ว retry logic ของตัวเอง

**RLS:** เปิดแบบ permissive — client ที่รู้ `code` ของห้องอ่าน/เขียนแถวนั้นได้เลย ไม่มี Supabase Auth ไม่มีการแยกสิทธิ์ต่อผู้เล่น (ตรงกับ trade-off ที่ยอมรับไว้แล้วในสเปกเดิม)

## Realtime Sync

ใช้ Supabase Realtime ฟีเจอร์ **Postgres Changes** subscribe เหตุการณ์ `UPDATE` บนตาราง `rooms` กรองด้วย `code=eq.{roomCode}` (ต้องเปิด replication ให้ตาราง `rooms` ตอน implement: `alter publication supabase_realtime add table rooms`)

Client ทุกเครื่องที่อยู่ในห้องเดียวกัน apply `state` ที่ได้รับจาก realtime event เป็นค่าล่าสุดตรงๆ ไม่ต้องมี merge logic ฝั่ง client เพราะการเขียนเป็นแบบ whole-tree เหมือน Firebase เดิม

## โครงโฟลเดอร์ (เฉพาะส่วนที่เกี่ยวกับฐานราก)

```
game/                  # พอร์ตจาก src/engine/*.js + src/cards/*.js แบบ 1:1 เป็น .ts
  engine.ts, actions.ts, traps.ts, counters.ts, cards.ts, ...
lib/
  supabase.ts          # สร้าง Supabase client
multiplayer/
  room.ts              # อ่าน/เขียน rooms table พร้อม version-retry logic
  realtime.ts          # subscribe/unsubscribe ต่อ room code
app/
  page.tsx, lobby/, game/    # scaffold เปล่าไว้ก่อน — ดีไซน์ UI จริงอยู่ในสเปกถัดไป
components/            # scaffold เปล่าไว้ก่อน — สเปกถัดไป
```

`multiplayer/player.ts` (เก็บ player id ใน localStorage ฯลฯ) อยู่ในสเปกถัดไปพร้อมกับ room/lobby flow เพราะเกี่ยวพันกับ UI โดยตรง

## แผนพอร์ต Engine

พอร์ตแบบ **1:1 ตรงตัว** — ทุกไฟล์ใน `src/engine/*.js` และ `src/cards/{loadCards,parseCsv}.js` ย้ายไปเป็น `.ts` ใต้ `game/` โดยคง function signature และพฤติกรรมเดิมทุกอย่าง แค่เพิ่ม type annotations เท่านั้น ไม่ redesign state shape หรือ logic ใดๆ ในขั้นนี้

Test รันด้วย **Vitest เหมือนเดิม** (มีอยู่แล้วเป็น devDependency ใช้กับ Next.js ได้ปกติ ไม่ต้องเปลี่ยน test runner) — ย้ายไฟล์ `*.test.js` เป็น `*.test.ts` คู่กับไฟล์ที่พอร์ต

Card loading pipeline (`loadCards.ts`) คงลอจิกเดิมทุกอย่าง (fetch published CSV จาก Google Sheets ก่อน, fallback เป็น `data/cards.json` ถ้า fetch ไม่ได้)

**หมายเหตุเรื่อง Google Sheet ใหม่:** ระหว่างทำงานนี้ได้อัปเดต `data/cards.json` / `data/cards.csv` / `public/data/cards.json` ให้ตรงกับ Google Sheet ใหม่ที่ผู้ใช้ให้มาแล้ว (231 ใบ ครบ) แต่ sheet นี้ยังเป็น edit-mode link แยก 3 แท็บ (Action/Counter/Trap) ไม่ใช่ published CSV รวมคอลัมน์เดียวแบบที่ `loadCards.ts` ต้องการ (`type,name_en,name_th,effect_th,code`) ดังนั้น URL สำหรับ live-fetch ใน `loadCards.ts` จะยังชี้ไป sheet เก่า (ที่ publish ไว้แล้ว) จนกว่าผู้ใช้จะทำ **File → Share → Publish to web → เลือกทุกแท็บ → CSV** บน sheet ใหม่แล้วส่งลิงก์มาอัปเดต

## ขอบเขตของสเปกนี้ (ไม่รวม)

- UI components และการออกแบบหน้าจอ (`components/`, ดีไซน์ `app/lobby`, `app/game`) — สเปกถัดไป
- Room/lobby flow แบบละเอียด (สร้างห้อง/เข้าร่วม/reconnect ด้วย localStorage) — สเปกถัดไป
- การจัดการเอฟเฟกต์การ์ด 3 tier (กลไกล้วน/มินิเกม/โซเชียล) ในบริบท UI ใหม่ — สเปกถัดไป (logic เดิมพอร์ตมาแล้วในขั้นนี้ แต่การ "โชว์ผลลัพธ์ให้กด" เป็นเรื่อง UI)
- การ deploy จริงขึ้น Vercel/Supabase project จริง (เป็นงานใน implementation plan ไม่ใช่ design decision)
