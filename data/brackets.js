// Tax data — verified against primary sources 2026-06-10.
// US figures: tax year 2026 (IRS Rev. Proc. 2025-32, post-OBBBA).
// Foreign brackets are stored in NATIVE currency and converted to USD via the FX
// table below at load — update FX (or a bracket) in one place and everything follows.
export const TAX_YEAR = 2026;
export const FX_AS_OF = '2026-06-10';

// USD per 1 unit of local currency
export const FX = {
    SGD: 1 / 1.2867,
    JPY: 1 / 160.28,
    TWD: 1 / 31.58,
    HKD: 1 / 7.837,
    AUD: 0.7028,
    NZD: 0.5838,
};
const conv = (brackets, fx) =>
    brackets.map(([lo, hi, r]) => [lo * fx, hi === Infinity ? Infinity : hi * fx, r]);

// ========== FEDERAL (US) 2026 — Rev. Proc. 2025-32 ==========
export const fedBrackets = {
    single: [
        [0, 12400, 0.10], [12400, 50400, 0.12], [50400, 105700, 0.22],
        [105700, 201775, 0.24], [201775, 256225, 0.32], [256225, 640600, 0.35],
        [640600, Infinity, 0.37]
    ],
    mfj: [
        [0, 24800, 0.10], [24800, 100800, 0.12], [100800, 211400, 0.22],
        [211400, 403550, 0.24], [403550, 512450, 0.32], [512450, 768700, 0.35],
        [768700, Infinity, 0.37]
    ],
    hoh: [
        [0, 17700, 0.10], [17700, 67450, 0.12], [67450, 105700, 0.22],
        [105700, 201750, 0.24], [201750, 256200, 0.32], [256200, 640600, 0.35],
        [640600, Infinity, 0.37]
    ]
};
export const fedLTCGBrackets = {
    single: [[0, 49450, 0.00], [49450, 545500, 0.15], [545500, Infinity, 0.20]],
    mfj: [[0, 98900, 0.00], [98900, 613700, 0.15], [613700, Infinity, 0.20]],
    hoh: [[0, 66200, 0.00], [66200, 579600, 0.15], [579600, Infinity, 0.20]]
};
export const stdDeduction = { single: 16100, mfj: 32200, hoh: 24150 };
export const niitThreshold = { single: 200000, mfj: 250000, hoh: 200000 }; // statutory, not indexed
export const ficaSSCap = 184500; // 2026 SS wage base
export const ficaMedicareExtra = { single: 200000, mfj: 250000, hoh: 200000 }; // statutory

// ========== STATE / LOCATION ==========
// CA: 2025 FTB schedule (2026 not yet published). 1% Mental Health Services Tax
// over $1M is applied in the engine (top effective rate 13.3%).
export const ca = [
    [0,11079,0.01],[11079,26264,0.02],[26264,41452,0.04],[41452,57542,0.06],
    [57542,72724,0.08],[72724,371479,0.093],[371479,445771,0.103],
    [445771,742953,0.113],[742953,Infinity,0.123]
];
export const caMentalHealth = [[1000000, Infinity, 0.01]];
// NY: 2026 rates — FY2026 budget cut the bottom five brackets 0.1pp (another 0.1pp in 2027).
export const ny = [
    [0,8500,0.039],[8500,11700,0.044],[11700,13900,0.0515],[13900,80650,0.054],
    [80650,215400,0.059],[215400,1077550,0.0685],[1077550,5000000,0.0965],
    [5000000,25000000,0.103],[25000000,Infinity,0.109]
];
export const utRate = 0.0445; // TY2026 (SB 60)
// WA capital gains: 7% on taxable LT gains after the standard deduction, +2.9%
// (= 9.9%) on TAXABLE gains over $1M (RCW 82.87.040; $1M tier not indexed).
export const waThreshold = 278000; // 2025 deduction; 2026 amount not yet published
export const waSurchargeStart = 1000000; // of taxable gains
// WA "millionaires tax" (SB 6346, signed 2026-03-30): 9.9% on AGI > $1M household,
// effective TY2028, under constitutional challenge → toggle defaults OFF.
export const waIncomeThreshold = 1000000;
export const waIncomeRate = 0.099;
// PR: regular brackets + 5% gradual adjustment over $500k (modeled as a pseudo-bracket,
// capped ≈ $8,895 → flat-33% behavior above ~$677,900). LT gains 0% assumes a LEGACY
// Act 60 decree (≤2026); regular residents pay 15%, new decrees (2027+) pay 4%.
export const pr = [[0,9000,0],[9000,25000,0.07],[25000,41500,0.14],[41500,61500,0.25],[61500,Infinity,0.33]];
export const prGradual = [[500000, 677900, 0.05]];

