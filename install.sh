#!/bin/sh
set -e

# ──────────────────────────────────────────────────────────────
# TronLink Skills — One-Command Installer
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/TronLink/tronlink-skills/main/install.sh | sh
#
# Local development (no GitHub needed):
#   sh install.sh --local /path/to/tronlink-skills
#
# Detects your AI environment automatically:
#   - Claude Code  → installs as plugin + registers MCP server
#   - Cursor       → installs as plugin with skills
#   - Codex CLI    → symlinks to skills directory
#   - OpenCode     → registers plugin + symlinks
#   - Other        → clones to ~/.tronlink-skills for manual use
# ──────────────────────────────────────────────────────────────

REPO="TronLink/tronlink-skills"
REPO_URL="https://github.com/${REPO}.git"
INSTALL_DIR="$HOME/.tronlink-skills"
VERSION="1.0.0"
LOCAL_SRC=""

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      LOCAL_SRC="$(cd "$2" && pwd)"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { printf "${CYAN}ℹ${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}✓${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${NC}  %s\n" "$1"; }

# ──────────────────────────────────────────────────────────────
# Step 1: Clone or update the repo
# ──────────────────────────────────────────────────────────────

clone_or_update() {
  if [ -n "$LOCAL_SRC" ]; then
    # --local mode: copy from local directory instead of git clone
    info "Installing from local source: $LOCAL_SRC"
    if [ "$LOCAL_SRC" = "$INSTALL_DIR" ]; then
      ok "Source is already at $INSTALL_DIR, skipping copy"
    else
      rm -rf "$INSTALL_DIR"
      cp -R "$LOCAL_SRC" "$INSTALL_DIR"
      ok "Copied to $INSTALL_DIR"
    fi
    return
  fi

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR" && git pull --quiet
    ok "Updated to latest version"
  else
    info "Cloning tronlink-skills..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null
    ok "Cloned to $INSTALL_DIR"
  fi
}

# ──────────────────────────────────────────────────────────────
# Step 2: Detect AI environment
# ──────────────────────────────────────────────────────────────

detect_env() {
  # Claude Code
  if command -v claude >/dev/null 2>&1; then
    echo "claude-code"
    return
  fi

  # Cursor (check if running inside Cursor terminal)
  if [ -n "$CURSOR_TRACE_ID" ] || [ -d "$HOME/.cursor" ]; then
    echo "cursor"
    return
  fi

  # Codex CLI
  if command -v codex >/dev/null 2>&1; then
    echo "codex"
    return
  fi

  # OpenCode
  if command -v opencode >/dev/null 2>&1 || [ -d "$HOME/.config/opencode" ]; then
    echo "opencode"
    return
  fi

  # Windsurf
  if [ -d "$HOME/.windsurf" ]; then
    echo "windsurf"
    return
  fi

  echo "generic"
}

# ──────────────────────────────────────────────────────────────
# Step 3: Environment-specific setup
# ──────────────────────────────────────────────────────────────

setup_claude_code() {
  info "Detected: Claude Code"

  # Method 1: Register as global MCP server (available in all projects)
  info "Registering MCP server (global)..."
  if claude mcp add -s user tronlink -- node "$INSTALL_DIR/scripts/mcp_server.mjs" 2>/dev/null; then
    ok "MCP server registered globally (25 TRON tools available in all projects)"
  else
    warn "MCP auto-register failed. Manual setup:"
    echo ""
    echo "  claude mcp add -s user tronlink -- node $INSTALL_DIR/scripts/mcp_server.mjs"
    echo ""
  fi

  # Method 2: Also add CLAUDE.md to project if we're in a project
  if [ -f "package.json" ] || [ -d ".git" ]; then
    if [ ! -f "CLAUDE.md" ]; then
      cp "$INSTALL_DIR/CLAUDE.md" ./CLAUDE.md
      ok "Added CLAUDE.md to current project"
    else
      # Append if CLAUDE.md already exists
      if ! grep -qi "tronlink" CLAUDE.md 2>/dev/null; then
        echo "" >> CLAUDE.md
        cat "$INSTALL_DIR/CLAUDE.md" >> CLAUDE.md
        ok "Appended TronLink instructions to existing CLAUDE.md"
      fi
    fi
  fi

  ok "Claude Code setup complete!"
  echo ""
  echo "  Usage: Start Claude Code and ask about TRON:"
  echo "    💬 \"Check TRX balance for this address: TAddr...\""
  echo "    💬 \"Is the USDT contract safe?\""
  echo "    💬 \"Estimate how much Energy a USDT transfer needs\""
}

