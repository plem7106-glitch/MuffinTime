# Live Multiplayer & Card Table UI — Design Spec

วันที่: 2026-09-01 (แก้ไขระหว่างบทสนทนาหลัง pull โค้ดจาก origin)

## บริบท

สเปกก่อนหน้า (`docs/superpowers/specs/2026-08-31-mobile-game-ui-demo-design.md`) สร้าง UI/UX ที่เล่นได้จริงทั้ง flow แล้ว แต่ระบุไว้ชัดในขอบเขตว่า **ไม่ต่อ backend/Supabase/multiplayer จริง** — ทุกอย่างรันในเบราว์เซอร์เดียว ห้องเป็นของปลอมที่ seed ไว้ ผู้เล่นเป็น string `'me'` คงที่

เจ้าของโปรเจกต์อยากให้เพื่อนจริงๆ สร้าง/เข้าร่วมห้องข้ามเครื่องได้ และปรับหน้าโต๊ะเกมให้ "เห็นการ์ดเหมือนถืออยู่ในมือจริง"

**ระหว่างบทสนทนานี้เกิดสองเหตุการณ์ที่เปลี่ยนสเปกฉบับแรกไปมาก:**

1. `git pull` ดึงงานจาก origin เข้ามา 660 ไฟล์ (คนอื่นในทีมทำไว้) — หลายส่วนที่วางแผนไว้ถูกสร้างไปแล้วหรือถูกออกแบบใหม่ไปคนละทางแล้ว (ดูตารางสถานะด้านล่าง)
2. ความต้องการเปลี่ยนจาก **"ไม่มี account เลย เก็บตัวตนแค่ใน localStorage"** เป็น **"สมัครสมาชิกจริง แล้ว login ข้ามเครื่องได้"** — เพราะอยากให้เพื่อนที่สมัครแล้วเข้าเล่นจากมือถือเครื่องไหนก็ได้แล้วยังเป็นคนเดิม

สเปกนี้คือฉบับแก้ไขที่ตรงกับสถานะโค้ดจริงหลัง pull + ความต้องการ login จริง

## สถานะปัจจุบันหลัง pull (ตรวจสอบแล้ว ก่อนวางแผนต่อ)

| ส่วน | สถานะ |
|---|---|
| `lib/session.tsx` เชื่อมกับ Supabase จริง | **ยังไม่ทำ** — ยังเป็น local reducer ล้วน, `multiplayer/room.ts`/`realtime.ts` ยังไม่มีใครเรียกใช้ |
| ตัวตนผู้เล่น (persist ข้ามเครื่อง) | **ยังไม่ทำ** — ผู้เล่นในเครื่องยังเป็น id `'me'` คงที่ ไม่มี auth ใดๆ |
| `maxPlayers` บน `RoomState` | **ทำแล้วเต็มรูปแบบ** โดยทีมอื่น (`game/types.ts`, `game/room.ts` มี validate ครบ) — ไม่ต้องทำอะไรเพิ่ม |
| `app/create/page.tsx`, `app/join/[code]/page.tsx` | ยังเรียก local reducer (`useGameSession()`) ล้วน ยังไม่มี network call |
| การ์ดในมือ: แตะขยายดูรายละเอียด+ปุ่มเล่น | **มีอยู่แล้ว** ใน `components/room/HandTrayModal.tsx` (เปิดผ่านปุ่ม "ดูไพ่ในมือ" ที่แถบล่างของ `GameTable.tsx`) — เป็น panel ขยายในตัว ไม่ใช่ BottomSheet แต่ทำหน้าที่เดียวกัน |
| มือไพ่ซ้อนทับกันแบบถือไพ่จริง | **ยังไม่ทำ** — แถวใน `HandTrayModal` ยังเรียงห่างกันเฉยๆ ไม่ซ้อน |
| การ์ดเพื่อนคนอื่นบนโต๊ะ (พัดหลังไพ่) | **ยังไม่ทำ** — `components/room/PlayerDensityGrid.tsx` (ตัวที่ใช้งานจริงตอนนี้) โชว์แค่ badge ตัวเลข |
| ภาพประกอบการ์ดจริง | **มีแล้ว** — `public/cards/{action,trap,counter}/{code}.jpg` ครบ 231 ใบ, `components/card/Card.tsx` render จริงผ่าน `<img>` |
| `components/card/CardHand.tsx`, `components/room/PlayerCard.tsx` | **dead code** ไม่มีใครเรียกใช้แล้ว (ถูกแทนที่ด้วย `HandTrayModal`/`PlayerDensityGrid`) |

