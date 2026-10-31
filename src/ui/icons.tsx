// Small line icons (24 × 24). Shape icons show the real shape.

import type { ReactNode } from 'react';

const S = 0.866;

function Icon({ children, fill }: { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const pts = (a: [number, number][]) => a.map((p) => p.join(',')).join(' ');

/** Hexagon around (12,12) with radius r, pointy top – same orientation as on the sheet. */
const hex = (r: number) => Array.from({ length: 6 }, (_, k) => [12 + r * Math.sin((k * Math.PI) / 3), 12 - r * Math.cos((k * Math.PI) / 3)] as [number, number]);

export function CubeIcon({ variant = 0, colors }: { variant?: 0 | 1; colors?: string[] }) {
  const R = hex(10);
  const c: [number, number] = [12, 12];
  const starts = variant === 0 ? [5, 1, 3] : [0, 2, 4];
  const fills = colors ?? ['#ffe7a8', '#d9a53a', '#f5c64f'];
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      {starts.map((s, k) => (
        <polygon
          key={k}
          points={pts([c, R[s % 6], R[(s + 1) % 6], R[(s + 2) % 6]])}
          fill={fills[k]}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function RhombIcon({ type = 0 }: { type?: 0 | 1 | 2 }) {
  const R = hex(10);
  const c: [number, number] = [12, 12];
  // Same three rhombs as the faces of a cube, centred in the icon.
  const faces = [
    [c, R[5], R[0], R[1]],
    [c, R[1], R[2], R[3]],
    [c, R[3], R[4], R[5]],
  ];
  const f = faces[type];
  const mx = f.reduce((a, p) => a + p[0], 0) / 4;
  const my = f.reduce((a, p) => a + p[1], 0) / 4;
  return (
    <Icon>
      <polygon points={pts(f.map((p) => [(p[0] - mx) * 1.15 + 12, (p[1] - my) * 1.15 + 12] as [number, number]))} fill="#d6ccc2" />
    </Icon>
  );
}

export const TriangleIcon = () => (
  <Icon>
    <polygon points={pts([[6, 3], [6 + 18 * S, 12], [6, 21]])} fill="#d6ccc2" />
  </Icon>
);

export const HexIcon = () => (
  <Icon>
    <polygon points={pts(hex(10))} fill="#d6ccc2" />
  </Icon>
);

export const SelectIcon = () => (
  <Icon>
    <path d="M5 3l13 8-6 1.5L9 19z" fill="#fff" />
    <path d="M12.5 13l4 6" />
  </Icon>
);

export const PenIcon = () => (
  <Icon>
    <path d="M4 19l5-11 7 4 4-8" />
    <circle cx="4" cy="19" r="1.8" fill="currentColor" />
    <circle cx="9" cy="8" r="1.8" fill="currentColor" />
    <circle cx="16" cy="12" r="1.8" fill="currentColor" />
    <circle cx="20" cy="4" r="1.8" fill="currentColor" />
  </Icon>
);

export const BrushIcon = () => (
  <Icon>
    <path d="M14 4l6 6-7 7-6-6z" />
    <path d="M7 11c-3 0-4 3-4 6v3h3c3 0 6-1 6-4" />
  </Icon>
);

export const EraserIcon = () => (
  <Icon>
    <path d="M4 15l9-9 7 7-6 6H8z" />
    <path d="M8.5 10.5l7 7M8 19h12" />
  </Icon>
);

export const PipetteIcon = () => (
  <Icon>
    <path d="M13.5 6.5l4 4" />
    <path d="M15 3.5a2.5 2.5 0 0 1 3.5 0l2 2a2.5 2.5 0 0 1 0 3.5l-2 2-5.5-5.5z" fill="currentColor" />
    <path d="M14.5 9.5L6 18l-3 1 1-3 8.5-8.5" />
  </Icon>
);

export const MergeIcon = () => (
  <Icon>
    <polygon points={pts(hex(10))} />
    <path d="M12 12V22M12 12L3.3 7M12 12l8.7-5" strokeDasharray="2 2.5" />
  </Icon>
);

/** Cube plate falling apart into its three rhombs. */
export const SplitIcon = () => {
  const R = hex(8.5);
  const c: [number, number] = [12, 12];
  const faces: [number, number][][] = [
    [c, R[5], R[0], R[1]],
    [c, R[1], R[2], R[3]],
    [c, R[3], R[4], R[5]],
  ];
  const push: [number, number][] = [
    [0, -2.2],
    [1.9, 1.1],
    [-1.9, 1.1],
  ];
  return (
    <Icon>
      {faces.map((f, k) => (
        <polygon key={k} points={pts(f.map((p) => [p[0] + push[k][0], p[1] + push[k][1]] as [number, number]))} strokeWidth="1.8" />
      ))}
    </Icon>
  );
};

export const RotateIcon = () => (
  <Icon>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 3v5h-5" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

export const FrontIcon = () => (
  <Icon>
    <rect x="3" y="3" width="11" height="11" rx="2" strokeDasharray="2 2.5" />
    <rect x="10" y="10" width="11" height="11" rx="2" fill="#d6ccc2" />
  </Icon>
);

export const BackLayerIcon = () => (
  <Icon>
    <rect x="10" y="10" width="11" height="11" rx="2" fill="#d6ccc2" />
    <rect x="3" y="3" width="11" height="11" rx="2" fill="#fff" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7" strokeWidth="2.8" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);

export const FitIcon = () => (
  <Icon>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Icon>
);

export const GridIcon = ({ style }: { style: 'points' | 'lines' | 'off' }) => (
  <Icon>
    {style === 'lines' && <path d="M3 8h18M3 16h18M7 3l10 18M17 3L7 21" strokeWidth="1.5" />}
    {style === 'points' &&
      [4, 12, 20].flatMap((x, i) =>
        [5, 12, 19].map((y) => <circle key={`${i}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />),
      )}
    {style === 'off' && <path d="M4 4l16 16" />}
  </Icon>
);

export const ShareIcon = () => (
  <Icon>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Icon>
);

export const NoneIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="#fff" stroke="#c9b9ab" strokeWidth="2" />
    <path d="M6 18L18 6" stroke="#c0463d" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const WheelIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    {Array.from({ length: 12 }, (_, k) => {
      const a0 = (k * Math.PI) / 6;
      const a1 = ((k + 1) * Math.PI) / 6;
      const p = (a: number) => `${12 + 11 * Math.sin(a)},${12 - 11 * Math.cos(a)}`;
      return <path key={k} d={`M12 12L${p(a0)}A11 11 0 0 1 ${p(a1)}Z`} fill={`hsl(${k * 30},80%,62%)`} />;
    })}
    <circle cx="12" cy="12" r="4.5" fill="#fff" />
  </svg>
);
