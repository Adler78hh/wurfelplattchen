# Würfelplättchen

Tablet-App (PWA) für die Klassen 3–5: Kinder zeichnen auf einem Iso-Raster Bilder im Stil
von Victor Vasarely. Würfel, Treppen und unmögliche Figuren entstehen aus Würfelplättchen,
Rauten und Dreiecken.

## Bedienung

- **Galerie:** alle Bilder im Browser, neues Bild (A4 quer, A4 hoch, Quadrat; Raster fein/mittel/grob;
  Punkte oder Dreiecke), Bild aus Datei öffnen.
- **Würfelplättchen:** das zentrale Bauteil. Drei Rauten, automatisch hell, mittel und dunkel schattiert.
  Ein zweiter Druck auf den Würfel-Knopf dreht das Plättchen um 60° (liegende Raute oben oder unten). Ein ausgewähltes Plättchen zeigt unter der
  Zeichenfläche seine drei Seiten; jede lässt sich einzeln umfärben. Plättchen werden nicht wieder zerlegt.
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
- **Zoom:** zwei Finger, Mausrad oder die Knöpfe +, −, ganzes Blatt.
- **Rückgängig/Wiederholen**, auch mit Strg+Z / Strg+Umschalt+Z.
- **Speichern und Teilen:** automatisch in der Galerie; als PNG, drucken bzw. PDF, als Datei (`.wuerfel.json`).

Nach dem ersten Besuch funktioniert die App auch offline und lässt sich zum Home-Bildschirm hinzufügen.

## Geplant

- Etappe 2: 3D-Ansicht – Würfelplättchen werden Würfel, alles andere dünne Wände; drehen, zoomen,
  zurück zur Iso-Ansicht, unmögliche Teile markieren, als Bild speichern.
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
- `src/model/doc.ts`: Bild, Blattformate, Galerie im Browser, Dateiformat.
- `src/ui/`: React-Oberfläche (Galerie, Editor, zoombare Zeichenfläche, Farbrad, Export).
