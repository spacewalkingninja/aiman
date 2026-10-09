# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.4] - 2026-10-09

### Changed
- **Treemap cells now render in screen space.** Text and borders keep a constant
  pixel size at any zoom, so zooming into a file reveals more of its source at a
  readable size (instead of magnifying a few lines and fattening the borders).
- **Effectively infinite zoom** (up to 8000×) so you can fill the view with a
  single file and read a full page without opening the editor. Labels and icons
  stay small while the file content expands to fill the cell.
- Off-screen cells are culled while panning/zooming to keep it smooth.

## [1.3.3] - 2026-10-09

### Fixed
- **Treemap only rendered file code after opening and closing a file.** The
  size-tracking effect that gates the on-screen preview threshold only re-ran
  when the editor toggled, so on first load (before the tree/container mounted)
  it bailed and never observed the map size — file rectangles stayed empty until
  a forced remount. It now also re-runs when the tree loads.

## [1.3.2] - 2026-10-09

### Fixed
- **Treemap crash / black page** (`Cannot read properties of null (reading 'tx')`).
  The pan handler read `drag.current` inside the `setView` updater, which React
  runs after the pointer has already been released. The drag values are now
  captured locally.
- Added a React **error boundary** around the codebase visualizer and the
  terminal so a component fault shows an inline message instead of a blank page.

## [1.3.1] - 2026-10-09

### Fixed
- **Terminal didn't open behind Apache** (showed *"session ended — reopen to
  reconnect"*). The `/ptyws/` WebSocket bridge needs an explicit `ws://`
  ProxyPass; a plain `ProxyPass /` uses `mod_proxy_http` and does not tunnel
  WebSocket upgrades. Added [`deploy/apache-aiman.conf`](deploy/apache-aiman.conf)
  and a README note. Standalone `aiman` was never affected.

### Changed
- **Treemap now renders recursively.** Directories contain their children, so
  files nested inside folders are shown (depth-first, deep nesting included), and
  file rectangles render their actual code (or image) once they are large enough
  on screen.
- **Pan / zoom in the treemap.** Mouse wheel zooms toward the cursor, the
  **middle mouse button** drags to pan, clicking a folder zooms to fit it,
  *fit* resets the view, and double-clicking a file opens the editor.

## [1.3.0] - 2026-10-09

### Added
- **Per-user / per-profile statistics.** Sessions are attributed to the user who
  creates or first opens them, and to their active config profile. The Stats view
  can be filtered by user, by profile, or any combination.
- **Per-session statistics.** A `stats` panel in the session header (available in
  both chat modes) shows tokens, cost, user-message count and per-model usage.
- **Fork here.** Every message in the web chat has a *Fork here* action that
  creates a new session from that point (`POST /session/{id}/fork`).
- **Onboarding.** New and first-run users get a short wizard covering security
  (password) and preferences (chat mode). Completion is stored per user.
- **Codebase explorer.** Opening a folder (or directory) in the sidebar splits
  the view: the session list stays on the left, and a **CodeCharta-style treemap**
  of the codebase appears on the right. It has a 2D/3D toggle, click-to-zoom
  directories, inline code/image previews inside file rectangles, and a full
  editor (`double-click` a file) with save support. Files are read/written
  through the manager with path-escape protection and sensible ignores
  (`node_modules`, `.git`, `dist`, …).
- New endpoints: `/api/stats?user=&profile=`, `/api/stats/filters`,
  `/api/sessions/{id}/claim`, `/api/tree`, `/api/file` (GET/PUT), `/api/raw`,
  `/api/me/onboarded`, `/api/me/password`.

### Changed
- Installers continue to install `opencode` **only when it is not already
  present** (and likewise for Bun).

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
