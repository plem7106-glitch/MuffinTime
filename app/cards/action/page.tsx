import { CardGalleryView } from '../../../components/card/CardGalleryView';
import { actionCards } from '../../../data/cards/index';

export const metadata = {
  title: 'ACTION CARDS | MUFFIN TIME',
  description: 'รวมการ์ดแอ็กชัน (Action Cards) ทั้งหมด 138 ใบ',
};

export default function ActionCardsPage() {
  return (
    <CardGalleryView
      fixedType="action"
      title="ACTION CARDS"
      subtitle={`การ์ดแอ็กชันทั้งหมด ${actionCards.length} ใบ`}
      backHref="/how-to-play"
    />
  );
}
