# Markdown-Viewer (Tauri) — Design

**Datum:** 2026-08-18
**Status:** Genehmigt (Design), bereit für Implementierungsplan

## Ziel

Ein Desktop-Markdown-Viewer auf Basis von **Tauri v2**: zeigt `.md`-Dateien als
gerendertes HTML mit moderner Typografie und Umschaltung zwischen hellem und
dunklem Theme.

## Umfang (aus dem Brainstorming bestätigt)

**Datei öffnen (alle vier):**
- Datei-Dialog über Toolbar-Button
- Drag & Drop ins Fenster
- CLI-Argument (`mdviewer datei.md`) und OS-Dateiverknüpfung für `.md`
- Live-Reload: geöffnete Datei beobachten, Ansicht bei Änderung aktualisieren

**Markdown-/Rendering-Funktionen (alle vier):**
- GitHub-Flavored Markdown (Tabellen, Aufgabenlisten, Durchstreichen, Autolinks)
- Syntax-Highlighting in Code-Blöcken
- Mermaid-Diagramme
- Mathe (LaTeX/KaTeX)

**Theme:** Start mit OS-Vorgabe (`prefers-color-scheme`), manueller Umschalt-Button
überschreibt sie, Auswahl wird persistent gespeichert.

**Frontend-Stack:** Vanilla TypeScript + Vite.

## Nicht im Umfang (YAGNI)

- Kein Editor/Bearbeiten, nur Anzeige
- Kein Export (PDF/HTML)
- Keine Tabs/Mehrfachfenster, keine zuletzt-geöffnet-Liste (kann später kommen)
- Kein Inhaltsverzeichnis / keine Suche (kann später kommen)

## Architektur

Tauri v2 mit schlankem Rust-Backend und Vanilla-TypeScript-Frontend (Vite).
Das Markdown-→-HTML-Rendering läuft vollständig im **Frontend**, weil
Syntax-Highlighting, Mermaid und KaTeX allesamt JS-/Browser-Bibliotheken sind.
Rust übernimmt nur Dateizugriff, CLI-Argument, Datei-Dialog und Datei-Überwachung.

```
mdviewer/
├── index.html, package.json, vite.config.ts, tsconfig.json
├── src/                     # Frontend
│   ├── main.ts              # App-Verdrahtung, Events, Toolbar
│   ├── render.ts            # reine Funktion: markdown -> sauberes HTML
│   ├── theme.ts             # Theme-Logik (hell/dunkel/system, persistent)
│   └── styles/              # modernes CSS (Variablen-basiert)
└── src-tauri/               # Rust-Backend
    ├── Cargo.toml, tauri.conf.json
    ├── capabilities/        # Berechtigungen (fs, dialog, cli, event)
    └── src/lib.rs           # Commands + Datei-Watcher
```

### Units und Verantwortlichkeiten

- **`render.ts`** — reine Funktion `render(markdown: string) => string` (sanitisiertes
  HTML). Kennt keine Tauri-APIs, dadurch mit Vitest isoliert testbar.
- **`theme.ts`** — verwaltet Theme-Zustand (`light` | `dark` | `system`), liest/schreibt
  Persistenz, reagiert auf OS-Wechsel. Interface: `initTheme()`, `toggleTheme()`.
- **`main.ts`** — verdrahtet Toolbar, Tauri-Events und Rendering. Hält keinen
  Rendering- oder Theme-Detailzustand selbst.
- **Rust `lib.rs`** — Commands `read_markdown(path)` und Start/Stopp der
  Datei-Überwachung; sendet `file-changed`-Events.

## Rendering-Pipeline (Frontend)

`render.ts` als reine, testbare Funktion (Markdown-String → sanitisiertes HTML):

- **markdown-it** als Kern + GFM (Tabellen, Strikethrough, `linkify`,
  Aufgabenlisten via `markdown-it-task-lists`)
- **highlight.js** im Highlight-Callback für Code-Blöcke
- **KaTeX** (via `markdown-it-texmath`) für `$…$` / `$$…$$`
- **Mermaid** als Nachbearbeitungsschritt: `mermaid`-Codeblöcke einsammeln und rendern
- **DOMPurify** zur Sanitisierung — MD-Dateien können beliebiges HTML enthalten,
  das wird sicherheitshalber gefiltert

Mermaid wird nach dem Einfügen des HTML in den DOM ausgeführt (es braucht echte
Elemente). KaTeX und Highlighting laufen synchron innerhalb von markdown-it.

## Datenfluss

1. **Start:** Rust prüft CLI-Argument (und unter macOS das „Datei öffnen"-Event) →
   Pfad ans Frontend.
2. **Öffnen:** Dialog-Button *oder* Drag & Drop → Frontend ruft Rust-Command
   `read_markdown(path)` → Roh-Markdown → rendern.
3. **Live-Reload:** Rust überwacht die aktuelle Datei (`notify`-Crate) → bei Änderung
   Event `file-changed` → Frontend liest neu und rendert; **Scrollposition bleibt
   erhalten**.

## Theme

CSS-Variablen mit `data-theme="light|dark"` am Wurzelelement. Der Toolbar-Toggle
überschreibt die OS-Vorgabe; die Auswahl wird persistent gespeichert
(`tauri-plugin-store`). Ohne gespeicherte Wahl folgt die App `prefers-color-scheme`
und reagiert live auf OS-Wechsel. Die Farbschemata von highlight.js und KaTeX
wechseln mit dem Theme mit (variablenbasiert bzw. per umschaltbarem Stylesheet).

## UI/Layout

Dünne obere Toolbar (Öffnen-Button, Dateiname, Reload, Theme-Toggle) und darunter
ein scrollbarer Lesebereich mit angenehmer Lesespalte (`max-width`) und moderner
Typografie.

## Fehlerbehandlung

- Datei nicht lesbar / nicht gefunden → Inline-Fehlerbanner statt Absturz.
- Nicht-UTF-8- oder sehr große Dateien → sauber abgefangen mit klarer Meldung.
- Fehlerhafter Mermaid-/KaTeX-Block → betroffener Block zeigt Rohtext + Hinweis,
  der Rest des Dokuments rendert normal.

## Tauri-Konfiguration / Sicherheit

- Capabilities minimal gehalten: `dialog`, `fs` (Lesen, sinnvoll gescoped), `event`,
  CLI-Plugin, `store`.
- `read_markdown` validiert, dass der Pfad existiert und eine Datei ist.

## Tests

- **Rust:** Unit-Tests für `read_markdown` (Pfadauflösung, Fehlerfälle: fehlend,
  Verzeichnis, kein UTF-8).
- **Frontend (Vitest):** `render.ts` gegen MD-Fixtures — GFM, Code-Highlighting,
  Mathe, Mermaid-Erkennung, HTML-Injektion (DOMPurify entfernt `<script>` o. Ä.).
- Manuelle Smoke-Test-Checkliste (Öffnen per Dialog/Drag&Drop/CLI, Theme-Wechsel,
  Live-Reload).

## Offene Punkte für den Implementierungsplan

- Genaue Tauri-v2-Plugin-Versionen und `notify`-Setup.
- Auswahl konkreter highlight.js-/KaTeX-Theme-Dateien pro Modus.
