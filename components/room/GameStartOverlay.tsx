'use client';

const PARTICLES = [
  { tx: '-120px', ty: '-90px', rot: '45deg', color: '#06B6D4', size: 16, type: 'rect', delay: '0.35s' },
  { tx: '130px', ty: '-100px', rot: '-30deg', color: '#F59E0B', size: 18, type: 'diamond', delay: '0.4s' },
  { tx: '-150px', ty: '30px', rot: '60deg', color: '#FF2E63', size: 14, type: 'circle', delay: '0.45s' },
  { tx: '140px', ty: '50px', rot: '-45deg', color: '#10B981', size: 16, type: 'rect', delay: '0.38s' },
  { tx: '-80px', ty: '-140px', rot: '15deg', color: '#EC4899', size: 20, type: 'diamond', delay: '0.42s' },
  { tx: '85px', ty: '-135px', rot: '-20deg', color: '#3B82F6', size: 15, type: 'circle', delay: '0.48s' },
  { tx: '-100px', ty: '120px', rot: '75deg', color: '#F59E0B', size: 14, type: 'rect', delay: '0.5s' },
  { tx: '110px', ty: '115px', rot: '-60deg', color: '#06B6D4', size: 18, type: 'diamond', delay: '0.44s' },
  { tx: '0px', ty: '-160px', rot: '0deg', color: '#FFFFFF', size: 12, type: 'circle', delay: '0.35s' },
  { tx: '0px', ty: '150px', rot: '45deg', color: '#FF2E63', size: 14, type: 'diamond', delay: '0.52s' },
];

export function GameStartOverlay() {
  return (
    <div
      role="status"
      aria-label="กำลังเริ่มเกม"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/65 backdrop-blur-md select-none pointer-events-auto animate-[game-start-overlay_2s_cubic-bezier(0.16,1,0.3,1)_forwards]"
    >
      {/* Particle & Confetti Burst */}
      <div className="relative flex items-center justify-center pointer-events-none">
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-xs animate-[particle-burst_1.4s_cubic-bezier(0.25,1,0.5,1)_forwards]"
            style={
              {
                '--tx': p.tx,
                '--ty': p.ty,
                '--rot': p.rot,
                animationDelay: p.delay,
                width: p.size,
                height: p.size,
                backgroundColor: p.type === 'circle' ? p.color : undefined,
                borderRadius: p.type === 'circle' ? '9999px' : p.type === 'diamond' ? '3px' : '4px',
                transform: p.type === 'diamond' ? 'rotate(45deg)' : undefined,
                border: p.type !== 'circle' ? `2px solid ${p.color}` : undefined,
                background: p.type !== 'circle' ? `${p.color}dd` : p.color,
                boxShadow: `0 0 10px ${p.color}88`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* Central Title Group */}
        <div className="flex flex-col items-center justify-center text-center">
          {/* Top text: MUFFIN */}
          <div
            className="text-5xl sm:text-6xl font-black tracking-wider text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)] animate-[pop-muffin_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.15s_both]"
            style={{
              textShadow: '0 4px 18px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 255, 255, 0.4)',
            }}
          >
            MUFFIN
          </div>

          {/* Bottom text: TIME! */}
          <div
            className="text-6xl sm:text-7xl font-black tracking-tight text-[#FF2E63] animate-[pop-time_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.45s_both] -mt-1 sm:-mt-2"
            style={{
              textShadow:
                '0 6px 24px rgba(255, 46, 99, 0.8), 0 0 40px rgba(237, 31, 79, 0.6), 0 2px 4px rgba(0,0,0,0.8)',
            }}
          >
            TIME!
          </div>

          {/* Clean Subtitle Pill */}
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 backdrop-blur-md animate-[fade-in_0.4s_ease-out_0.75s_both]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide">
              เริ่มความป่วนกันเลย!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
