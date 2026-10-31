// The two drop-down menus in the editor's top bar: grid style, and saving / sharing / printing.

import type { Doc } from '../model/doc';
import { exportPng, printDoc, saveFile } from './exporting';
import * as I from './icons';

interface MenuProps {
  open: boolean;
  toggle(): void;
}

export function GridMenu({ open, toggle, doc, set }: MenuProps & { doc: Doc; set(p: Partial<Doc>): void }) {
  return (
    <div className="menu-anchor">
      <button className={'round' + (open ? ' on' : '')} onClick={toggle} aria-label="Raster" title="Raster">
        <I.GridIcon style={doc.gridVisible ? doc.gridStyle : 'off'} />
      </button>
      {open && (
        <div className="menu">
          <div className="menu-label">Raster</div>
          <div className="seg">
            <button className={doc.gridVisible && doc.gridStyle === 'points' ? 'on' : ''} onClick={() => set({ gridStyle: 'points', gridVisible: true })}>
              <I.GridIcon style="points" /> Punkte
            </button>
            <button className={doc.gridVisible && doc.gridStyle === 'lines' ? 'on' : ''} onClick={() => set({ gridStyle: 'lines', gridVisible: true })}>
              <I.GridIcon style="lines" /> Linien
            </button>
            <button className={!doc.gridVisible ? 'on' : ''} onClick={() => set({ gridVisible: false })}>
              <I.GridIcon style="off" /> Aus
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExportMenu({ open, toggle, current }: MenuProps & { current(): Doc }) {
  const item = (label: string, act: () => void) => (
    <button
      onClick={() => {
        toggle();
        act();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="menu-anchor">
      <button className={'round' + (open ? ' on' : '')} onClick={toggle} aria-label="Speichern und Teilen" title="Speichern und Teilen">
        <I.ShareIcon />
      </button>
      {open && (
        <div className="menu right">
          {item('Als Bild speichern (PNG)', () => exportPng(current(), false).catch((e) => alert(String(e))))}
          {item('Drucken / PDF', () => printDoc(current(), false))}
          {item('Drucken mit Raster', () => printDoc({ ...current(), gridVisible: true }, true))}
          {item('Leeres Raster drucken (Arbeitsblatt)', () => printDoc({ ...current(), shapes: [], gridVisible: true }, true))}
          {item('Als Datei speichern', () => saveFile(current()))}
        </div>
      )}
    </div>
  );
}
