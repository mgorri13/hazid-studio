# HAZID Studio

Desktop application for running HAZID (Hazard Identification) studies, oriented to the nuclear sector.

Stack: Tauri 2 (Rust) + React + TypeScript. Each study is stored as a single `.hazid` file (SQLite). Export to Excel (`.xlsx`).

The risk database (categories of hazardous scenarios) and the default risk matrix are shared by all studies on the
computer, stored as `risk-database.json` and `risk-matrix.json` in the app data folder (`~/Library/Application Support/com.hazidstudio.app/` on macOS,
`%APPDATA%\com.hazidstudio.app\` on Windows). Each study keeps its own copy of both inside the `.hazid` file.

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

### Windows

Windows installers are built by GitHub Actions (`.github/workflows/windows-release.yml`). To publish a new version:
bump `version` in `src-tauri/tauri.conf.json`, push, then run the **Windows release** workflow from the Actions tab
(or push a tag `vX.Y.Z`). The release contains an `.msi`, a per-user `-setup.exe` and a portable `.exe`.

## License

[MIT](LICENSE)
