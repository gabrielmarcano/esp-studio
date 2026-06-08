// esp-studio backend: thin wrappers around the user's existing CLIs
// (mpremote, mpy-cross via python, esptool) plus local filesystem + project scaffolding.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// ---------- helpers ----------

/// Run a command, returning stdout on success or a combined error string on failure.
fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("failed to launch `{program}`: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!(
            "`{program}` exited with {}\nstdout:\n{stdout}\nstderr:\n{stderr}",
            output.status
        ))
    }
}

/// Strip ANSI escape sequences (colour + cursor codes) that tools like esptool
/// emit even when piped, so the streamed console stays clean.
fn strip_ansi(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\u{1b}' {
            // ESC [ <params> <final byte 0x40..=0x7e> (CSI), else just drop ESC.
            if i + 1 < chars.len() && chars[i + 1] == '[' {
                i += 2;
                while i < chars.len() && !('\u{40}'..='\u{7e}').contains(&chars[i]) {
                    i += 1;
                }
                i += 1; // skip the final byte
            } else {
                i += 1;
            }
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Run a command, streaming each stdout/stderr line to the frontend as `event`
/// so long operations (esp. flashing) show live progress instead of going dark.
/// Returns Ok on success, Err on a non-zero exit.
fn run_streamed(app: &AppHandle, event: &str, program: &str, args: &[&str]) -> Result<(), String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to launch `{program}`: {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Read stderr on its own thread so both streams flow concurrently.
    let app_err = app.clone();
    let ev_err = event.to_string();
    let err_handle = std::thread::spawn(move || {
        if let Some(s) = stderr {
            for line in BufReader::new(s).lines().map_while(Result::ok) {
                let _ = app_err.emit(&ev_err, strip_ansi(&line));
            }
        }
    });

    if let Some(s) = stdout {
        for line in BufReader::new(s).lines().map_while(Result::ok) {
            let _ = app.emit(event, strip_ansi(&line));
        }
    }
    let _ = err_handle.join();

    let status = child.wait().map_err(|e| format!("wait failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("`{program}` exited with {status}"))
    }
}

/// Like `run`, but kills the child after `secs` and returns an error.
/// Used for device probes that could otherwise hang on a board that holds the
/// serial line but doesn't speak the MicroPython REPL. Output is expected to be
/// small (a few KB), so polling try_wait without draining pipes won't deadlock.
fn run_timeout(program: &str, args: &[&str], secs: u64) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to launch `{program}`: {e}"))?;

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = String::new();
                let mut stderr = String::new();
                if let Some(mut o) = child.stdout.take() {
                    let _ = o.read_to_string(&mut stdout);
                }
                if let Some(mut e) = child.stderr.take() {
                    let _ = e.read_to_string(&mut stderr);
                }
                if status.success() {
                    return Ok(stdout);
                }
                return Err(format!("`{program}` exited with {status}\n{stdout}\n{stderr}"));
            }
            Ok(None) => {
                if start.elapsed() > Duration::from_secs(secs) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("`{program}` timed out after {secs}s"));
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("wait failed: {e}")),
        }
    }
}

/// Resolve a device tool to an executable path.
///
/// A non-empty `override_path` (set by the user in Settings) always wins — it
/// lets power users point at a system install. Otherwise we use the binary we
/// bundle as a Tauri sidecar:
///   - production: it sits next to the app executable (Tauri strips the triple);
///   - dev: it lives in `src-tauri/binaries/<name>-<triple>`.
/// Falls back to the bare name (PATH lookup) if neither is found.
fn tool_path(override_path: &str, name: &str) -> String {
    let o = override_path.trim();
    if !o.is_empty() {
        return o.to_string();
    }

    let exe_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };

    // Next to the app executable (production bundle).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join(&exe_name);
            if p.exists() {
                return p.to_string_lossy().into_owned();
            }
        }
    }

    // Dev: the un-stripped sidecar in the source tree.
    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("{name}-{}", env!("BUILD_TARGET_TRIPLE")));
    let dev = if cfg!(windows) { dev.with_extension("exe") } else { dev };
    if dev.exists() {
        return dev.to_string_lossy().into_owned();
    }

    name.to_string()
}

