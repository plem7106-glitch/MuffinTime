import Link from 'next/link';
import { Card } from '../../components/card/Card';
import {
  actionCards,
  trapCards,
  counterCards,
  allCards,
  getCardById,
} from '../../data/cards/index';

export const metadata = {
  title: 'วิธีเล่น | MUFFIN TIME',
  description: 'กฎกติกาและวิธีการเล่นเกมไพ่ MUFFIN TIME บนมือถือ',
};

export default function HowToPlayPage() {
  const actionExample = getCardById('A001');
  const trapExample = getCardById('T01');
  const counterExample = getCardById('C01');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-4 pb-12">
      {/* Top Navigation */}
      <header className="flex items-center gap-3 py-2">
        <Link
          href="/"
          aria-label="ย้อนกลับหน้าหลัก"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card border border-ink/10 text-xl font-bold text-ink hover:bg-ink/5"
        >
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold text-ink">วิธีเล่น / HOW TO PLAY</h1>
          <p className="text-xs text-ink-secondary">คู่มือกติกา Muffin Time ฉบับเข้าใจง่าย</p>
        </div>
      </header>

      {/* Intro Box */}
      <section className="rounded-card border border-primary/20 bg-primary/5 p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧁</span>
          <span className="font-bold text-primary text-sm uppercase tracking-wide">
            Muffin Time คืออะไร?
          </span>
        </div>
        <p className="text-sm leading-relaxed text-ink">
          <strong>Muffin Time</strong> คือปาร์ตี้การ์ดเกมสุดปั่นที่เล่นด้วยกันในกลุ่มเพื่อน (3–8 คน)
          โดยผู้เล่นแต่ละคนใช้มือถือของตนเองในการจัดการการ์ดในมือ กองจั่ว กองทิ้ง และการวางกับดัก
          แทนสำรับการ์ดจริง พร้อมพึ่งพาการสังเกตและพูดคุยกันในชีวิตจริง!
        </p>
      </section>

      {/* Section 1: Objective */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
            1
          </span>
          <h2 className="text-base font-bold text-ink">เป้าหมายของเกม</h2>
        </div>
        <div className="rounded-card border border-ink/10 bg-card p-4 flex flex-col gap-3 shadow-sm">
          <p className="text-sm text-ink-secondary leading-relaxed">
            ผู้เล่นทุกคนต้องพยายามสะสมการ์ดในมือให้มี <strong className="text-ink">ครบ 10 ใบพอดี</strong> เพื่อชนะเกม
          </p>
          <div className="rounded-lg bg-app-bg p-3 flex flex-col gap-2 border border-ink/5 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold">①</span>
              <span>เมื่อมีไพ่ในมือครบ 10 ใบ ให้กดปุ่ม <strong>&quot;Muffin Time!&quot;</strong> บนหน้าจอ</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold">②</span>
              <span>
                หากรอดผ่านการขัดขวางของเพื่อนทุกคน จนกระทั่งถึง <strong>ตอนเริ่มต้นเทิร์นถัดไปของคุณ</strong> และยังคงมีไพ่ครบ 10 ใบพอดี
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-counter font-bold">🏆</span>
              <span className="font-bold text-counter">คุณจะเป็นผู้ชนะเกมทันที!</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Setup */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
            2
          </span>
          <h2 className="text-base font-bold text-ink">การเตรียมเกม</h2>
        </div>
        <div className="rounded-card border border-ink/10 bg-card p-4 flex flex-col gap-2 shadow-sm text-sm text-ink-secondary leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-ink">
            <li>รองรับผู้เล่น <strong>3 – 8 คน</strong> ต่อห้อง</li>
            <li>สำรับการ์ดทั้งหมดรวมกัน <strong>{allCards.length} ใบ</strong> (สับรวมกัน)</li>
            <li>แจกการ์ดเริ่มต้นให้ผู้เล่นทุกคนคนละ <strong>3 ใบ</strong></li>
            <li>ระบบจะสุ่มลำดับเทิร์นและทิศทางการเล่นให้โดยอัตโนมัติ</li>
          </ul>
        </div>
      </section>

      {/* Section 3: Turn Flow */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
            3
          </span>
          <h2 className="text-base font-bold text-ink">วิธีเล่นในแต่ละเทิร์น</h2>
        </div>
        <div className="rounded-card border border-ink/10 bg-card p-4 flex flex-col gap-3.5 shadow-sm">
          <p className="text-xs text-ink-secondary">เมื่อถึงตาของคุณ ให้ปฏิบัติตามลำดับดังนี้:</p>

          <div className="flex flex-col gap-3 text-sm">
            <div className="border-l-2 border-trap pl-3">
              <p className="font-bold text-ink">ขั้นที่ 1: วางกับดัก (ไม่บังคับ)</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                เลือกวางการ์ด Trap จากมือคว่ำไว้หน้าตัวเอง 1 ใบ (วางได้สูงสุดคนละไม่เกิน 3 ใบ หากเต็มแล้วต้องเลือกทิ้งใบเก่า)
              </p>
            </div>

            <div className="border-l-2 border-action pl-3">
              <p className="font-bold text-ink">ขั้นที่ 2: ทำ 1 การกระทำหลัก (เลือก 1 อย่าง)</p>
              <div className="mt-1.5 flex flex-col gap-1.5 pl-1">
                <div className="rounded bg-app-bg p-2 text-xs">
                  <strong className="text-action">📥 จั่วไพ่ 1 ใบ:</strong> จั่วไพ่เพิ่มจากกองจั่วเข้ามือ 1 ใบ
                </div>
                <div className="rounded bg-app-bg p-2 text-xs">
                  <strong className="text-action">⚡ เล่น Action 1 ใบ:</strong> ร่ายการ์ด Action จากมือ 1 ใบเพื่อใช้งานผลของการ์ด
                </div>
              </div>
            </div>

            <div className="border-l-2 border-counter pl-3">
              <p className="font-bold text-ink">ขั้นที่ 3: ประกาศ Muffin Time</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                หากตอนจบเทิร์นคุณมีไพ่ในมือครบ 10 ใบพอดี อย่าลืมกดปุ่ม Muffin Time เพื่อเตรียมชนะในเทิร์นถัดไป
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Card Types & Real Examples */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
              4
            </span>
            <h2 className="text-base font-bold text-ink">ประเภทการ์ดทั้ง 3 แบบ</h2>
          </div>
          <Link
            href="/cards"
            className="text-xs font-semibold text-primary underline hover:opacity-80"
          >
            ดูคลังการ์ดทั้งหมด →
          </Link>
        </div>

        {/* Action Type */}
        <div className="flex flex-col gap-2 rounded-card border border-action/20 bg-action/[0.03] p-3">
          <div className="flex items-center justify-between">
            <Link
              href="/cards/action"
              className="text-xs font-bold uppercase tracking-wider text-action hover:underline"
            >
              ACTION ({actionCards.length} ใบ) →
            </Link>
            <span className="text-xs text-ink-secondary">สีน้ำเงิน</span>
          </div>
          <p className="text-xs text-ink-secondary">
            การ์ดที่เล่นในเทิร์นของตัวเองเพื่อให้เกิดผลทันที เช่น จั่วไพ่, บังคับให้คนอื่นทิ้งไพ่, ขโมยไพ่, หรือเริ่มมินิเกม
          </p>
          {actionExample && (
            <Link href={`/cards/${actionExample.id}`} className="block transition-transform hover:-translate-y-0.5">
              <Card card={actionExample} language="th" />
            </Link>
          )}
          <Link
            href="/cards/action"
            className="mt-1 flex min-h-[36px] items-center justify-center rounded-lg bg-action/10 text-xs font-bold text-action hover:bg-action/20"
          >
            ดูการ์ด Action ทั้งหมด {actionCards.length} ใบ →
          </Link>
        </div>

        {/* Trap Type */}
        <div className="flex flex-col gap-2 rounded-card border border-trap/20 bg-trap/[0.03] p-3">
          <div className="flex items-center justify-between">
            <Link
              href="/cards/trap"
              className="text-xs font-bold uppercase tracking-wider text-trap hover:underline"
            >
              TRAP ({trapCards.length} ใบ) →
            </Link>
            <span className="text-xs text-ink-secondary">สีแดง</span>
          </div>
          <p className="text-xs text-ink-secondary">
            การ์ดกับดักที่วางคว่ำหน้าไว้ล่วงหน้า และจะเปิดทำงานเมื่อมีผู้เล่นอื่นทำตามเงื่อนไขที่ระบุบนการ์ด
          </p>
          {trapExample && (
            <Link href={`/cards/${trapExample.id}`} className="block transition-transform hover:-translate-y-0.5">
              <Card card={trapExample} language="th" />
            </Link>
          )}
          <Link
            href="/cards/trap"
            className="mt-1 flex min-h-[36px] items-center justify-center rounded-lg bg-trap/10 text-xs font-bold text-trap hover:bg-trap/20"
          >
            ดูการ์ด Trap ทั้งหมด {trapCards.length} ใบ →
          </Link>
        </div>

        {/* Counter Type */}
        <div className="flex flex-col gap-2 rounded-card border border-counter/20 bg-counter/[0.03] p-3">
          <div className="flex items-center justify-between">
            <Link
              href="/cards/counter"
              className="text-xs font-bold uppercase tracking-wider text-counter hover:underline"
            >
              COUNTER ({counterCards.length} ใบ) →
            </Link>
            <span className="text-xs text-ink-secondary">สีเขียว</span>
          </div>
          <p className="text-xs text-ink-secondary">
            การ์ดสวนกลับที่สามารถเล่นได้ทุกเมื่อ (รวมถึงนอกเทิร์น) เพื่อหยุด, เบี่ยงเบนเป้าหมาย, หรือตอบโต้การ์ดใบอื่น
          </p>
          {counterExample && (
            <Link href={`/cards/${counterExample.id}`} className="block transition-transform hover:-translate-y-0.5">
              <Card card={counterExample} language="th" />
            </Link>
          )}
          <Link
            href="/cards/counter"
            className="mt-1 flex min-h-[36px] items-center justify-center rounded-lg bg-counter/10 text-xs font-bold text-counter hover:bg-counter/20"
          >
            ดูการ์ด Counter ทั้งหมด {counterCards.length} ใบ →
          </Link>
        </div>
      </section>

      {/* Section 5: Trap Details */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
            5
          </span>
          <h2 className="text-base font-bold text-ink">Trap ทำงานอย่างไร?</h2>
        </div>
        <div className="rounded-card border border-ink/10 bg-card p-4 flex flex-col gap-2.5 shadow-sm text-sm text-ink-secondary leading-relaxed">
          <p className="text-ink">
            กับดักจะถูกวางคว่ำหน้าไว้บนโต๊ะ (คนละไม่เกิน 3 ใบ) โดยเงื่อนไขของกับดักแบ่งเป็น 3 รูปแบบ:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong>คำพูด / คำถาม:</strong> เช่น หากมีคนพูดคำหยาบ, พูดภาษาต่างประเทศ, ถามเวลา</li>
            <li><strong>พฤติกรรมจริง:</strong> เช่น หากมีคนจับหน้าผาก, ดื่มน้ำ, เช็คโทรศัพท์มือถือ</li>
            <li><strong>เหตุการณ์ในเกม:</strong> เช่น หากมีคนสั่งให้เราทิ้งไพ่ หรือขโมยไพ่ของเรา</li>
          </ul>
          <div className="rounded bg-trap/10 p-2.5 text-xs text-trap font-medium mt-1">
            ⚠️ <strong>การเปิดกับดัก:</strong> เมื่อมีผู้เล่นทำตามเงื่อนไขจริง เจ้าของกับดักจะต้องกดปุ่ม <strong>&quot;เปิดกับดัก&quot;</strong> ในแอปทันทีเพื่อเริ่มคิดผล!
          </div>
        </div>
      </section>

      {/* Section 6: Counter Details */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
            6
          </span>
          <h2 className="text-base font-bold text-ink">Counter ทำงานอย่างไร?</h2>
        </div>
        <div className="rounded-card border border-ink/10 bg-card p-4 flex flex-col gap-2.5 shadow-sm text-sm text-ink-secondary leading-relaxed">
          <p className="text-ink">
            เมื่อมีผู้เล่นเล่นการ์ด Action หรือเปิดการ์ด Trap ผู้เล่นทุกคนที่มีสิทธิ์จะมีช่วงเวลาสั้นๆ ในการเล่นการ์ด Counter จากมือ:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong>หยุดการทำงาน (Cancel):</strong> ยกเลิกผลของการ์ดใบนั้นทันที</li>
            <li><strong>สะท้อนกลับ (Redirect):</strong> เปลี่ยนเป้าหมายให้ส่งผลย้อนกลับไปหาผู้ร่าย</li>
            <li><strong>สวนกลับพร้อมโบนัส:</strong> หยุดการ์ดศัตรูพร้อมได้จั่วไพ่เพิ่มหรือขโมยไพ่คืน</li>
            <li><strong>Counter Chain:</strong> สามารถเล่นการ์ด Counter สวนกลับการ์ด Counter ใบอื่นได้</li>
          </ul>
        </div>
      </section>

      {/* Section 7: Winning Tips */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
            7
          </span>
          <h2 className="text-base font-bold text-ink">กลยุทธ์การขัดขวางและชนะเกม</h2>
        </div>
        <div className="rounded-card border border-ink/10 bg-card p-4 flex flex-col gap-2 shadow-sm text-xs text-ink-secondary leading-relaxed">
          <p className="text-ink font-medium">
            เมื่อมีเพื่อนประกาศ <em>&quot;It&apos;s Muffin Time!&quot;</em> ผู้เล่นคนอื่นทุกคนต้องร่วมมือกันขัดขวาง:
          </p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>เล่น Action สั่งให้คนนั้นทิ้งไพ่</li>
            <li>ขโมยไพ่จากมือของคนนั้น</li>
            <li>ให้คนนั้นจั่วไพ่เพิ่ม (หากมีเกิน 10 ใบก็ไม่ชนะเช่นกัน!)</li>
          </ul>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href="/"
          className="flex min-h-[48px] items-center justify-center rounded-card bg-primary font-bold text-white shadow-sm hover:opacity-95"
        >
          กลับหน้าหลัก / เล่นเกม
        </Link>
      </div>
    </main>
  );
}
