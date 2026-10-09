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
  activity charts and top sessions.
- **Chat view** — streamed messages, tool output, todos, permission prompts and
  interactive question prompts.
- **Users** — first-run admin setup, add/promote/disable/delete users.
- **Profiles** — bundle provider API keys and switch them at runtime.
- **Deep links** — every view has a URL (`/sessions`, `/search`, `/stats`, …) and
  each session has its own handle (`/sessions/<id>`).
- **Cross-platform** — runs on Linux, macOS and Windows via [Bun](https://bun.sh).
- **Optional terminal** — embeds a browser terminal via pyxtermjs.

## Requirements

- [opencode](https://opencode.ai) (the manager reads its SQLite database and
  talks to `opencode serve`).
- [Bun](https://bun.sh) — installed automatically by the installer scripts.

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
| `TERMINAL_URL`  | `http://127.0.0.1:4098`                   | optional pyxtermjs terminal backend      |

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

The manager proxies `/oc/*` to `opencode serve` and `/terminal/*` to pyxtermjs,
so the Vite dev server works without extra CORS setup.

## Architecture

| Path       | What it is                                                        |
| ---------- | ----------------------------------------------------------------- |
| `server/`  | Bun HTTP server: REST API, auth, FTS index, opencode proxy        |
| `web/`     | React + Vite single-page app (builds to `dist/`)                  |
| `bin/`     | `aiman` launcher                                                  |
| `scripts/` | Installers                                                        |

## License

[MIT](LICENSE)
