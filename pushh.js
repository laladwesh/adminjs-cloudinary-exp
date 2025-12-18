#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

// Ensure we are inside a git repo
try {
  run("git rev-parse --is-inside-work-tree");
} catch {
  console.error("Error: Not inside a git repository.");
  process.exit(1);
}

// Get uncommitted files (tracked + untracked, excluding ignored)
let statusOutput = run("git status --porcelain");

if (!statusOutput) {
  console.log("No uncommitted files found.");
  process.exit(0);
}

console.log("Uncommitted files found:" , statusOutput);
let files = statusOutput
  .split("\n")
  .map(line => line.slice(3)) // remove status chars
  .filter(Boolean);

// Count files
const count = files.length;

console.log(`Uncommitted files count: ${count}`);
console.log("--------------------------------");

let committed = 0;

for (const file of files) {
  if (fs.existsSync(file)) {
    try {
      run(`git add "${file}"`);
      run(`git commit -m "Commit ${file}"`);
      committed++;
      console.log(`Committed (${committed}/${count}): ${file}`);
    } catch (err) {
      console.error(`Failed to commit: ${file}`);
      console.error(err.message);
      process.exit(1);
    }
  } else {
    console.log(`Skipped (missing): ${file}`);
  }
}

console.log("--------------------------------");
console.log(`Done. Total files committed: ${committed}`);
