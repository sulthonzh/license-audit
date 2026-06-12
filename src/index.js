'use strict';

const fs = require('fs');
const path = require('path');

// License categorization
const LICENSE_CATEGORIES = {
  permissive: [
    'mit', 'apache-2.0', 'apache-1.0', 'apache-1.1',
    'bsd-2-clause', 'bsd-3-clause', 'bsd-4-clause', '0bsd',
    'isc', 'artistic-2.0', 'zlib', 'cc0-1.0',
    'psf-2.0', 'wtfpl', 'fair', 'ms-pl',
  ],
  weak_copyleft: [
    'lgpl-2.0', 'lgpl-2.1', 'lgpl-3.0',
    'mpl-1.0', 'mpl-1.1', 'mpl-2.0',
    'epl-1.0', 'epl-2.0',
    'cddl-1.0', 'cddl-1.1',
    'cpl-1.0',
  ],
  strong_copyleft: [
    'gpl-2.0', 'gpl-3.0', 'agpl-3.0', 'agpl-1.0',
    'gpl-2.0-with-classpath-exception',
    'gpl-2.0-with-linking-exception',
    'cpal-1.0',
    'ecl-2.0',
    'eupl-1.0', 'eupl-1.1', 'eupl-1.2',
  ],
  proprietary: ['commercial', 'proprietary'],
  public_domain: ['cc0-1.0', 'unlicense', 'wtfpl', 'cc0', 'public-domain'],
  restricted: [
    'bsl-1.0', 'bsl-1.1',
    'ncsa',
    'cc-by-nc-1.0', 'cc-by-nc-2.0', 'cc-by-nc-3.0', 'cc-by-nc-4.0',
    'cc-by-nc-nd-*', 'cc-by-nc-sa-*',
  ],
};

function normalizeLicense(license) {
  if (!license) return 'unknown';
  if (typeof license === 'string') return license.toLowerCase().trim();
  if (typeof license === 'object') {
    if (license.type) return license.type.toLowerCase().trim();
    if (license.name) return license.name.toLowerCase().trim();
    return 'unknown';
  }
  return 'unknown';
}

function categorizeLicense(license) {
  const norm = normalizeLicense(license);
  if (norm === 'unknown') return 'unknown';

  for (const [category, licenses] of Object.entries(LICENSE_CATEGORIES)) {
    if (licenses.includes(norm)) return category;
  }

  // Fuzzy matching for common patterns (order matters — more specific first)
  if (norm.includes('cc0') || norm.includes('public domain') || norm.includes('unlicense')) return 'public_domain';
  if (norm.includes('proprietary') || norm.includes('commercial')) return 'proprietary';
  if (norm.includes('nc') || norm.includes('non-commercial')) return 'restricted';
  if (norm.includes('agpl')) return 'strong_copyleft';
  if (norm.includes('gpl')) return 'strong_copyleft';
  if (norm.includes('lgpl')) return 'weak_copyleft';
  if (norm.includes('mpl')) return 'weak_copyleft';
  if (norm.includes('epl')) return 'weak_copyleft';
  if (norm.includes('cddl')) return 'weak_copyleft';
  if (norm.includes('mit')) return 'permissive';
  if (norm.includes('apache')) return 'permissive';
  if (norm.includes('bsd')) return 'permissive';
  if (norm.includes('isc')) return 'permissive';

  return 'other';
}

function readPackageJson(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function extractLicense(pkg) {
  if (!pkg) return 'unknown';

  // Direct license field
  if (pkg.license) return pkg.license;

  // Licenses array
  if (pkg.licenses && Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses[0].type || pkg.licenses[0];
  }

  return 'unknown';
}

function scanNodeModules(rootDir, options = {}) {
  const nodeModulesDir = path.join(rootDir, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    return { packages: [], errors: [`No node_modules found at ${nodeModulesDir}`] };
  }

  const packages = [];
  const errors = [];
  const seen = new Set();

  function scanDir(dir, depth = 0) {
    if (depth > 5) return; // Prevent going too deep

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Scoped package
        if (entry.name.startsWith('@')) {
          try {
            const scopedEntries = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const se of scopedEntries) {
              if (se.isDirectory() && !se.name.startsWith('.')) {
                const scopedPath = path.join(fullPath, se.name);
                const scopedPkg = readPackageJson(scopedPath);
                if (scopedPkg) {
                  const fullName = `${entry.name}/${se.name}`;
                  if (!seen.has(fullName)) {
                    seen.add(fullName);
                    packages.push(createPackageEntry(fullName, scopedPkg, scopedPath));
                  }
                }
              }
            }
          } catch {
            errors.push(`Could not read scoped dir: ${fullPath}`);
          }
        } else {
          const pkg = readPackageJson(fullPath);
          if (pkg && pkg.name) {
            if (!seen.has(pkg.name)) {
              seen.add(pkg.name);
              packages.push(createPackageEntry(pkg.name, pkg, fullPath));
            }
            // Don't recurse into node_modules inside packages unless flatten mode
            const innerNm = path.join(fullPath, 'node_modules');
            if (options.deep && fs.existsSync(innerNm)) {
              scanDir(innerNm, depth + 1);
            }
          }
        }
      }
    }
  }

  scanDir(nodeModulesDir);
  return { packages, errors };
}

function createPackageEntry(name, pkg, dirPath) {
  const license = extractLicense(pkg);
  const category = categorizeLicense(license);

  return {
    name,
    version: pkg.version || 'unknown',
    license: normalizeLicense(license),
    licenseRaw: license,
    category,
    path: dirPath,
  };
}

