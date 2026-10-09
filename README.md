# aiman

A self-hosted web UI and session manager for [opencode](https://opencode.ai).

`aiman` turns your opencode session history into a searchable, organisable
workspace: browse conversations, sort them into folders, pin the important ones,
full-text search every message, track token/cost usage, manage users and switch
provider API keys — all from the browser, with a live event stream while
opencode is working.

## Features

- **Sessions** — browse, rename, pin, archive and file sessions into colour-coded
  folders. Live "working" badges as opencode streams.
- **Full-text search** — FTS5 index over every message part (text, reasoning,
  tool calls, files).
- **Usage statistics** — tokens, cost, cache and per-model breakdowns, daily
  activity charts and top sessions. Filter by **user**, by **profile**, or any
  combination, and drill into **per-session** statistics.
- **Fork anywhere** — fork a new session from any message with *Fork here*.
- **Onboarding** — first-run wizard for security (password) and preferences.
- **Codebase explorer** — select a folder and a CodeCharta-style **treemap** of
  the code appears beside the session list, with a 2D/3D toggle, zoomable
  directories, inline code/image previews, and a built-in editor.
- **Terminal chat (default)** — opens each session as the full opencode TUI
  embedded in the browser, attached to that session (streaming, tools and slash
  commands in one view). Switch to the classic structured chat in **Settings**.
- **Web chat** — streamed messages, tool output, todos, permission prompts and
  interactive question prompts.
- **Native terminal** — the embedded terminal runs on opencode's own PTY API and
  xterm.js; no Python or external terminal server, works on Linux, macOS and
  Windows.
- **Users** — first-run admin setup, add/promote/disable/delete users.
- **Profiles** — bundle provider API keys and switch them at runtime.
- **Deep links** — every view has a URL (`/sessions`, `/search`, `/stats`, …) and
  each session has its own handle (`/sessions/<id>`).
- **Themes** — eight app-wide skins including Windows XP and Windows 98
  (via xp.css / 98.css), a skeuomorphic Winamp-style theme, Nord and a CRT.
- **Pop-out windows** — open any session in its own chrome-less browser window.
- **Cross-platform** — runs on Linux, macOS and Windows via [Bun](https://bun.sh).

## Requirements

Both are installed automatically by the installer scripts:

- [Bun](https://bun.sh) — the runtime and web build tool.
- [opencode](https://opencode.ai) (`opencode-ai`) — the manager reads its SQLite
  database and talks to `opencode serve` / its native PTY.

## Install

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.ps1 | iex
```

### From source

```bash
git clone https://github.com/spacewalkingninja/aiman.git
cd aiman
bun install --cwd web
bun run build
bun run start
```

### Docker

```bash
docker compose up --build
```

## Usage

```bash
aiman                 # start the manager (and opencode serve)
aiman --open          # ...and open the browser
aiman --build         # rebuild the web UI first
aiman --no-opencode   # don't start opencode; use an existing server
aiman --port 5000     # custom port
```

Then open <http://127.0.0.1:4097>. On first visit you'll be asked to create the
administrator account.

## Configuration

Everything is optional and can be set via environment variables:

| Variable        | Default                                   | Description                              |
| --------------- | ----------------------------------------- | ---------------------------------------- |
| `AIMAN_HOME`    | OS data dir `/aiman`                      | aiman's own data (manager.db, backups)   |
| `MANAGER_DB`    | `$AIMAN_HOME/manager.db`                  | explicit SQLite path for aiman's data    |
| `OPENCODE_DB`   | auto-detected opencode data dir           | opencode's SQLite database               |
| `OPENCODE_AUTH` | `<opencode data dir>/auth.json`           | opencode auth file                       |
| `DIST`          | `<repo>/dist`                             | built web UI directory                   |
| `HOST`          | `127.0.0.1`                               | bind host                                |
| `PORT`          | `4097`                                    | HTTP port                                |
| `OPENCODE_URL`  | `http://127.0.0.1:4096`                   | opencode server URL                      |
| `TERMINAL_URL`  | `http://127.0.0.1:4098`                   | legacy pyxtermjs backend (not required)  |

Default data locations by platform:

- **Linux:** `~/.local/share/aiman`
- **macOS:** `~/Library/Application Support/aiman`
- **Windows:** `%APPDATA%\aiman`

## Development

```bash
bun install --cwd web
bun run --cwd web dev     # Vite dev server (proxies to the manager on :4097)
bun run dev               # manager in watch mode on :4097
```

The manager proxies `/oc/*` (including the PTY) to `opencode serve` and bridges
terminals over `/ptyws/*`, so the Vite dev server works without extra CORS setup.

## Chat modes

Open a session and it launches the opencode TUI attached to it inside the
browser (**terminal chat**, the default). Switch to the structured React chat
under **Settings** (`/settings`). The choice is remembered per browser.

When running behind a reverse proxy, make sure WebSocket upgrades reach the
manager: the terminal bridge lives at `/ptyws/` and needs a `ws://` ProxyPass
(plain `ProxyPass /` does not tunnel WebSockets). See
[`deploy/apache-aiman.conf`](deploy/apache-aiman.conf). The standalone `aiman`
launcher needs no proxy at all.

The embedded terminal uses opencode's native PTY API:

- `POST /oc/pty` creates a PTY (the manager proxies it to opencode),
- the browser connects to `/ptyws/{id}`, which the manager bridges over a
  WebSocket to `opencode /pty/{id}/connect`,
- xterm.js renders it — all bundled, no external terminal server.

## Codebase explorer

Select a folder (or a directory) in the sidebar and the main view splits in two:
the session list stays on the left, and a treemap of the codebase appears on the
right. Directories are sized by total bytes; click a rectangle to zoom in. When
you zoom into files, each rectangle shows a code snippet, an image preview, or a
file-type icon. Double-click a text file to open it in the built-in editor and
save changes.

Tune the walk with `GET /api/tree?directory=<path>&depth=<n>&max=<n>`; common
build/vendor folders (`node_modules`, `.git`, `dist`, `target`, `.venv`, …) are
skipped. File reads and writes go through `/api/file` (GET/PUT) and `/api/raw`
and are confined to the selected directory.

## Architecture

| Path       | What it is                                                             |
| ---------- | ---------------------------------------------------------------------- |
| `server/`  | Bun HTTP server: REST API, auth, FTS index, opencode + PTY WebSocket proxy |
| `web/`     | React + Vite single-page app (builds to `dist/`)                       |
| `bin/`     | `aiman` launcher                                                       |
| `scripts/` | Installers                                                             |

## License

[MIT](LICENSE)
