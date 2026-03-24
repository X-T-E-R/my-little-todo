#!/usr/bin/env node
/**
 * Unified version bumper for the my-little-todo monorepo.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch        # 0.3.0 → 0.3.1
 *   node scripts/bump-version.mjs minor        # 0.3.0 → 0.4.0
 *   node scripts/bump-version.mjs major        # 0.3.0 → 1.0.0
 *   node scripts/bump-version.mjs 1.2.3        # explicit version
 *   node scripts/bump-version.mjs              # print current version
 *
 * Add --tag to also: git add → commit → tag → push
 *   node scripts/bump-version.mjs minor --tag
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ─── All files that carry the product version ────────────────────────
// When you add a new package, add its manifest here.
const VERSION_FILES = [
  { path: 'packages/admin/package.json', type: 'json' },
  { path: 'packages/core/package.json', type: 'json' },
  { path: 'packages/mobile/package.json', type: 'json' },
  { path: 'packages/web/package.json', type: 'json' },
  { path: 'crates/server/Cargo.toml', type: 'cargo' },
  { path: 'crates/server-bin/Cargo.toml', type: 'cargo' },
  { path: 'packages/web/src-tauri/Cargo.toml', type: 'cargo' },
  { path: 'packages/web/src-tauri/tauri.conf.json', type: 'json' },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function readCurrentVersion() {
  const pkg = JSON.parse(readFileSync(resolve(root, VERSION_FILES[0].path), 'utf8'));
  return pkg.version;
}

function bumpSemver(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump type: ${type}`);
}

function updateJson(filePath, newVersion) {
  const full = resolve(root, filePath);
  const obj = JSON.parse(readFileSync(full, 'utf8'));
  obj.version = newVersion;
  writeFileSync(full, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function updateCargo(filePath, oldVersion, newVersion) {
  const full = resolve(root, filePath);
  let text = readFileSync(full, 'utf8');
  text = text.replace(`version = "${oldVersion}"`, `version = "${newVersion}"`);
  writeFileSync(full, text, 'utf8');
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

// ─── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const doTag = args.includes('--tag');
const versionArg = args.find((a) => a !== '--tag');

const current = readCurrentVersion();

if (!versionArg) {
  console.log(`Current version: ${current}`);
  console.log('\nUsage: node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--tag]');
  process.exit(0);
}

const isExplicit = /^\d+\.\d+\.\d+(-\w+)?$/.test(versionArg);
const newVersion = isExplicit ? versionArg : bumpSemver(current, versionArg);

console.log(`\n  ${current}  →  ${newVersion}\n`);

for (const { path: fp, type } of VERSION_FILES) {
  if (type === 'json') updateJson(fp, newVersion);
  else updateCargo(fp, current, newVersion);
  console.log(`  ✓ ${fp}`);
}

console.log('\nUpdating Cargo.lock ...');
run('cargo check -p mlt-server -p mlt-server-bin');

console.log(`\n✅ Version bumped to ${newVersion}\n`);

if (doTag) {
  console.log('Creating commit and tag ...');
  run('git add -A');
  run(`git commit -m "chore: bump to v${newVersion}"`);
  run(`git tag v${newVersion}`);
  run('git push');
  run(`git push origin v${newVersion}`);
  console.log(`\n🚀 Pushed v${newVersion} — workflows should be running now.`);
} else {
  console.log('Next steps (or re-run with --tag to automate):');
  console.log(`  git add -A`);
  console.log(`  git commit -m "chore: bump to v${newVersion}"`);
  console.log(`  git tag v${newVersion}`);
  console.log(`  git push && git push origin v${newVersion}`);
}
