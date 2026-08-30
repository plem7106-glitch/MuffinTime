# MUFFIN TIME [TH]

เกมไพ่ Multiplayer บนเว็บที่ได้รับแรงบันดาลใจจาก **Muffin Time** โดยออกแบบมาให้เล่นกับเพื่อนที่อยู่ด้วยกันผ่านโทรศัพท์มือถือของแต่ละคน

> โปรเจกต์นี้อยู่ระหว่างการพัฒนา

---

## เกี่ยวกับโปรเจกต์

**MUFFIN TIME [TH]** เป็นโปรเจกต์ Web Multiplayer สำหรับเล่นเกมไพ่ปาร์ตี้กับเพื่อนที่อยู่ด้วยกัน

แทนที่จะใช้ไพ่จริง ผู้เล่นแต่ละคนจะใช้โทรศัพท์มือถือของตัวเองเพื่อ:

- เข้าร่วมห้องเกมเดียวกัน
- ดูไพ่ในมือของตัวเอง
- จั่วและเล่นไพ่
- เปิดใช้งาน Trap Card
- เล่น Counter Card
- พูดคุยและทำกิจกรรมกับผู้เล่นคนอื่นในชีวิตจริง

เว็บไซต์ทำหน้าที่เป็น **โต๊ะไพ่ดิจิทัลและระบบจัดการสถานะเกม** ส่วนการพูดคุย การจับผิด และกิจกรรมทางสังคมต่าง ๆ ยังคงเกิดขึ้นระหว่างผู้เล่นในชีวิตจริง

---

## รูปแบบการเล่น

### เป้าหมายของเกม

เป้าหมายคือทำให้ตัวเองมีไพ่ในมือ **10 ใบพอดี ณ ตอนเริ่มต้นเทิร์นของตัวเอง**

เมื่อผู้เล่นมีไพ่ครบ 10 ใบ จะต้องพูดว่า:

> "It's Muffin Time!"

หากเมื่อเริ่มต้นเทิร์นถัดไป ผู้เล่นคนนั้นยังคงมีไพ่ **10 ใบพอดี** จะเป็นผู้ชนะทันที

---

## กติกาพื้นฐาน

- ผู้เล่นแต่ละคนเริ่มเกมด้วยไพ่แบบสุ่ม **3 ใบ**
- ในเทิร์นของตัวเอง ผู้เล่นสามารถเลือกทำอย่างใดอย่างหนึ่ง:
  - จั่วไพ่จากกอง 1 ใบ
  - เล่น Action Card 1 ใบ
- ในเทิร์นของตัวเอง ผู้เล่นสามารถเลือกวาง Trap Card แบบคว่ำหน้าได้
- Counter Card สามารถใช้เพื่อตอบโต้ไพ่ใบอื่นได้
- Trap Card ที่ถูกวางไว้จะไม่นับรวมกับจำนวนไพ่ในมือ
- ผู้เล่นหนึ่งคนสามารถมี Trap Card ที่กำลังทำงานอยู่ได้สูงสุด **3 ใบ**
- ผู้เล่นชนะเมื่อเริ่มต้นเทิร์นของตัวเองด้วยไพ่ **10 ใบพอดี**

---

## ประเภทของการ์ด

เกมประกอบด้วยการ์ดหลัก 3 ประเภท

### Action Card

Action Card โดยปกติจะเล่นในเทิร์นของผู้เล่น

Effect ของการ์ดอาจประกอบด้วย:

- จั่วไพ่
- ทิ้งไพ่
- ขโมยไพ่
- ให้ไพ่กับผู้เล่นคนอื่น
- แลกเปลี่ยนไพ่หรือไพ่ทั้งมือ
- ส่งผลต่อผู้เล่นหลายคน
- เริ่ม Mini-Game

Action Card บางใบเป็น **Mini-Game Card** ซึ่งกำหนดให้ผู้เล่นทำกิจกรรมหรือแข่งขันกันในชีวิตจริง

---

### Trap Card

Trap Card จะถูกวางแบบคว่ำหน้าในเทิร์นของผู้เล่น

หลังจากวางแล้ว Trap จะยังคงอยู่จนกว่าเงื่อนไขที่ระบุบนการ์ดจะเกิดขึ้น

