#!/usr/bin/env node
'use strict';

const path = require('path');
const { scanProject, checkCompliance, formatReport } = require('../src/index');

function parseArgs(argv) {
  const args = { _: [], allowed: [], denied: [], requireLicense: true, json: false, ci: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--allow':
        args.allowed.push(argv[++i]);
        break;
      case '--deny':
        args.denied.push(argv[++i]);
        break;
      case '--no-require-license':
        args.requireLicense = false;
        break;
      case '--json':
        args.json = true;
        break;
      case '--ci':
        args.ci = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (!arg.startsWith('-')) args._.push(arg);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
license-audit — Scan npm dependencies for license compliance

USAGE
  license-audit [path] [options]

OPTIONS
  --allow <license>       Add allowed license (repeatable)
  --deny <license>        Add denied license (repeatable)
  --no-require-license    Don't fail on missing licenses
  --json                  Output as JSON
  --ci                    Exit 1 on violations
  -h, --help              Show this help

EXAMPLES
  license-audit                          # Audit current directory
  license-audit ./my-project             # Audit specific project
  license-audit --deny gpl-3.0           # Deny GPL-3.0
  license-audit --allow mit --allow isc  # Only allow MIT and ISC
  license-audit --json                   # JSON output
  license-audit --ci                     # CI mode (exit code)
`);
}

const args = parseArgs(process.argv);

if (args.help) {
  printHelp();
  process.exit(0);
}

const rootDir = args._[0] ? path.resolve(args._[0]) : process.cwd();

const scanResult = scanProject(rootDir);
const policy = {
  allowed: args.allowed,
  denied: args.denied,
  requireLicense: args.requireLicense,
};

const complianceResult = checkCompliance(scanResult, policy);

if (args.json) {
  console.log(JSON.stringify({ scan: scanResult, compliance: complianceResult }, null, 2));
} else {
  console.log(formatReport(scanResult, complianceResult));
}

if (args.ci && !complianceResult.passed) {
  process.exit(1);
}
