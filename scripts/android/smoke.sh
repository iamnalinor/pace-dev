#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
readonly repo="$PWD"
readonly artifact_dir="$repo/.cache/android-e2e"
readonly apk="$repo/apps/app/android/app/build/outputs/apk/release/app-release.apk"
readonly app_id=dev.nalinor.pace.e2e
readonly app_api=http://10.0.2.2:8787
readonly host_api=http://127.0.0.1:8787
readonly telegram_id=844001
readonly wrangler="$repo/apps/api/node_modules/.bin/wrangler"
readonly config="$repo/apps/api/wrangler.jsonc"

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

build() {
  [[ "${EXPO_PUBLIC_API_URL:-}" == "$app_api" && "${EXPO_PUBLIC_DEV_LOGIN:-}" == 1 ]] ||
    fail "Android smoke build requires EXPO_PUBLIC_API_URL=$app_api and EXPO_PUBLIC_DEV_LOGIN=1"

  export CI=1 EXPO_NO_GIT_STATUS=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1
  mkdir -p "$artifact_dir"
  (
    # The generated project may contain a manifest from a previous build. Regenerate it.
    bun run --cwd apps/app prebuild --clean &&
      cd apps/app/android &&
      # Expo's 512 MiB metaspace default exhausted class metadata in Actions.
      # Fail immediately on JVM exhaustion instead of hanging until the job timeout.
      ./gradlew :app:assembleRelease --no-daemon \
        '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -XX:+ExitOnOutOfMemoryError' \
        -PreactNativeArchitectures=x86_64 -PPACE_STORE_FILE=
  ) 2>&1 | tee "$artifact_dir/build.log"
  [[ -f "$apk" ]] || fail "Build succeeded without the expected APK: $apk"
}

wait_for_worker() {
  local attempt
  for ((attempt = 0; attempt < 60; attempt++)); do
    kill -0 "$worker_pid" 2>/dev/null || fail "Local Worker exited during startup; see worker.log"
    if curl --disable --fail --silent --noproxy '*' --max-time 1 "$host_api/api/health" |
      bun --no-env-file -e 'process.exit((await Bun.stdin.json())?.status === "ok" ? 0 : 1)' 2>/dev/null; then
      return
    fi
    sleep 1
  done
  fail "Local Worker never became healthy at $host_api/api/health; see worker.log"
}

finish() {
  local status=$?
  if ((status != 0)); then
    printf 'Android smoke failed (exit %s); artifacts: %s\n' "$status" "$artifacts" >&2
    if [[ -n "$serial" ]]; then
      adb -s "$serial" logcat -d -t 2000 >"$artifacts/logcat.txt" 2>&1 || true
      adb -s "$serial" exec-out screencap -p >"$artifacts/failure.png" 2>/dev/null || true
    fi
  fi
  if [[ -n "$worker_pid" ]]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  rm -rf "$state_dir"
  exit "$status"
}

run() {
  local tool
  for tool in adb apkanalyzer bun curl maestro; do
    command -v "$tool" >/dev/null || fail "Android smoke requires $tool on PATH"
  done
  [[ -x "$wrangler" ]] || fail "Run bun install --frozen-lockfile before Android smoke"
  [[ -f "$apk" ]] || fail "Build the Android smoke APK first: $apk"
  [[ "$(apkanalyzer manifest application-id "$apk")" == "$app_id" ]] ||
    fail "Refusing to install an APK without the Android smoke application id: $app_id"
  # Expo Constants reads this asset in a standalone Android app. Check what Gradle
  # actually bundled before the emulator can load the app or make any network calls.
  if ! apkanalyzer files cat --file /assets/app.config "$apk" |
    bun --no-env-file -e '
      const extra = (await Bun.stdin.json())?.extra;
      const origin = process.argv[1];
      const valid = extra?.apiUrl === origin && extra?.webOrigin === origin && extra?.isDevLogin === true;
      process.exit(valid ? 0 : 1);
    ' "$app_api" 2>/dev/null; then
    fail "Android smoke APK must embed the emulator API origin and dev login flag"
  fi

  mkdir -p "$artifact_dir"
  artifacts=$(mktemp -d "$artifact_dir/run.XXXXXX")
  printf 'Android smoke artifacts: %s\n' "$artifacts"
  serial=""
  worker_pid=""
  state_dir=$(mktemp -d)
  trap finish EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  local target
  target=$(adb devices | awk '$2 == "device" { print $1 }')
  [[ "$target" =~ ^emulator-[0-9]+$ &&
    "$(adb -s "$target" shell getprop ro.kernel.qemu | tr -d '\r')" == 1 &&
    "$(adb -s "$target" shell getprop ro.product.cpu.abi | tr -d '\r')" == x86_64 &&
    "$(adb -s "$target" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]] ||
    fail "Android smoke requires one booted x86_64 emulator; physical devices are unsupported"
  serial="$target"

  # Refuse another running HTTP server on this port, even if it answers 404.
  if curl --disable --silent --noproxy '*' --max-time 1 "$host_api/" >/dev/null; then
    fail "Port 8787 already has an HTTP server; stop it before running Android smoke"
  fi

  # An explicit env file bypasses developer .dev.vars and .env files. Do not import host
  # process variables as Worker bindings. Telegram calls, if made, stay on loopback.
  export CLOUDFLARE_INCLUDE_PROCESS_ENV=false CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=true
  export WRANGLER_SEND_METRICS=false MAESTRO_CLI_NO_ANALYTICS=1
  cat >"$state_dir/worker.env" <<ENV
ENVIRONMENT=test
ALLOWED_TELEGRAM_IDS=$telegram_id
API_ORIGIN=$host_api
WEB_ORIGIN=$app_api
LLM_PROVIDER=fake
TELEGRAM_BOT_USERNAME=PaceAndroidSmokeBot
TELEGRAM_WEBHOOK_SECRET=pace-android-smoke
TELEGRAM_API_ROOT=$host_api
BOT_INFO={"id":1,"is_bot":true,"first_name":"Pace Smoke","username":"PaceAndroidSmokeBot"}
ENV
  "$wrangler" d1 migrations apply DB --local --env dev --config "$config" \
    --env-file "$state_dir/worker.env" --persist-to "$state_dir" >"$artifacts/migrations.log" 2>&1 ||
    fail "Could not apply local D1 migrations; see migrations.log"
  "$wrangler" dev --local --env dev --config "$config" --ip 127.0.0.1 --port 8787 --inspector-port 0 \
    --env-file "$state_dir/worker.env" --persist-to "$state_dir" >"$artifacts/worker.log" 2>&1 &
  worker_pid=$!
  wait_for_worker

  adb -s "$serial" install -r "$apk" | tee "$artifacts/install.log"
  maestro --device "$serial" test --env "TELEGRAM_ID=$telegram_id" \
    --format JUNIT --output "$artifacts/smoke.xml" --debug-output "$artifacts/maestro-debug" \
    --test-output-dir "$artifacts/maestro-output" e2e/android/smoke.yaml 2>&1 |
    tee "$artifacts/maestro.log"
}

case "${1:-}" in
  build) build ;;
  run) run ;;
  *) fail "Usage: bash scripts/android/smoke.sh {build|run}" ;;
esac