// ---------- local filesystem ----------

#[derive(Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

const IGNORED: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "out",
    "__pycache__",
    ".venv",
    "venv",
    ".DS_Store",
];

fn build_tree(dir: &Path) -> Vec<FileNode> {
    let mut entries: Vec<_> = match fs::read_dir(dir) {
        Ok(rd) => rd.flatten().collect(),
        Err(_) => return vec![],
    };
    // dirs first, then files; each alphabetical
    entries.sort_by_key(|e| {
        let is_dir = e.path().is_dir();
        let name = e.file_name().to_string_lossy().to_lowercase();
        (!is_dir, name)
    });

    entries
        .into_iter()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            !IGNORED.contains(&name.as_str())
        })
        .map(|e| {
            let path = e.path();
            let is_dir = path.is_dir();
            FileNode {
                name: e.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                is_dir,
                children: if is_dir {
                    Some(build_tree(&path))
                } else {
                    None
                },
            }
        })
        .collect()
}

#[tauri::command]
pub async fn read_dir(path: String) -> Result<Vec<FileNode>, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    Ok(build_tree(&p))
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("write {path}: {e}"))
}

// ---------- device: mpremote ----------

#[derive(Serialize)]
pub struct PortInfo {
    port: String,
    description: String,
    likely_esp: bool,
}

// USB-serial bridge chips commonly found on ESP32/ESP8266 boards (USB vendor IDs).
const ESP_USB_VIDS: &[&str] = &[
    "10c4", // Silicon Labs CP210x
    "1a86", // QinHeng CH340 / CH9102
    "0403", // FTDI
    "303a", // Espressif (native USB serial/JTAG, e.g. S3/C3)
    "067b", // Prolific PL2303
];

// Port-name fragments that indicate a real USB-serial adapter across platforms.
const USB_NAME_HINTS: &[&str] = &[
    "usbserial",
    "usbmodem",
    "slab_usbtouart",
    "wchusbserial",
    "ttyusb",
    "ttyacm",
];

/// Parse one `mpremote connect list` line:
///   "<port> <serial> <vid:pid> <manufacturer> <product>"
/// Returns `None` for virtual ports (Bluetooth, debug-console, etc.) so the UI
/// only shows actual USB-serial adapters.
fn parse_port_line(line: &str) -> Option<PortInfo> {
    let mut parts = line.split_whitespace();
    let port = parts.next()?.to_string();
    let _serial = parts.next().unwrap_or("");
    let vidpid = parts.next().unwrap_or("").to_lowercase();
    let rest = parts.collect::<Vec<_>>().join(" ");

    let real_usb = vidpid.contains(':') && vidpid != "0000:0000";
    let name_usb = {
        let p = port.to_lowercase();
        USB_NAME_HINTS.iter().any(|h| p.contains(h))
    };
    if !real_usb && !name_usb {
        return None; // Bluetooth headphones, debug-console, virtual ports → skip
    }

    let vid = vidpid.split(':').next().unwrap_or("");
    let likely_esp = ESP_USB_VIDS.contains(&vid);

    // Prefer the human-readable manufacturer/product; fall back to the vid:pid.
    let description = if rest.is_empty() || rest == "None None" {
        vidpid
    } else {
        rest
    };

    Some(PortInfo {
        port,
        description,
        likely_esp,
    })
}

/// `mpremote connect list` → USB-serial ports only, ESP-likely boards first.
#[tauri::command]
pub async fn list_ports(mpremote: String) -> Result<Vec<PortInfo>, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let out = run(&mpremote, &["connect", "list"])?;
    let mut ports: Vec<PortInfo> = out
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(parse_port_line)
        .collect();
    // ESP-likely ports first so the UI can default to the most probable board.
    ports.sort_by_key(|p| !p.likely_esp);
    Ok(ports)
}

