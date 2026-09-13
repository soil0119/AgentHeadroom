#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
version="${1:-0.1.0}"
archive="$project_dir/dist/CodexHeadroom-v$version-macOS-arm64.zip"

"$project_dir/scripts/build-app.sh" release
rm -f "$archive" "$archive.sha256"
ditto -c -k --sequesterRsrc --keepParent "$project_dir/dist/CodexHeadroom.app" "$archive"
(cd "$project_dir/dist" && shasum -a 256 "${archive:t}") > "$archive.sha256"

printf 'Packaged %s\n' "$archive"
