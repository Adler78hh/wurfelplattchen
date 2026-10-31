// Colour helpers: palettes and the three shades of a cube plate.

import type { RhombType } from './lattice';

/** Soft, friendly fill colours (the last ones are neutral). */
export const FILLS = [
  '#e8665c', // Tomate
  '#f59a4a', // Orange
  '#ffd166', // Sonnengelb
  '#93cf7e', // Apfelgrün
  '#4fbfb3', // Türkis
  '#6aa9e0', // Himmelblau
  '#a58bd8', // Flieder
  '#f4a6c8', // Rosa
  '#b98b6a', // Haselnuss
  '#4a3a2e', // Schokobraun
  '#ffffff', // Weiß
];

/** Outline colours. */
export const STROKES = ['#4a3a2e', '#2f6f72', '#c0463d', '#8a8f99', '#ffffff'];

/** Stroke widths relative to the triangle edge length. */
export const WIDTHS = [0.035, 0.07, 0.12];

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

/** Shade of a base colour for a rhomb face: lying = light, left = middle, right = dark. */
export function shade(base: string, t: RhombType): string {
  if (t === 0) return mix(base, '#ffffff', 0.45);
  if (t === 2) return mix(base, '#000000', 0.1);
  return mix(base, '#000000', 0.32);
}

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = parse(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