ตัวอย่าง Trigger อาจเกิดจากผู้เล่นคนอื่น:

- พูดคำบางอย่าง
- หัวเราะ
- หาว
- ทำพฤติกรรมบางอย่าง
- ทำตามเงื่อนไขที่ระบุไว้บนการ์ด

เมื่อเงื่อนไขเกิดขึ้น เจ้าของ Trap สามารถเปิดการ์ดและใช้ Effect ของการ์ดได้

Trap Card:

- ไม่นับรวมกับจำนวนไพ่ในมือขณะที่วางเป็น Trap
- ผู้เล่นแต่ละคนสามารถมี Active Trap ได้สูงสุด **3 ใบ**

---

### Counter Card

Counter Card เป็นการ์ดสำหรับตอบโต้เหตุการณ์หรือการ์ดใบอื่น

สามารถใช้ตอบโต้:

- Action Card
- Trap Card
- Counter Card ใบอื่น

ขึ้นอยู่กับความสามารถของ Counter Card แต่ละใบ ซึ่งอาจสามารถ:

- ยกเลิก Effect
- สะท้อน Effect
- ป้องกัน Effect
- เปลี่ยนแปลง Effect
- เปลี่ยนเป้าหมายของ Effect

Counter Card สามารถถูกเล่นระหว่างเทิร์นของผู้เล่นคนอื่นได้ หากตรงตามเงื่อนไขของการ์ด

---

## แนวคิด Multiplayer

เกมถูกออกแบบโดยมีเป้าหมายหลักให้ผู้เล่น **อยู่ด้วยกันในสถานที่เดียวกัน**

ผู้เล่นแต่ละคนใช้โทรศัพท์มือถือของตัวเอง:




___
___
___
___




# MUFFIN TIME [TH]

Web-based multiplayer card game inspired by **Muffin Time**, designed for playing together with friends using individual mobile devices.

> This project is currently under development.

---

## About the Project

**MUFFIN TIME [TH]** is a web multiplayer adaptation project designed for local party play.

Instead of using physical cards, each player uses their own smartphone to:

- Join the same game room
- View their own cards
- Draw and play cards
- Activate Trap cards
- Play Counter cards
- Interact with other players in real life

The website acts as the digital card table and manages the game state, while social interactions still happen between players in real life.

---

## How the Game Works

### Objective

The objective is to have exactly **10 cards in your hand at the start of your turn**.

When a player reaches 10 cards, they must announce:

> "It's Muffin Time!"

If they still have exactly 10 cards when their next turn begins, they win.

---

## Basic Rules

- Each player starts with **3 randomly drawn cards**.
- During their turn, a player can either:
  - Draw one card from the deck, or
  - Play one Action card.
- During their turn, a player may also place a Trap card face-down.
- Counter cards may be played in response to other cards.
- Trap cards placed face-down do not count toward the player's hand total.
- A player may have a maximum of **3 active Trap cards**.
- A player wins by starting their turn with exactly **10 cards**.

---

## Card Types

The game contains three main types of cards.

### Action

Action cards are normally played during the player's turn.

Their effects may include:

- Drawing cards
- Discarding cards
- Stealing cards
- Giving cards to another player
- Swapping cards or hands
- Affecting multiple players
- Starting a mini-game

Some Action cards are **Mini-Game cards**, requiring players to perform an activity or challenge in real life.

---

### Trap

Trap cards are placed face-down during the player's turn.

They remain active until their trigger condition occurs.

Examples of triggers may involve another player:

- Saying something
- Laughing
- Yawning
- Performing a particular action
- Triggering another condition written on the card

When the condition occurs, the owner reveals the Trap and its effect is resolved.

Trap cards:

- Do not count toward the player's hand total while active.
- Are limited to **3 active Traps per player**.

---

### Counter

Counter cards are response cards.

They may be used against:

- Action cards
- Trap cards
- Other Counter cards

Depending on the card, a Counter may:

- Cancel an effect
- Reverse an effect
- Negate an effect
- Modify an effect
- Redirect an effect

Counter cards may be played during another player's turn when their conditions allow it.

---

## Multiplayer Concept

The game is designed primarily for players who are physically together.

Each player uses their own smartphone:

```text
Player A ──┐
Player B ──┤
Player C ──┼── Game Room
Player D ──┘
