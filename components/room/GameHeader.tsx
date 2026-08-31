import { RoomCode } from './RoomCode';

export function GameHeader({ hostName, code }: { hostName: string; code: string }) {
  return (
    <header className="flex items-center justify-between py-2">
      <div>
        <h1 className="text-lg font-bold text-ink">ห้องของ {hostName}</h1>
        <RoomCode code={code} />
      </div>
      <button aria-label="ตั้งค่า" className="text-2xl text-ink">
        ⚙️
      </button>
    </header>
  );
}
