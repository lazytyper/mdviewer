# Print-Funktion mit Setup, Vorschau & anpassbaren Umbrüchen — Design

**Datum:** 2026-08-18
**Status:** Genehmigt (Design), bereit für Implementierungsplan
**Baut auf:** [Markdown-Viewer](2026-08-18-markdown-viewer-design.md)

## Ziel

Den Markdown-Viewer um eine Druckfunktion erweitern: Auslösung über das native
OS-Menü und `Ctrl+P`, ein Print-Setup mit Format-Auswahl und einer WYSIWYG-Vorschau,
in der Seitenumbrüche über verschiebbare Balken angepasst werden können. Gedruckt
wird über den OS-Druckdialog (`window.print()`).

## Umfang (aus dem Brainstorming bestätigt)

- **Ausgabe:** OS-Druckdialog via `window.print()` (physischer Drucker oder „In PDF
  drucken" des Systems). Kein eigener PDF-Export.
- **Auslöser:** natives Tauri-Menü **„Datei → Drucken…"** mit Accelerator
  **`CmdOrCtrl+P`**. Kein Toolbar-Button.
- **Format-Auswahl:** Papiergröße (A4, Letter, A5, Legal), Ausrichtung (Hoch/Quer),
  Ränder (Presets), Skalierung (Basis-Schriftgröße für den Druck).
- **Vorschau:** paginierte WYSIWYG-Vorschau im gewählten Format.
- **Umbrüche anpassen:** automatische Seitengrenzen als Balken, die *früher*
  erzwungen werden können (nach oben ziehen); zusätzlich manuelle Umbrüche
  hinzufügen/entfernen. Balken rasten an Block-Element-Grenzen ein.

## Nicht im Umfang (YAGNI)

- Kein eigener PDF-Export (das System-„In PDF drucken" genügt).
- Kein Kopf-/Fußzeilen-Editor, keine Seitenzahlen-Konfiguration.
- Kein Umbruch mitten in einer Zeile/einem Block (nur an Element-Grenzen).
- Kein Dehnen eines Umbruchs über eine volle Seite hinaus (nur früher erzwingen).

## Auslöser: OS-Menü + Ctrl-P

Im Rust-Backend (`src-tauri/src/lib.rs`) wird beim Setup ein natives Menü aufgebaut:
ein Menü **„Datei"** mit dem Eintrag **„Drucken…"** (`MenuItem`) und Accelerator
`CmdOrCtrl+P`. Der Accelerator liefert OS-Menüeintrag und Tastenkürzel in einem.
`on_menu_event` fängt den Klick/das Kürzel ab und ruft `app.emit("menu-print", ())`
auf. Das Frontend (`main.ts`) hört per `listen('menu-print', …)` und öffnet das
Print-Setup-Overlay aus `preview.ts`.

Auf Linux/Windows erscheint dadurch erstmals eine Menüleiste im Fenster; das ist
gewollt. (Ein bestehender Menü-Kontext auf macOS wird ergänzt, nicht ersetzt.)

## Architektur & Module

Neues Verzeichnis `src/print/`, damit `main.ts` schlank bleibt und die Logik testbar
ist. Reine Funktionen sind von DOM/Tauri entkoppelt.

```
src/print/
├── format.ts       # rein: Formate/Ausrichtung/Ränder/Skalierung -> Maße in px
├── paginate.ts     # rein: Block-Höhen + Seiten-Inhaltshöhe + erzwungene Umbrüche
│                   #       -> Seitenaufteilung (Umbruch-Indizes)
├── print-css.ts    # rein: Format + erzwungene Umbruch-Indizes -> @page/break-CSS
└── preview.ts      # UI: Setup-Panel + Vorschau, misst Blöcke, zeichnet Balken,
                    #     Drag/Snap/Add/Remove, ruft window.print()
```

### Verantwortlichkeiten

- **`format.ts`** — Tabelle der Papierformate in mm (A4 210×297, Letter 216×279,
  A5 148×210, Legal 216×356), Rand-Presets (normal/schmal/breit in mm) und
  Skalierungsfaktor. Funktion `pageMetrics(settings)` liefert Seiten- und
  Inhaltsmaße in CSS-px (mm→px bei 96 dpi: `px = mm / 25.4 * 96`), berücksichtigt
  Ausrichtung (Breite/Höhe tauschen) und Ränder. Rein, testbar.
- **`paginate.ts`** — `paginate(blockHeights: number[], contentHeightPx: number,
  forcedBreaks: Set<number>): number[]`. Greedy: Blöcke der Reihe nach summieren;
  läuft der nächste Block über die Seiten-Inhaltshöhe, beginnt vor ihm eine neue
  Seite (Auto-Umbruch). Ein Index in `forcedBreaks` erzwingt einen Umbruch vor
  diesem Block, unabhängig vom Füllstand. Rückgabe: Liste der Block-Indizes, vor
  denen eine neue Seite beginnt. Blöcke höher als eine Seite werden allein auf eine
  Seite gelegt und als „überläuft" markierbar. Rein, testbar.
- **`print-css.ts`** — `buildPrintCss(settings, forcedBreaks): string`. Erzeugt
  `@page { size: <w>mm <h>mm; margin: <t> <r> <b> <l>; }`, eine Basis-Schriftgröße
  aus der Skalierung, `break-before: page` (plus Alt-Property `page-break-before`)
  auf `#content > :nth-child(i)` für jeden erzwungenen Umbruch-Index, und blendet im
  `@media print` alles außer `#content` aus. Rein, testbar.
- **`preview.ts`** — baut das Overlay (Setup-Steuerung links/oben, Vorschau rechts),
  klont `#content` in einen Messcontainer der Format-Inhaltsbreite, misst die Höhe
  jedes obersten Blocks (`offsetHeight`), ruft `paginate()`, rendert Seiten im
  Format-Seitenverhältnis mit dem Inhalt und zeichnet an jeder Seitengrenze einen
  Balken. Verarbeitet Drag (rastet auf die nächste frühere Block-Grenze) und Klicks
  zwischen Blöcken (Umbruch hinzufügen/entfernen). „Drucken" injiziert das CSS aus
  `print-css.ts`, ruft `window.print()` und räumt danach auf.

## Datenfluss

1. `Ctrl+P` bzw. Menü „Drucken…" → Rust `on_menu_event` → `emit("menu-print")`.
2. `main.ts` `listen('menu-print')` → `preview.open()` mit dem aktuellen `#content`.
3. `preview.ts` misst Block-Höhen, `format.ts` liefert die Inhaltshöhe, `paginate()`
   berechnet Auto-Umbrüche → Seiten + Balken werden gezeichnet.
4. Nutzer ändert Format (Größe/Ausrichtung/Rand/Skalierung) → alles neu berechnen;
   oder zieht/setzt Balken → `forcedBreaks` anpassen, `paginate()` erneut.
5. „Drucken" → `buildPrintCss()` injizieren → `window.print()` (OS-Dialog) → CSS und
   Overlay wieder entfernen. „Schließen" verwirft das Overlay ohne Druck.

## Zustand & Persistenz

- **Format-Einstellungen** (Größe, Ausrichtung, Ränder, Skalierung) werden wie das
  Theme in `localStorage` gespeichert (Schlüssel `mdviewer-print`).
- **Manuelle Umbrüche** (`forcedBreaks`) gelten pro Dokument und werden verworfen,
  wenn eine andere Datei geladen wird oder sich der Inhalt per Live-Reload ändert
  (die Block-Indizes wären sonst ungültig).

## Fehlerbehandlung & Risiken

- **Leeres Dokument:** Menüeintrag bleibt nutzbar, aber das Setup zeigt einen Hinweis
  „Kein Inhalt zum Drucken" und deaktiviert „Drucken".
- **Block höher als eine Seite** (großes Bild/Tabelle): wird allein auf eine Seite
  gelegt; die Vorschau markiert ihn als überlaufend; der Druck bricht ihn selbst um.
- **Live-Reload während geöffnetem Setup:** Umbrüche zurücksetzen und Vorschau neu
  aufbauen (Indizes könnten sonst nicht mehr passen).
- **Technisches Risiko WebKitGTK:** `window.print()` unterstützt `@page size` und
  erzwungene Umbrüche gut; Rand-Treue kann leicht abweichen. Die Vorschau ist die
  WYSIWYG-Referenz; kleine Abweichungen im OS-Dialog sind möglich und werden beim
  manuellen Test geprüft.

## Tests

- **Vitest (rein):**
  - `format.ts` — Maße für A4/Letter/A5/Legal, Hoch/Quer (Tausch), Rand-Presets,
    Skalierung; mm→px-Umrechnung.
  - `paginate.ts` — Auto-Umbruch bei Überlauf; mehrere Seiten; erzwungener Umbruch
    vor Index; Block größer als Seite; leere Eingabe.
  - `print-css.ts` — korrektes `@page` je Format/Ausrichtung/Rand; `break-before`
    auf den richtigen `nth-child`-Indizes; `@media print`-Ausblendung.
- **Rust:** ggf. Unit-Test der Menü-Event-Verdrahtung, soweit ohne laufendes Fenster
  testbar (sonst durch den manuellen Test abgedeckt).
- **Manuell:** Ctrl-P und Menüeintrag öffnen das Setup; Format-Wechsel aktualisiert
  die Vorschau; Balken ziehen/hinzufügen/entfernen wirkt; „Drucken" öffnet den
  OS-Dialog mit den gesetzten Umbrüchen; Format-Einstellungen überstehen Neustart.

## Offene Punkte für den Implementierungsplan

- Konkrete Tauri-v2-Menü-API-Aufrufe (`MenuBuilder`/`SubmenuBuilder`/`MenuItemBuilder`)
  und `on_menu_event`-Verdrahtung.
- Genaues Layout/CSS des Setup-Overlays und der Balken-Interaktion.
