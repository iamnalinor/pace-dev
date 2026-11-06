#!/usr/bin/env bash
# Pure Kotlin/JVM tests: no Android SDK, emulator, Firebase service or app process.
set -euo pipefail

PACE_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACE_JVM_TOOLS="${PACE_JVM_TEST_TOOLS:-$PACE_REPO/.cache/native-jvm}"
mkdir -p "$PACE_JVM_TOOLS"

download_verified() {
  local name="$1" url="$2" digest="$3"
  if [ -f "$PACE_JVM_TOOLS/$name" ] && printf '%s  %s\n' "$digest" "$PACE_JVM_TOOLS/$name" | sha256sum --check --status; then
    return
  fi
  curl --fail --location --retry 2 "$url" --output "$PACE_JVM_TOOLS/$name"
  printf '%s  %s\n' "$digest" "$PACE_JVM_TOOLS/$name" | sha256sum --check
}

download_verified kotlin.zip \
  https://github.com/JetBrains/kotlin/releases/download/v2.4.21/kotlin-compiler-2.4.21.zip \
  7cc140e76daf416a0424a5557f99afd7ca89ebd463ea1101261e3e01c33e75cd
download_verified junit.jar \
  https://repo.maven.apache.org/maven2/junit/junit/4.13.2/junit-4.13.2.jar \
  8e495b634469d64fb8acfa3495a065cbacc8a0fff55ce1e31007be4c16dc57d3
download_verified hamcrest.jar \
  https://repo.maven.apache.org/maven2/org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar \
  66fdef91e9739348df7a096aa384a5685f4e875584cce89386a7a47251c4d8e9
unzip -q -o "$PACE_JVM_TOOLS/kotlin.zip" -d "$PACE_JVM_TOOLS"

PACE_TEST_OUTPUT="$(mktemp -d)"
trap 'rm -rf "$PACE_TEST_OUTPUT"' EXIT
PACE_NATIVE_SOURCE="$PACE_REPO/apps/app/modules/pace-native/android/src"
PACE_TEST_CLASSPATH="$PACE_JVM_TOOLS/junit.jar:$PACE_JVM_TOOLS/hamcrest.jar"
bash "$PACE_JVM_TOOLS/kotlinc/bin/kotlinc" \
  "$PACE_NATIVE_SOURCE/main/java/expo/modules/pacenative/FirebaseController.kt" \
  "$PACE_NATIVE_SOURCE/test/java/expo/modules/pacenative/FirebaseControllerTest.kt" \
  -jvm-target 17 -cp "$PACE_TEST_CLASSPATH" -include-runtime -d "$PACE_TEST_OUTPUT/tests.jar"
java -cp "$PACE_TEST_OUTPUT/tests.jar:$PACE_TEST_CLASSPATH" \
  org.junit.runner.JUnitCore expo.modules.pacenative.FirebaseControllerTest
