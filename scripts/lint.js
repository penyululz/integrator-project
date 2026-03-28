const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = process.cwd();
const TARGET_DIRS = ["src", "modules", "core", "adapters", "tests", "scripts"];

function walk(dirPath, files) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const item of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name === ".git") {
      continue;
    }

    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (item.isFile() && item.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

function main() {
  const files = [];
  for (const dir of TARGET_DIRS) {
    walk(path.join(ROOT, dir), files);
  }

  if (files.length === 0) {
    console.log("No JS files found for lint checks.");
    return;
  }

  let failed = false;

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      stdio: "inherit",
    });

    if (result.status !== 0) {
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(`Syntax check passed for ${files.length} files.`);
  }
}

main();
