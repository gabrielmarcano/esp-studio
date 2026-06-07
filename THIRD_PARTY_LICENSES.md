# Third-party tools bundled with esp-studio

esp-studio bundles the following device tools as sidecar executables and invokes
them as separate processes. They are not modified and are not linked into the
application. Each is redistributed under its own license.

## esptool — GPLv2-or-later

- Copyright © Espressif Systems (Shanghai) Co., Ltd.
- License: GNU General Public License v2 or later. Full text: [`licenses/esptool-GPLv2.txt`](./licenses/esptool-GPLv2.txt).
- Source code: https://github.com/espressif/esptool (we ship the unmodified
  official release binary, currently **v5.3.0**, from that project's GitHub Releases).
- **GPLv2 obligation:** because we redistribute esptool, we must provide the
  corresponding source. We satisfy this with the upstream source link above; the
  bundled binary is the unmodified upstream release for the matching tag.

## mpremote — MIT

- Copyright © 2019-2022 Damien P. George and contributors.
- License: MIT (part of MicroPython).
- Source: https://github.com/micropython/micropython (`tools/mpremote`).
- We bundle a PyInstaller-frozen build of the unmodified PyPI package.

## mpy-cross — MIT

- Part of MicroPython; License: MIT.
- Source: https://github.com/micropython/micropython (`mpy-cross`).
- We bundle the compiled binary from the `mpy-cross` PyPI wheel. The `.mpy` ABI
  version must match the firmware flashed to the device.

---

The bundled binaries are produced by [`scripts/fetch-binaries.sh`](./scripts/fetch-binaries.sh).
