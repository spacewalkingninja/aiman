# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.1] - 2026-10-09

### Fixed
- **Uploaded files didn't appear in the file manager.** They're saved to a
  hidden `.aiman-uploads/` folder, which the tree walk filtered out; that folder
  is now included.
- **Paste / drag-drop files into the terminal did nothing.** xterm stops
  propagation of its textarea's paste event, so the previous React handlers
  never fired. The native terminal now uses native, capture-phase listeners on
  the pane, so dropping or pasting images/PDF/etc. works in the in-app session
  and in pop-out windows. (The vendored pyxtermjs page already used native
  listeners.)

## [1.7.0] - 2026-10-09

### Added
- **Paste or drag & drop files into a session terminal** (native terminal and
  the vendored pyxtermjs): images, PDFs and any readable file are uploaded and
  their path is typed into the terminal so opencode can read them. Works in the
  in-app session tab and in pop-out windows.
- **Quick file editor tab in the session header** (`files`): lists the session
  folder's files with filter, open/edit/save, upload and delete.
- Server endpoints: `POST /api/upload`, `DELETE /api/file`.

### Fixed
- **Couldn't switch back to a plain theme (e.g. Aiman Dark) after Windows
  XP/98.** Now every theme variable is cleared on switch and any injected
  xp.css/98.css stylesheet is always detached, so its global element styles
  can't leak into other themes.

## [1.6.0] - 2026-10-09

### Added
- **Self-restart on update.** Applying an update now restarts aiman
  automatically (exits and lets systemd/launchd bring it back, or relaunches
  detached when run from a terminal), so new code takes effect without a manual
  restart. Added a **Restart aiman** button and `POST /api/restart`.
- **Install as a background service from Settings.** A new *Background service*
  section installs/uninstalls and reports status for **systemd** (Linux, system
  or user unit), **launchd** (macOS LaunchAgent) and **Task Scheduler**
  (Windows). Endpoints: `GET /api/service`, `POST /api/service/install`,
  `POST /api/service/uninstall`.

## [1.5.5] - 2026-10-09

### Fixed
- **Switching provider profiles didn't take effect in running sessions.**
  opencode caches provider auth in per-directory instances, so a runtime
  `PUT /auth` updated `auth.json` but existing instances kept the old key
  (e.g. you'd still get the old key's "Insufficient Balance"). Profile
  activation now disposes the affected opencode instances so the next request
  re-reads the new keys.

## [1.5.4] - 2026-10-09

### Changed
- **Treemap auto-loads file contents.** Instead of only fetching when a cell is
  large, the visualizer now auto-loads every text file up to **200 KB** (using a
  binary *blocklist* so any language/config file counts, not a hand-written
  allowlist), so contents are ready and render as soon as a cell is big enough.
  Images render automatically straight from `/api/raw` as soon as the cell is a
  usable thumbnail, with no fetch/open step. Concurrency-limited to 6 requests.

## [1.5.3] - 2026-10-09

### Fixed
- **Windows: "opencode is not recognized" in session terminals.** Session
  terminals now launch opencode by its **absolute path** (resolved server-side
  and exposed as `opencodeBin` in `/api/config`), so they no longer depend on
  the PTY's PATH. On Windows the TUI is started via PowerShell (robust quoting)
  instead of cmd. This also stops the follow-on `PUT /oc/pty/{id}` 404s, which
  happened because the PTY had already exited.

## [1.5.2] - 2026-10-09

### Added
- **Copy on select** in the terminal (native xterm pane and the vendored
  pyxtermjs page): selecting text copies it to the clipboard, with a fallback
  for non-secure contexts.

## [1.5.1] - 2026-10-09

### Fixed
- **Windows: `spawn … opencode.cmd EINVAL`.** The launcher now spawns npm
  `.cmd`/`.bat` shims through the shell (with quoting), and no longer crashes if
  `opencode` fails to start — aiman keeps running and prints a hint.

## [1.5.0] - 2026-10-09

### Added
- **Update checks from GitHub Releases.** On WebUI load the server checks the
  latest release (cached for an hour) and notifies you if a newer version is
  available. Settings → **Updates** shows installed vs latest and has
  *Check for updates* and, for admins, *Update now* — which downloads the
  release tarball and overlays the app files (user data in `AIMAN_HOME` is
  untouched), then asks you to restart.
- New endpoints: `GET /api/update`, `POST /api/update/apply`.

### Fixed
- **Diff now lists changed files even when opencode reports none.** opencode's
  per-session diff is empty for projects it doesn't track, so the diff view
  falls back to the files touched by the session's `edit`/`write`/`patch` tool
  calls, shown as a scrollable list.

## [1.4.1] - 2026-10-09

### Fixed
- **"Changed files: none" when using diff.** The client expected
  `{ files: [...] }` but opencode's `/session/{id}/diff` returns an array of
  `{ file, patch, additions, deletions }`; the response is now normalised and
  the session's directory is passed so opencode resolves the right project.
  (opencode only reports files it tracked for the session — sessions whose
  directory isn't a tracked project legitimately return an empty diff.)
- **Pop-out windows now show the session title** in the window/tab title
  (`<session title> · aiman`).

## [1.4.0] - 2026-10-09

### Added
- **Themes.** A theme picker in Settings (and the onboarding wizard) with eight
  skins that restyle the entire app — chrome, sessions, chat, terminal (xterm
  colours follow the theme), code map, overlays and scrollbars:
  *Aiman Dark* (default), *Aiman Light*, **Windows XP** and **Windows 98**
  (using the real [xp.css](https://botoxparty.github.io/XP.css/) /
  [98.css](https://jdan.github.io/98.css/) skins, loaded lazily only while
  active), *Skeuomorphic* (Winamp-style brushed metal with green LED glow),
  *macOS Aqua*, *Nord* and *Phosphor CRT*. The choice is remembered per browser.
- **Pop-out session windows.** Every session row and the session header have an
  "open in new window" (⇗) action that opens `/sessions/<id>?popout=1` in a
  chrome-less browser window, so you can move sessions into their own windows
  and arrange them side by side.

## [1.3.5] - 2026-10-09

### Fixed
- **Blank terminal / `assignment to undeclared variable i` in the terminal pane.**
  The bundled xterm.js 6.x renderer produced that runtime error under some
  browsers, leaving the terminal empty. Pinned `@xterm/xterm` to the stable
  `5.5.0` (with `@xterm/addon-fit@0.10.0`), which minifies cleanly.

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
