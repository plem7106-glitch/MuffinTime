import { CardGalleryView } from '../../components/card/CardGalleryView';

export const metadata = {
  title: 'คลังการ์ดทั้งหมด | MUFFIN TIME',
  description: 'รวมรายชื่อและการ์ดทั้งหมด 231 ใบในเกม MUFFIN TIME',
};

export default function CardsPage() {
  return (
    <CardGalleryView
      initialType="all"
      title="คลังการ์ดทั้งหมด"
      subtitle="เลือกดูการ์ดทั้ง 231 ใบในเกม"
      backHref="/how-to-play"
    />
  );
}