setup_cursor() {
  info "Detected: Cursor"

  # Symlink skills to current project
  if [ -f "package.json" ] || [ -d ".git" ]; then
    ln -sf "$INSTALL_DIR/skills" ./tronlink-skills 2>/dev/null || true
    cp -n "$INSTALL_DIR/AGENTS.md" ./ 2>/dev/null || true
    ok "Linked skills to current project"
  fi

  # Set up as .cursor-plugin if possible
  CURSOR_RULES="$HOME/.cursor/rules"
  mkdir -p "$CURSOR_RULES" 2>/dev/null || true
  if [ -d "$CURSOR_RULES" ]; then
    cp "$INSTALL_DIR/.cursor-plugin/plugin.json" "$CURSOR_RULES/tronlink-skills.json" 2>/dev/null || true
    ok "Registered in Cursor rules"
  fi

  # Also offer MCP
  echo ""
  info "For deeper integration, add MCP server in Cursor Settings → MCP:"
  echo ""
  echo "  Server name: tronlink"
  echo "  Command: node"
  echo "  Args: $INSTALL_DIR/scripts/mcp_server.mjs"
  echo ""

  ok "Cursor setup complete!"
}

setup_codex() {
  info "Detected: Codex CLI"

  mkdir -p "$HOME/.agents/skills"
  ln -sf "$INSTALL_DIR/skills" "$HOME/.agents/skills/tronlink-skills"
  ok "Symlinked to ~/.agents/skills/tronlink-skills"

  # Copy AGENTS.md to project if applicable
  if [ -f "package.json" ] || [ -d ".git" ]; then
    if [ ! -f "AGENTS.md" ]; then
      cp "$INSTALL_DIR/AGENTS.md" ./ 2>/dev/null || true
      ok "Added AGENTS.md to current project"
    fi
  fi

  ok "Codex setup complete! Restart Codex to discover skills."
}

setup_opencode() {
  info "Detected: OpenCode"

  OPENCODE_DIR="$HOME/.config/opencode"
  mkdir -p "$OPENCODE_DIR/plugins" "$OPENCODE_DIR/skills"

  # Symlink plugin
  ln -sf "$INSTALL_DIR/.opencode/plugins/tronlink-skills.js" \
         "$OPENCODE_DIR/plugins/tronlink-skills.js" 2>/dev/null || true

  # Symlink skills
  ln -sf "$INSTALL_DIR/skills" \
         "$OPENCODE_DIR/skills/tronlink-skills" 2>/dev/null || true

  ok "OpenCode setup complete! Restart OpenCode to load skills."
}

setup_windsurf() {
  info "Detected: Windsurf"

  # Similar to Cursor
  if [ -f "package.json" ] || [ -d ".git" ]; then
    ln -sf "$INSTALL_DIR/skills" ./tronlink-skills 2>/dev/null || true
    cp -n "$INSTALL_DIR/AGENTS.md" ./ 2>/dev/null || true
    ok "Linked skills to current project"
  fi

  echo ""
  info "Add MCP server in Windsurf settings for deeper integration:"
  echo "  node $INSTALL_DIR/scripts/mcp_server.mjs"

  ok "Windsurf setup complete!"
}

setup_generic() {
  info "No specific AI environment detected"
  echo ""
  echo "  Skills installed to: $INSTALL_DIR"
  echo ""
  echo "  Manual integration options:"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────┐"
  echo "  │ Claude Code:                                                │"
  echo "  │   claude mcp add tronlink -- node \\                        │"
  echo "  │     $INSTALL_DIR/scripts/mcp_server.mjs                    │"
  echo "  │                                                             │"
  echo "  │ Claude Desktop (claude_desktop_config.json):                │"
  echo "  │   { \"mcpServers\": { \"tronlink\": {                          │"
  echo "  │       \"command\": \"node\",                                    │"
  echo "  │       \"args\": [\"$INSTALL_DIR/scripts/mcp_server.mjs\"]      │"
  echo "  │   }}}                                                       │"
  echo "  │                                                             │"
  echo "  │ Direct CLI:                                                 │"
  echo "  │   node $INSTALL_DIR/scripts/tron_api.mjs --help            │"
  echo "  └─────────────────────────────────────────────────────────────┘"
  echo ""
}

# ──────────────────────────────────────────────────────────────
# Step 4: Verify Node.js
# ──────────────────────────────────────────────────────────────

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js not found. Install Node.js 18+ first:"
    echo "  https://nodejs.org"
    exit 1
  fi

  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 18 ] 2>/dev/null; then
    warn "Node.js $NODE_VERSION found, but 18+ required"
    echo "  Update: https://nodejs.org"
    exit 1
  fi

  ok "Node.js $(node -v) detected"
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║     TronLink Skills Installer v${VERSION}     ║"
  echo "  ║  Wallet · Market · Swap · Energy · Stake ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo ""

  check_node
  clone_or_update

  ENV=$(detect_env)

  case "$ENV" in
    claude-code) setup_claude_code ;;
    cursor)      setup_cursor ;;
    codex)       setup_codex ;;
    opencode)    setup_opencode ;;
    windsurf)    setup_windsurf ;;
    *)           setup_generic ;;
  esac

  echo ""
  echo "  ──────────────────────────────────────────"
  echo "  Quick test:"
  echo "    node $INSTALL_DIR/scripts/tron_api.mjs validate-address \\"
  echo "      --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
  echo ""
  echo "  All commands:"
  echo "    node $INSTALL_DIR/scripts/tron_api.mjs --help"
  echo ""
  echo "  Docs: $INSTALL_DIR/docs/claude-integration-guide.md"
  echo "  ──────────────────────────────────────────"
  echo ""
}

main
