import { CardGalleryView } from '../../../components/card/CardGalleryView';
import { counterCards } from '../../../data/cards/index';

export const metadata = {
  title: 'COUNTER CARDS | Muffin Time',
  description: 'รวมการ์ดตอบโต้ (Counter Cards) ทั้งหมด 40 ใบ',
};

export default function CounterCardsPage() {
  return (
    <CardGalleryView
      fixedType="counter"
      title="COUNTER CARDS"
      subtitle={`การ์ดตอบโต้ทั้งหมด ${counterCards.length} ใบ`}
      backHref="/how-to-play"
    />
  );
}