// Snapshot the device filesystem in ONE round-trip: the tree plus the contents
// of small text files, so the UI can open them instantly (read-only) without a
// serial round-trip per file. Binary/non-text files are flagged not-readable;
// oversized text files are listed without content (the UI lazy-reads on demand).
const WALK_SCRIPT: &str = r#"
import os, json
TEXT = ('.py', '.txt', '.json', '.md', '.cfg', '.csv', '.html', '.htm', '.js', '.css', '.toml', '.ini', '.yaml', '.yml', '.env', '.sh')
MAX = 65536
def istext(name):
    low = name.lower()
    for ext in TEXT:
        if low.endswith(ext):
            return True
    return False
def filenode(name, full):
    node = {"name": name, "path": full, "is_dir": False, "readable": istext(name)}
    if node["readable"]:
        try:
            if os.stat(full)[6] <= MAX:
                with open(full) as f:
                    node["content"] = f.read()
        except Exception:
            pass
    return node
def walk(p):
    out = []
    try:
        items = list(os.ilistdir(p))
    except OSError:
        return out
    for e in items:
        name = e[0]; typ = e[1]
        full = (p + '/' + name) if p != '/' else '/' + name
        if typ & 0x4000:
            out.append({"name": name, "path": full, "is_dir": True, "children": walk(full)})
        else:
            out.append(filenode(name, full))
    return out
print(json.dumps(walk('/')))
"#;

/// Snapshot the device filesystem (tree + small text-file contents) via a single
/// `mpremote exec` round-trip. Returns the raw JSON string (frontend parses it).
#[tauri::command]
pub async fn device_tree(mpremote: String, port: String) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let out = run(&mpremote, &["connect", &port, "exec", WALK_SCRIPT])?;
    Ok(out.trim().to_string())
}

/// Read a file off the device: `mpremote connect <port> fs cat :<path>`.
#[tauri::command]
pub async fn device_read(mpremote: String, port: String, path: String) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let remote = format!(":{}", path.trim_start_matches(':'));
    run(&mpremote, &["connect", &port, "fs", "cat", &remote])
}

/// Upload a single local file to the device root (or a remote path).
/// `mpremote connect <port> fs cp <local> :<remote>`
#[tauri::command]
pub async fn upload_file(
    mpremote: String,
    port: String,
    local: String,
    remote: Option<String>,
) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let remote_name = match remote {
        Some(r) if !r.is_empty() => r,
        _ => Path::new(&local)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .ok_or_else(|| "invalid local path".to_string())?,
    };
    let dest = format!(":{}", remote_name.trim_start_matches(':'));
    run(&mpremote, &["connect", &port, "fs", "cp", &local, &dest])
}

/// Run a local file on the device without uploading: `mpremote connect <port> run <local>`.
#[tauri::command]
pub async fn run_file(mpremote: String, port: String, local: String) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    run(&mpremote, &["connect", &port, "run", &local])
}

/// Soft-reset the device.
#[tauri::command]
pub async fn reset_device(mpremote: String, port: String) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    run(&mpremote, &["connect", &port, "reset"])
}

// ---------- device detection ----------

#[derive(Serialize)]
pub struct DeviceInfo {
    micropython: bool,
    version: Option<String>, // MicroPython sys.version, if present
    machine: Option<String>, // os.uname().machine, if present
    chip: Option<String>,    // normalized chip family (e.g. "ESP32", "ESP32-S3")
    suggested_offset: Option<String>, // flash offset for that chip
}

// Probe printed line-by-line so we can parse a fixed order on stdout.
const MP_PROBE: &str = "import sys,os\nprint(sys.implementation.name)\nprint(sys.version)\ntry:\n    print(os.uname().machine)\nexcept Exception:\n    print('')\n";

/// MicroPython flash offset by chip family. The original ESP32 uses 0x1000;
/// every newer ESP32 variant and the ESP8266 use 0x0.
fn offset_for_chip(chip: &str) -> &'static str {
    if chip.eq_ignore_ascii_case("ESP32") {
        "0x1000"
    } else {
        "0x0"
    }
}

