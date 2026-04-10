#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outputArg = process.argv[2];
const outputDir = path.resolve(
  repoRoot,
  outputArg || "dist/engine-portable",
);

const enginePaths = [
  ".env.example",
  "docker-compose.yml",
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "apps/api",
  "packages/core",
  "packages/shared",
  "packages/adapters",
  "docs/engine",
  "README.md",
];

const skipNames = new Set([
  ".git",
  ".github",
  "node_modules",
  "dist",
  "coverage",
  ".DS_Store",
  "Thumbs.db",
]);

function shouldSkip(sourcePath) {
  const name = path.basename(sourcePath);
  if (skipNames.has(name)) {
    return true;
  }
  if (name.endsWith(".tsbuildinfo")) {
    return true;
  }
  return false;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyEntry(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(destination);
    for (const child of fs.readdirSync(source)) {
      const childSource = path.join(source, child);
      const childDestination = path.join(destination, child);
      if (shouldSkip(childSource)) {
        continue;
      }
      copyEntry(childSource, childDestination);
    }
    return;
  }
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function removeDir(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function main() {
  removeDir(outputDir);
  ensureDir(outputDir);

  const copied = [];
  for (const relPath of enginePaths) {
    const source = path.join(repoRoot, relPath);
    if (!fs.existsSync(source)) {
      continue;
    }
    const destination = path.join(outputDir, relPath);
    copyEntry(source, destination);
    copied.push(relPath);
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    sourceRoot: repoRoot,
    outputDir,
    copiedPaths: copied,
  };
  const manifestPath = path.join(outputDir, "engine-export.manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Engine export completed: ${outputDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

main();

