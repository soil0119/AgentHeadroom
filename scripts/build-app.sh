#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
configuration="${1:-release}"
app_dir="$project_dir/dist/CodexHeadroom.app"
binary_dir="$project_dir/.build/$configuration"

cd "$project_dir"
swift build -c "$configuration"

rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS"
cp "$binary_dir/CodexHeadroom" "$app_dir/Contents/MacOS/CodexHeadroom"
cp "$project_dir/App/Info.plist" "$app_dir/Contents/Info.plist"
codesign --force --deep --sign - "$app_dir"

printf 'Built %s\n' "$app_dir"
