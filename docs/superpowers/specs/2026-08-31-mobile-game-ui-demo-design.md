# Mobile Game UI Demo — Design Spec

วันที่: 2026-08-31

## บริบท

สเปกก่อนหน้า (`docs/superpowers/specs/2026-08-31-nextjs-supabase-foundation-design.md`) ทำแค่ "ฐานราก": scaffold Next.js + Supabase, พอร์ต engine เกม (`game/*.ts`) เป็น TypeScript, และ multiplayer layer — ยังไม่มี UI จริงเลย (มีแค่หน้า placeholder) และตั้งใจเว้นไว้ให้เป็นสเปกถัดไปตามที่ระบุไว้ในขอบเขตของสเปกนั้น

สเปกนี้คือสเปกถัดไปที่ว่า: ออกแบบและสร้าง **UI/UX demo ที่เล่นได้จริง** สำหรับเกมการ์ดบนมือถือ ตาม design brief ที่ผู้ใช้ให้มา (สี, typography, spacing, รายชื่อหน้าจอ, component list) โดยต่อกับ `game/*.ts` engine จริง (ไม่ mock logic) แต่ยังไม่มี backend/multiplayer จริง — ทุกอย่างรันในเบราว์เซอร์เดียว ไม่มี persist ข้าม refresh

เป้าหมาย: "เกมไพ่บนมือถือที่ข้อมูลแน่น แต่ไม่รก" ไม่ใช่ "เว็บไซต์ที่เอามาย่อให้เล็กลง" — และต้องกดผ่าน flow ได้จริงทั้งเส้นทาง (Lobby → Create Room → Waiting Room → Game Table → เล่นการ์ด → เลือกเป้าหมาย → Trap → Counter → Game Over)

## การตัดสินใจหลักที่ตกลงกันไว้

- **ต่อกับ engine จริง** ไม่ใช่ scripted mock — state เปลี่ยนจริงตามกติกาจริงที่ผ่าน test แล้ว
- **แทนที่หน้าแรก** (`app/page.tsx`) เลย ไม่ใช่แยกไว้ที่ `/demo`
- **บอทมีลูกเล่น**: บอทสุ่มเล่น Action ใส่ผู้เล่นจริงได้บ้าง ไม่ใช่แค่จั่วเฉยๆ ทุกเทิร์น — เพื่อให้เห็นหน้าจอ Counter จากฝั่งถูกโจมตีจริงด้วย
- **คัดการ์ดจริง ~13 ใบ** จาก 231 ใบใน `data/cards.json` มาจับคู่กับ primitive ของ engine เอง (เพราะการจับคู่การ์ด→primitive ทั้ง 231 ใบยังไม่มี เป็นงานแยกต่างหากที่ยังไม่เริ่ม) — การ์ดอื่นที่เหลือยังเก็บไว้ใน pool ได้ แต่จะไม่ถูกสุ่มแจกใน demo นี้ ใช้ deck เฉพาะจาก 13 ใบที่คัดไว้แทน

## สถาปัตยกรรม & Routing

ใช้ `RoomState.status` ('lobby' | 'playing' | 'ended') ที่มีอยู่แล้วเป็นตัวขับ route เดียวสำหรับทั้งห้อง ไม่แยก path ตามหน้าจอย่อย:

```
/                → Lobby (สร้าง/เข้าร่วมห้อง)
/create          → Create Room form
/join/[code]     → Join Room
/room/[code]     → render ตาม RoomState.status:
                     'lobby'   → Waiting Room
                     'playing' → Game Table (+ Action/Target/Trap/Counter modals)
                     'ended'   → Game Over
```

State ทั้งหมดอยู่ใน React Context ที่ห่อทั้งแอปใน `app/layout.tsx` (client component) ไม่มี backend, ไม่มี localStorage persist — refresh แล้ว state หายได้ (ยอมรับได้สำหรับ demo)