## การตัดสินใจหลักที่ตกลงกันไว้ (อัปเดตล่าสุด)

- **Login จริงผ่าน Supabase Auth แบบ Magic Link ทางอีเมล** — ไม่เขียนระบบ auth เอง ใช้ของที่มากับ `@supabase/supabase-js` อยู่แล้ว
- ไม่มีสิทธิ์ host พิเศษ (ปิดห้อง/เตะเพื่อนออก) — เรียบง่ายที่สุด
- คนหลุดกลางเกม/ปิดแท็บ → รอเฉยๆ ไม่มี kick/bot สวมแทน/timer
- **มือไพ่ผู้เล่นเอง: ต่อยอดของเดิม (`HandTrayModal`) ไม่รื้อโครงสร้าง** — แค่เพิ่มการซ้อนทับกันในแถวการ์ด (ปุ่ม "ดูไพ่ในมือ" + panel แตะขยายดู ที่มีอยู่แล้วใช้ต่อได้เลย)
- การ์ดของเพื่อนคนอื่นบนโต๊ะ: โชว์เป็นพัดหลังไพ่เล็กๆ แทน badge ตัวเลขล้วนใน `PlayerDensityGrid.tsx`

## ระบบ Login จริง — Supabase Auth (Magic Link)

### ทำไมเลือกทางนี้

`@supabase/supabase-js` มี `.auth` ในตัวอยู่แล้ว (สมัคร/login/เก็บ session ให้อัตโนมัติผ่าน localStorage โดยไลบรารีเอง ไม่ต้องเขียนเพิ่ม) — ไม่ต้องทำตารางผู้ใช้เอง ไม่ต้อง hash รหัสผ่านเอง ไม่ต้องเพิ่ม dependency ใหม่ Magic Link ไม่ต้องให้เพื่อนจำรหัสผ่าน เหมาะกับกลุ่มเพื่อนที่ไม่ได้อยากตั้งรหัสผ่านจริงจัง

### หน้าจอ Login (ใหม่) — `app/login/page.tsx`

ฟอร์มเดียว: อีเมล + ชื่อที่จะโชว์ในเกม → กด "ส่งลิงก์เข้าสู่ระบบ" →
```ts
supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/`,
    data: { name },   // ติดไปกับ user_metadata ตอนสมัครครั้งแรก ไม่ต้องมีตาราง profile แยก
  },
});
```
เพื่อนกดลิงก์ในอีเมล → Supabase สร้าง session ให้อัตโนมัติ (supabase-js อ่าน token จาก URL เองตอนโหลดหน้า ไม่ต้องเขียน callback route แยก) → พากลับมาหน้าแรก ล็อกอินค้างไว้ในเครื่องนั้นจนกว่าจะ logout

**ใช้ id เดียวกันได้ทุกเครื่อง** เพราะ `user.id` มาจาก Supabase Auth ผูกกับอีเมล ไม่ใช่สุ่มต่อเครื่องแบบเดิม — login เครื่องไหนก็ได้ id เดิม ชื่อเดิม (จาก `user_metadata.name`)

### `lib/auth.tsx` (ไฟล์ใหม่) — AuthProvider

แยกความรับผิดชอบออกจาก `lib/session.tsx` (เรื่อง auth คนละเรื่องกับเรื่องห้อง/เกม):
```ts
interface AuthValue {
  user: { id: string; name: string; email: string } | null;
  loading: boolean;
  signOut: () => void;
}
```
ใช้ `supabase.auth.getSession()` ตอน mount + subscribe `onAuthStateChange` ห่อทั้งแอปใน `app/layout.tsx` เหนือ `GameSessionProvider`

หน้าที่ต้อง login ก่อนถึงเข้าได้ (`/create`, `/join/[code]`, `/room/[code]`) เช็ค `useAuth().user` — ถ้า `null` และโหลดเสร็จแล้ว → redirect ไป `/login`

### ผลกับ `lib/session.tsx`

`myPlayerId` และชื่อผู้เล่น อ่านจาก `useAuth().user` แทนการรับ input ชื่อจากฟอร์ม create/join เอง (ฟอร์ม create/join ไม่ต้องมีช่องกรอกชื่ออีกต่อไป เพราะรู้ชื่ออยู่แล้วจาก session)

### สิ่งที่ต้องตั้งค่าฝั่ง Supabase Dashboard (ไม่ใช่โค้ด — เช็คลิสต์ให้ผู้ใช้ทำเอง)

- เปิด Email provider ใน Authentication settings (ปกติเปิดอยู่แล้วโดย default สำหรับโปรเจกต์ใหม่)
- เพิ่ม URL ของแอป (เช่น `http://localhost:3000/`, โดเมนจริงตอน deploy) เข้า **Redirect URLs allowlist** ไม่งั้นลิงก์ magic link จะถูกปฏิเสธ

