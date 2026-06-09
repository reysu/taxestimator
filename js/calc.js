// Shared tax engine — pure functions used by every tab.
import {
    fedBrackets, fedLTCGBrackets,
    niitThreshold, ficaSSCap, ficaMedicareExtra,
    ca, ny, utRate, waThreshold, waIncomeThreshold, waIncomeRate,
    pr, sg, jp, jpSurtaxRate, jpLocalRate, jpCapitalRate,
    au, auMedicareRate, nz, tw, hk, hkStandardRate
} from '../data/brackets.js';

// ========== HELPERS ==========
export function taxBracket(amount, brackets) {
    let tax = 0;
    for (const [lower, upper, rate] of brackets) {
        if (amount <= lower) break;
        tax += (Math.min(amount, upper) - lower) * rate;
        if (amount <= upper) break;
    }
    return tax;
}

export function taxBracketStacked(amount, brackets, startAt) {
    if (amount <= 0) return 0;
    let tax = 0;
    const end = startAt + amount;
    for (const [lower, upper, rate] of brackets) {
        if (end <= lower) break;
        const effLower = Math.max(lower, startAt);
        const effUpper = Math.min(end, upper);
        if (effUpper <= effLower) continue;
        tax += (effUpper - effLower) * rate;
    }
    return tax;
}

export function bracketDetail(amount, brackets, startAt) {
    if (amount <= 0) return [];
    const rows = [];
    const end = (startAt || 0) + amount;
    for (const [lower, upper, rate] of brackets) {
        if (end <= lower) break;
        const effLower = Math.max(lower, startAt || 0);
        const effUpper = Math.min(end, upper);
        if (effUpper <= effLower) continue;
        const taxable = effUpper - effLower;
        rows.push({ lower, upper, rate, taxable, tax: taxable * rate });
    }
    return rows;
}

// ========== LOCATION TAX ==========
export function locationTax(amount, loc, type, stackBase, opts) {
    if (amount <= 0) return 0;
    const waMillionaires = opts && opts.waMillionaires;
    switch (loc) {
        case 'CA': return taxBracketStacked(amount, ca, stackBase);
        case 'NY': return taxBracketStacked(amount, ny, stackBase);
        case 'UT': return amount * utRate;
        case 'WA': {
            let waTax = 0;
            if (type === 'long' && amount > waThreshold) {
                const taxable = amount - waThreshold;
                const gainCap = 1000000 - waThreshold;
                waTax += taxable <= gainCap ? taxable * 0.07 : gainCap * 0.07 + (taxable - gainCap) * 0.099;
            }
            if (waMillionaires) {
                const totalInc = stackBase + amount;
                if (totalInc > waIncomeThreshold) {
                    const over = Math.min(amount, totalInc - waIncomeThreshold);
                    waTax += over * waIncomeRate;
                }
            }
            return waTax;
        }
        case 'TX': case 'FL': case 'NV': return 0;
        case 'PR':
            if (type === 'long') return 0;
            return taxBracketStacked(amount, pr, stackBase);
        case 'SG':
            if (type === 'long' || type === 'short') return 0;
            return taxBracketStacked(amount, sg, stackBase);
        case 'JP':
            if (type === 'long' || type === 'short') return amount * jpCapitalRate;
            const natTax = taxBracketStacked(amount, jp, stackBase);
            const surtax = natTax * jpSurtaxRate;
            return natTax + surtax + amount * jpLocalRate;
        case 'AE': return 0;
        case 'AU': {
            if (type === 'long') {
                const discounted = amount * 0.5;
                const bracketTax = taxBracketStacked(discounted, au, stackBase);
                const medicare = discounted * auMedicareRate;
                return bracketTax + medicare;
            }
            const bracketTax = taxBracketStacked(amount, au, stackBase);
            const medicare = amount * auMedicareRate;
            return bracketTax + medicare;
        }
        case 'NZ':
            if (type === 'long' || type === 'short') return 0;
            return taxBracketStacked(amount, nz, stackBase);
        case 'TW':
            if (type === 'long' || type === 'short') return 0;
            return taxBracketStacked(amount, tw, stackBase);
        case 'HK': {
            if (type === 'long' || type === 'short') return 0;
            const progressiveHK = taxBracketStacked(amount, hk, stackBase);
            const standardHK = (stackBase + amount) * hkStandardRate - stackBase * hkStandardRate;
            return Math.min(progressiveHK, standardHK);
        }
        default: return 0;
    }
}

// ========== FORMAT ==========
export const fmt = v => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const fmt2 = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtK = v => {
    const n = Number(v);
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k';
    return '$' + n.toFixed(0);
};

