import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const distAssetsDir = join(distDir, "assets");
const rootAssetsDir = join(rootDir, "assets");
const hashedAssetPattern = /^index-[\w-]+\.(css|js)$/;
const textFilePattern = /\.(html|json|txt|webmanifest)$/;

function detectNewline(filePath) {
  if (!existsSync(filePath)) {
    return "\n";
  }

  const content = readFileSync(filePath, "utf8");
  const crlfCount = content.match(/\r\n/g)?.length ?? 0;
  const lfCount = content.match(/(?<!\r)\n/g)?.length ?? 0;

  return crlfCount > lfCount ? "\r\n" : "\n";
}

function copyRootFile(source, destination) {
  if (textFilePattern.test(source) || source.endsWith(".nojekyll")) {
    const newline = detectNewline(destination);
    let content = readFileSync(source, "utf8").replace(/\r\n?/g, "\n");
    if (newline === "\r\n") {
      content = content.replace(/\n/g, "\r\n");
    }

    writeFileSync(destination, content, "utf8");
    return;
  }

  copyFileSync(source, destination);
}

function preserveExistingHashedAssets() {
  if (!existsSync(rootAssetsDir)) {
    return;
  }

  mkdirSync(distAssetsDir, { recursive: true });

  for (const entry of readdirSync(rootAssetsDir, { withFileTypes: true })) {
    if (entry.isFile() && hashedAssetPattern.test(entry.name)) {
      copyFileSync(join(rootAssetsDir, entry.name), join(distAssetsDir, entry.name));
    }
  }
}

preserveExistingHashedAssets();

for (const entry of readdirSync(distDir, { withFileTypes: true })) {
  if (entry.isFile()) {
    copyRootFile(join(distDir, entry.name), join(rootDir, entry.name));
  }
}

mkdirSync(rootAssetsDir, { recursive: true });

for (const entry of readdirSync(distAssetsDir, { withFileTypes: true })) {
  if (entry.isFile()) {
    copyFileSync(join(distAssetsDir, entry.name), join(rootAssetsDir, entry.name));
  }
}

console.log("Synced dist files to repository root for branch-based GitHub Pages.");
