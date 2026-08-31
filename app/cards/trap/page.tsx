import { CardGalleryView } from '../../../components/card/CardGalleryView';
import { trapCards } from '../../../data/cards/index';

export const metadata = {
  title: 'TRAP CARDS | MUFFIN TIME',
  description: 'รวมการ์ดกับดัก (Trap Cards) ทั้งหมด 53 ใบ',
};

export default function TrapCardsPage() {
  return (
    <CardGalleryView
      fixedType="trap"
      title="TRAP CARDS"
      subtitle={`การ์ดกับดักทั้งหมด ${trapCards.length} ใบ`}
      backHref="/how-to-play"
    />
  );
}
