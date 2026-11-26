#!/usr/bin/env bash
# Turn this template into a new package:  ./init.sh my-package "One-line description"
# Renames everything, checks the npm name, builds and tests. Deletes itself when done.
set -euo pipefail

name="${1:-}"; desc="${2:-}"
if [[ ! "$name" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]] || [[ -z "$desc" ]]; then
  echo 'usage: ./init.sh my-package "One-line description"  (lowercase letters, digits, dashes)' >&2
  exit 1
fi
snake="${name//-/_}"
env="$(echo "$snake" | tr '[:lower:]' '[:upper:]')"

# npm rejects names that match an existing package once dashes/dots/underscores are removed
# (html-kit was refused because "htmlkit" exists), so check both spellings.
for candidate in "$name" "${name//-/}"; do
  if npm view "$candidate" name >/dev/null 2>&1; then
    echo "npm name problem: '$candidate' already exists, so npm will refuse '$name'. Pick another name." >&2
    exit 1
  fi
done

files=$(git ls-files 2>/dev/null || find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -not -path './target/*')
for f in $files; do
  [[ "$f" == "./init.sh" || "$f" == "init.sh" ]] && continue
  [[ -f "$f" ]] || continue
  grep -qE 'template-pkg|template_pkg|TEMPLATE_PKG|TEMPLATE_DESCRIPTION' "$f" || continue
  # Escape characters that are special in sed replacements (\, & and the | delimiter).
  esc_desc=$(printf '%s' "$desc" | sed -e 's/[\\&|]/\\&/g')
  sed -i.bak -e "s|template-pkg|$name|g" -e "s|template_pkg|$snake|g" -e "s|TEMPLATE_PKG|$env|g" -e "s|TEMPLATE_DESCRIPTION|$esc_desc|g" "$f"
  rm -f "$f.bak"
done

rm -f init.sh
npm install
npm run build
cp index.d.ts index.d.cts
npm test
echo
echo "✅ $name is ready. Next: write src/lib.rs, lib/api.js and index.d.ts (then: cp index.d.ts index.d.cts)."
