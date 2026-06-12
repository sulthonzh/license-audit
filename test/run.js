#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const {
  normalizeLicense, categorizeLicense, extractLicense,
  readPackageJson, scanProject, checkCompliance, formatReport,
  LICENSE_CATEGORIES,
} = require('../src/index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

console.log('license-audit tests\n');

// --- normalizeLicense ---
test('normalizes MIT string', () => {
  assert.strictEqual(normalizeLicense('MIT'), 'mit');
});

test('normalizes null to unknown', () => {
  assert.strictEqual(normalizeLicense(null), 'unknown');
});

test('normalizes undefined to unknown', () => {
  assert.strictEqual(normalizeLicense(undefined), 'unknown');
});

test('normalizes object with type', () => {
  assert.strictEqual(normalizeLicense({ type: 'Apache-2.0' }), 'apache-2.0');
});

test('normalizes object with name', () => {
  assert.strictEqual(normalizeLicense({ name: 'ISC' }), 'isc');
});

test('normalizes empty string to unknown', () => {
  assert.strictEqual(normalizeLicense(''), 'unknown');
});

// --- categorizeLicense ---
test('categorizes MIT as permissive', () => {
  assert.strictEqual(categorizeLicense('MIT'), 'permissive');
});

test('categorizes Apache-2.0 as permissive', () => {
  assert.strictEqual(categorizeLicense('Apache-2.0'), 'permissive');
});

test('categorizes GPL-3.0 as strong_copyleft', () => {
  assert.strictEqual(categorizeLicense('GPL-3.0'), 'strong_copyleft');
});

test('categorizes LGPL-3.0 as weak_copyleft', () => {
  assert.strictEqual(categorizeLicense('LGPL-3.0'), 'weak_copyleft');
});

test('categorizes MPL-2.0 as weak_copyleft', () => {
  assert.strictEqual(categorizeLicense('MPL-2.0'), 'weak_copyleft');
});

test('categorizes AGPL-3.0 as strong_copyleft', () => {
  assert.strictEqual(categorizeLicense('AGPL-3.0'), 'strong_copyleft');
});

test('categorizes ISC as permissive', () => {
  assert.strictEqual(categorizeLicense('ISC'), 'permissive');
});

test('categorizes unknown', () => {
  assert.strictEqual(categorizeLicense(null), 'unknown');
});

test('fuzzy matches "MIT License" string', () => {
  assert.strictEqual(categorizeLicense('MIT License'), 'permissive');
});

test('fuzzy matches "GPLv3" string', () => {
  assert.strictEqual(categorizeLicense('GPLv3'), 'strong_copyleft');
});

test('categorizes BSD-3-Clause as permissive', () => {
  assert.strictEqual(categorizeLicense('BSD-3-Clause'), 'permissive');
});

test('categorizes Unlicense as public_domain', () => {
  assert.strictEqual(categorizeLicense('Unlicense'), 'public_domain');
});

// --- extractLicense ---
test('extracts license from pkg.license string', () => {
  assert.strictEqual(extractLicense({ license: 'MIT' }), 'MIT');
});

test('extracts license from pkg.licenses array', () => {
  assert.strictEqual(extractLicense({ licenses: [{ type: 'Apache-2.0' }] }), 'Apache-2.0');
});

test('returns unknown when no license field', () => {
  assert.strictEqual(extractLicense({ name: 'foo' }), 'unknown');
});

test('returns unknown for null pkg', () => {
  assert.strictEqual(extractLicense(null), 'unknown');
});

// --- scanProject with fixtures ---
const fixturesDir = path.join(__dirname, 'fixtures');

// Create fixture
const fixturePath = path.join(fixturesDir, 'project');
const nmPath = path.join(fixturePath, 'node_modules');

fs.rmSync(fixturePath, { recursive: true, force: true });
fs.mkdirSync(path.join(nmPath, 'lodash'), { recursive: true });
fs.mkdirSync(path.join(nmPath, '@scope', 'mylib'), { recursive: true });
fs.mkdirSync(path.join(nmPath, 'unlicensed-pkg'), { recursive: true });

fs.writeFileSync(path.join(fixturePath, 'package.json'), JSON.stringify({
  name: 'test-project', version: '1.0.0', license: 'MIT',
}, null, 2));

fs.writeFileSync(path.join(nmPath, 'lodash', 'package.json'), JSON.stringify({
  name: 'lodash', version: '4.17.21', license: 'MIT',
}, null, 2));

fs.writeFileSync(path.join(nmPath, '@scope', 'mylib', 'package.json'), JSON.stringify({
  name: '@scope/mylib', version: '2.0.0', license: 'Apache-2.0',
}, null, 2));

fs.writeFileSync(path.join(nmPath, 'unlicensed-pkg', 'package.json'), JSON.stringify({
  name: 'unlicensed-pkg', version: '0.0.1',
}, null, 2));

test('scanProject finds root package', () => {
  const result = scanProject(fixturePath);
  assert.strictEqual(result.project, 'test-project');
  assert.strictEqual(result.rootPackages.length, 1);
  assert.strictEqual(result.rootPackages[0].license, 'mit');
});

test('scanProject finds dependencies', () => {
  const result = scanProject(fixturePath);
  assert.ok(result.dependencies.length >= 3);
  const names = result.dependencies.map(d => d.name);
  assert.ok(names.includes('lodash'));
  assert.ok(names.includes('@scope/mylib'));
  assert.ok(names.includes('unlicensed-pkg'));
});

test('scanProject categorizes dependencies', () => {
  const result = scanProject(fixturePath);
  const lodash = result.dependencies.find(d => d.name === 'lodash');
  assert.strictEqual(lodash.category, 'permissive');
  const scoped = result.dependencies.find(d => d.name === '@scope/mylib');
  assert.strictEqual(scoped.category, 'permissive');
});

test('scanProject marks unknown license', () => {
  const result = scanProject(fixturePath);
  const unlic = result.dependencies.find(d => d.name === 'unlicensed-pkg');
  assert.strictEqual(unlic.license, 'unknown');
  assert.strictEqual(unlic.category, 'unknown');
});

// --- checkCompliance ---
test('checkCompliance detects no-license violation', () => {
  const scan = scanProject(fixturePath);
  const result = checkCompliance(scan);
  assert.ok(!result.passed);
  assert.ok(result.violations.some(v => v.reason === 'no_license'));
});

test('checkCompliance passes with noRequireLicense', () => {
  const scan = scanProject(fixturePath);
  const result = checkCompliance(scan, { requireLicense: false });
  assert.ok(result.passed);
});

test('checkCompliance detects denied license', () => {
  const scan = scanProject(fixturePath);
  const result = checkCompliance(scan, { denied: ['mit'], requireLicense: false });
  assert.ok(!result.passed);
  assert.ok(result.violations.some(v => v.reason === 'denied_license'));
});

test('checkCompliance detects not-in-allowed license', () => {
  const scan = scanProject(fixturePath);
  const result = checkCompliance(scan, { allowed: ['mit'], requireLicense: false });
  // Apache-2.0 is not in allowed list
  assert.ok(result.violations.some(v => v.reason === 'not_in_allowed_list'));
});

test('checkCompliance warns on risky categories', () => {
  // Create a GPL package
  const gplPath = path.join(nmPath, 'gpl-pkg');
  fs.mkdirSync(gplPath, { recursive: true });
  fs.writeFileSync(path.join(gplPath, 'package.json'), JSON.stringify({
    name: 'gpl-pkg', version: '1.0.0', license: 'GPL-3.0',
  }, null, 2));

  const scan = scanProject(fixturePath);
  const result = checkCompliance(scan, { requireLicense: false });
  assert.ok(result.warnings.some(w => w.category === 'strong_copyleft'));
});

test('checkCompliance counts totals', () => {
  const scan = scanProject(fixturePath);
  const result = checkCompliance(scan, { requireLicense: false });
  assert.ok(result.totalScanned > 0);
  assert.ok(result.summary.byLicense);
  assert.ok(result.summary.byCategory);
});

// --- formatReport ---
test('formatReport produces readable output', () => {
  const scan = scanProject(fixturePath);
  const compliance = checkCompliance(scan, { requireLicense: false });
  const report = formatReport(scan, compliance);
  assert.ok(report.includes('License Audit'));
  assert.ok(report.includes('test-project'));
  assert.ok(report.includes('permissive'));
});

test('formatReport shows FAILED with violations', () => {
  const scan = scanProject(fixturePath);
  const compliance = checkCompliance(scan);
  const report = formatReport(scan, compliance);
  assert.ok(report.includes('FAILED'));
});

// --- readPackageJson ---
test('readPackageJson returns null for missing file', () => {
  assert.strictEqual(readPackageJson('/nonexistent/path'), null);
});

// --- LICENSE_CATEGORIES ---
test('has expected category keys', () => {
  assert.ok(LICENSE_CATEGORIES.permissive);
  assert.ok(LICENSE_CATEGORIES.strong_copyleft);
  assert.ok(LICENSE_CATEGORIES.weak_copyleft);
});

test('permissive includes common licenses', () => {
  assert.ok(LICENSE_CATEGORIES.permissive.includes('mit'));
  assert.ok(LICENSE_CATEGORIES.permissive.includes('apache-2.0'));
  assert.ok(LICENSE_CATEGORIES.permissive.includes('isc'));
});

// Cleanup
fs.rmSync(fixturePath, { recursive: true, force: true });

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
