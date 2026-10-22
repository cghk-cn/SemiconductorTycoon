#!/bin/bash
# =============================================================================
#  Semiconductor Tycoon - One-Click APK Build
# =============================================================================
#  Usage:
#    ./scripts/build-apk.sh            # Debug APK -> Desktop
#    ./scripts/build-apk.sh release    # Release APK (unsigned) -> Desktop
#
#  Prerequisites (auto-detected / auto-installed where possible):
#    - Node.js 18+
#    - JDK 21 (Capacitor 7 requirement)
#    - Android SDK (platform 36, build-tools 36.0.0, platform-tools)
# =============================================================================
set -euo pipefail

BUILD_TYPE="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$CLIENT_DIR/android"
SDK_DIR="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"

# --- colors -----------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step() { echo -e "${CYAN}==>${NC} $1"; }
ok()   { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
die()  { echo -e "${RED}✘ $1${NC}"; exit 1; }

echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN} Semiconductor Tycoon - APK Build (${BUILD_TYPE})${NC}"
echo -e "${CYAN}=============================================${NC}"

# --- 1. locate JDK 21 --------------------------------------------------------
step "Locating JDK 21..."
JAVA_HOME_CANDIDATES=(
  "${JAVA_HOME:-}"
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home"
)
FOUND_JAVA=""
for c in "${JAVA_HOME_CANDIDATES[@]}"; do
  if [ -n "$c" ] && [ -x "$c/bin/javac" ]; then
    if "$c/bin/java" -version 2>&1 | grep -qE '"21\.'; then FOUND_JAVA="$c"; break; fi
  fi
done
if [ -z "$FOUND_JAVA" ]; then
  if command -v brew >/dev/null 2>&1; then
    warn "JDK 21 not found - installing via Homebrew..."
    brew install openjdk@21
    FOUND_JAVA="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  else
    die "JDK 21 required. Install it: brew install openjdk@21"
  fi
fi
export JAVA_HOME="$FOUND_JAVA"
export PATH="$JAVA_HOME/bin:$PATH"
ok "JDK: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# --- 2. locate / install Android SDK -----------------------------------------
step "Locating Android SDK..."
if [ ! -d "$SDK_DIR/cmdline-tools/latest/bin" ]; then
  warn "Android cmdline-tools missing - downloading..."
  mkdir -p "$SDK_DIR/cmdline-tools"
  TMP_ZIP="$(mktemp -t cmdtools).zip"
  curl -sL -o "$TMP_ZIP" https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip
  TMP_DIR="$(mktemp -d)"
  unzip -q "$TMP_ZIP" -d "$TMP_DIR"
  mkdir -p "$SDK_DIR/cmdline-tools/latest"
  cp -R "$TMP_DIR/cmdline-tools/." "$SDK_DIR/cmdline-tools/latest/"
  rm -rf "$TMP_ZIP" "$TMP_DIR"
fi
SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"

step "Accepting SDK licenses..."
yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true

step "Installing required SDK packages..."
"$SDKMANAGER" --install 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' >/dev/null 2>&1 || true
ok "SDK packages ready: $SDK_DIR"

# --- 3. local.properties -----------------------------------------------------
step "Writing android/local.properties..."
echo "sdk.dir=$SDK_DIR" > "$ANDROID_DIR/local.properties"
ok "local.properties written"

# --- 4. pin Gradle to the correct JDK ---------------------------------------
step "Pinning Gradle JDK in gradle.properties..."
if grep -q '^org.gradle.java.home=' "$ANDROID_DIR/gradle.properties"; then
  sed -i '' "s|^org.gradle.java.home=.*|org.gradle.java.home=$JAVA_HOME|" "$ANDROID_DIR/gradle.properties"
else
  printf '\norg.gradle.java.home=%s\n' "$JAVA_HOME" >> "$ANDROID_DIR/gradle.properties"
fi
ok "org.gradle.java.home=$JAVA_HOME"

# --- 5. install npm deps ----------------------------------------------------
step "Installing npm dependencies..."
cd "$CLIENT_DIR"
[ -d node_modules ] || npm install
ok "Dependencies ready"

# --- 6. build web assets -----------------------------------------------------
step "Building web assets (vite -> www/)..."
npm run build
ok "www/ generated"

# --- 7. sync capacitor -------------------------------------------------------
step "Syncing assets to Android project..."
npx cap sync android
ok "Assets synced"

# --- 8. gradle assemble ------------------------------------------------------
if [ "$BUILD_TYPE" = "release" ]; then
  GRADLE_TASK="assembleRelease"
  OUT_NAME="SemiconductorTycoon-release-unsigned.apk"
else
  GRADLE_TASK="assembleDebug"
  OUT_NAME="SemiconductorTycoon-debug.apk"
fi

step "Building APK (./gradlew $GRADLE_TASK)..."
cd "$ANDROID_DIR"
chmod +x gradlew
./gradlew "$GRADLE_TASK" --no-daemon

# --- 9. collect output -------------------------------------------------------
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/$( [ "$BUILD_TYPE" = "release" ] && echo release || echo debug )/$( [ "$BUILD_TYPE" = "release" ] && echo app-release-unsigned.apk || echo app-debug.apk )"
[ -f "$APK_PATH" ] || die "APK not produced at $APK_PATH"

DESKTOP_APK="$HOME/Desktop/$OUT_NAME"
cp "$APK_PATH" "$DESKTOP_APK"

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN} BUILD SUCCESSFUL${NC}"
echo -e "${GREEN}=============================================${NC}"
echo "  APK path : $APK_PATH"
echo "  Copied to: $DESKTOP_APK"
echo "  Size     : $(du -h "$DESKTOP_APK" | cut -f1)"
echo ""
echo "  Install via USB:  adb install -r \"$DESKTOP_APK\""
echo "  Run on device   :  cd $CLIENT_DIR && npx cap run android"
echo ""
