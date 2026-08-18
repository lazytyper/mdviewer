# Markdown Viewer

Ein Desktop-Markdown-Viewer auf Basis von **Tauri v2**. Zeigt lokale `.md`-Dateien
als gerendertes HTML mit moderner Typografie und Umschaltung zwischen hellem und
dunklem Theme.

## Funktionen

- **Dateien öffnen** über Datei-Dialog, Drag & Drop, CLI-Argument (`mdviewer datei.md`)
  oder OS-Dateiverknüpfung für `.md`
- **Live-Reload**: geöffnete Datei wird beobachtet, die Ansicht aktualisiert sich bei
  Änderungen (Scrollposition bleibt erhalten)
- **Rendering**: GitHub-Flavored Markdown (Tabellen, Aufgabenlisten, Durchstreichen,
  Autolinks), Syntax-Highlighting, Mermaid-Diagramme, Mathe (KaTeX)
- **Theme**: hell/dunkel, manueller Umschalt-Button überschreibt die OS-Vorgabe,
  Auswahl wird persistent gespeichert; Code-Highlighting und Mermaid folgen dem Theme
- **Sicherheit**: HTML aus Markdown-Dateien wird mit DOMPurify bereinigt

## Architektur

- **Frontend** (Vanilla TypeScript + Vite) übernimmt das gesamte Markdown→HTML-Rendering.
  `src/render.ts` ist eine reine, testbare Funktion; `src/theme.ts` kapselt die
  Theme-Logik; `src/main.ts` verdrahtet Toolbar, Dialoge und Tauri-Events.
- **Backend** (Rust, `src-tauri/src/lib.rs`) liest Dateien, ermittelt den Startpfad
  (CLI-Argument / Dateiverknüpfung) und überwacht die geöffnete Datei.

Design und Umsetzungsplan liegen unter `docs/superpowers/`.

## Entwicklung

```bash
npm install                 # Abhängigkeiten installieren
npm run tauri dev           # App im Entwicklungsmodus starten (benötigt Display)
npm run build               # Frontend bauen (tsc + vite)
npm test                    # Frontend-Tests (Vitest)
cd src-tauri && cargo test  # Rust-Tests
npm run tauri build         # Produktions-Build / Installer
```

### Systemvoraussetzungen (Linux)

Tauri v2 benötigt u. a. `webkit2gtk-4.1` und `gtk+-3.0`. Auf Debian/Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```

## Hinweise / bewusste Entscheidungen

- Die Theme-Auswahl wird in `localStorage` gespeichert (statt `tauri-plugin-store`) —
  einfacher und in jsdom testbar; im Webview persistent.
- Der Datei-Watcher beobachtet das **übergeordnete Verzeichnis** (nicht die Datei
  selbst), damit Editoren mit Atomic-Save (Rename beim Speichern) korrekt erkannt werden.
- macOS-`Opened`-Events (Doppelklick im Finder) sind noch nicht angebunden;
  CLI-Argument und Windows-/Linux-Dateiverknüpfung funktionieren.
