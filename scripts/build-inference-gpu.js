const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");

const repo = path.resolve(__dirname, "..");
const engine = path.join(repo, "packages", "inference-engine");

let cudaBin = null;
let cudaRoot = null; // toolkit root for CUDA_PATH so crates use 12.x not 13.x
if (process.platform === "win32") {
  const root = process.env.CUDA_PATH || process.env.CUDA_ROOT;
  if (root) {
    const bin = path.join(root, "bin");
    if (fs.existsSync(path.join(bin, "nvcc.exe"))) {
      cudaBin = bin;
      cudaRoot = root;
    }
  } else {
    const base = "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA";
    if (fs.existsSync(base)) {
      const versions = fs.readdirSync(base)
        .filter((d) => /^v\d+(\.\d+)*$/.test(d))
        .filter((d) => {
          const major = parseInt(d.slice(1).split(".")[0], 10);
          return major <= 12;
        })
        .sort((a, b) => {
          const pa = a.slice(1).split(".").map(Number);
          const pb = b.slice(1).split(".").map(Number);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (na !== nb) return nb - na;
          }
          return 0;
        });
      for (const v of versions) {
        const bin = path.join(base, v, "bin");
        if (fs.existsSync(path.join(bin, "nvcc.exe"))) {
          cudaBin = bin;
          cudaRoot = path.join(base, v);
          break;
        }
      }
    }
  }
}

if (process.platform === "win32" && !cudaBin) {
  console.error("\n  GPU build needs the CUDA Toolkit with nvcc (the compiler), not just the runtime.");
  console.error("  The candle/cudarc stack supports CUDA 11.x and 12.x only (not 13.x yet).");
  console.error("  Install CUDA 12.x (e.g. 12.6) from https://developer.nvidia.com/cuda-downloads");
  console.error("  with \"Development\" / compiler components. Then run: npm run build:inference-gpu\n");
  process.exit(1);
}

function getCargoBin() {
  if (process.platform !== "win32") return null;
  const cargoHome = process.env.CARGO_HOME || path.join(process.env.USERPROFILE || "", ".cargo");
  const bin = path.join(cargoHome, "bin");
  return fs.existsSync(path.join(bin, "cargo.exe")) ? bin : null;
}

// nvcc on Windows needs cl.exe (MSVC). Find VC Tools bin (Hostx64\x64) under Visual Studio.
function getMsvcBin() {
  if (process.platform !== "win32") return null;
  const bases = [
    "C:\\Program Files\\Microsoft Visual Studio",
    "C:\\Program Files (x86)\\Microsoft Visual Studio",
  ];
  // CUDA 12.8 only supports MSVC 2017–2022; prefer 2022/2019 over 2026 (18).
  const editions = ["17", "2022", "16", "2019", "18", "2026"];
  for (const vsBase of bases) {
    if (!fs.existsSync(vsBase)) continue;
    for (const ed of editions) {
      const edPath = path.join(vsBase, ed);
      if (!fs.existsSync(edPath)) continue;
      let skus;
      try {
        skus = fs.readdirSync(edPath);
      } catch (_) {
        continue;
      }
      for (const sku of skus) {
        const msvc = path.join(edPath, sku, "VC", "Tools", "MSVC");
        if (!fs.existsSync(msvc)) continue;
        const vers = fs.readdirSync(msvc).sort().reverse();
        for (const ver of vers) {
          const bin = path.join(msvc, ver, "bin", "Hostx64", "x64");
          if (fs.existsSync(path.join(bin, "cl.exe"))) return bin;
        }
      }
    }
  }
  return null;
}

const cargoBin = getCargoBin();
const msvcBin = getMsvcBin();
if (process.platform === "win32" && cudaBin && !msvcBin) {
  console.error("\n  nvcc on Windows needs the MSVC compiler (cl.exe).");
  console.error("  Install \"Build Tools for Visual Studio\" or Visual Studio with the");
  console.error("  \"Desktop development with C++\" workload, then run: npm run build:inference-gpu\n");
  process.exit(1);
}
const basePath = process.env.Path || process.env.PATH || "";
const pathParts = [cudaBin, msvcBin, cargoBin].filter(Boolean);
const pathEnv = pathParts.length ? pathParts.join(path.delimiter) + path.delimiter + basePath : basePath;
const env = { ...process.env, Path: pathEnv, PATH: pathEnv };
if (cudaRoot) {
  env.CUDA_PATH = cudaRoot;
  env.CUDA_ROOT = cudaRoot;
}

let r;
if (process.platform === "win32" && cudaBin) {
  // CUDA bin first, then Cargo bin, then rest of PATH so both nvcc and cargo are found.
  const psCmd = `$env:Path = '${cudaBin.replace(/'/g, "''")}' + ';' + $env:Path; Set-Location '${engine.replace(/'/g, "''")}'; cargo build --release --features candle,cuda`;
  r = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCmd],
    { cwd: repo, stdio: "inherit", env }
  );
} else {
  r = spawnSync("cargo", ["build", "--release", "--features", "candle,cuda"], {
    cwd: engine,
    env,
    stdio: "inherit",
    shell: true,
  });
}
process.exit(r.status ?? 1);
