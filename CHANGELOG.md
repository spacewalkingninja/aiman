# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-09

### Added
- **Terminal chat (default).** Sessions can now open directly as the opencode
  TUI embedded in the browser. Opening a session launches
  `opencode attach <server> --session <id>` inside an xterm.js terminal, with
  live streaming, tools and slash commands in one view.
- **Native PTY backend — pyxtermjs is no longer required.** The terminal is
  powered by opencode's own PTY API and a WebSocket bridge in the manager
  (`/ptyws/{id}`), so it works on Linux, macOS and Windows with no Python or
  external terminal server. xterm.js is bundled into the web build.
- **Settings view** (`/settings`) to choose the chat mode: *Terminal chat*
  (default) or *Web chat*. The choice is stored per browser and the backend
  reports PTY availability.
- The generic **Terminal** tab now uses the native PTY too.

### Changed
- Installers are now self-contained: they install **Bun** and **opencode**
  (`opencode-ai`) when missing, and Linux/macOS installs prefer the prebuilt
  release tarball (which already contains the built UI) so no toolchain is
  needed.
- App config exposes `platform`; terminal commands are wrapped per-OS because
  spawning the opencode binary directly as a PTY leader aborts.

## [1.1.0] - 2026-10-09

### Added
- **URL routing (handles).** Every place has a stable path — `/sessions`,
  `/search`, `/stats`, `/terminal`, `/users`, `/profiles` — and individual
  sessions get a deep link at `/sessions/<id>`. The browser URL updates as you
  navigate, and back/forward buttons work. `?session=<id>` is still supported
  for backwards compatibility.
- **Cross-platform configuration.** All paths are now resolved per-platform and
  overridable via environment variables (`AIMAN_HOME`, `OPENCODE_DB`,
  `OPENCODE_AUTH`, `DIST`, `PORT`, `HOST`, `OPENCODE_URL`, `TERMINAL_URL`).
  Data defaults to the OS data directory (`~/.local/share/aiman` on Linux,
  `~/Library/Application Support/aiman` on macOS, `%APPDATA%\aiman` on Windows).
- **`aiman` launcher CLI** (`bin/aiman.mjs`) that starts the manager, optionally
  boots an `opencode serve` instance, can rebuild the UI, and opens the browser.
- **Installers** for Linux/macOS (`scripts/install.sh`) and Windows
  (`scripts/install.ps1`) that install Bun, build the UI and add an `aiman`
  command.
- **Docker support** (`Dockerfile`, `docker-compose.yml`).
- **CI and release workflows** (`.github/workflows/`) that build the UI and
  publish tagged releases.
- **Graceful terminal fallback.** `/terminal` is proxied to a configurable
  pyxtermjs backend; when it is not running the panel shows setup instructions
  instead of failing.

### Fixed
- **Sidebar navigation from other tabs.** Clicking **All sessions**, **Pinned**,
  **Archived**, a folder, a directory, or **New session** while viewing Search,
  Stats, Terminal, Users or Profiles now correctly switches back to the sessions
  view instead of leaving the screen unchanged.

### Changed
- Project relicensed and published as an open-source repository at
  <https://github.com/spacewalkingninja/aiman>.

## [1.0.0] - 2026-10-07

### Added
- Initial self-hosted opencode sessions manager: session browsing, folders,
  pinning/archiving, full-text search, usage statistics, user management,
  provider config profiles, live event streaming and an embedded terminal.
