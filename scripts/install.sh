#!/usr/bin/env bash
# aiman installer for Linux and macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.sh | bash
#
# Options (env vars):
#   AIMAN_APP_DIR   where to install the app      (default: ~/.aiman/app)
#   AIMAN_BIN_DIR   where to put the launcher     (default: ~/.local/bin)
#   AIMAN_REF       git ref to install            (default: main)
set -euo pipefail

REPO="https://github.com/spacewalkingninja/aiman.git"
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

# ---- 2. Source code -------------------------------------------------------
if [ -f "package.json" ] && grep -q '"name": "aiman"' package.json 2>/dev/null; then
  APP_DIR="$(pwd)"
  info "Installing from current checkout: $APP_DIR"
elif [ -d "$APP_DIR/.git" ]; then
  info "Updating existing install in $APP_DIR..."
  git -C "$APP_DIR" fetch --depth 1 origin "$REF"
  git -C "$APP_DIR" checkout -q FETCH_HEAD
else
  info "Cloning $REPO ($REF) into $APP_DIR..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth 1 --branch "$REF" "$REPO" "$APP_DIR"
fi

# ---- 3. Build web UI ------------------------------------------------------
info "Installing web dependencies and building the UI..."
( cd "$APP_DIR/web" && "$BUN" install && "$BUN" run build )

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
