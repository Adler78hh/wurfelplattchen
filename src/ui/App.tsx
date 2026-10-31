import { useState } from 'react';
import type { Doc } from '../model/doc';
import { Editor } from './Editor';
import { Gallery } from './Gallery';

export function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  return doc ? <Editor key={doc.id} initial={doc} onExit={() => setDoc(null)} /> : <Gallery onOpen={setDoc} />;
}
