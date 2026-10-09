#!/usr/bin/env bash
# aiman installer for Linux and macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.sh | bash
#
# Everything needed is bundled or installed here — no system Python/Node, no
# external terminal server. After install you only need `aiman`.
#
# Options (env vars):
#   AIMAN_APP_DIR   where to install the app      (default: ~/.aiman/app)
#   AIMAN_BIN_DIR   where to put the launcher     (default: ~/.local/bin)
#   AIMAN_REF       git ref to install            (default: main)
set -euo pipefail

REPO_SLUG="spacewalkingninja/aiman"
REPO="https://github.com/${REPO_SLUG}.git"
APP_DIR="${AIMAN_APP_DIR:-$HOME/.aiman/app}"
BIN_DIR="${AIMAN_BIN_DIR:-$HOME/.local/bin}"
REF="${AIMAN_REF:-main}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

# ---- 1. Bun ---------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  info "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
BUN="$(command -v bun || echo "$HOME/.bun/bin/bun")"
info "Using Bun at $BUN ($("$BUN" --version))"

# ---- 2. opencode ----------------------------------------------------------
if ! command -v opencode >/dev/null 2>&1; then
  info "Installing opencode (npm: opencode-ai)..."
  "$BUN" install -g opencode-ai || {
    echo "   Could not install opencode automatically." >&2
    echo "   Install it manually from https://opencode.ai and re-run." >&2
  }
fi

# ---- 3. App source --------------------------------------------------------
build_if_needed() {
  if [ ! -f "$APP_DIR/dist/index.html" ]; then
    info "Building the web UI..."
    ( cd "$APP_DIR/web" && "$BUN" install && "$BUN" run build )
  fi
}

if [ -f "package.json" ] && grep -q '"name": "aiman"' package.json 2>/dev/null; then
  APP_DIR="$(pwd)"
  info "Installing from current checkout: $APP_DIR"
  build_if_needed
else
  # Prefer the latest prebuilt release (bundles dist, so no build needed).
  TARBALL_URL="$(curl -fsSL "https://api.github.com/repos/${REPO_SLUG}/releases/latest" 2>/dev/null \
    | grep -oE '"browser_download_url":[[:space:]]*"[^"]*aiman-[0-9][^"]*\.tar\.gz"' \
    | head -1 | grep -oE 'https://[^"]+')" || true

  if [ -n "${TARBALL_URL:-}" ]; then
    info "Downloading latest release..."
    TMP="$(mktemp -d)"
    curl -fsSL "$TARBALL_URL" -o "$TMP/aiman.tgz"
    tar -xzf "$TMP/aiman.tgz" -C "$TMP"
    SRC="$(find "$TMP" -maxdepth 1 -type d -name 'aiman-*' | head -1)"
    rm -rf "$APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    mv "$SRC" "$APP_DIR"
    rm -rf "$TMP"
  else
    info "Cloning $REPO ($REF) into $APP_DIR..."
    rm -rf "$APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --depth 1 --branch "$REF" "$REPO" "$APP_DIR"
  fi
  build_if_needed
fi

# ---- 4. Launcher ----------------------------------------------------------
mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/aiman"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
exec "$BUN" "$APP_DIR/bin/aiman.mjs" "\$@"
EOF
chmod +x "$LAUNCHER"

info "Installed. Launcher: $LAUNCHER"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "   Add $BIN_DIR to your PATH, e.g.:"
     echo "     export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo
echo "Start it with:"
echo "  aiman --open"
