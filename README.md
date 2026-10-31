# Würfelplättchen

App (PWA) für Tablet und Handy, Klassen 3–5: Kinder zeichnen auf einem Iso-Raster Bilder im Stil
von Victor Vasarely. Würfel, Treppen und unmögliche Figuren entstehen aus Würfelplättchen,
Rauten und Dreiecken.

## Bedienung

- **Galerie:** alle Bilder im Browser, neues Bild (A4 quer, A4 hoch, Quadrat; Punkte oder Dreiecke),
  Bild aus Datei öffnen. Dazu **Beispiele zum Entdecken** (Treppe, Würfelstadt, Kippstern, unmögliches
  Dreieck, Würfel oder Ecke?, Würfelmuster); Antippen legt eine eigene Kopie an.
- **Würfelplättchen:** das zentrale Bauteil. Ein neues Plättchen wird automatisch richtig gestapelt:
  Es liegt an Würfeln an, steht auf Boden oder Würfel und verschwindet hinter Würfeln, die davor stehen. Drei Rauten: Der Deckel bekommt die gewählte Farbe, links einen helleren und rechts einen dunkleren Ton.
  Ein zweiter Druck auf den Würfel-Knopf dreht das Plättchen um 60° (liegende Raute oben oder unten). Ein ausgewähltes Plättchen zeigt unter der
  Zeichenfläche seine drei Seiten; jede lässt sich einzeln umfärben. *Teilen* macht aus ausgewählten Plättchen wieder je drei lose Rauten.
- **Raute, Dreieck, Sechseck:** genau eine Rasterzelle groß. Jeder weitere Druck auf den Rauten-Knopf
  dreht die Raute um 60°; der Knopf zeigt die aktuelle Lage.
- **Verschmelzen:** Liegen drei lose Rauten zu einem Würfel zusammen, leuchtet ihr Rand und der Knopf
  *Verschmelzen* wird grün. Gehört eine Raute zu zwei möglichen Würfeln, entscheidet das Antippen der
  Raute (näher an der gewünschten Würfelmitte) mit dem Auswahlwerkzeug.
- **Zwei Dreiecke → Raute:** Liegt ein gerade gesetztes oder ausgewähltes Dreieck neben einem zweiten,
  sodass beide eine Raute bilden, leuchtet *Verschmelzen* ebenfalls.
- **Streckenzug:** Punkte nacheinander antippen. Zurück zum ersten Punkt ergibt eine Fläche, den letzten
  Punkt noch einmal antippen oder *Linie fertig* ergibt eine offene Linie.
- **Ausmalen:** Dreieckszellen antippen oder darüber wischen.
- **Radiergummi**, **Farbe aufnehmen** (Pipette).
- **Auswählen:** antippen oder Rahmen aufziehen; verschieben, kopieren, um 60° drehen, nach vorne,
  nach hinten, umfärben. Rückgängig und Löschen (Papierkorb) stehen direkt in der Werkzeugleiste.
- **Muster:** *Reihe* setzt die Auswahl dreimal lückenlos nach rechts fort. *Stern ×3* und *Stern ×6*
  drehen Kopien um die Ecke, an der die Form angetippt wurde – eine Raute an ihrer spitzen Ecke
  angetippt ergibt mit *Stern ×6* den Vasarely-Stern.
- **Farben:** Kinderfarben für Füllung und Rand, eigene Farbe über ein Farbrad, kein Rand, drei Linienstärken.
- **Zoom:** Das Blatt bleibt gleich groß; gezoomt werden Raster und Zeichnung darin. Herauszoomen zeigt
  mehr Rasterpunkte. Zwei Finger zoomen und verschieben, ebenso Mausrad/Trackpad und die Knöpfe
  +, − und Zurücksetzen. Export und Druck zeigen genau den sichtbaren Ausschnitt.
- **Rückgängig/Wiederholen**, auch mit Strg+Z / Strg+Umschalt+Z.
- **Speichern und Teilen:** automatisch in der Galerie; als PNG, drucken bzw. PDF (ohne oder mit Raster),
  als Datei (`.wuerfel.json`). *Leeres Raster drucken* ergibt ein Arbeitsblatt zum Zeichnen auf Papier
  (Punkte oder Dreiecke, in der aktuellen Zoomstufe).

Nach dem ersten Besuch funktioniert die App auch offline und lässt sich zum Home-Bildschirm hinzufügen.

## 3D-Ansicht

Der Knopf **3D** zeigt die Zeichnung als Körper. Ein Finger dreht, zwei Finger zoomen und verschieben.

- Jedes Würfelplättchen wird ein Würfel. Gegenüberliegende Seiten haben dieselbe Farbe.
- Ausnahme **gedrehte Plättchen** (liegende Raute unten): Sie sind entweder ein Würfel von unten oder
  eine **Ecke** wie in einem Zimmer (Boden und zwei Wände) – nur die Ecke sieht in 3D genau wie
  gezeichnet aus. Beim Setzen oder Verschmelzen fragt eine Sprechblase „Würfel oder Ecke?“; ohne
  Antwort wird es eine Ecke. Umwählen in der Auswahl-Zeile „In 3D“ oder durch Antippen in 3D.
