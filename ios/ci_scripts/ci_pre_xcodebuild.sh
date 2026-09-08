#!/bin/bash
# Xcode Cloud pre-xcodebuild: stamp CFBundleVersion from project.yml before archive.
#
# Manage Version OFF (preferred): archived IPA carries CURRENT_PROJECT_VERSION.
# Manage Version ON: Apple rewrites CFBundleVersion at export to CI_BUILD_NUMBER —
# this script cannot override export. See docs/app-store/testflight-checklist.md §4.

set -euo pipefail

if [[ "${CI_XCODEBUILD_ACTION:-}" != "archive" ]]; then
  echo ">>> ci_pre_xcodebuild: skip (CI_XCODEBUILD_ACTION=${CI_XCODEBUILD_ACTION:-unset})"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${IOS_DIR}"

REPO_BUILD="$(grep -E '^[[:space:]]*CURRENT_PROJECT_VERSION:' project.yml | head -1 | sed -E 's/.*:[[:space:]]*//; s/"//g; s/^[[:space:]]+//; s/[[:space:]]+$//')"

if [[ ! "${REPO_BUILD}" =~ ^[0-9]+$ ]]; then
  echo "error: invalid CURRENT_PROJECT_VERSION in project.yml: '${REPO_BUILD}'" >&2
  exit 1
fi

echo ">>> ci_pre_xcodebuild: repo CURRENT_PROJECT_VERSION=${REPO_BUILD}"
echo ">>> ci_pre_xcodebuild: CI_BUILD_NUMBER=${CI_BUILD_NUMBER:-unset}"

PBXPROJ="FAHYBRIK.xcodeproj/project.pbxproj"
if [[ -f "${PBXPROJ}" ]]; then
  sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${REPO_BUILD};/g" "${PBXPROJ}"
  echo ">>> ci_pre_xcodebuild: synced ${PBXPROJ}"
fi

PLISTS=(
  "FAHYBRIK/Generated-Info.plist"
  "FAHYBRIKWatch/Generated-Info.plist"
  "FAHYBRIKWidgets/Generated-Info.plist"
)

for plist in "${PLISTS[@]}"; do
  if [[ ! -f "${plist}" ]]; then
    echo "error: missing ${plist} (ci_post_clone should have run xcodegen)" >&2
    exit 1
  fi
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${REPO_BUILD}" "${plist}"
  echo ">>> ci_pre_xcodebuild: ${plist} CFBundleVersion=${REPO_BUILD}"
done

if xcrun agvtool what-version -terse >/dev/null 2>&1; then
  xcrun agvtool new-version -all "${REPO_BUILD}" >/dev/null
  echo ">>> ci_pre_xcodebuild: agvtool new-version -all ${REPO_BUILD}"
fi

if [[ -n "${CI_BUILD_NUMBER:-}" ]] && [[ "${CI_BUILD_NUMBER}" -lt "${REPO_BUILD}" ]]; then
  echo ">>> ci_pre_xcodebuild: WARNING — ASC Manage Version ON exports CI_BUILD_NUMBER (${CI_BUILD_NUMBER}), not repo ${REPO_BUILD}."
  echo ">>> ci_pre_xcodebuild: Turn OFF Manage Version (testflight-checklist §4) or set Next Build Number > latest TestFlight."
fi

echo ">>> ci_pre_xcodebuild: done"