```ts
interface LocalGameSession {
  rooms: RoomSummary[];        // สำหรับ list ใน Lobby
  activeRoom: {
    state: RoomState;          // ของจริงจาก game/types.ts
    maxPlayers: number;        // ไม่ได้อยู่ใน RoomState เดิม เก็บแยกไว้ที่นี่
  } | null;
  myPlayerId: PlayerId | null;
}

interface RoomSummary {
  code: string;
  hostName: string;
  currentPlayers: number;
  maxPlayers: number;
}
```

Lobby seed ห้องปลอมไว้ 2-3 ห้อง (ตามตัวอย่างในโจทย์ "ห้องของ Tee/Bank/Joe") ให้หน้าไม่ว่างตอนเปิดครั้งแรก — กด JOIN ห้องพวกนี้ได้จริง (ระบบสร้างห้องจำลองพร้อมบอทให้ทันที)

## ต่อกับ Engine จริงยังไง

ใช้ฟังก์ชันจาก `game/*.ts` ตรงๆ ไม่เขียน logic ซ้ำ — ไฟล์ `game/` **ไม่ถูกแก้ไข** เลยในงานนี้:

| การกระทำ | ฟังก์ชันที่ใช้ |
|---|---|
| สร้างห้อง / เข้าร่วม / เริ่มเกม | `createRoom`, `addPlayer`, `startGame` |
| จั่ว / ทิ้ง | `draw`, `discard`, `everyoneDraws`, `everyoneDiscards` |
| ขโมย / แลกไพ่ | `stealRandom`, `stealChosen`, `swapHands` |
| วาง/เปิดกับดัก | `placeTrap`, `removeTrap` |
| จบเทิร์น | `advanceTurn` |
| ประกาศ/เช็คชนะ | `declareMuffinTime`, `checkWinnerAtTurnStart`, `isMuffinTimeEligible` |

`startGame()` รับ `allCardCodes: CardCode[]` — สำหรับ demo นี้จะไม่ส่ง 231 โค้ดจริงทั้งหมด แต่ส่ง array ที่สร้างจาก **13 โค้ดที่คัดไว้ ทำซ้ำใบละ ~10 ครั้ง** (deck ~130 ใบ พอสำหรับ 3-8 ผู้เล่น) — ยังเป็นโค้ดจริงจาก `data/cards.json` ไม่ใช่ข้อมูลแต่งขึ้นใหม่ แค่จำกัดชุดที่สุ่มมา

## ชุดการ์ดที่คัดมาใช้จริง (`lib/demoCards.ts`)

ไฟล์ใหม่ เก็บ mapping จากโค้ดการ์ดจริง → primitive ของ engine พร้อม metadata ว่าต้องเลือกเป้าหมายไหม:

**Action:**
| Code | ชื่อไทย | ต้องเลือกเป้าหมาย | Primitive |
|---|---|---|---|
| A001 | ผิดบ้านแล้ว! | ไม่ | `everyoneDraws(state, 2, [actorId])` |
| A004 | จักรวาลคู่ขนาน | ไม่ (ผลกับตัวเอง) | `draw(state, actorId, actorHandSize)` |
| A008 | ปาชีส! | ไม่ | `everyoneDiscards(state, 1, [actorId])` |
| A014 | ดึงนิ้วฉันสิ | ใช่ | `stealRandom(state, actorId, targetId, 1)` |
| A016 | จัดการมัน! | ใช่ | `discard(state, targetId, targetHandSize)` |

**Counter:**
| Code | ชื่อไทย | Primitive |
|---|---|---|
| C16 | หน่วยกู้ระเบิด | ยกเลิกผลที่รอ + `draw(state, actorId, 3)` |
| C17 | สั่งฉันไม่ได้หรอก | ยกเลิกผลที่รอ + `draw(state, actorId, 1)` |
| C09 | หมาถือมีด | ยกเลิกผลที่รอ เฉยๆ ไม่มีโบนัส |