// ========== APPLY LOSSES ==========
export function applyLosses(st, lt, inc, loss, loc) {
    const isUS = !['SG', 'JP', 'AE', 'AU', 'NZ', 'TW', 'HK'].includes(loc);
    const incomeDeductionCap = isUS ? 3000 : Infinity;
    let remaining = loss;
    let stT = Math.max(0, st - remaining);
    remaining = Math.max(0, remaining - st);
    let ltT = Math.max(0, lt - remaining);
    remaining = Math.max(0, remaining - lt);
    const incDeduction = Math.min(remaining, incomeDeductionCap);
    let incT = Math.max(0, inc - incDeduction);
    return [stT, ltT, incT];
}

// ========== CALCULATE FOR A GIVEN LOCATION ==========
export function calcForLocation(lt, st, inc, loss, loc, opts) {
    const [stTaxable, ltTaxable, incTaxable] = applyLosses(st, lt, inc, loss, loc);
    const noFederal = ['PR', 'SG', 'JP', 'AE', 'AU', 'NZ', 'TW', 'HK'].includes(loc);
    const status = opts.status || 'single';
    const fedOrd = fedBrackets[status];
    const fedLTCG = fedLTCGBrackets[status];

    // Apply deduction to federal taxable income
    const deduction = noFederal ? 0 : (opts.deduction || 0);
    let dedRemaining = deduction;
    const fedInc = Math.max(0, incTaxable - dedRemaining);
    dedRemaining = Math.max(0, dedRemaining - incTaxable);
    const fedSt = Math.max(0, stTaxable - dedRemaining);
    dedRemaining = Math.max(0, dedRemaining - stTaxable);
    const fedLt = Math.max(0, ltTaxable - dedRemaining);

    let fedLongTax = 0, fedShortTax = 0, fedIncomeTax = 0, niitTax = 0, ficaTax = 0;
    if (!noFederal) {
        const ordinaryTotal = fedInc + fedSt;
        const fedOrdTotal = taxBracket(ordinaryTotal, fedOrd);
        if (ordinaryTotal > 0) {
            fedIncomeTax = fedOrdTotal * (fedInc / ordinaryTotal);
            fedShortTax = fedOrdTotal * (fedSt / ordinaryTotal);
        }
        fedLongTax = taxBracketStacked(fedLt, fedLTCG, ordinaryTotal);

        // NIIT: 3.8% on lesser of investment income or AGI excess
        const investmentIncome = stTaxable + ltTaxable;
        const agi = incTaxable + stTaxable + ltTaxable;
        const niitExcess = Math.max(0, agi - niitThreshold[status]);
        niitTax = Math.min(investmentIncome, niitExcess) * 0.038;

        // FICA / SE tax
        if (opts.selfEmployed && incTaxable > 0) {
            const seBase = incTaxable * 0.9235;
            const ssTax = Math.min(seBase, ficaSSCap) * 0.124;
            const medTax = seBase * 0.029;
            const extraMed = Math.max(0, seBase - ficaMedicareExtra[status]) * 0.009;
            ficaTax = ssTax + medTax + extraMed;
        }
    }

    let locStackBase = 0;
    const locIncomeTax = locationTax(incTaxable, loc, 'inc', locStackBase, opts);
    if (['CA', 'NY', 'PR', 'SG', 'JP', 'WA', 'AU', 'NZ', 'TW', 'HK'].includes(loc)) locStackBase += incTaxable;

    const locShortTax = locationTax(stTaxable, loc, 'short', locStackBase, opts);
    if (['CA', 'NY', 'PR', 'WA', 'AU'].includes(loc)) locStackBase += stTaxable;

    const locLongTax = locationTax(ltTaxable, loc, 'long', locStackBase, opts);

    return {
        fedLongTax, fedShortTax, fedIncomeTax, niitTax, ficaTax,
        locLongTax, locShortTax, locIncomeTax,
        total: fedLongTax + fedShortTax + fedIncomeTax + niitTax + ficaTax + locLongTax + locShortTax + locIncomeTax,
        deduction,
        // For bracket detail
        fedOrd, fedLTCG, fedInc, fedSt, fedLt,
        incTaxable, stTaxable, ltTaxable
    };
}

// ========== REVERSE: GROSS INCOME NEEDED FOR A TARGET NET ==========
// Given a target take-home (net), find the gross income that produces it
// at a location, via binary search. Used by the cost-of-living tab.
// `split` lets you choose how the gross is composed across income types.
export function grossForNet(targetNet, loc, opts, split) {
    if (targetNet <= 0) return 0;
    const s = split || { inc: 1, st: 0, lt: 0 };
    const netForGross = gross => {
        const lt = gross * (s.lt || 0);
        const st = gross * (s.st || 0);
        const inc = gross * (s.inc || 0);
        const r = calcForLocation(lt, st, inc, 0, loc, opts);
        return gross - r.total;
    };
    let lo = targetNet, hi = targetNet * 4;
    // Expand hi until it brackets the target (handles very high effective rates).
    while (netForGross(hi) < targetNet && hi < targetNet * 100) hi *= 1.5;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (netForGross(mid) < targetNet) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}
