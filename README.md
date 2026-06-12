# license-audit

Scan your npm dependencies for license compliance — before they become a legal problem.

## Why?

Most devs never check what licenses their dependencies use. That's fine until legal asks "are we using any GPL code?" and you have to dig through 500 packages manually.

`license-audit` scans your `node_modules`, categorizes every license, and flags violations against your policy. Zero deps, runs in seconds.

## Install

```bash
npm install -g license-audit
```

Or use without installing:

```bash
npx license-audit
```

## Usage

```bash
# Audit current project
license-audit

# Audit a specific project
license-audit ./my-project

# Deny specific licenses
license-audit --deny gpl-3.0 --deny agpl-3.0

# Only allow specific licenses
license-audit --allow mit --allow apache-2.0 --allow isc

# JSON output (for scripts/CI)
license-audit --json

# CI mode — exits 1 on violations
license-audit --ci --deny gpl-3.0

# Don't fail on missing licenses
license-audit --no-require-license
```

## Example Output

```
License Audit: my-app@2.0.0
==================================================

Scanned 147 package(s)

Categories:
  permissive            128 (87.1%)
  weak_copyleft           12 (8.2%)
  strong_copyleft          3 (2.0%)
  unknown                  4 (2.7%)

Top Licenses:
  mit                          98
  apache-2.0                   18
  isc                          12
  bsd-3-clause                  8

Warnings (3):
  ⚠  some-gpl-pkg@1.0.0 is strong_copyleft (gpl-3.0)

Result: PASSED with warnings
```

## How It Works

1. Reads your `package.json` and scans `node_modules/`
2. Extracts license from each package's `package.json`
3. Categorizes into: `permissive`, `weak_copyleft`, `strong_copyleft`, `proprietary`, `public_domain`, `restricted`, `unknown`
4. Checks against your policy (allowed/denied lists, require license)
5. Reports violations and warnings

## License Categories

| Category | Examples | Risk Level |
|----------|----------|------------|
| permissive | MIT, Apache-2.0, BSD, ISC | Low |
| weak_copyleft | LGPL, MPL, EPL, CDDL | Medium |
| strong_copyleft | GPL, AGPL | High |
| proprietary | Commercial licenses | High |
| public_domain | CC0, Unlicense | None |
| restricted | Non-commercial, BSL | High |

## CI Integration

```yaml
# GitHub Actions
- name: License Audit
  run: npx license-audit --ci --deny gpl-3.0 --deny agpl-3.0
```

Exit code 0 = clean, exit code 1 = violations found.

## API

```js
const { scanProject, checkCompliance, formatReport } = require('license-audit');

const scan = scanProject('./my-project');
const result = checkCompliance(scan, {
  allowed: ['mit', 'apache-2.0'],
  denied: ['gpl-3.0'],
  requireLicense: true,
});

console.log(result.passed);    // true/false
console.log(result.violations); // [{ package, reason, message }]
console.log(result.warnings);   // [{ package, category, message }]
console.log(formatReport(scan, result)); // formatted string
```

## Options

| Flag | Description |
|------|-------------|
| `--allow <license>` | Add to allowed list (repeatable) |
| `--deny <license>` | Add to denied list (repeatable) |
| `--no-require-license` | Don't fail on missing licenses |
| `--json` | Output as JSON |
| `--ci` | Exit 1 on violations |

## License

MIT