**Trap** (เปิดแบบ honor-system เอง แล้วเลือกว่าใครทำเงื่อนไขจริง):
| Code | ชื่อไทย | ต้องเลือกเป้าหมาย | Primitive |
|---|---|---|---|
| T13 | จับได้แล้ว! | ใช่ | `stealRandom(state, targetId, ownerId, 3)` |
| T14 | กี่โมงแล้ว? | ใช่ | `stealRandom(state, targetId, ownerId, 4)` |
| T16 | เปิดตำราหน่อย | ใช่ | `discard(state, targetId, 3)` |
| T27 | อย่าคิดถึงแมว | ใช่ | `discard(state, targetId, 3)` |
| T45 | หักมุมซะงั้น! | ไม่ (ผลกับตัวเอง) | `draw(state, ownerId, 10)` — ปุ่มเปิดกับดักนี้กดได้เฉพาะตอนมือว่าง (0 ใบ) เท่านั้น ตรงเงื่อนไขจริงของการ์ด |

## พฤติกรรมบอท (`lib/botTurn.ts`)

ทุกครั้งที่ถึงเทิร์นบอท:
1. สุ่ม (เช่น 60% จั่ว / 40% เล่น Action) ว่าจะจั่วหรือเล่น Action
2. ถ้าจั่ว → `draw(state, botId, 1)` แล้ว advance เทิร์นทันที (delay สั้นๆ ~600ms ให้เห็น)
3. ถ้าเล่น Action → เลือกการ์ด Action แบบสุ่มจากมือบอท (ต้องเป็นการ์ดจากชุด 13 ใบที่คัดไว้เท่านั้น เพราะเป็นชุดเดียวที่มี logic รองรับ) → ถ้าการ์ดต้องเลือกเป้าหมาย ให้สุ่มเลือกเป้าหมายจาก **ผู้เล่นจริง (มนุษย์) ก่อนเสมอถ้าเป็นไปได้** (เพื่อสร้างโอกาสให้เห็นหน้าจอ Counter) ถ้าไม่มีการ์ดแบบนั้นในมือให้จั่วแทน
4. เล่น Action แล้ว เปิด "Counter Window" ให้ผู้เล่นมนุษย์ตอบสนอง (ข้อถัดไป) ก่อน advance เทิร์น

บอทไม่วางกับดัก (trap) เลยใน demo นี้ — trap เป็นสิทธิ์ของผู้เล่นมนุษย์เท่านั้น (ทั้งวางและเปิดเอง)

`decideBotTurn(state, botId, rng)` เป็น pure function คืนค่า `{ action: 'draw' } | { action: 'play'; code: CardCode; targetId?: PlayerId }` — เทสได้แยกจาก UI ด้วย Vitest

## Response Window (Counter)

ตามกติกาจริง: หลัง Action ถูกเล่นหรือ Trap ถูกเปิด ระบบเปิดช่วงเวลาสั้นๆ ให้ผู้เล่นเล่น Counter ได้ ใน demo นี้: **เฉพาะผู้เล่นมนุษย์เท่านั้น** ที่ได้รับ prompt Counter Window (บอทไม่เล่น Counter — เกิน scope ของ demo) — เด้งให้ทุกครั้งที่มีการเล่น Action/เปิด Trap ไม่ว่าใครจะเป็นคนเล่นหรือเป้าหมายคือใคร (ตรงกับกติกาจริงที่ "เล่นสวนได้ทุกเมื่อ" ไม่จำกัดว่าต้องเป็นฝ่ายถูกกระทำ) ถ้ามือมนุษย์ไม่มีการ์ด Counter เลย ให้ apply ผลทันทีโดยไม่ต้องโชว์ prompt เปล่าๆ แสดงเป็น bottom sheet สั้นๆ: "เล่น Counter ไหม?" พร้อมการ์ด Counter ที่มีอยู่ในมือ กับปุ่ม "ข้าม" ถ้าข้ามหรือไม่มีการ์ด Counter เลย ผลของ Action/Trap เดิม apply ตามปกติ

## Component Architecture

