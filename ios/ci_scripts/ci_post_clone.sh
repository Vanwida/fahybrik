#!/bin/bash
# Xcode Cloud post-clone: regenerate gitignored xcodegen artifacts.
#
# project.yml is the source of truth for app / watch / widgets Info.plist.
# Generated-Info.plist files are gitignored (ios/.gitignore). A clean clone
# (including Xcode Cloud) has none until xcodegen runs — Archive fails with
# "Build input file cannot be found: .../Generated-Info.plist".
#
# Apple requires ci_scripts/ beside the .xcodeproj (ios/ci_scripts/, not repo root).

set -euo pipefail

# Default CWD when Xcode Cloud invokes this script is ios/ci_scripts/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo ">>> ci_post_clone: ios dir = ${IOS_DIR}"
cd "${IOS_DIR}"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo ">>> ci_post_clone: installing XcodeGen via Homebrew"
  HOMEBREW_NO_AUTO_UPDATE=1 brew install xcodegen
fi

echo ">>> ci_post_clone: xcodegen generate"
xcodegen generate

REQUIRED=(
  "FAHYBRIK/Generated-Info.plist"
  "FAHYBRIKWatch/Generated-Info.plist"
  "FAHYBRIKWidgets/Generated-Info.plist"
)

for plist in "${REQUIRED[@]}"; do
  if [[ ! -f "${plist}" ]]; then
    echo "error: missing ${plist} after xcodegen generate" >&2
    exit 1
  fi
  echo ">>> ci_post_clone: verified ${plist}"
done

echo ">>> ci_post_clone: done"
