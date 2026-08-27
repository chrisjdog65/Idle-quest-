#!/usr/bin/env bash
# Concatenate the src/ parts into the single-file deliverable: index.html
set -euo pipefail
cd "$(dirname "$0")"
out=index.html
: > "$out"
for f in src/00_head.html \
         src/01_core.js src/02_audio.js src/03_content.js src/04_world.js \
         src/05_gfx.js src/06_scene.js src/07_game.js src/08_meta.js \
         src/09_ui.js src/09b_panels.js src/10_auto.js src/11_main.js \
         src/99_tail.html; do
  cat "$f" >> "$out"
  printf '\n' >> "$out"
done
bytes=$(wc -c < "$out")
printf 'built %s (%s bytes, %s KB)\n' "$out" "$bytes" "$((bytes/1024))"