```
app/
  page.tsx                    Lobby
  create/page.tsx             Create Room
  join/[code]/page.tsx        Join Room
  room/[code]/page.tsx        Waiting Room / Game Table / Game Over (ตาม status)
  layout.tsx                  ห่อด้วย GameSessionProvider

lib/
  demoCards.ts                curated card ↔ primitive mapping (ตารางข้างบน)
  botTurn.ts                  decideBotTurn() — pure, testable
  session.tsx                 GameSessionContext + Provider (createRoom/joinRoom/playCard/...)

components/
  ui/
    PrimaryButton.tsx, SecondaryButton.tsx
    BottomSheet.tsx           ปุ่ม modal/bottom-sheet กลางที่ทุก modal ใช้ร่วมกัน
    Toast.tsx, ConfirmationDialog.tsx
  lobby/
    RoomCard.tsx
  room/
    GameHeader.tsx, PlayerAvatar.tsx, PlayerCard.tsx, PlayerList.tsx, RoomCode.tsx
    WaitingRoom.tsx, GameTable.tsx, GameResult.tsx, BottomActionBar.tsx
  card/
    Card.tsx, CardHand.tsx, Deck.tsx, DiscardPile.tsx
  modals/
    ActionModal.tsx, TargetSelector.tsx, TrapModal.tsx, CounterModal.tsx
```

`game/` (engine) และ `components/` (UI) แยกกันชัดเจนตามชื่อ ไม่ปนกัน

## Styling

- Tailwind CSS v4 ที่มีอยู่แล้ว ใช้ CSS `@theme` ใน `app/globals.css` กำหนด design token ตรงจากโจทย์ (สี, radius, spacing) เป็นตัวแปรกลาง ไม่ hardcode hex ซ้ำในแต่ละ component
- ฟอนต์: `next/font/google` โหลด Noto Sans Thai ใน `app/layout.tsx`
- **ไม่เพิ่ม dependency ใหม่** สำหรับ animation/modal — bottom sheet ทำด้วย CSS transform + backdrop เอง, swipe-down ปิดด้วย pointer events พื้นฐาน, card hand scroll แนวนอนใช้ `overflow-x-auto` + `scroll-snap-type` (native, ไม่ใช้ library ท่าเจ๋งๆ) เหตุผล: โจทย์เน้น UX/flow ไม่ใช่ความหวือหวาของ animation, และ bundle เล็กกว่า
- Safe area: `padding-bottom: env(safe-area-inset-bottom)` ตรงตามที่โจทย์ระบุ บน `BottomActionBar`

## Testing

- Logic ใหม่ที่เป็น pure function (`lib/demoCards.ts` mapping resolver, `lib/botTurn.ts` decision function) เขียน Vitest unit test ตามธรรมเนียมโปรเจกต์เดิม
- UI/interaction ทดสอบด้วยการคลิกจริงผ่านทั้ง flow (ตรงกับแนวทางที่ระบุไว้แล้วใน spec เดิม: "ส่วน UI... ทดสอบด้วยการเล่นจริง... ไม่ใช้ automated e2e") — ไม่ทำ component test/e2e เพิ่ม

## ขอบเขต (ไม่รวมในสเปกนี้)

- การจับคู่ primitive ให้ครบทั้ง 231 ใบ (เป็นงานแยก ทำทีหลังเมื่อพร้อม)
- มินิเกม (จ้องตา/เป่ายิ้งฉุบ ฯลฯ) และการ์ดกลุ่มโซเชียลล้วนที่ต้องพึ่งความซื่อสัตย์ — ไม่มีใน 13 ใบที่คัด
- Backend / Supabase / multiplayer จริง (ของเดิมมีอยู่แล้วใน `multiplayer/*.ts` แต่ demo นี้ไม่ต่อเข้า)
- ภาพประกอบการ์ด (ใช้ text placeholder ตามโจทย์)
- Desktop layout ที่ขยายเต็มที่ (mobile คือ source of truth ตามโจทย์ — desktop แค่ไม่พังก็พอ)
