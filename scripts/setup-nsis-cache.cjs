// scripts/setup-nsis-cache.cjs
// Pre-populates the electron-builder NSIS cache.
// Usage: node scripts/setup-nsis-cache.cjs [path/to/nsis-3.0.4.1.7z]
//
// If no path is given, the script prints instructions for manual download.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const NSIS_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z";
const CACHE_ROOT = process.env.ELECTRON_BUILDER_CACHE || path.join(process.env.LOCALAPPDATA, "electron-builder", "cache");

// FNV-1a 32-bit hash, matches app-builder Go code
function fnv1a32(str) {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const hash = fnv1a32(NSIS_URL);
const cacheFile = path.join(CACHE_ROOT, "nsis", String(hash));
const cacheDir = path.dirname(cacheFile);

const inputFile = process.argv[2];

if (!inputFile) {
  console.log("NSIS 3.0.4.1 cache setup helper");
  console.log("=================================");
  console.log("");
  console.log("The NSIS binary is not cached. electron-builder needs this file:");
  console.log("  " + NSIS_URL);
  console.log("");
  console.log("Since direct download may be blocked, download it manually:");
  console.log("  1. Use a browser/VPN to download the .7z from the URL above");
  console.log("  2. Run this script with the downloaded file:");
  console.log("     node scripts/setup-nsis-cache.cjs path\\to\\nsis-3.0.4.1.7z");
  console.log("");
  console.log("Expected cache location:");
  console.log("  " + cacheFile);
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error("File not found: " + inputFile);
  process.exit(1);
}

fs.mkdirSync(cacheDir, { recursive: true });
fs.copyFileSync(inputFile, cacheFile);
console.log("NSIS cached successfully at: " + cacheFile);
console.log("You can now run: node pack.js nsis");
