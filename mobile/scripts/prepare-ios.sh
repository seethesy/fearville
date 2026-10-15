#!/bin/sh
# Xcode runs this before Copy Bundle Resources. Inputs remain owned by cap sync;
# every configuration gets its own derived config and offline Retry destination.
set -eu
case "$CONFIGURATION:$FEARVILLE_HOST" in
  Debug:staging.fearville.app|Staging:staging.fearville.app|Release:fearville.app) ;;
  *) echo 'error: Invalid Fearville build configuration/host.' >&2; exit 1 ;;
esac
if [ -z "${PRODUCT_BUNDLE_IDENTIFIER:-}" ]; then
  echo 'error: Set the registered bundle IDs from FEAR-115 in Config/Identity.xcconfig.' >&2
  exit 1
fi
if [ "${CODE_SIGNING_ALLOWED:-YES}" != NO ] && [ -z "${DEVELOPMENT_TEAM:-}" ]; then
  echo 'error: Set the Apple Team ID from FEAR-115 in Config/Identity.xcconfig.' >&2
  exit 1
fi
source_dir="$SRCROOT/App"
bundle_dir="$DERIVED_FILE_DIR/Fearville"
mkdir -p "$bundle_dir/public"
cp "$source_dir/capacitor.config.json" "$bundle_dir/capacitor.config.json"
cp -R "$source_dir/public/." "$bundle_dir/public/"
/usr/bin/plutil -replace server.url -string "https://$FEARVILLE_HOST" "$bundle_dir/capacitor.config.json"
/usr/bin/plutil -replace appId -string "$PRODUCT_BUNDLE_IDENTIFIER" "$bundle_dir/capacitor.config.json"
/usr/bin/plutil -replace appName -string "$FEARVILLE_DISPLAY_NAME" "$bundle_dir/capacitor.config.json"
debug=false
[ "$CONFIGURATION" != Debug ] || debug=true
/usr/bin/plutil -replace ios.webContentsDebuggingEnabled -bool "$debug" "$bundle_dir/capacitor.config.json"
/usr/bin/plutil -convert json "$bundle_dir/capacitor.config.json"
printf 'window.FEARVILLE_SITE = "https://%s/";\n' "$FEARVILLE_HOST" > "$bundle_dir/public/site.js"