### RLS ของตาราง `rooms` — เพิ่มการเช็คว่า login แล้ว (เล็กน้อย ไม่ใช่ของใหม่ทั้งชุด)

Migration เดิม (`0001_create_rooms.sql`) เปิดกว้างให้ใครก็ได้อ่าน/เขียนได้แม้ไม่ login (`using (true)`) — ตอนนี้มีระบบ login จริงแล้ว ปรับให้ต้อง login ก่อนแตะตารางนี้ได้ (migration ใหม่เล็กๆ `0002_require_auth_for_rooms.sql`):
```sql
drop policy "anyone can read rooms" on rooms;
drop policy "anyone can insert rooms" on rooms;
drop policy "anyone can update rooms" on rooms;

create policy "authenticated can read rooms" on rooms for select using (auth.uid() is not null);
create policy "authenticated can insert rooms" on rooms for insert with check (auth.uid() is not null);
create policy "authenticated can update rooms" on rooms for update using (auth.uid() is not null) with check (auth.uid() is not null);
```
ยังไม่ต้องเช็คว่า "เป็นคนในห้องนั้นจริงไหม" (ซับซ้อนเกินความจำเป็นสำหรับกลุ่มเพื่อน — รู้รหัสห้อง 4 ตัวก็เข้าได้เหมือนเดิม แค่ต้อง login ก่อน)

## เชื่อม `lib/session.tsx` เข้ากับ Supabase จริง

แทนที่ reducer/state ปลอมเดิมด้วย hook ที่:

- โหลด initial state ด้วย `fetchRoom` (`multiplayer/room.ts` มีอยู่แล้ว)
- subscribe การเปลี่ยนแปลงสดด้วย `subscribeToRoom` (`multiplayer/realtime.ts` มีอยู่แล้ว) → เซ็ต state ใหม่ทุกครั้งที่มีใครเขียนสำเร็จ (รวมตัวเอง) — ไม่ทำ optimistic local update เพิ่มความซับซ้อน
- action ทุกตัว (draw/discard/playCard/startGame/placeTrap/...) คำนวณ state ใหม่ด้วยฟังก์ชันจาก `game/*.ts` เดิม (ไม่แก้ engine logic) แล้วเขียนกลับด้วย `updateRoomWithRetry`
- unsubscribe ตอน unmount

Component ที่ใช้ context เดิม (`WaitingRoom`, `GameTable`, ฯลฯ) ไม่ต้องแก้โครงสร้าง เพราะ shape ของ context ที่ expose ออกไปคงเดิม เปลี่ยนแค่ข้างในจาก in-memory → Supabase

สร้างห้อง/join ห้อง ใช้รหัสห้อง 4 ตัว + insert/fetch แถวจริงในตาราง `rooms` ตามที่ออกแบบไว้เดิม (สุ่มรหัสจาก charset ตัดตัวกำกวม, retry ถ้าชนกัน) — ต่างจากฉบับแรกแค่ตรงที่ id/ชื่อผู้เล่นมาจาก `useAuth()` แทน localStorage ที่สร้างเอง

`WaitingRoom.tsx` เดิมเติมบอทอัตโนมัติถ้าห้องว่างเกิน 900ms — ปิดพฤติกรรมนี้ในโหมดจริง (โค้ดบอทไม่ลบ เก็บไว้เผื่อใช้ภายหลัง)

### `pendingResponse` / `lastResult` ต้อง sync ผ่าน `RoomState` ด้วย (พบระหว่างวางแผน ไม่ใช่แค่ local state แล้ว)

