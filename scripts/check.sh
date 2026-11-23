#!/bin/sh
# Fails the build if the page pulls anything blocked in China or grows too heavy.
set -eu
if grep -RniE 'googleapis|gstatic|google-analytics|googletagmanager|recaptcha|youtube|cdn\.|unpkg|jsdelivr' dist; then
  echo "blocked-in-China resource found"; exit 1
fi
size=$(cat dist/*.html dist/*.css dist/*.js | wc -c)
echo "html+css+js: $size bytes"
[ "$size" -lt 153600 ] || { echo "page over 150 KB budget"; exit 1; }
grep -q '<h1' dist/index.html
