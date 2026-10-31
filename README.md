# Würfelplättchen

Tablet-App (PWA) für die Klassen 3–5: Kinder zeichnen auf einem Iso-Raster Bilder im Stil
von Victor Vasarely. Würfel, Treppen und unmögliche Figuren entstehen aus Würfelplättchen,
Rauten und Dreiecken.

## Bedienung

- **Galerie:** alle Bilder im Browser, neues Bild (A4 quer, A4 hoch, Quadrat; Punkte oder Dreiecke),
  Bild aus Datei öffnen.
- **Würfelplättchen:** das zentrale Bauteil. Drei Rauten: Der Deckel bekommt die gewählte Farbe, links einen helleren und rechts einen dunkleren Ton.
  Ein zweiter Druck auf den Würfel-Knopf dreht das Plättchen um 60° (liegende Raute oben oder unten). Ein ausgewähltes Plättchen zeigt unter der
  Zeichenfläche seine drei Seiten; jede lässt sich einzeln umfärben. *Teilen* macht aus ausgewählten Plättchen wieder je drei lose Rauten.
- **Raute, Dreieck, Sechseck:** genau eine Rasterzelle groß. Jeder weitere Druck auf den Rauten-Knopf
  dreht die Raute um 60°; der Knopf zeigt die aktuelle Lage.
- **Verschmelzen:** Liegen drei lose Rauten zu einem Würfel zusammen, leuchtet ihr Rand und der Knopf
  *Verschmelzen* wird grün. Gehört eine Raute zu zwei möglichen Würfeln, entscheidet das Antippen der
  Raute (näher an der gewünschten Würfelmitte) mit dem Auswahlwerkzeug.
- **Streckenzug:** Punkte nacheinander antippen. Zurück zum ersten Punkt ergibt eine Fläche, den letzten
  Punkt noch einmal antippen oder *Linie fertig* ergibt eine offene Linie.
- **Ausmalen:** Dreieckszellen antippen oder darüber wischen.
- **Radiergummi**, **Farbe aufnehmen** (Pipette).
- **Auswählen:** antippen oder Rahmen aufziehen; verschieben, kopieren, um 60° drehen, nach vorne,
  nach hinten, löschen, umfärben.
- **Farben:** Kinderfarben für Füllung und Rand, eigene Farbe über ein Farbrad, kein Rand, drei Linienstärken.
- **Zoom:** Das Blatt bleibt gleich groß; gezoomt werden Raster und Zeichnung darin. Herauszoomen zeigt
  mehr Rasterpunkte. Zwei Finger zoomen und verschieben, ebenso Mausrad/Trackpad und die Knöpfe
  +, − und Zurücksetzen. Export und Druck zeigen genau den sichtbaren Ausschnitt.
- **Rückgängig/Wiederholen**, auch mit Strg+Z / Strg+Umschalt+Z.
- **Speichern und Teilen:** automatisch in der Galerie; als PNG, drucken bzw. PDF, als Datei (`.wuerfel.json`).

Nach dem ersten Besuch funktioniert die App auch offline und lässt sich zum Home-Bildschirm hinzufügen.

## 3D-Ansicht

Der Knopf **3D** zeigt die Zeichnung als Körper. Ein Finger dreht, zwei Finger zoomen und verschieben.

- Jedes Würfelplättchen wird ein Würfel. Gegenüberliegende Seiten haben dieselbe Farbe.
- Plättchen, die sich im Bild überlappen oder berühren, berühren sich auch im Raum; was im Bild vorne
  liegt, ist auch im Raum vorne. Jedes Gebäude steht auf dem Boden.
- Widersprechen sich diese Wünsche (unmögliche Figur), wird an einer Stelle aufgeschnitten.
- Lose Rauten werden dünne Wände: jede ist eine Seite eines gedachten Würfels. Rauten, die sich mit
  anderen Rauten oder Würfeln eine Kante teilen, stoßen im Raum genau an dieser Kante zusammen. Ein
  geteiltes Plättchen bleibt so eine Würfelecke aus drei Wänden, der Deckel bleibt oben.
- Dreiecke, Sechsecke und Streckenzüge werden dünne Platten, die von vorne genau wie die Zeichnung
  aussehen. Sie stehen beim nächsten Würfel.
- **Wie gezeichnet** dreht zurück in die Blickrichtung der Zeichnung.
- **Unmögliches** hebt Würfel und Rauten hervor, die nicht zusammenpassen, und lose Rauten, die keine
  ganze Würfelecke bilden.
- Die aktuelle Ansicht lässt sich als PNG speichern.

Die 3D-Grafik nutzt three.js 0.162 (die letzte Version mit WebGL 1, damit sie auch auf älteren iPads läuft)
und wird erst beim ersten Öffnen geladen.

## Geplant

- Etappe 3: Würfel in 3D anbauen und entfernen, die Zeichnung passt sich an.

## Entwicklung

```sh
npm install
npm run dev      # Entwicklungsserver
npm test         # Geometrie-Tests
npm run build    # statische Seite in dist/
```

Bei jedem Push auf `main` testet und baut GitHub Actions die App und veröffentlicht sie auf
GitHub Pages. Dafür muss einmalig unter *Settings → Pages → Source* „GitHub Actions“ ausgewählt sein.

## Aufbau

- `src/geo/lattice.ts`: Iso-Raster in ganzzahligen Koordinaten (i, j), Dreiecke, Rauten, Sechsecke, Würfelplättchen, 60°-Drehung.
- `src/geo/shapes.ts`: Formen, Treffer, Verschieben/Drehen, Verschmelzen von drei Rauten.
- `src/geo/color.ts`: Paletten und die drei Würfel-Schattierungen.
- `src/geo/space.ts`: aus der Zeichnung ein 3D-Modell (Tiefen der Würfel, Widersprüche, Wände).
- `src/model/doc.ts`: Bild, Blattformate, Galerie im Browser, Dateiformat.
- `src/ui/`: React-Oberfläche (Galerie, Editor, zoombare Zeichenfläche, Farbrad, Export).
