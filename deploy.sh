#!/usr/bin/env bash
# Build the phone app and publish dist/ to the gh-pages branch (served by GitHub Pages).
# Run from anywhere: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

python3 build.py
remote=$(git remote get-url origin)

tmp=$(mktemp -d)
cp -R dist/. "$tmp"
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "$remote" gh-pages
cd - >/dev/null
rm -rf "$tmp"
echo "Deployed. Live in about a minute at https://agaugo.github.io/bjj-roadmap/"