// ---- foreign systems (native currency → USD via FX) ----
// SG: YA2024+ resident table (unchanged for YA2026), IRAS.
const sgSGD = [
    [0,20000,0],[20000,30000,0.02],[30000,40000,0.035],[40000,80000,0.07],
    [80000,120000,0.115],[120000,160000,0.15],[160000,200000,0.18],
    [200000,240000,0.19],[240000,280000,0.195],[280000,320000,0.20],
    [320000,500000,0.22],[500000,1000000,0.23],[1000000,Infinity,0.24]
];
export const sg = conv(sgSGD, FX.SGD);

// JP: national brackets (unchanged since 2015). The engine computes JP in JPY so it
// can apply the 2025-reform deductions (employment income deduction min ¥650k,
// basic deduction ¥580k national / ¥430k inhabitant).
export const jpJPY = [
    [0,1950000,0.05],[1950000,3300000,0.10],[3300000,6950000,0.20],
    [6950000,9000000,0.23],[9000000,18000000,0.33],[18000000,40000000,0.40],
    [40000000,Infinity,0.45]
];
export const jp = conv(jpJPY, FX.JPY); // USD view for charts/tables
export const jpSurtaxRate = 0.021;       // reconstruction surtax on national tax (through 2037)
export const jpLocalRate = 0.10;         // inhabitant tax
export const jpPerCapitaJPY = 5000;      // inhabitant per-capita levy (incl. forest levy)
export const jpBasicDeductionJPY = { national: 580000, inhabitant: 430000 }; // 2025 reform
export const jpCapitalRate = 0.20315;    // listed securities, any holding period

// AU: FY2026-27 resident rates (legislated cut: 16% → 15% from 1 Jul 2026; → 14% FY2027-28).
const auAUD = [
    [0,18200,0],[18200,45000,0.15],[45000,135000,0.30],
    [135000,190000,0.37],[190000,Infinity,0.45]
];
export const au = conv(auAUD, FX.AUD);
export const auMedicareRate = 0.02; // low-income exemption (< A$28k) not modeled

// NZ: 2026-27 thresholds (unchanged from 2025-26). ACC earner's levy (1.75%) not modeled.
const nzNZD = [
    [0,15600,0.105],[15600,53500,0.175],[53500,78100,0.30],
    [78100,180000,0.33],[180000,Infinity,0.39]
];
export const nz = conv(nzNZD, FX.NZD);

// TW: 2026 CPI-indexed brackets (MOF). Engine subtracts the standard package of
// exemption + standard deduction + salary special deduction (NT$464k, single, 2026).
const twTWD = [
    [0,610000,0.05],[610000,1380000,0.12],[1380000,2770000,0.20],
    [2770000,5190000,0.30],[5190000,Infinity,0.40]
];
export const tw = conv(twTWD, FX.TWD);
export const twDeduction = 464000 * FX.TWD; // ≈ $14.7k off the top
// Domestic securities gains exempt; overseas-income AMT (20% > NT$7.5M) not modeled.

// HK: 2025/26 progressive bands + basic allowance, capped by the two-tier standard
// rate (15% on first HKD 5M net income, 16% above — since 2024/25).
const hkHKD = [
    [0,50000,0.02],[50000,100000,0.06],[100000,150000,0.10],
    [150000,200000,0.14],[200000,Infinity,0.17]
];
export const hk = conv(hkHKD, FX.HKD);
export const hkAllowance = 132000 * FX.HKD; // basic allowance (progressive leg only)
export const hkStd = conv([[0,5000000,0.15],[5000000,Infinity,0.16]], FX.HKD);
export const hkStandardRate = 0.15; // display-only (marginal chart)

// ========== LOCATION METADATA ==========
// Single source of truth for the location list — used by selects, charts, maps, and other tabs.
export const LOCATIONS = [
    { code: 'CA', name: 'california' },
    { code: 'NY', name: 'new york' },
    { code: 'UT', name: 'utah' },
    { code: 'TX', name: 'texas' },
    { code: 'FL', name: 'florida' },
    { code: 'WA', name: 'washington (seattle)' },
    { code: 'NV', name: 'nevada (las vegas)' },
    { code: 'PR', name: 'puerto rico (act 60)' },
    { code: 'SG', name: 'singapore resident' },
    { code: 'JP', name: 'japan resident' },
    { code: 'AE', name: 'dubai (UAE)' },
    { code: 'AU', name: 'australia' },
    { code: 'NZ', name: 'new zealand' },
    { code: 'TW', name: 'taiwan' },
    { code: 'HK', name: 'hong kong' },
];