- Plättchen, die sich im Bild überlappen oder berühren, berühren sich auch im Raum; was im Bild vorne
  liegt, ist auch im Raum vorne. Jedes Gebäude steht auf dem Boden.
- Fest sind: Würfel, deren Plättchen sich so überlappen, dass sie eine Seite teilen könnten, berühren
  sich; gemeinsame Kanten mit Rauten und gezeichneten Flächen treffen sich. Alles andere (nur an einer
  Kante berührend, nebeneinander, gemeinsame Ecke) ist ein Wunsch, der genutzt wird, wo er passt.
- Unmöglich ist eine Figur, wenn feste Verbindungen sich widersprechen oder es keine Anordnung gibt, in
  der jeder oben gezeichnete Würfel auch näher am Betrachter steht. Markiert wird die Stelle des Tricks.
- Lose Rauten werden dünne Wände: jede ist eine Seite eines gedachten Würfels. Rauten, die sich mit
  anderen Rauten oder Würfeln eine Kante teilen, stoßen im Raum genau an dieser Kante zusammen. Ein
  geteiltes Plättchen bleibt so eine Würfelecke aus drei Wänden, der Deckel bleibt oben.
- Dreiecke, Sechsecke, Streckenzüge und Linien liegen in einer der drei Würfelebenen (liegend,
  Wand nach rechts, Wand nach links) und sehen von vorne genau wie gezeichnet aus. Die App wählt die
  Ebene, in der die meisten Kanten echte Würfelkanten sind; passen mehrere gleich gut, die, in der die
  Fläche an Würfel- oder Rautenkanten ansetzt. Gemeinsame Kanten (sonst eine gemeinsame Ecke) stoßen
  im Raum zusammen.
- **Kippfiguren** (Flächen, die liegen oder stehen könnten): Nach dem Zeichnen fragt eine Sprechblase
  „Liegt sie oder steht sie?“. Wer weiterzeichnet, überlässt der App die Wahl.
- Ist eine gezeichnete Fläche ausgewählt, zeigt die Zeile **Lage in 3D** die Knöpfe Tisch, Wand, Wand.
- **Antippen** einer gezeichneten Fläche in 3D klappt sie in die nächste Ebene. Die Wahl wird im Bild
  gespeichert und lässt sich rückgängig machen.
- **Wie gezeichnet** dreht zurück in die Blickrichtung der Zeichnung.
- **Unmögliches** hebt Würfel und Rauten hervor, die nicht zusammenpassen, und lose Rauten, die keine
  ganze Würfelecke bilden.
- Die aktuelle Ansicht lässt sich als PNG speichern.

Die 3D-Grafik nutzt three.js 0.162 (die letzte Version mit WebGL 1, damit sie auch auf älteren iPads läuft)
und wird erst beim ersten Öffnen geladen.

- **Bauen** (Knopf in 3D): Würfelseite antippen setzt dort einen neuen Würfel in der aktuellen Farbe,
  Boden antippen stellt einen Würfel auf den Boden, lange drücken nimmt einen Würfel weg. Die Zeichnung
  passt sich an, neue Plättchen landen an der richtigen Stelle im Stapel.

## Entwicklung

```sh
npm install
npm run dev      # Entwicklungsserver
npm test         # Geometrie- und 3D-Tests (Vitest)
npm run build    # statische Seite in dist/
npm run e2e      # Oberflächentests im Browser (Playwright, Tablet und Handy; vorher bauen)
```

Bei jedem Push auf `main` testet und baut GitHub Actions die App (inklusive Oberflächentests) und veröffentlicht sie auf
GitHub Pages. Dafür muss einmalig unter *Settings → Pages → Source* „GitHub Actions“ ausgewählt sein.

## Aufbau

- `src/geo/lattice.ts`: Iso-Raster in ganzzahligen Koordinaten (i, j), Dreiecke, Rauten, Sechsecke, Würfelplättchen, 60°-Drehung.
- `src/geo/shapes.ts`: Formen, Treffer, Verschieben/Drehen, Verschmelzen von drei Rauten.
- `src/geo/color.ts`: Paletten und die drei Würfel-Schattierungen.
- `src/geo/space.ts`: aus der Zeichnung ein 3D-Modell (Tiefen der Würfel, Widersprüche, Wände).
- `src/model/doc.ts`: Bild, Blattformate, Dateiformat.
- `src/model/store.ts`: Galerie in IndexedDB (alte Bilder aus localStorage werden einmal übernommen; ohne IndexedDB weiter localStorage).
- `src/model/examples.ts`: Beispielbilder.
- `src/ui/`: React-Oberfläche (Galerie, Editor, zoombare Zeichenfläche, Farbrad, Export).
