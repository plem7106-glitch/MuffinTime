export function PlayerAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}
