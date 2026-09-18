#!/bin/bash
#
# Fetches Apple's own Node installer and opens it.
#
# Magic Wand needs Node and there is no honest way to install it silently —
# it writes into /usr/local, which needs your password. So this does the two
# steps that are easy to get wrong (which version, which chip) and hands the
# rest to Apple's installer, where you just click Continue.
#
# The package comes from nodejs.org over https, signed by the Node project
# and checked by macOS before it will run. Nothing here bypasses that.

set -u
say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

printf "\033]0;Install Node\007"
say "Installing Node for Magic Wand"

# Already there? Then the problem was never Node — it was the old folder in
# Downloads, which didn't know to look in the two places it installs to.
for c in /usr/local/bin /opt/homebrew/bin; do [ -x "$c/node" ] && PATH="$c:$PATH"; done
if command -v node >/dev/null 2>&1; then
  say "Node is already installed: $(node -v)"
  echo "So you don't need this. Open Magic Wand — the new one, in Applications."
  echo "The old folder in Downloads doesn't look in the right place."
  echo
  echo "Press any key to close."; read -r -n 1; exit 0
fi

say "Finding the current long-term-support version..."
# The LTS builds are the ones with a codename; everything else is a preview.
INFO=$(curl -fsSL --max-time 30 "https://nodejs.org/dist/index.json") || die "Couldn't reach nodejs.org."
VERSION=$(echo "$INFO" | tr '}' '\n' | grep '"lts":"[A-Za-z]' | head -1 | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
[ -n "$VERSION" ] || die "Couldn't work out which version to get. Install it by hand from https://nodejs.org"

# Apple Silicon and Intel take different packages, and the wrong one fails
# halfway through with a message that explains nothing.
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  *)     ARCH="x64" ;;
esac
PKG="node-${VERSION}-${ARCH}.pkg"
URL="https://nodejs.org/dist/${VERSION}/${PKG}"
DEST="$HOME/Downloads/$PKG"

say "Downloading $VERSION for $ARCH..."
curl -fL --progress-bar --max-time 300 "$URL" -o "$DEST" || die "Download failed. Check your connection."
[ -s "$DEST" ] || die "The download came back empty."

say "Opening Apple's installer."
echo "Click Continue, Continue, Agree, Install, enter your password, Close."
echo
echo "When it's finished, open Magic Wand."
sleep 1
open "$DEST"

echo
echo "Press any key to close this window."
read -r -n 1
