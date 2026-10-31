// Start screen: all drawings in this browser, a new drawing, or a drawing from a file.

import { useMemo, useState } from 'react';
import { type Doc, FORMATS, type FormatId, type GridStyle, deleteDoc, fromFile, listDocs, newDoc, saveDoc } from '../model/doc';
import { EXAMPLES } from '../model/examples';
import { openFile } from './exporting';
import * as I from './icons';
import { docSvg } from './render';

function Thumb({ doc }: { doc: Doc }) {
  const html = useMemo(() => docSvg(doc, { grid: false, px: 1 }).replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"'), [doc]);
  return <div className="thumb-img" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Gallery({ onOpen }: { onOpen(d: Doc): void }) {
  const [docs, setDocs] = useState(listDocs);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const examples = useMemo(() => EXAMPLES.map((e) => e.make()), []);

  const load = async () => {
    const text = await openFile();
    if (!text) return;
    const d = fromFile(text);
    if (!d) {
      setMsg('Diese Datei ist kein Würfelplättchen-Bild.');
      return;
    }
    saveDoc(d);
    onOpen(d);
  };

  return (
    <div className="app gallery">
      <header className="hero">
        <I.CubeIcon colors={['#ffe7a8', '#e8665c', '#f4a6c8']} />
        <h1>Würfelplättchen</h1>
      </header>
      {msg && (
        <p className="msg" onClick={() => setMsg('')}>
          {msg}
        </p>
      )}
      <div className="cards">
        <button className="card new" onClick={() => setCreating(true)}>
          <span className="plus">
            <I.PlusIcon />
          </span>
          <span>Neues Bild</span>
        </button>
        {docs.map((d) => (
          <div key={d.id} className="card">
            <button className="thumb" onClick={() => onOpen(d)} aria-label={'Öffnen: ' + d.name}>
              <Thumb doc={d} />
            </button>
            <div className="card-foot">
              <span className="card-name">{d.name}</span>
              <button
                className="round small"
                aria-label="Löschen"
                title="Löschen"
                onClick={() => {
                  if (confirm(`„${d.name}“ wirklich löschen?`)) {
                    deleteDoc(d.id);
                    setDocs(listDocs());
                  }
                }}
              >
                <I.TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="center">
        <button className="pill" onClick={load}>
          Bild aus Datei öffnen
        </button>
      </p>
      <h2 className="section">Beispiele zum Entdecken</h2>
      <p className="section-hint">Öffne ein Beispiel, schau es dir in 3D an und bau weiter. Du bekommst deine eigene Kopie.</p>
      <div className="cards">
        {examples.map((d, k) => (
          <div key={EXAMPLES[k].key} className="card example">
            <button
              className="thumb"
              onClick={() => {
                const copy = EXAMPLES[k].make();
                saveDoc(copy);
                onOpen(copy);
              }}
              aria-label={'Beispiel öffnen: ' + d.name}
            >
              <Thumb doc={d} />
            </button>
            <div className="card-foot">
              <span className="card-name">{d.name}</span>
            </div>
          </div>
        ))}
      </div>
      {creating && (
        <NewDialog
          count={docs.length}
          onCancel={() => setCreating(false)}
          onCreate={(d) => {
            saveDoc(d);
            onOpen(d);
          }}
        />
      )}
    </div>
  );
}

function FormatIcon({ id }: { id: FormatId }) {
  const f = FORMATS[id];
  const k = 34 / Math.max(f.w, f.h);
  return (
    <svg viewBox="0 0 40 40" width="48" height="48" aria-hidden="true">
      <rect x={20 - (f.w * k) / 2} y={20 - (f.h * k) / 2} width={f.w * k} height={f.h * k} rx="2" fill="#fff" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function NewDialog({ count, onCreate, onCancel }: { count: number; onCreate(d: Doc): void; onCancel?: () => void }) {
  const [format, setFormat] = useState<FormatId>('a4q');
  const [style, setStyle] = useState<GridStyle>('points');
  return (
    <div className="modal-back">
      <div className="modal new-dialog" role="dialog" aria-label="Neues Bild">
        <h2>Neues Bild</h2>
        <div className="menu-label">Blatt</div>
        <div className="choices">
          {(Object.keys(FORMATS) as FormatId[]).map((id) => (
            <button key={id} className={'choice' + (format === id ? ' on' : '')} onClick={() => setFormat(id)}>
              <FormatIcon id={id} />
              {FORMATS[id].label}
            </button>
          ))}
        </div>
        <div className="menu-label">Raster</div>
        <div className="choices">
          <button className={'choice' + (style === 'points' ? ' on' : '')} onClick={() => setStyle('points')}>
            <I.GridIcon style="points" />
            Punkte
          </button>
          <button className={'choice' + (style === 'lines' ? ' on' : '')} onClick={() => setStyle('lines')}>
            <I.GridIcon style="lines" />
            Dreiecke
          </button>
        </div>
        <div className="modal-row">
          <span className="grow" />
          {onCancel && (
            <button className="round" onClick={onCancel} aria-label="Abbrechen">
              <I.CloseIcon />
            </button>
          )}
          <button className="pill ok" onClick={() => onCreate(newDoc(format, style, `Bild ${count + 1}`))}>
            <I.CheckIcon /> Los geht’s
          </button>
        </div>
      </div>
    </div>
  );
}