ตอน local reducer เดิม `pendingResponse` (การ์ด Action/Trap ที่เพิ่งเล่น รอช่วง Counter) และ `lastResult` (ผลลัพธ์ล่าสุดเพื่อโชว์ popup) เป็น state ในเครื่องผู้เล่นคนเดียว ใช้ได้เพราะทุกคนอยู่ใน reducer เดียวกัน — พอเป็น multiplayer จริงข้ามเครื่อง **ต้องย้ายสองอันนี้เข้าไปเป็นส่วนหนึ่งของ `RoomState`** (เพิ่ม field `pendingResponse?: PendingResponse | null` และ `lastResult?: LastResult | null` ใน `game/types.ts`) ไม่งั้นผู้เล่นอีกฝั่ง (เช่นเป้าหมายของ Trap) จะไม่เห็นว่ามีอะไรรอให้ตอบสนองอยู่เลย — เหมือนกับที่เพิ่ม `maxPlayers` เข้า state ไปก่อนหน้านี้ ยังเป็นแค่ jsonb ก้อนเดิม ไม่ต้องแก้ migration

**ป้องกันการ resolve ซ้ำซ้อน**: เมื่อหลายเครื่อง subscribe เห็น `pendingResponse` เดียวกันพร้อมกัน (เช่น auto-skip counter เมื่อมือไม่มีการ์ดตอบโต้) ต้องไม่ให้ทุกเครื่อง apply ผลซ้ำกัน — ใช้ `responseId` (มีอยู่แล้วในโครงสร้างเดิม) เป็น idempotency token: ฟังก์ชัน updater ที่ resolve ต้องเช็คก่อนว่า `state.pendingResponse?.responseId === responseId` ที่ตัวเองถืออยู่ ถ้าไม่ตรง (มีคนอื่น resolve ไปก่อนแล้ว) ให้ return state เดิมไม่ทำอะไร — `updateRoomWithRetry` fetch state ใหม่ทุกครั้งที่ retry อยู่แล้วจึงเช็คได้

`lastResult` sync แต่ **การปิด popup (`clearLastResult`) ต้องเป็น local เท่านั้น** ไม่เขียนกลับ Supabase — ไม่งั้นคนหนึ่งกดปิด popup จะไปปิดของทุกคนพร้อมกันทั้งที่บางคนยังไม่ทันอ่าน (เทียบ `dismissedResponseId` ใน local component state กับ `lastResult.responseId` แทน)

### Gotcha อื่นที่ต้องระวังตอน implement

- **ฟังก์ชัน engine โยน exception เมื่อทำไม่ได้** (`addPlayer` โยนถ้าห้องเต็ม, `placeTrap` โยนถ้ากับดักเกิน 3, `startGame` โยนถ้าผู้เล่นไม่ถึง 3 คน) — reducer เดิมจับด้วย try/catch แล้ว "เงียบๆ คืน state เดิม" พอเป็น async เขียนผ่าน `updateRoomWithRetry` ต้อง catch แล้วโชว์ error ให้ผู้ใช้เห็นจริงๆ (ไม่เงียบเหมือนเดิม)
- **ต้องกันกดซ้ำระหว่างรอ round-trip**: ไม่มี optimistic update แล้ว (ตามที่ตัดสินใจไว้) ระหว่างที่ยังไม่มี state ใหม่กลับมาจาก Supabase ปุ่ม action ต่างๆ (จั่วไพ่ ฯลฯ) ยังกดซ้ำได้ถ้าไม่กันไว้ — ต้องมี local flag (เช่น `isWriting`) ปิดปุ่มระหว่างรอ
- **Overlay ที่จบด้วยการเรียก action ต้อง gate ไม่ให้ทุกเครื่องยิงพร้อมกัน**: `ShuffleDrawPileOverlay` เรียก `finishShuffleDrawPile()` ตอน animation จบ ซึ่งทุกเครื่องที่เห็น `isShufflingDrawPile: true` จะรัน animation แล้วเรียกพร้อมกันหมด — จำกัดให้ host เท่านั้นเป็นคนเรียก (เครื่องอื่น no-op)
- **`app/page.tsx` มีลิสต์ "ห้องที่เปิดอยู่"** (seed จาก `SEED_ROOMS`) และ `components/lobby/JoinRoomModal.tsx` (อีกทางเข้า join ที่พิมพ์รหัสแล้วเช็คกับ `rooms` local list เหมือนกัน) — โมเดล multiplayer จริงเป็นแบบ "รู้รหัสห้องถึงเข้าได้" (แชร์รหัสกันเอง) ไม่มีแนวคิด "เห็นห้องคนอื่นทั้งระบบ" ตัดสินใจ: **ลบลิสต์ "ห้องที่เปิดอยู่" ทิ้ง** (ไม่ query ห้องทั้งหมดจาก Supabase มาโชว์) เหลือแค่ปุ่ม "สร้างห้อง" / "เข้าร่วมห้อง" (กรอกรหัส) — `JoinRoomModal` ยังเก็บไว้ได้แต่เปลี่ยนให้ไปเช็คห้องจริงตอนกด "เข้าร่วม" (fetch แล้ว push ไป `/join/[code]` เสมอ ให้หน้า join เป็นคนเช็คว่าห้องมีจริง/เต็มไหมอีกที)

