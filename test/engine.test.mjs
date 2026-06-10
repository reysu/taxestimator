// Engine regression tests — run with: node test/engine.test.mjs
// Expected values hand-computed from the statutes/schedules cited in data/brackets.js.
import { taxBracket, calcForLocation, grossForNet } from '../js/calc.js';
import { fedBrackets, FX, LOCATIONS } from '../data/brackets.js';

let failures = 0;
const ok = (name, got, want, tol = 1) => {
    const pass = Math.abs(got - want) <= tol;
    if (!pass) failures++;
    console.log(pass ? 'PASS' : 'FAIL', name, '→', Math.round(got), '(want', Math.round(want) + ')');
};
const opts = { status: 'single', deduction: 16100 };

// federal 2026
ok('fed 2026 single 50k', taxBracket(50000, fedBrackets.single), 5752);
ok('fed bracket edge', taxBracket(12400, fedBrackets.single), 1240);

// WA: 7% on taxable LT gains after $278k deduction, 9.9% on taxable > $1M
ok('WA 1.5M LT gain', calcForLocation(1500000, 0, 0, 0, 'WA', opts).locLongTax, 91978);
// WA millionaires tax (SB 6346, TY2028) — opt-in toggle
ok('WA 2M income toggle off', calcForLocation(0, 0, 2000000, 0, 'WA', { ...opts, waMillionaires: false }).locIncomeTax, 0);
ok('WA 2M income toggle on', calcForLocation(0, 0, 2000000, 0, 'WA', { ...opts, waMillionaires: true }).locIncomeTax, 99000);

// CA: 2025 brackets + 1% MHST over $1M
ok('CA 2M incl MHST', calcForLocation(0, 0, 2000000, 0, 'CA', opts).locIncomeTax, 236837, 5);

// JP: 2025-reform deductions (employment income + basic), surtax, inhabitant + per-capita
ok('JP 200k salary', calcForLocation(0, 0, 200000, 0, 'JP', opts).locIncomeTax, 75969, 30);

// HK: min(progressive after allowance, two-tier standard)
ok('HK 500k std-rate cap', calcForLocation(0, 0, 500000, 0, 'HK', opts).locIncomeTax, 75000, 30);
ok('HK 50k progressive', calcForLocation(0, 0, 50000, 0, 'HK', opts).locIncomeTax, 3340, 30);

// TW: NT$464k deduction package off the top
ok('TW 30k w/ deduction', calcForLocation(0, 0, 30000, 0, 'TW', opts).locIncomeTax, (30000 - 464000 * FX.TWD) * 0.05, 5);

// AU FY2026-27 (15% second bracket) + 2% Medicare, FX-converted
ok('AU 100k', calcForLocation(0, 0, 100000, 0, 'AU', opts).locIncomeTax, 25696, 30);

// NZ + SG, FX-converted
ok('NZ 100k', calcForLocation(0, 0, 100000, 0, 'NZ', opts).locIncomeTax, 27090, 40);
ok('SG 100k', calcForLocation(0, 0, 100000, 0, 'SG', opts).locIncomeTax, 7190, 30);

// PR: brackets + 5% gradual adjustment over $500k (capped → approaches flat 33%)
ok('PR 700k incl gradual', calcForLocation(0, 0, 700000, 0, 'PR', opts).locIncomeTax, 228030, 5);
const pr = calcForLocation(0, 0, 1500000, 0, 'PR', opts).locIncomeTax;
ok('PR 1.5M stays under 33%', pr / 1500000 < 0.33 ? 1 : 0, 1, 0);

// reverse solver round-trips at every location
for (const { code } of LOCATIONS) {
    const g = grossForNet(80000, code, opts, { inc: 1 });
    const net = g - calcForLocation(0, 0, g, 0, code, opts).total;
    ok(`grossForNet round-trip ${code}`, net, 80000);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