function scanProject(rootDir, options = {}) {
  const pkg = readPackageJson(rootDir);
  const result = {
    project: pkg ? pkg.name : path.basename(rootDir),
    projectVersion: pkg ? pkg.version : 'unknown',
    rootPackages: [],
    dependencies: [],
    errors: [],
  };

  // Root package license
  if (pkg) {
    const rootLicense = extractLicense(pkg);
    result.rootPackages.push({
      name: pkg.name,
      version: pkg.version,
      license: normalizeLicense(rootLicense),
      category: categorizeLicense(rootLicense),
    });
  }

  // Scan node_modules
  const scanResult = scanNodeModules(rootDir, options);
  result.dependencies = scanResult.packages;
  result.errors = scanResult.errors;

  return result;
}

function checkCompliance(scanResult, policy = {}) {
  const {
    allowed = [],
    denied = [],
    requireLicense = true,
    warnCategories = ['strong_copyleft', 'restricted', 'proprietary'],
  } = policy;

  const violations = [];
  const warnings = [];

  const allPackages = [...scanResult.rootPackages, ...scanResult.dependencies];

  for (const pkg of allPackages) {
    const lic = pkg.license;

    // No license
    if (lic === 'unknown' && requireLicense) {
      violations.push({
        package: pkg.name,
        version: pkg.version,
        reason: 'no_license',
        message: `${pkg.name}@${pkg.version} has no license`,
        severity: 'error',
      });
      continue;
    }

    // Explicitly denied
    if (denied.length > 0) {
      const isDenied = denied.some(d => lic === normalizeLicense(d));
      if (isDenied) {
        violations.push({
          package: pkg.name,
          version: pkg.version,
          reason: 'denied_license',
          message: `${pkg.name}@${pkg.version} uses denied license: ${lic}`,
          severity: 'error',
        });
        continue;
      }
    }

    // Explicitly allowed
    if (allowed.length > 0) {
      const isAllowed = allowed.some(a => lic === normalizeLicense(a));
      if (!isAllowed && lic !== 'unknown') {
        violations.push({
          package: pkg.name,
          version: pkg.version,
          reason: 'not_in_allowed_list',
          message: `${pkg.name}@${pkg.version} uses ${lic} (not in allowed list)`,
          severity: 'error',
        });
        continue;
      }
    }

    // Category warnings
    if (warnCategories.includes(pkg.category)) {
      warnings.push({
        package: pkg.name,
        version: pkg.version,
        reason: 'risky_category',
        category: pkg.category,
        message: `${pkg.name}@${pkg.version} is ${pkg.category} (${lic})`,
        severity: 'warning',
      });
    }
  }

  return {
    violations,
    warnings,
    passed: violations.length === 0,
    totalScanned: allPackages.length,
    summary: {
      byCategory: countByCategory(allPackages),
      byLicense: countByLicense(allPackages),
    },
  };
}

function countByCategory(packages) {
  const counts = {};
  for (const pkg of packages) {
    counts[pkg.category] = (counts[pkg.category] || 0) + 1;
  }
  return counts;
}

function countByLicense(packages) {
  const counts = {};
  for (const pkg of packages) {
    counts[pkg.license] = (counts[pkg.license] || 0) + 1;
  }
  return counts;
}

function formatReport(scanResult, complianceResult) {
  const lines = [];

  lines.push(`License Audit: ${scanResult.project}@${scanResult.projectVersion}`);
  lines.push(`${'='.repeat(50)}`);
  lines.push('');

  // Summary
  const total = complianceResult.totalScanned;
  const cats = complianceResult.summary.byCategory;
  lines.push(`Scanned ${total} package(s)`);
  lines.push('');

  if (Object.keys(cats).length > 0) {
    lines.push('Categories:');
    for (const [cat, count] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / total) * 100).toFixed(1);
      lines.push(`  ${cat.padEnd(18)} ${count} (${pct}%)`);
    }
    lines.push('');
  }

  // Top licenses
  const lics = complianceResult.summary.byLicense;
  const topLics = Object.entries(lics).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topLics.length > 0) {
    lines.push('Top Licenses:');
    for (const [lic, count] of topLics) {
      lines.push(`  ${lic.padEnd(25)} ${count}`);
    }
    lines.push('');
  }

  // Warnings
  if (complianceResult.warnings.length > 0) {
    lines.push(`Warnings (${complianceResult.warnings.length}):`);
    for (const w of complianceResult.warnings) {
      lines.push(`  ⚠  ${w.message}`);
    }
    lines.push('');
  }

  // Violations
  if (complianceResult.violations.length > 0) {
    lines.push(`Violations (${complianceResult.violations.length}):`);
    for (const v of complianceResult.violations) {
      lines.push(`  ✖  ${v.message}`);
    }
    lines.push('');
  }

  // Result
  if (complianceResult.passed) {
    if (complianceResult.warnings.length > 0) {
      lines.push('Result: PASSED with warnings');
    } else {
      lines.push('Result: PASSED ✓');
    }
  } else {
    lines.push('Result: FAILED ✗');
    lines.push(`  ${complianceResult.violations.length} violation(s) found`);
  }

  return lines.join('\n');
}

module.exports = {
  normalizeLicense,
  categorizeLicense,
  extractLicense,
  readPackageJson,
  scanNodeModules,
  scanProject,
  checkCompliance,
  formatReport,
  LICENSE_CATEGORIES,
};