## มือไพ่ผู้เล่นเอง — ต่อยอด `HandTrayModal` ที่มีอยู่แล้ว

ไม่รื้อ ไม่สร้างใหม่ — แก้แค่ CSS ของแถวการ์ดใน `HandTrayModal.tsx`: จากเรียงห่างกัน → ซ้อนทับกันซ้าย→ขวา (margin ติดลบ ~1/3 ความกว้างการ์ด, z-index ไล่ตามลำดับ) การ์ดที่แตะเลือก (`selectedCode`) ยกขึ้น + ยกระดับ z-index เหนือใบข้างๆ ให้เห็นชัดว่าใบไหนถูกเลือกอยู่ (ของเดิมมี state `selectedCode` + panel รายละเอียดอยู่แล้ว ไม่ต้องแก้ logic ส่วนนั้น)

## การ์ดของเพื่อนคนอื่น — พัดหลังไพ่ใน `PlayerDensityGrid.tsx`

เพิ่มพัดหลังไพ่จิ๋ว (การ์ดหลังไพ่สีเรียบ ไม่มีลาย) ซ้อนกันโค้งเล็กๆ ข้าง/แทน badge ตัวเลขปัจจุบัน จำกัดโชว์สูงสุด ~5 ใบ ถ้ามากกว่านั้นโชว์ตัวเลขต่อท้าย (เช่น "🂠🂠🂠🂠🂠 +3") ยังคง badge ตัวเลข `CardsIcon`/`TrapIcon` เดิมไว้คู่กัน เพราะผู้เล่นต้องรู้เลขจริงเพื่อประเมินว่าใครใกล้ Muffin Time

## Cleanup เล็กน้อย (ไม่บังคับ แต่ทำง่ายระหว่างนี้)

`components/card/CardHand.tsx` และ `components/room/PlayerCard.tsx` เป็น dead code (ไม่มีใครเรียกใช้แล้วหลัง merge) — ลบทิ้งได้เพื่อลดความสับสนว่าไฟล์ไหนคือของจริงที่ใช้งานอยู่

## Testing

- Logic ใหม่ที่เป็น pure function (`lib/auth.tsx` ส่วนที่ไม่ผูก React, ตัวสุ่มรหัสห้อง) เขียน Vitest unit test ตามธรรมเนียมโปรเจกต์เดิม
- Multiplayer จริงทดสอบด้วยการเล่นข้ามอุปกรณ์/แท็บจริง (สมัคร/login สองอีเมลต่างกัน หรือสองแท็บ incognito, สร้างห้องจากฝั่งหนึ่ง join จากอีกฝั่ง เล่นจนจบเทิร์นสองสามรอบ เช็คว่า state sync ตรงกัน) — ไม่ทำ automated e2e ตรงตามแนวทางเดิมของโปรเจกต์

## ขอบเขต (ไม่รวมในสเปกนี้)

- Presence/heartbeat tracking — คนหลุดก็รอเฉยๆ ตามที่ตกลงไว้
- สิทธิ์ host พิเศษ (เตะผู้เล่น/ปิดห้อง)
- ระบบลบห้องเก่าอัตโนมัติ — ห้องจะค้างอยู่ในตาราง `rooms` ไปเรื่อยๆ ทำเพิ่มทีหลังถ้าเป็นปัญหาจริง
- เช็คสิทธิ์ระดับ "ต้องเป็นคนในห้องนั้นเท่านั้นถึงจะอ่าน/เขียนได้" ใน RLS — ตอนนี้แค่ต้อง login เฉยๆ พอ
- OAuth (Google/Facebook login) หรือ email+password — เลือก Magic Link อย่างเดียวตามที่ตกลงไว้
- การจับคู่ primitive ให้ครบทั้ง 231 ใบ (งานแยกต่างหาก)
- อัปเดต `CLAUDE.md` ส่วน "Project status" ที่ล้าสมัย (ทำเป็น commit เล็กแยกได้ระหว่างพัฒนา)
