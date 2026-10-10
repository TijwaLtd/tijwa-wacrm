'use client';

import { useId } from 'react';

const GREEN = '#128C7E';
const MUTED = '#667781';

export function MiniBars({
  data,
  labels,
  height = 64,
}: {
  data: number[];
  labels: string[];
  height?: number;
}) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1.5">
      {data.map((v, i) => {
        const last = i === data.length - 1;
        return (
          <div
            key={labels[i]}
            className="flex flex-1 flex-col items-center gap-0.5"
          >
            <span className="text-[9px] font-medium text-[#303030]">{v}</span>
            <div
              className="animate-bar-grow w-full rounded-t-[3px]"
              style={{
                height: (v / max) * height,
                animationDelay: `${i * 90}ms`,
                background: last
                  ? 'linear-gradient(180deg,#25D366,#128C7E)'
                  : 'linear-gradient(180deg,#cfe3da,#b7d4c7)',
              }}
            />
            <span className="text-[9px]" style={{ color: MUTED }}>
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({
  data,
  color = GREEN,
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const w = 120;
  const h = 44;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 4 - ((v - min) / (max - min || 1)) * (h - 10),
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${w},${h} L0,${h} Z`}
        fill={`url(#${id})`}
        className="animate-fade-in"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        className="animate-line-draw"
      />
      <circle
        cx={last[0] - 2}
        cy={last[1]}
        r="3"
        fill={color}
        className="animate-fade-in"
      />
    </svg>
  );
}
