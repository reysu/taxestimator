// ========== FEDERAL (US) 2025 ==========
export const fedBrackets = {
    single: [
        [0, 11925, 0.10], [11925, 48475, 0.12], [48475, 103350, 0.22],
        [103350, 197300, 0.24], [197300, 250525, 0.32], [250525, 626350, 0.35],
        [626350, Infinity, 0.37]
    ],
    mfj: [
        [0, 23850, 0.10], [23850, 96950, 0.12], [96950, 206700, 0.22],
        [206700, 394600, 0.24], [394600, 501050, 0.32], [501050, 751600, 0.35],
        [751600, Infinity, 0.37]
    ],
    hoh: [
        [0, 17000, 0.10], [17000, 64850, 0.12], [64850, 103350, 0.22],
        [103350, 197300, 0.24], [197300, 250500, 0.32], [250500, 626350, 0.35],
        [626350, Infinity, 0.37]
    ]
};
export const fedLTCGBrackets = {
    single: [[0, 48350, 0.00], [48350, 533400, 0.15], [533400, Infinity, 0.20]],
    mfj: [[0, 96700, 0.00], [96700, 600050, 0.15], [600050, Infinity, 0.20]],
    hoh: [[0, 64750, 0.00], [64750, 566700, 0.15], [566700, Infinity, 0.20]]
};
export const stdDeduction = { single: 15000, mfj: 30000, hoh: 22500 };
export const niitThreshold = { single: 200000, mfj: 250000, hoh: 200000 };
export const ficaSSCap = 176100;
export const ficaMedicareExtra = { single: 200000, mfj: 250000, hoh: 200000 };

// ========== STATE / LOCATION 2025 ==========
export const ca = [
    [0,10756,0.01],[10756,25499,0.02],[25499,40245,0.04],[40245,55866,0.06],
    [55866,70606,0.08],[70606,360659,0.093],[360659,432787,0.103],
    [432787,721314,0.113],[721314,Infinity,0.123]
];
export const ny = [
    [0,8500,0.04],[8500,11700,0.045],[11700,13900,0.0525],[13900,80650,0.055],
    [80650,215400,0.06],[215400,1077550,0.0685],[1077550,5000000,0.0965],
    [5000000,25000000,0.103],[25000000,Infinity,0.109]
];
export const utRate = 0.045;
export const waThreshold = 278000;
export const waIncomeThreshold = 1000000;
export const waIncomeRate = 0.099;
export const pr = [[0,9000,0],[9000,25000,0.07],[25000,41500,0.14],[41500,61500,0.25],[61500,Infinity,0.33]];
export const sg = [
    [0,20000,0],[20000,30000,0.02],[30000,40000,0.035],[40000,80000,0.07],
    [80000,120000,0.115],[120000,160000,0.15],[160000,200000,0.18],
    [200000,240000,0.19],[240000,280000,0.195],[280000,320000,0.20],
    [320000,500000,0.22],[500000,1000000,0.23],[1000000,Infinity,0.24]
];
export const jp = [
    [0,12580,0.05],[12580,21290,0.10],[21290,44840,0.20],
    [44840,58070,0.23],[58070,116130,0.33],[116130,258070,0.40],[258070,Infinity,0.45]
];
export const jpSurtaxRate = 0.021;
export const jpLocalRate = 0.10;
export const jpCapitalRate = 0.20315;
export const au = [
    [0,18200,0],[18200,45000,0.16],[45000,135000,0.30],
    [135000,190000,0.37],[190000,Infinity,0.45]
];
export const auMedicareRate = 0.02;
export const nz = [
    [0,15600,0.105],[15600,53500,0.175],[53500,78100,0.30],
    [78100,180000,0.33],[180000,Infinity,0.39]
];
export const tw = [
    [0,18438,0.05],[18438,41563,0.12],[41563,83125,0.20],
    [83125,155625,0.30],[155625,Infinity,0.40]
];
export const hk = [
    [0,6410,0.02],[6410,12821,0.06],[12821,19231,0.10],
    [19231,25641,0.14],[25641,Infinity,0.17]
];
export const hkStandardRate = 0.15;

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
    { code: 'PR', name: 'puerto rico' },
    { code: 'SG', name: 'singapore resident' },
    { code: 'JP', name: 'japan resident' },
    { code: 'AE', name: 'dubai (UAE)' },
    { code: 'AU', name: 'australia' },
    { code: 'NZ', name: 'new zealand' },
    { code: 'TW', name: 'taiwan' },
    { code: 'HK', name: 'hong kong' },
];
