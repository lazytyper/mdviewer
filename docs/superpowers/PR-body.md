## Summary
- Tauri-v2-Desktop-Viewer, der lokale `.md`-Dateien als gestyltes HTML rendert
- Dateien öffnen per Dialog, Drag & Drop, CLI-Argument/Dateiverknüpfung sowie **Live-Reload** bei Änderungen (Scrollposition bleibt erhalten)
- Rendering im Frontend über eine reine, getestete `render()`-Funktion: GFM, Syntax-Highlighting, Mermaid, KaTeX; HTML wird mit DOMPurify bereinigt
- Hell/Dunkel-Theme: manueller Toggle überschreibt OS-Vorgabe, persistent; Code-Highlighting und Mermaid folgen dem Theme
- Fehler erscheinen als Inline-Banner (kein Absturz)

## Architektur
- **Frontend** (Vanilla TS + Vite): `render.ts` (rein/testbar), `theme.ts` (Theme-Logik), `main.ts` (Verdrahtung), `styles/app.css`
- **Backend** (Rust): `read_markdown`, `get_startup_path`, `start_watching` (überwacht das übergeordnete Verzeichnis → robust bei Atomic-Save)
- Design & Plan unter `docs/superpowers/`

## Bewusste Abweichungen von der Spec
- Theme-Persistenz via `localStorage` statt `tauri-plugin-store` (einfacher, in jsdom testbar)
- Watcher beobachtet das Elternverzeichnis statt der Datei-Inode

## Tests
- Frontend (Vitest): **13** Tests grün — `render.ts` (GFM, Highlight, KaTeX, Mermaid, XSS-Sanitisierung), `theme.ts`
- Rust (`cargo test`): **5** Tests grün — `read_markdown` (Fehlerfälle), CLI-Arg-Extraktion
- `npm run build` und `cargo build` erfolgreich

## Test Plan (manuell, GUI — headless nicht verifizierbar)
- [ ] `npm run tauri dev` startet
- [ ] „Öffnen…" rendert eine `.md`-Datei
- [ ] Drag & Drop einer `.md`-Datei rendert
- [ ] 🌓 schaltet hell/dunkel; Wahl übersteht Neustart
- [ ] Datei extern speichern → Ansicht aktualisiert sich, Scrollposition bleibt
- [ ] Start mit Pfadargument öffnet die Datei

🤖 Generated with [Claude Code](https://claude.com/claude-code)
