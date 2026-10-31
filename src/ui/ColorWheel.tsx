// Colour wheel for choosing your own colour: hue around the circle, strength towards the edge,
// brightness with the slider below.

import { useEffect, useRef, useState } from 'react';
import { hexToHsv, hsvToHex } from '../geo/color';
import { CheckIcon, CloseIcon } from './icons';

const SIZE = 240;

interface Props {
  initial: string;
  title: string;
  onPick(hex: string): void;
  onClose(): void;
}

export function ColorWheel({ initial, title, onPick, onClose }: Props) {
  const [hsv, setHsv] = useState(() => {
    const [h, s, v] = hexToHsv(initial);
    return { h, s, v: Math.max(v, 0.15) };
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  const color = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    const r = SIZE / 2;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const dx = x - r + 0.5;
        const dy = y - r + 0.5;
        const d = Math.hypot(dx, dy);
        const i = (y * SIZE + x) * 4;
        if (d > r) continue;
        const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
        const hex = hsvToHex(h, Math.min(1, d / r), hsv.v);
        const n = parseInt(hex.slice(1), 16);
        img.data[i] = n >> 16;
        img.data[i + 1] = (n >> 8) & 255;
        img.data[i + 2] = n & 255;
        img.data[i + 3] = d > r - 1 ? Math.round((r - d) * 255) : 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [hsv.v]);

  const pickAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = SIZE / rect.width;
    const dx = (e.clientX - rect.left) * k - SIZE / 2;
    const dy = (e.clientY - rect.top) * k - SIZE / 2;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    setHsv((c) => ({ ...c, h, s: Math.min(1, Math.hypot(dx, dy) / (SIZE / 2)) }));
  };

  const mx = SIZE / 2 + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * (SIZE / 2);
  const my = SIZE / 2 - Math.cos((hsv.h * Math.PI) / 180) * hsv.s * (SIZE / 2);

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wheel-modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div className="wheel-wrap">
          <canvas
            ref={canvas}
            width={SIZE}
            height={SIZE}
            className="wheel"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pickAt(e);
            }}
            onPointerMove={(e) => e.buttons && pickAt(e)}
          />
          <div className="wheel-mark" style={{ left: `${(mx / SIZE) * 100}%`, top: `${(my / SIZE) * 100}%`, background: color }} />
        </div>
        <label className="bright">
          <span>Helligkeit</span>
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.01}
            value={hsv.v}
            onChange={(e) => setHsv((c) => ({ ...c, v: Number(e.target.value) }))}
            style={{ background: `linear-gradient(90deg, #222, ${hsvToHex(hsv.h, hsv.s, 1)})` }}
          />
        </label>
        <div className="modal-row">
          <span className="swatch big" style={{ background: color }} />
          <span className="grow" />
          <button className="round" onClick={onClose} aria-label="Abbrechen">
            <CloseIcon />
          </button>
          <button className="round ok" onClick={() => onPick(color)} aria-label="Übernehmen">
            <CheckIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
