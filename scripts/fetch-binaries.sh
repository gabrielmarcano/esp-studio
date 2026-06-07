#!/usr/bin/env bash
# Fetch / build the device tools bundled as Tauri sidecars.
#
# Produces, for the HOST platform's Rust target triple, under src-tauri/binaries/:
#   esptool-<triple>     Espressif's official prebuilt, signed+notarized binary (GPLv2)
#   mpy-cross-<triple>   compiled binary extracted from the mpy-cross PyPI wheel (MIT)
#   mpremote-<triple>    PyInstaller-frozen mpremote (MIT)
#
# Run this once per target platform (e.g. in a CI matrix: macos-arm64, macos-x86_64,
# linux-x86_64, windows-x86_64). It only builds for the machine it runs on.
#
# Requires: bash, curl, tar/unzip, python3 (with pip + venv), rustc.
set -euo pipefail

ESPTOOL_VERSION="v5.3.0"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/src-tauri/binaries"
mkdir -p "$OUT"

TRIPLE="$(rustc --print host-tuple 2>/dev/null || rustc -Vv | sed -n 's/^host: //p')"
echo "Host target triple: $TRIPLE"

EXE_SUFFIX=""
case "$TRIPLE" in
  *windows*) EXE_SUFFIX=".exe" ;;
esac

# Map the Rust triple → Espressif esptool release asset name.
case "$TRIPLE" in
  aarch64-apple-darwin)        ESPTOOL_ASSET="esptool-${ESPTOOL_VERSION}-macos-arm64.tar.gz" ;;
  x86_64-apple-darwin)         ESPTOOL_ASSET="esptool-${ESPTOOL_VERSION}-macos-amd64.tar.gz" ;;
  x86_64-unknown-linux-gnu)    ESPTOOL_ASSET="esptool-${ESPTOOL_VERSION}-linux-amd64.tar.gz" ;;
  aarch64-unknown-linux-gnu)   ESPTOOL_ASSET="esptool-${ESPTOOL_VERSION}-linux-aarch64.tar.gz" ;;
  armv7-unknown-linux-gnueabihf) ESPTOOL_ASSET="esptool-${ESPTOOL_VERSION}-linux-armv7.tar.gz" ;;
  x86_64-pc-windows-msvc)      ESPTOOL_ASSET="esptool-${ESPTOOL_VERSION}-windows-amd64.zip" ;;
  *) echo "Unsupported triple for esptool: $TRIPLE" >&2; exit 1 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---- esptool: download Espressif's prebuilt binary ----
echo "==> esptool $ESPTOOL_VERSION ($ESPTOOL_ASSET)"
URL="https://github.com/espressif/esptool/releases/download/${ESPTOOL_VERSION}/${ESPTOOL_ASSET}"
cd "$WORK"
curl -L --fail --retry 3 -o esptool-archive "$URL"
mkdir esptool-x
case "$ESPTOOL_ASSET" in
  *.zip)    unzip -q esptool-archive -d esptool-x ;;
  *.tar.gz) tar xzf esptool-archive -C esptool-x ;;
esac
ESPTOOL_BIN="$(find esptool-x -type f -name "esptool${EXE_SUFFIX}" | head -1)"
[ -n "$ESPTOOL_BIN" ] || { echo "esptool binary not found in archive" >&2; exit 1; }
cp "$ESPTOOL_BIN" "$OUT/esptool-${TRIPLE}${EXE_SUFFIX}"
# Keep the committed GPLv2 license text in sync with the bundled binary.
ESPTOOL_LICENSE="$(find esptool-x -type f -name LICENSE | head -1)"
[ -n "$ESPTOOL_LICENSE" ] && cp "$ESPTOOL_LICENSE" "$ROOT/licenses/esptool-GPLv2.txt"

# ---- mpy-cross: extract the compiled binary from the PyPI wheel ----
echo "==> mpy-cross (PyPI wheel)"
cd "$WORK"
python3 -m pip download mpy-cross --no-deps -d mpy-dl >/dev/null
mkdir mpy-x
unzip -q mpy-dl/mpy_cross-*.whl -d mpy-x
# wheel ships data/purelib/mpy_cross/mpy-cross (top-level = current ABI)
MPY_BIN="$(find mpy-x -path '*/mpy_cross/mpy-cross*' -not -path '*/archive/*' -type f | head -1)"
[ -n "$MPY_BIN" ] || { echo "mpy-cross binary not found in wheel" >&2; exit 1; }
cp "$MPY_BIN" "$OUT/mpy-cross-${TRIPLE}${EXE_SUFFIX}"

# ---- mpremote: freeze the pure-Python tool with PyInstaller ----
echo "==> mpremote (PyInstaller freeze)"
cd "$WORK"
python3 -m venv venv
./venv/bin/pip install -q --upgrade pip pyinstaller mpremote
printf 'from mpremote.main import main\nmain()\n' > mpremote_entry.py
./venv/bin/pyinstaller --onefile --name mpremote \
  --collect-all mpremote --collect-all serial \
  --distpath mpr-dist --workpath mpr-build --specpath mpr-spec \
  mpremote_entry.py >/dev/null
cp "mpr-dist/mpremote${EXE_SUFFIX}" "$OUT/mpremote-${TRIPLE}${EXE_SUFFIX}"

chmod +x "$OUT"/esptool-* "$OUT"/mpy-cross-* "$OUT"/mpremote-* 2>/dev/null || true

# Record the bundled versions so the app can show them without launching the
# (slow-starting) binaries at runtime. See commands::tool_versions.
ESPTOOL_V="$("$OUT/esptool-${TRIPLE}${EXE_SUFFIX}" version 2>/dev/null | head -1)"
MPREMOTE_V="$("$OUT/mpremote-${TRIPLE}${EXE_SUFFIX}" --version 2>/dev/null | head -1)"
MPYCROSS_V="$("$OUT/mpy-cross-${TRIPLE}${EXE_SUFFIX}" --version 2>/dev/null | head -1)"
python3 - "$ESPTOOL_V" "$MPREMOTE_V" "$MPYCROSS_V" > "$ROOT/src-tauri/versions.json" <<'PY'
import json, sys
print(json.dumps({"esptool": sys.argv[1], "mpremote": sys.argv[2], "mpy_cross": sys.argv[3]}, indent=2))
PY
echo "Wrote src-tauri/versions.json"

echo
echo "Done. Sidecars for $TRIPLE:"
ls -lh "$OUT" | grep -- "-${TRIPLE}"
echo
echo "NOTE: on macOS each bundled binary must be code-signed + notarized as part of"
echo "      the app's notarization. esptool ships already-signed; mpremote/mpy-cross"
echo "      are signed by your app's signing identity during 'tauri build'."
