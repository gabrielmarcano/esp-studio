// esp-studio backend: thin wrappers around the user's existing CLIs
// (mpremote, mpy-cross via python, esptool) plus local filesystem + project scaffolding.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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
pub fn read_dir(path: String) -> Result<Vec<FileNode>, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    Ok(build_tree(&p))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("write {path}: {e}"))
}

// ---------- device: mpremote ----------

#[derive(Serialize)]
pub struct PortInfo {
    port: String,
    description: String,
}

/// `mpremote connect list` → list of serial ports.
#[tauri::command]
pub fn list_ports(mpremote: String) -> Result<Vec<PortInfo>, String> {
    let out = run(&mpremote, &["connect", "list"])?;
    // Each line: "<port> <serial> <vid:pid> <manufacturer> <product>"
    let ports = out
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let mut parts = l.split_whitespace();
            let port = parts.next().unwrap_or("").to_string();
            let description = parts.collect::<Vec<_>>().join(" ");
            PortInfo { port, description }
        })
        .filter(|p| !p.port.is_empty())
        .collect();
    Ok(ports)
}

// Walks the device filesystem in one round-trip and prints a JSON tree.
const WALK_SCRIPT: &str = r#"
import os, json
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
            out.append({"name": name, "path": full, "is_dir": False})
    return out
print(json.dumps(walk('/')))
"#;

/// Walk the device filesystem via a single `mpremote exec` round-trip.
/// Returns the raw JSON string (frontend parses it).
#[tauri::command]
pub fn device_tree(mpremote: String, port: String) -> Result<String, String> {
    let out = run(&mpremote, &["connect", &port, "exec", WALK_SCRIPT])?;
    Ok(out.trim().to_string())
}

/// Read a file off the device: `mpremote connect <port> fs cat :<path>`.
#[tauri::command]
pub fn device_read(mpremote: String, port: String, path: String) -> Result<String, String> {
    let remote = format!(":{}", path.trim_start_matches(':'));
    run(&mpremote, &["connect", &port, "fs", "cat", &remote])
}

/// Upload a single local file to the device root (or a remote path).
/// `mpremote connect <port> fs cp <local> :<remote>`
#[tauri::command]
pub fn upload_file(
    mpremote: String,
    port: String,
    local: String,
    remote: Option<String>,
) -> Result<String, String> {
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
pub fn run_file(mpremote: String, port: String, local: String) -> Result<String, String> {
    run(&mpremote, &["connect", &port, "run", &local])
}

/// Soft-reset the device.
#[tauri::command]
pub fn reset_device(mpremote: String, port: String) -> Result<String, String> {
    run(&mpremote, &["connect", &port, "reset"])
}

/// Delete a file on the device.
#[tauri::command]
pub fn device_delete(mpremote: String, port: String, path: String) -> Result<String, String> {
    let remote = format!(":{}", path.trim_start_matches(':'));
    run(&mpremote, &["connect", &port, "fs", "rm", &remote])
}

/// Upload an entire project directory. Mirrors the user's build.py:
/// root *.py stay as source; files inside subdirs are cross-compiled to .mpy
/// when `compile` is true. Skips templates, env.py/secrets.py, and ignored dirs.
#[tauri::command]
pub fn upload_project(
    mpremote: String,
    python: String,
    port: String,
    dir: String,
    compile: bool,
) -> Result<String, String> {
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
            // Cross-compile each .py to .mpy via the python mpy_cross module, then upload .mpy.
            for f in walk_py_files(&path) {
                let status = Command::new(&python)
                    .args(["-m", "mpy_cross", &f.to_string_lossy()])
                    .status()
                    .map_err(|e| format!("mpy_cross launch: {e}"))?;
                if !status.success() {
                    return Err(format!("mpy_cross failed on {}", f.display()));
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
pub fn flash_firmware(args: FlashArgs) -> Result<String, String> {
    let mut log = String::new();
    if args.erase {
        log.push_str(&run(&args.esptool, &["--port", &args.port, "erase-flash"])?);
        log.push_str("\n--- erased ---\n");
    }
    log.push_str(&run(
        &args.esptool,
        &[
            "--port",
            &args.port,
            "--baud",
            &args.baud,
            "write-flash",
            "-z",
            &args.offset,
            &args.bin_path,
        ],
    )?);
    Ok(log)
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
pub fn new_project(args: NewProjectArgs) -> Result<String, String> {
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
