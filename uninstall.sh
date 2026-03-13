#!/bin/sh
set -e

# ──────────────────────────────────────────────────────────────
# TronLink Skills — Uninstaller
#
# Reverses everything done by install.sh:
#   - Removes MCP server registration (Claude Code)
#   - Removes symlinks and copied config files
#   - Deletes ~/.tronlink-skills
#
# Usage:
#   sh uninstall.sh
#   # or, if already removed locally:
#   curl -sSL https://raw.githubusercontent.com/TronLink/tronlink-skills/main/uninstall.sh | sh
# ──────────────────────────────────────────────────────────────

INSTALL_DIR="$HOME/.tronlink-skills"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}ℹ${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}✓${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${NC}  %s\n" "$1"; }
removed() { printf "${RED}✗${NC}  Removed: %s\n" "$1"; }

# ──────────────────────────────────────────────────────────────
# Claude Code
# ──────────────────────────────────────────────────────────────

uninstall_claude_code() {
  if command -v claude >/dev/null 2>&1; then
    info "Removing Claude Code MCP server..."
    # Remove from all scopes (user/global and project-level)
    claude mcp remove -s user tronlink 2>/dev/null && removed "MCP server 'tronlink' (global)"
    claude mcp remove tronlink 2>/dev/null && removed "MCP server 'tronlink' (project)"
    ok "MCP cleanup done"
  fi
}

# ──────────────────────────────────────────────────────────────
# Cursor
# ──────────────────────────────────────────────────────────────

uninstall_cursor() {
  CURSOR_RULES="$HOME/.cursor/rules/tronlink-skills.json"
  if [ -f "$CURSOR_RULES" ]; then
    rm -f "$CURSOR_RULES"
    removed "$CURSOR_RULES"
  fi
}

# ──────────────────────────────────────────────────────────────
# Codex CLI
# ──────────────────────────────────────────────────────────────

uninstall_codex() {
  CODEX_LINK="$HOME/.agents/skills/tronlink-skills"
  if [ -L "$CODEX_LINK" ] || [ -e "$CODEX_LINK" ]; then
    rm -f "$CODEX_LINK"
    removed "$CODEX_LINK"
  fi
}

# ──────────────────────────────────────────────────────────────
# OpenCode
# ──────────────────────────────────────────────────────────────

uninstall_opencode() {
  OC_PLUGIN="$HOME/.config/opencode/plugins/tronlink-skills.js"
  OC_SKILLS="$HOME/.config/opencode/skills/tronlink-skills"

  if [ -L "$OC_PLUGIN" ] || [ -e "$OC_PLUGIN" ]; then
    rm -f "$OC_PLUGIN"
    removed "$OC_PLUGIN"
  fi
  if [ -L "$OC_SKILLS" ] || [ -e "$OC_SKILLS" ]; then
    rm -f "$OC_SKILLS"
    removed "$OC_SKILLS"
  fi
}

# ──────────────────────────────────────────────────────────────
# Project-level files (Cursor / Windsurf / Codex may have added)
# ──────────────────────────────────────────────────────────────

uninstall_project_files() {
  # Symlink to skills
  if [ -L "./tronlink-skills" ]; then
    rm -f "./tronlink-skills"
    removed "./tronlink-skills (symlink)"
  fi

  # AGENTS.md — only remove if it was copied from our install
  if [ -f "./AGENTS.md" ] && grep -q "tron_api.mjs" "./AGENTS.md" 2>/dev/null; then
    rm -f "./AGENTS.md"
    removed "./AGENTS.md"
  fi

  # CLAUDE.md — only remove tronlink content
  if [ -f "./CLAUDE.md" ]; then
    if grep -q "TronLink Wallet Skills" "./CLAUDE.md" 2>/dev/null; then
      # If the entire file is our content, remove it
      FIRST_LINE=$(head -1 "./CLAUDE.md")
      if echo "$FIRST_LINE" | grep -q "TronLink"; then
        rm -f "./CLAUDE.md"
        removed "./CLAUDE.md (was entirely TronLink content)"
      else
        warn "./CLAUDE.md contains TronLink content mixed with other content."
        warn "Please manually remove the TronLink section from CLAUDE.md"
      fi
    fi
  fi
}

# ──────────────────────────────────────────────────────────────
# Core: remove ~/.tronlink-skills
# ──────────────────────────────────────────────────────────────

uninstall_core() {
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    removed "$INSTALL_DIR"
  else
    info "$INSTALL_DIR does not exist, skipping"
  fi
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║     TronLink Skills Uninstaller          ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo ""

  info "Cleaning up all environments..."
  echo ""

  uninstall_claude_code
  uninstall_cursor
  uninstall_codex
  uninstall_opencode
  uninstall_project_files
  uninstall_core

  echo ""
  ok "TronLink Skills has been completely uninstalled."
  echo ""
  echo "  Note: Environment variables (TRONGRID_API_KEY, etc.)"
  echo "  are not removed. Remove them from your shell profile if needed:"
  echo "    ~/.bashrc  ~/.zshrc  ~/.profile"
  echo ""
}

main
