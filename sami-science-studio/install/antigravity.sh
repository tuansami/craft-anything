#!/bin/sh
# Install the studio's skills for Google Antigravity.
#   sh install/antigravity.sh <workspace folder>     skills for one workspace (<workspace>/.agents/skills)
#   sh install/antigravity.sh --global               skills for every workspace (~/.gemini/config/skills)
# The skills are copied with the studio's own folder written in, because Antigravity does not fill in
# ${CLAUDE_PLUGIN_ROOT}. Run it again after updating the studio.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
case "${1:-}" in
  "") echo "usage: sh install/antigravity.sh <workspace folder> | --global" >&2; exit 2 ;;
  --global) DEST="$HOME/.gemini/config/skills" ;;
  *) [ -d "$1" ] || { echo "no such folder: $1" >&2; exit 1; }; DEST="$(cd "$1" && pwd)/.agents/skills" ;;
esac
mkdir -p "$DEST"
for skill in "$ROOT"/skills/*/; do
  name=$(basename "$skill")
  rm -rf "$DEST/$name"
  cp -R "$skill" "$DEST/$name"
  find "$DEST/$name" -name '*.md' | while IFS= read -r f; do
    # | is the sed delimiter: a path cannot contain it on the systems this targets.
    sed "s|\${CLAUDE_PLUGIN_ROOT}|$ROOT|g" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  done
  echo "installed $name -> $DEST/$name"
done
echo "Studio root: $ROOT"
echo "Antigravity has no sub-agents: the science-video skill runs the roles in order in one conversation."