/// Collapse a raw chip string ("ESP32-D0WD-V3", "Generic ESP32-S3 module") to a
/// known family, preferring the most specific match.
fn normalize_chip(raw: &str) -> Option<String> {
    let u = raw.to_uppercase();
    for fam in [
        "ESP32-S3",
        "ESP32-S2",
        "ESP32-C3",
        "ESP32-C6",
        "ESP32-C2",
        "ESP32-H2",
        "ESP8266",
    ] {
        if u.contains(fam) {
            return Some(fam.to_string());
        }
    }
    if u.contains("ESP32") {
        return Some("ESP32".to_string());
    }
    None
}

/// Detect chip type and whether MicroPython is installed.
///
/// First gently asks the running firmware (via mpremote) whether it's
/// MicroPython. If not, falls back to esptool, which reads the chip type from
/// the ROM bootloader regardless of firmware (this resets the board into and
/// out of download mode — harmless when there's no app firmware to interrupt).
#[tauri::command]
pub async fn detect_device(
    mpremote: String,
    esptool: String,
    port: String,
) -> Result<DeviceInfo, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let esptool = tool_path(&esptool, "esptool");

    // 1. Is MicroPython running?
    if let Ok(out) = run_timeout(&mpremote, &["connect", &port, "exec", MP_PROBE], 6) {
        let mut lines = out.lines();
        let impl_name = lines.next().unwrap_or("").trim().to_lowercase();
        if impl_name.contains("micropython") {
            let version = lines
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let machine = lines
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            let chip = machine.as_deref().and_then(normalize_chip);
            let suggested_offset = chip.as_deref().map(|c| offset_for_chip(c).to_string());
            return Ok(DeviceInfo {
                micropython: true,
                version,
                machine,
                chip,
                suggested_offset,
            });
        }
    }

    // 2. No MicroPython → ask esptool what chip this is.
    let chip = run_timeout(&esptool, &["--port", &port, "chip-id"], 25)
        .ok()
        .and_then(|out| {
            out.lines()
                .find(|l| l.trim_start().starts_with("Chip is"))
                .and_then(normalize_chip)
                .or_else(|| normalize_chip(&out))
        });
    let suggested_offset = chip.as_deref().map(|c| offset_for_chip(c).to_string());
    Ok(DeviceInfo {
        micropython: false,
        version: None,
        machine: None,
        chip,
        suggested_offset,
    })
}

// ---------- tool versions (About screen) ----------

#[derive(Serialize, Deserialize)]
pub struct ToolVersions {
    mpremote: String,
    mpy_cross: String,
    esptool: String,
}

// Versions of the bundled binaries, recorded at build time by
// scripts/fetch-binaries.sh. Reading these avoids launching the (slow-starting)
// tools just to populate the About screen.
const BUNDLED_VERSIONS: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/versions.json"));

/// Versions of the binaries bundled with the app — read from the build-time
/// manifest, so this never launches a process (instant).
#[tauri::command]
pub async fn bundled_versions() -> ToolVersions {
    serde_json::from_str(BUNDLED_VERSIONS).unwrap_or(ToolVersions {
        mpremote: "unknown".into(),
        mpy_cross: "unknown".into(),
        esptool: "unknown".into(),
    })
}

/// Versions of the user's own binaries, queried live from the given override
/// paths. A blank path returns "" (that tool falls back to the bundled one).
/// Only used to populate the "Your binaries" section when overrides are on.
#[tauri::command]
pub async fn override_versions(
    mpremote: String,
    mpy_cross: String,
    esptool: String,
) -> ToolVersions {
    fn ver(path: &str, args: &[&str]) -> String {
        let p = path.trim();
        if p.is_empty() {
            return String::new();
        }
        run(p, args)
            .ok()
            .and_then(|out| {
                out.lines()
                    .find(|l| !l.trim().is_empty())
                    .map(|l| l.trim().to_string())
            })
            .unwrap_or_else(|| "unknown".to_string())
    }

    ToolVersions {
        mpremote: ver(&mpremote, &["--version"]),
        mpy_cross: ver(&mpy_cross, &["--version"]),
        esptool: ver(&esptool, &["version"]),
    }
}

