import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith("--")) {
      const name = key.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[name] = next;
        i += 1;
      } else {
        args[name] = "true";
      }
    }
  }
  return args;
}

function sha256Base64Url(fileBuffer) {
  return crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function md5Hex(fileBuffer) {
  return crypto.createHash("md5").update(fileBuffer).digest("hex");
}

function deterministicUuid(seed) {
  const hex = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; // UUID v4
  const variantNibble = parseInt(hex[16], 16);
  hex[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function mimeForExtension(ext) {
  const clean = ext.replace(/^\./, "").toLowerCase();
  switch (clean) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "xml":
      return "application/xml";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "json":
      return "application/json";
    case "hbc":
    case "js":
      return "application/javascript";
    default:
      return "application/octet-stream";
  }
}

function copyDirRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const distDir = path.resolve(args.dist || "ota-dist");
const outDir = path.resolve(args.out || "ota-publish");
const runtimeVersion = args["runtime-version"] || "1.2.0";
const commitSha = (args.commit || "local").slice(0, 7);
const summary = args.summary || "";

const metadataPath = path.join(distDir, "metadata.json");
if (!fs.existsSync(metadataPath)) {
  throw new Error(`Missing metadata.json in ${distDir}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const androidMeta = metadata?.fileMetadata?.android;
if (!androidMeta?.bundle) {
  throw new Error("metadata.json missing fileMetadata.android.bundle");
}

const appConfigPath = path.resolve("app.json");
const appJson = fs.existsSync(appConfigPath)
  ? JSON.parse(fs.readFileSync(appConfigPath, "utf8"))
  : { expo: {} };

fs.rmSync(outDir, { recursive: true, force: true });
copyDirRecursive(distDir, outDir);

const bundleRel = androidMeta.bundle.replace(/\\/g, "/").replace(/^\/+/, "");
const bundleAbs = path.join(outDir, bundleRel);
const bundleBuf = fs.readFileSync(bundleAbs);
const bundleHash = sha256Base64Url(bundleBuf);
const bundleExt = path.extname(bundleRel) || ".hbc";

const launchAsset = {
  hash: bundleHash,
  key: md5Hex(bundleBuf),
  contentType: "application/javascript",
  fileExtension: bundleExt,
  url: bundleRel,
};

const assetEntries = [];
const seedParts = [runtimeVersion, bundleHash];

for (const asset of androidMeta.assets || []) {
  const rel = String(asset.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) continue;
  const abs = path.join(outDir, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`Referenced OTA asset missing: ${abs}`);
  }
  const buf = fs.readFileSync(abs);
  const extNoDot = String(asset.ext || path.extname(rel) || "bin").replace(/^\./, "");
  const fileHash = sha256Base64Url(buf);
  const key = md5Hex(buf);
  seedParts.push(`${key}:${fileHash}`);
  assetEntries.push({
    hash: fileHash,
    key,
    contentType: mimeForExtension(extNoDot),
    fileExtension: `.${extNoDot}`,
    url: rel,
  });
}

seedParts.sort();
const createdAt = new Date().toISOString();
const updateId = deterministicUuid(seedParts.join("|"));

const manifest = {
  id: updateId,
  createdAt,
  runtimeVersion,
  launchAsset,
  assets: assetEntries,
  metadata: {},
  extra: {
    expoClient: appJson.expo || {},
    otaRelease: {
      version: appJson.expo?.version || runtimeVersion,
      commitSha,
      builtAt: createdAt,
      summary,
    },
  },
};

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(
  `Prepared OTA update manifest id=${updateId} runtime=${runtimeVersion} assets=${assetEntries.length} bundle=${bundleRel}`,
);
