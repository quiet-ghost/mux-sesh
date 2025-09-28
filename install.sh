#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REPO_URL="https://github.com/quiet-ghost/mux-sesh"
BINARY_NAME="mux-sesh"
INSTALL_DIR="$HOME/.local/bin"

echo -e "${BLUE}🚀 Installing Mux-Sesh...${NC}"

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

if ! command -v go &>/dev/null; then
	echo -e "${RED}❌ Go is not installed. Please install Go 1.19 or later.${NC}"
	exit 1
fi

if ! command -v tmux &>/dev/null; then
	echo -e "${RED}❌ tmux is not installed. Please install tmux.${NC}"
	exit 1
fi

if ! command -v git &>/dev/null; then
	echo -e "${RED}❌ git is not installed. Please install git.${NC}"
	exit 1
fi

echo -e "${GREEN}✅ All prerequisites found${NC}"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo -e "${YELLOW}📥 Downloading source code...${NC}"
git clone "$REPO_URL" .

echo -e "${YELLOW}🔨 Building binary...${NC}"
go build -o "$BINARY_NAME" main.go config.go

echo -e "${YELLOW}📦 Installing to $INSTALL_DIR...${NC}"
mv "$BINARY_NAME" "$INSTALL_DIR/"

chmod +x "$INSTALL_DIR/$BINARY_NAME"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✅ Installation complete!${NC}"
echo ""
echo -e "${BLUE}📖 Usage:${NC}"
echo "  $BINARY_NAME"
echo ""
echo -e "${BLUE}💡 Add an alias to your shell config:${NC}"
echo "  alias tmp='$BINARY_NAME'"
echo ""
echo -e "${BLUE}⌨️  Optional keyboard shortcut (zsh):${NC}"
echo "  bindkey -s '^[s' '$BINARY_NAME\\n'  # Alt+s"
echo ""

# ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
	echo -e "${YELLOW}⚠️  Warning: $INSTALL_DIR is not in your PATH${NC}"
	echo -e "${YELLOW}   Add this to your shell config:${NC}"
	echo "   export PATH=\"$INSTALL_DIR:\$PATH\""
	echo ""
fi

echo -e "${GREEN}🎉 Ready to use! Run '$BINARY_NAME' to get started.${NC}"