/// Delete a file on the device.
#[tauri::command]
pub async fn device_delete(mpremote: String, port: String, path: String) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let remote = format!(":{}", path.trim_start_matches(':'));
    run(&mpremote, &["connect", &port, "fs", "rm", &remote])
}

/// Upload an entire project directory. Mirrors the user's build.py:
/// root *.py stay as source; files inside subdirs are cross-compiled to .mpy
/// when `compile` is true. Skips templates, env.py/secrets.py, and ignored dirs.
#[tauri::command]
pub async fn upload_project(
    mpremote: String,
    mpy_cross: String,
    port: String,
    dir: String,
    compile: bool,
) -> Result<String, String> {
    let mpremote = tool_path(&mpremote, "mpremote");
    let mpy_cross = tool_path(&mpy_cross, "mpy-cross");
    let root = PathBuf::from(&dir);
    if !root.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }

    let mut log = String::new();

    // 1. Upload root-level .py files (kept as source so tracebacks stay readable).
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let skip = name.ends_with(".template.py")
            || name == "build.py"
            || name == "env.py"
            || name == "secrets.py";
        if path.extension().and_then(|e| e.to_str()) == Some("py") && !skip {
            let dest = format!(":{name}");
            run(&mpremote, &["connect", &port, "fs", "cp", &path.to_string_lossy(), &dest])?;
            log.push_str(&format!("uploaded {name}\n"));
        }
    }

    // 2. Upload subdirectories (lib/, drivers/, vendored frameworks).
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dname = entry.file_name().to_string_lossy().to_string();
        if IGNORED.contains(&dname.as_str()) {
            continue;
        }

        if compile {
            // Cross-compile each .py to .mpy with the bundled mpy-cross, then upload.
            for f in walk_py_files(&path) {
                let status = Command::new(&mpy_cross)
                    .arg(f.as_os_str())
                    .status()
                    .map_err(|e| format!("mpy-cross launch: {e}"))?;
                if !status.success() {
                    return Err(format!("mpy-cross failed on {}", f.display()));
                }
            }
            log.push_str(&format!("compiled {dname}/*.py -> .mpy\n"));
        }

        // mkdir on device (ignore "already exists" errors), then recursive copy.
        let _ = run(&mpremote, &["connect", &port, "fs", "mkdir", &format!(":{dname}")]);
        run(
            &mpremote,
            &["connect", &port, "fs", "cp", "-r", &path.to_string_lossy(), ":"],
        )?;
        log.push_str(&format!("uploaded {dname}/\n"));
    }

    Ok(log)
}

fn walk_py_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = vec![];
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                out.extend(walk_py_files(&p));
            } else if p.extension().and_then(|x| x.to_str()) == Some("py") {
                out.push(p);
            }
        }
    }
    out
}

// ---------- firmware flashing: esptool ----------

#[derive(Deserialize)]
pub struct FlashArgs {
    esptool: String,
    port: String,
    bin_path: String,
    baud: String,
    offset: String, // e.g. "0x1000" for ESP32, "0x0" for ESP8266/S3/C3
    erase: bool,
}

#[tauri::command]
pub async fn flash_firmware(app: AppHandle, args: FlashArgs) -> Result<String, String> {
    let esptool = tool_path(&args.esptool, "esptool");
    let port = args.port.as_str();
    let offset = args.offset.as_str();
    let bin = args.bin_path.as_str();
    let want_erase = args.erase;

    // One flash attempt. `full_erase` does the power-hungry whole-chip erase
    // (needs the stub); skipping it still works because write-flash erases the
    // regions it writes.
    let attempt = |full_erase: bool, baud: Option<&str>| -> Result<(), String> {
        if want_erase && full_erase {
            run_streamed(&app, "flash-output", &esptool, &["--port", port, "erase-flash"])?;
        }
        let mut a: Vec<&str> = vec!["--port", port];
        if let Some(b) = baud {
            a.push("--baud");
            a.push(b);
        }
        a.extend(["write-flash", "-z", offset, bin]);
        run_streamed(&app, "flash-output", &esptool, &a)
    };

    // No-brainer escalation: clean install at the configured (fast) baud first;
    // on failure retry at the default speed and skip the whole-chip erase, which
    // is the heaviest current draw and a common cause of brown-outs / "serial
    // data stream stopped". The user never has to think about baud.
    if let Err(e) = attempt(true, Some(args.baud.as_str())) {
        let _ = app.emit(
            "flash-output",
            format!(
                "\n[ESPStudio] flash failed ({e}).\n[ESPStudio] Retrying at default speed without the full-chip erase…\n"
            ),
        );
        attempt(false, None)?;
    }
    Ok(String::new())
}

