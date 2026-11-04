# HAZID Studio

Desktop application for running HAZID (Hazard Identification) studies, oriented to the nuclear sector.

Stack: Tauri 2 (Rust) + React + TypeScript. Each study is stored as a single `.hazid` file (SQLite). Export to Excel (`.xlsx`).

## Development

```bash
npm install
npm run tauri dev
```

## Build installers

```bash
npm run tauri build
```

Installers are written to `src-tauri/target/release/bundle/`. Builds are currently unsigned.
