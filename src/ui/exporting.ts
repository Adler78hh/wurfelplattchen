// Export as PNG, print (also "save as PDF" in the print dialog) and save as a file.

import { type Doc, sheetOf, toFile } from '../model/doc';
import { docSvg } from './render';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Bild';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Render the drawing to a PNG blob (about 200 dpi). */
export function pngBlob(d: Doc, pxPerMm = 8, grid = false): Promise<Blob> {
  const svg = docSvg(d, { grid, px: pxPerMm });
  const { w, h } = sheetOf(d);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * pxPerMm);
      c.height = Math.round(h * pxPerMm);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG fehlgeschlagen'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht gezeichnet werden'));
    };
    img.src = url;
  });
}

export async function exportPng(d: Doc, grid: boolean) {
  download(await pngBlob(d, 8, grid), safeName(d.name) + '.png');
}

export function saveFile(d: Doc) {
  download(new Blob([toFile(d)], { type: 'application/json' }), safeName(d.name) + '.wuerfel.json');
}

/** Print the drawing in real size on its sheet format. */
export function printDoc(d: Doc, grid: boolean) {
  const root = document.getElementById('print-root');
  if (!root) return;
  const { w, h } = sheetOf(d);
  root.innerHTML = `<style>@page { size: ${w}mm ${h}mm; margin: 0 }</style>` + docSvg(d, { grid });
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    root.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

/** Ask for a file and return its text. */
export function openFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    input.click();
  });
}