// ---------- quick start: new project ----------

#[derive(Deserialize)]
pub struct NewProjectArgs {
    parent: String,
    name: String,
    template: String, // "blink" | "wifi"
    git: bool,
}

#[tauri::command]
pub async fn new_project(args: NewProjectArgs) -> Result<String, String> {
    let root = PathBuf::from(&args.parent).join(&args.name);
    if root.exists() {
        return Err(format!("already exists: {}", root.display()));
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let write = |rel: &str, content: &str| -> Result<(), String> {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&p, content).map_err(|e| format!("write {rel}: {e}"))
    };

    write(".gitignore", GITIGNORE)?;
    write("README.md", &readme(&args.name))?;

    match args.template.as_str() {
        "wifi" => {
            write("boot.py", BOOT_WIFI)?;
            write("main.py", MAIN_WIFI)?;
            write("env.template.py", ENV_TEMPLATE)?;
        }
        _ => {
            // "blink" minimal
            write("main.py", MAIN_BLINK)?;
        }
    }

    if args.git {
        let path = root.to_string_lossy().to_string();
        run("git", &["-C", &path, "init"])?;
    }

    Ok(root.to_string_lossy().to_string())
}

fn readme(name: &str) -> String {
    format!(
        r#"<h1 align="center">{name}</h1>
<p align="center">A MicroPython project for ESP32 / ESP8266</p>

<div align="center">

[![python](https://img.shields.io/badge/Python-3.13-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![micropython](https://img.shields.io/badge/built%20for-MicroPython-3776AB?logo=micropython)](https://micropython.org/)

</div>

## Setup

1. Flash MicroPython firmware to the board (use the **Flash** button in esp-studio).
2. Copy `env.template.py` to `env.py` and fill in your credentials (if applicable).
3. Hit **Upload** to push the project to the device.

## Deployment

Files are transferred with [`mpremote`](https://docs.micropython.org/en/latest/reference/mpremote.html):

```bash
mpremote connect list                       # find your device
mpremote connect <port> fs cp main.py :     # upload a file
```
"#
    )
}

const GITIGNORE: &str = r#"# Secrets — never commit
env.py
secrets.py

# Environments
.env
.venv
env/
venv/

# Build output
out/

# Python
__pycache__/
*.pyc
*.mpy

# OS
.DS_Store
"#;

const ENV_TEMPLATE: &str = r#"WIFI_SSID = "your-ssid"
WIFI_PASSWD = "your-password"
"#;

const BOOT_WIFI: &str = r#"# Runs on every boot (including wake from deepsleep).
import network
import webrepl
from env import WIFI_SSID, WIFI_PASSWD


def connect_to_network():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print("Connecting to WiFi...")
        wlan.connect(WIFI_SSID, WIFI_PASSWD)
        while not wlan.isconnected():
            pass
    print("Connected:", wlan.ifconfig())


connect_to_network()
webrepl.start()
"#;

const MAIN_WIFI: &str = r#"import time
from machine import Pin

led = Pin(2, Pin.OUT)  # built-in LED on most ESP32 devkits

print("Running. Network is up (see boot.py).")

while True:
    led.value(not led.value())
    time.sleep(1)
"#;

const MAIN_BLINK: &str = r#"import time
from machine import Pin

led = Pin(2, Pin.OUT)  # built-in LED on most ESP32 devkits

while True:
    led.value(not led.value())
    time.sleep(0.5)
"#;
