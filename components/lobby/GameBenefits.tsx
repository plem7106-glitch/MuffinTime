import { UsersIcon, CardsIcon, ChatIcon, TrophyIcon } from '../ui/Icons';

const BENEFITS = [
  {
    icon: UsersIcon,
    title: 'เล่นกับเพื่อน',
  },
  {
    icon: CardsIcon,
    title: 'ไพ่สุดป่วน',
  },
  {
    icon: ChatIcon,
    title: 'เล่นแบบเรียลไทม์',
  },
  {
    icon: TrophyIcon,
    title: 'ไม่มีอันดับ',
  },
];

export function GameBenefits() {
  return (
    <section className="rounded-2xl border border-[#FFE4E8] bg-[#FFF5F7] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        {BENEFITS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 border border-[#FED7DE]/60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center text-primary">
                <Icon className="h-4 w-4 stroke-[2.2]" />
              </div>
              <span className="text-xs font-bold text-ink truncate">
                {item.title}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
