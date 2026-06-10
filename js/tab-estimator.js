// Tab 1 — the original tax estimator. Logic moved verbatim from the old inline <script>.
import { calcForLocation, bracketDetail, fmt, fmt2, fmtK } from './calc.js';
import {
    stdDeduction, waIncomeThreshold, fedBrackets,
    ca, ny, pr, sg, jp, au, nz, tw, hk,
    jpSurtaxRate, jpLocalRate, hkStandardRate, utRate
} from '../data/brackets.js';
import { ledgerSummary } from './tab-ledger.js';

// ========== UI SYNC ==========
['lt', 'st', 'inc', 'loss'].forEach(id => {
    const num = document.getElementById(id);
    const rng = document.getElementById(id + 'Range');
    const sync = val => { num.value = val; rng.value = val; };
    num.addEventListener('input', () => { sync(num.value); calc(); });
    rng.addEventListener('input', () => { sync(rng.value); calc(); });
    sync(0);
});
document.getElementById('itemized').addEventListener('input', calc);
document.querySelectorAll('.btn-adj').forEach(btn => {
    btn.addEventListener('click', () => {
        const num = document.getElementById(btn.dataset.target);
        const rng = document.getElementById(btn.dataset.target + 'Range');
        const delta = btn.classList.contains('inc') ? 10000 : -10000;
        const val = Math.max(0, (+num.value || 0) + delta);
        num.value = val; rng.value = val; calc();
    });
});
document.getElementById('state').addEventListener('change', () => {
    const loc = document.getElementById('state').value;
    document.getElementById('waToggle').classList.toggle('visible', loc === 'WA');
    calc();
});
document.getElementById('compareState').addEventListener('change', calc);
document.getElementById('compareStatus').addEventListener('change', calc);
document.getElementById('waMillionaires').addEventListener('change', calc);
document.getElementById('selfEmployed').addEventListener('change', calc);
document.getElementById('useItemized').addEventListener('change', () => {
    document.getElementById('itemizedWrap').classList.toggle('visible', document.getElementById('useItemized').checked);
    calc();
});

// Filing status pills
document.querySelectorAll('.status-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        calc();
    });
});

// Import from ledger / reset
const setInput = (id, v) => {
    const n = document.getElementById(id), r = document.getElementById(id + 'Range');
    if (n) n.value = v;
    if (r) r.value = v;
};
document.getElementById('importLedgerBtn').addEventListener('click', () => {
    const s = ledgerSummary();
    if (!s.hasData && !confirm('your ledger is empty — import zeros anyway?')) return;
    setInput('inc', s.inc); setInput('lt', s.lt); setInput('st', s.st); setInput('loss', s.loss);
    document.getElementById('state').value = s.loc;
    document.querySelectorAll('.status-pill').forEach(p => p.classList.toggle('active', p.dataset.status === s.status));
    document.getElementById('selfEmployed').checked = s.selfEmployed;
    document.getElementById('waToggle').classList.toggle('visible', s.loc === 'WA');
    calc();
});
document.getElementById('resetBtn').addEventListener('click', () => {
    ['inc', 'lt', 'st', 'loss'].forEach(id => setInput(id, 0));
    setInput('itemized', 0);
    document.getElementById('useItemized').checked = false;
    document.getElementById('itemizedWrap').classList.remove('visible');
    document.getElementById('selfEmployed').checked = false;
    document.querySelectorAll('.status-pill').forEach(p => p.classList.toggle('active', p.dataset.status === 'single'));
    calc();
});

// ========== CHARTS ==========
const ctx = document.getElementById('chart').getContext('2d');
const chart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Work Income', 'Long Term', 'Short Term'],
        datasets: [
            { label: 'Federal Tax', data: [0, 0, 0], backgroundColor: 'rgba(107,114,203,0.7)', borderRadius: 4 },
            { label: 'Location Tax', data: [0, 0, 0], backgroundColor: 'rgba(239,68,68,0.5)', borderRadius: 4 }
        ]
    },
    options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#8b8fa3', font: { size: 11 } } } },
        scales: {
            x: { stacked: true, ticks: { color: '#8b8fa3' }, grid: { color: 'rgba(46,51,71,0.5)' } },
            y: { stacked: true, beginAtZero: true, ticks: { color: '#8b8fa3', callback: v => '$' + v.toLocaleString() }, grid: { color: 'rgba(46,51,71,0.5)' } }
        }
    }
});

const locationCodes = ['CA','NY','UT','TX','FL','WA','NV','PR','SG','JP','AE','AU','NZ','TW','HK'];
const locationLabels = ['CA','NY','UT','TX','FL','WA','NV','PR','SG','JP','AE','AU','NZ','TW','HK'];
const allLocCtx = document.getElementById('allLocationsChart').getContext('2d');
const allLocationsChart = new Chart(allLocCtx, {
    type: 'bar',
    data: {
        labels: locationLabels,
        datasets: [{ label: 'Total Tax', data: Array(locationCodes.length).fill(0), backgroundColor: 'rgba(239,68,68,0.6)', borderRadius: 4 }]
    },
    options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#8b8fa3' }, grid: { color: 'rgba(46,51,71,0.5)' } },
            y: { beginAtZero: true, ticks: { color: '#8b8fa3', callback: v => '$' + v.toLocaleString() }, grid: { color: 'rgba(46,51,71,0.5)' } }
        }
    }
});

// Marginal rate chart
const margCtx = document.getElementById('marginalChart').getContext('2d');
const marginalChart = new Chart(margCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Federal Rate', data: [], borderColor: 'rgba(107,114,203,0.9)', backgroundColor: 'rgba(107,114,203,0.15)', fill: true, tension: 0, pointRadius: 0, borderWidth: 2 },
            { label: 'Location Rate', data: [], borderColor: 'rgba(239,68,68,0.8)', backgroundColor: 'rgba(239,68,68,0.12)', fill: true, tension: 0, pointRadius: 0, borderWidth: 2 }
        ]
    },
    options: {
        responsive: true,
        plugins: {
            legend: { labels: { color: '#8b8fa3', font: { size: 11 } } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%' } }
        },
        scales: {
            x: { ticks: { color: '#8b8fa3', maxTicksLimit: 10 }, grid: { color: 'rgba(46,51,71,0.5)' } },
            y: { beginAtZero: true, max: 60, ticks: { color: '#8b8fa3', callback: v => v + '%' }, grid: { color: 'rgba(46,51,71,0.5)' } }
        }
    }
});

// ========== BRACKET TABLE ==========
let bracketTableOpen = false;
document.getElementById('bracketToggleBtn').addEventListener('click', () => {
    bracketTableOpen = !bracketTableOpen;
    document.getElementById('bracketTableWrap').classList.toggle('open', bracketTableOpen);
    document.getElementById('bracketToggleBtn').textContent = bracketTableOpen ? T[currentLang].hide_brackets : T[currentLang].show_brackets;
});

function buildBracketTable(r, loc) {
    const rows = [];
    const locLabel = locLabelMap[loc] || 'state';

    // Federal ordinary (income + short-term combined)
    const ordTotal = r.fedInc + r.fedSt;
    if (ordTotal > 0) {
        rows.push(`<tr class="section-header"><td colspan="4">federal ordinary income</td></tr>`);
        const details = bracketDetail(ordTotal, r.fedOrd, 0);
        details.forEach((d, i) => {
            const isLast = i === details.length - 1 && d.taxable > 0;
            rows.push(`<tr${isLast ? ' class="active-bracket"' : ''}><td>${fmtK(d.lower)} - ${d.upper === Infinity ? '+' : fmtK(d.upper)}</td><td>${(d.rate * 100).toFixed(1)}%</td><td>${fmt(d.taxable)}</td><td>${fmt(d.tax)}</td></tr>`);
        });
    }

    // Federal LTCG
    if (r.fedLt > 0) {
        rows.push(`<tr class="section-header"><td colspan="4">federal long-term capital gains</td></tr>`);
        const details = bracketDetail(r.fedLt, r.fedLTCG, ordTotal);
        details.forEach((d, i) => {
            const isLast = i === details.length - 1 && d.taxable > 0;
            rows.push(`<tr${isLast ? ' class="active-bracket"' : ''}><td>${fmtK(d.lower)} - ${d.upper === Infinity ? '+' : fmtK(d.upper)}</td><td>${(d.rate * 100).toFixed(1)}%</td><td>${fmt(d.taxable)}</td><td>${fmt(d.tax)}</td></tr>`);
        });
    }

    // Location brackets
    const locBrackets = { CA: ca, NY: ny, PR: pr, SG: sg, JP: jp, AU: au, NZ: nz, TW: tw, HK: hk }[loc];
    if (locBrackets && (r.incTaxable + r.stTaxable + r.ltTaxable) > 0) {
        rows.push(`<tr class="section-header"><td colspan="4">${locLabel} income tax</td></tr>`);
        let locAmount = r.incTaxable;
        if (['CA', 'NY', 'PR', 'AU'].includes(loc)) locAmount += r.stTaxable;
        if (loc === 'AU') locAmount += r.ltTaxable * 0.5; // CGT discount
        if (locAmount > 0) {
            const details = bracketDetail(locAmount, locBrackets, 0);
            details.forEach((d, i) => {
                const isLast = i === details.length - 1 && d.taxable > 0;
                rows.push(`<tr${isLast ? ' class="active-bracket"' : ''}><td>${fmtK(d.lower)} - ${d.upper === Infinity ? '+' : fmtK(d.upper)}</td><td>${(d.rate * 100).toFixed(1)}%</td><td>${fmt(d.taxable)}</td><td>${fmt(d.tax)}</td></tr>`);
            });
        }
    }

    if (rows.length === 0) {
        rows.push('<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">no bracket taxes for this location</td></tr>');
    }

    document.getElementById('bracketTable').innerHTML =
        '<thead><tr><th>bracket</th><th>rate</th><th>taxable</th><th>tax</th></tr></thead><tbody>' +
        rows.join('') + '</tbody>';
}

// ========== MARGINAL RATE CHART ==========
function updateMarginalChart(loc, status, opts) {
    const fedOrd = fedBrackets[status];
    const noFederal = ['PR', 'SG', 'JP', 'AE', 'AU', 'NZ', 'TW', 'HK'].includes(loc);
    const max = Math.max(1000000, (+document.getElementById('inc').value || 0) + (+document.getElementById('lt').value || 0) + (+document.getElementById('st').value || 0));
    const step = Math.max(10000, Math.round(max / 50 / 10000) * 10000);
    const labels = [];
    const fedRates = [];
    const locRates = [];

    for (let i = 0; i <= max; i += step) {
        labels.push(fmtK(i));
        // Federal marginal rate at this income level (treating as ordinary income)
        let fedRate = 0;
        if (!noFederal) {
            for (const [lower, upper, rate] of fedOrd) {
                if (i >= lower && i < upper) { fedRate = rate * 100; break; }
            }
        }
        // Location marginal rate (JP/HK handled below — they need combined/capped rates)
        let locRate = 0;
        const locBracketsMap = { CA: ca, NY: ny, PR: pr, SG: sg, AU: au, NZ: nz, TW: tw };
        const locB = locBracketsMap[loc];
        if (locB) {
            for (const [lower, upper, rate] of locB) {
                if (i >= lower && i < upper) { locRate = rate * 100; break; }
            }
        } else if (loc === 'UT') {
            locRate = utRate * 100;
        } else if (loc === 'JP') {
            // simplified: national + local
            for (const [lower, upper, rate] of jp) {
                if (i >= lower && i < upper) { locRate = (rate * (1 + jpSurtaxRate) + jpLocalRate) * 100; break; }
            }
        } else if (loc === 'HK') {
            // HK: min of progressive rate vs 15% standard rate
            for (const [lower, upper, rate] of hk) {
                if (i >= lower && i < upper) { locRate = Math.min(rate, hkStandardRate) * 100; break; }
            }
        }

        fedRates.push(fedRate);
        locRates.push(locRate);
    }

    marginalChart.data.labels = labels;
    marginalChart.data.datasets[0].data = fedRates;
    marginalChart.data.datasets[1].data = locRates;
    marginalChart.update();
}

// ========== ANIMATED VALUES ==========
const animationState = {};
function animateValue(el, target, prefix, suffix) {
    const key = el.id || el.className;
    if (animationState[key]) cancelAnimationFrame(animationState[key]);
    const current = parseFloat((el.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;
    if (Math.abs(current - target) < 1) { el.textContent = prefix + Number(target).toLocaleString('en-US', { maximumFractionDigits: 0 }) + suffix; return; }
    const start = performance.now();
    const duration = 350;
    const from = current;
    function step(ts) {
        const p = Math.min(1, (ts - start) / duration);
        const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const val = from + (target - from) * ease;
        el.textContent = prefix + Number(Math.round(val)).toLocaleString('en-US', { maximumFractionDigits: 0 }) + suffix;
        if (p < 1) animationState[key] = requestAnimationFrame(step);
    }
    animationState[key] = requestAnimationFrame(step);
}

// ========== URL SHARING ==========
function encodeState() {
    const params = new URLSearchParams();
    params.set('lt', document.getElementById('lt').value);
    params.set('st', document.getElementById('st').value);
    params.set('inc', document.getElementById('inc').value);
    params.set('loss', document.getElementById('loss').value);
    params.set('loc', document.getElementById('state').value);
    params.set('status', document.querySelector('.status-pill.active').dataset.status);
    if (document.getElementById('useItemized').checked) {
        params.set('itemized', document.getElementById('itemized').value);
    }
    if (document.getElementById('selfEmployed').checked) params.set('se', '1');
    if (document.getElementById('waMillionaires').checked) params.set('wam', '1');
    const cmp = document.getElementById('compareState').value;
    if (cmp) params.set('cmp', cmp);
    const cmpSt = document.getElementById('compareStatus').value;
    if (cmpSt) params.set('cmpst', cmpSt);
    return window.location.origin + window.location.pathname + '?' + params.toString();
}

function decodeState() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('loc') && !params.has('lt') && !params.has('inc')) return;

    if (params.has('lt')) { document.getElementById('lt').value = params.get('lt'); document.getElementById('ltRange').value = params.get('lt'); }
    if (params.has('st')) { document.getElementById('st').value = params.get('st'); document.getElementById('stRange').value = params.get('st'); }
    if (params.has('inc')) { document.getElementById('inc').value = params.get('inc'); document.getElementById('incRange').value = params.get('inc'); }
    if (params.has('loss')) { document.getElementById('loss').value = params.get('loss'); document.getElementById('lossRange').value = params.get('loss'); }
    if (params.has('loc')) document.getElementById('state').value = params.get('loc');
    if (params.has('status')) {
        document.querySelectorAll('.status-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.status === params.get('status'));
        });
    }
    if (params.has('itemized')) {
        document.getElementById('useItemized').checked = true;
        document.getElementById('itemizedWrap').classList.add('visible');
        document.getElementById('itemized').value = params.get('itemized');
    }
    if (params.has('se')) document.getElementById('selfEmployed').checked = true;
    if (params.get('wam') === '1') document.getElementById('waMillionaires').checked = true;
    if (params.has('cmp')) document.getElementById('compareState').value = params.get('cmp');
    if (params.has('cmpst')) document.getElementById('compareStatus').value = params.get('cmpst');
}

document.getElementById('copyBtn').addEventListener('click', () => {
    const url = encodeState();
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = T[currentLang].copied;
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = T[currentLang].copy_link; btn.classList.remove('copied'); }, 2000);
    });
});

// ========== LOC LABEL ==========
const locLabelMap = { 'SG': 'singapore', 'JP': 'japan', 'PR': 'puerto rico (act 60)', 'AE': 'dubai', 'AU': 'australia', 'NZ': 'new zealand', 'TW': 'taiwan', 'HK': 'hong kong' };

// ========== MAIN CALCULATION ==========
function calc() {
    const lt = +document.getElementById('lt').value || 0;
    const st = +document.getElementById('st').value || 0;
    const inc = +document.getElementById('inc').value || 0;
    const loss = +document.getElementById('loss').value || 0;
    const loc = document.getElementById('state').value;
    const status = document.querySelector('.status-pill.active').dataset.status;
    const waMillionaires = document.getElementById('waMillionaires').checked;
    const selfEmployed = document.getElementById('selfEmployed').checked;
    const useItemized = document.getElementById('useItemized').checked;
    const itemizedAmt = +document.getElementById('itemized').value || 0;

    const deduction = useItemized ? itemizedAmt : stdDeduction[status];
    const noFederal = ['PR', 'SG', 'JP', 'AE', 'AU', 'NZ', 'TW', 'HK'].includes(loc);

    // Update deduction display
    const dedTip = useItemized ? T[currentLang].tip_item_ded : T[currentLang].tip_std_ded;
    const dedText = useItemized ? T[currentLang].itemized_ded : T[currentLang].std_ded;
    document.getElementById('dedLabel').innerHTML = `<span class="help" data-tip="${dedTip}">${dedText}</span>`;
    document.getElementById('dedValue').textContent = noFederal ? 'n/a' : fmt(deduction);

    const opts = { waMillionaires, selfEmployed, status, deduction };
    const r = calcForLocation(lt, st, inc, loss, loc, opts);

    const taxLong = r.fedLongTax + r.locLongTax;
    const taxShort = r.fedShortTax + r.locShortTax;
    const taxIncome = r.fedIncomeTax + r.locIncomeTax;

    const pctLong = lt ? ((taxLong / lt) * 100).toFixed(1) : '0.0';
    const pctShort = st ? ((taxShort / st) * 100).toFixed(1) : '0.0';
    const pctIncome = inc ? ((taxIncome / inc) * 100).toFixed(1) : '0.0';

    const totalTax = r.total;
    const federalTotal = r.fedLongTax + r.fedShortTax + r.fedIncomeTax;
    const locTotal = r.locLongTax + r.locShortTax + r.locIncomeTax;
    const totalEarned = lt + st + inc;
    const totalNet = totalEarned - totalTax;
    const effectiveRate = totalEarned ? ((totalTax / totalEarned) * 100).toFixed(1) : '0.0';

    updateResultItem('resLong', fmt2(lt - taxLong), `${pctLong}% effective · ${fmt(taxLong)} tax`);
    updateResultItem('resShort', fmt2(st - taxShort), `${pctShort}% effective · ${fmt(taxShort)} tax`);
    updateResultItem('resIncome', fmt2(inc - taxIncome), `${pctIncome}% effective · ${fmt(taxIncome)} tax`);

    const locLabel = locLabelMap[loc] || 'state';
    const t = T[currentLang];
    let breakdownHTML = bkRow(t.federal_tax, fmt(federalTotal));
    if (r.niitTax > 0) breakdownHTML += bkRow(`<span class="help" data-tip="${t.tip_niit}">NIIT (3.8%)</span>`, fmt(r.niitTax));
    if (r.ficaTax > 0) breakdownHTML += bkRow(`<span class="help" data-tip="${t.tip_fica}">FICA / SE</span>`, fmt(r.ficaTax));
    breakdownHTML += bkRow(locLabel + t.loc_tax, fmt(locTotal));
    if (!noFederal) breakdownHTML += bkRow(t.ded_applied, fmt(r.deduction));
    breakdownHTML += bkRow(t.loss_applied, fmt(loss));
    breakdownHTML += bkRow(`<span class="help" data-tip="${t.tip_effective}">${t.effective_rate}</span>`, effectiveRate + '%');
    document.getElementById('breakdownRows').innerHTML = breakdownHTML;

    // WA tooltip
    const waTriggered = loc === 'WA' && waMillionaires && (inc + st + lt) > waIncomeThreshold;
    document.getElementById('waTooltip').classList.toggle('visible', waTriggered);

    // Animated summary
    animateValue(document.getElementById('earned'), totalEarned, '$', '');
    animateValue(document.getElementById('total'), totalTax, '$', '');
    const profitEl = document.getElementById('profit');
    animateValue(profitEl, totalNet, '$', '');

    // Main chart
    chart.data.datasets[0].data = [r.fedIncomeTax, r.fedLongTax, r.fedShortTax];
    chart.data.datasets[1].data = [r.locIncomeTax, r.locLongTax, r.locShortTax];
    chart.update();

    // All-locations chart
    const allLocTaxes = locationCodes.map(code => calcForLocation(lt, st, inc, loss, code, opts).total);
    allLocationsChart.data.datasets[0].data = allLocTaxes;
    const tc = getThemeColors();
    allLocationsChart.data.datasets[0].backgroundColor = locationCodes.map(code =>
        code === loc ? tc.highlight : tc.locAll
    );
    allLocationsChart.update();

    // Marginal rate chart
    updateMarginalChart(loc, status, opts);

    // Bracket table
    buildBracketTable(r, loc);

    // Comparison (location, filing status, or both)
    const cmpLoc = document.getElementById('compareState').value;
    const cmpStatus = document.getElementById('compareStatus').value;
    const compareSection = document.getElementById('compareResults');
    const statusLabels = { single: 'single', mfj: 'married jointly', hoh: 'head of household' };
    const hasCmpLoc = cmpLoc && cmpLoc !== loc;
    const hasCmpStatus = cmpStatus && cmpStatus !== status;

    if (hasCmpLoc || hasCmpStatus) {
        const cmpLocCode = hasCmpLoc ? cmpLoc : loc;
        const cmpStat = hasCmpStatus ? cmpStatus : status;
        const cmpDed = hasCmpStatus ? (useItemized ? itemizedAmt : stdDeduction[cmpStat]) : deduction;
        const cmpOpts = { ...opts, status: cmpStat, deduction: cmpDed };
        const cr = calcForLocation(lt, st, inc, loss, cmpLocCode, cmpOpts);

        const curLocName = locLabelMap[loc] || loc;
        const cmpLocName = locLabelMap[cmpLocCode] || cmpLocCode;
        const curStatusName = statusLabels[status];
        const cmpStatusName = statusLabels[cmpStat];

        // Build labels showing what changed
        let curLabel = curLocName;
        let cmpLabel = cmpLocName;
        if (hasCmpStatus) {
            curLabel = hasCmpLoc ? `${curLocName} · ${curStatusName}` : curStatusName;
            cmpLabel = hasCmpLoc ? `${cmpLocName} · ${cmpStatusName}` : cmpStatusName;
        }

        const diff = r.total - cr.total;
        const cmpRate = totalEarned ? ((cr.total / totalEarned) * 100).toFixed(1) : '0.0';

        document.getElementById('compareRow').innerHTML =
            `<div class="compare-card">
                <div class="cc-loc">${curLabel}</div>
                <div class="cc-tax">${fmt(r.total)}</div>
                <div class="cc-rate">${effectiveRate}% effective</div>
                <div class="cc-net">take-home: ${fmt(totalEarned - r.total)}</div>
            </div>
            <div class="compare-card">
                <div class="cc-loc">${cmpLabel}</div>
                <div class="cc-tax">${fmt(cr.total)}</div>
                <div class="cc-rate">${cmpRate}% effective</div>
                <div class="cc-net">take-home: ${fmt(totalEarned - cr.total)}</div>
            </div>`;

        const diffEl = document.getElementById('compareDiff');
        if (Math.abs(diff) < 1) {
            diffEl.className = 'compare-diff';
            diffEl.textContent = t.same_burden;
        } else if (diff > 0) {
            diffEl.className = 'compare-diff save';
            diffEl.textContent = t.save_with.replace('{amt}', fmt(diff)).replace('{loc}', cmpLabel);
        } else {
            diffEl.className = 'compare-diff cost';
            diffEl.textContent = t.costs_more.replace('{loc}', cmpLabel).replace('{amt}', fmt(-diff));
        }
        compareSection.style.display = '';
    } else {
        compareSection.style.display = 'none';
    }

    // Update geo map
    updateGeoMap(loc, opts, lt, st, inc, loss);

    // Update sandbox
    sandboxInit();
}

function updateResultItem(id, value, sub) {
    const el = document.getElementById(id);
    el.querySelector('.value').textContent = value;
    el.querySelector('.sub').textContent = sub;
}

function bkRow(label, value) {
    return `<div class="breakdown-row"><span class="bk-label">${label}</span><span class="bk-value">${value}</span></div>`;
}

// ========== THEME ==========
function getThemeColors() {
    const s = getComputedStyle(document.documentElement);
    return {
        grid: s.getPropertyValue('--chart-grid').trim(),
        text: s.getPropertyValue('--chart-text').trim(),
        fed: s.getPropertyValue('--chart-fed').trim(),
        loc: s.getPropertyValue('--chart-loc').trim(),
        locAll: s.getPropertyValue('--chart-loc-all').trim(),
        highlight: s.getPropertyValue('--chart-highlight').trim(),
    };
}

function applyChartTheme() {
    const c = getThemeColors();
    [chart, allLocationsChart, marginalChart].forEach(ch => {
        ch.options.scales.x.ticks.color = c.text;
        ch.options.scales.x.grid.color = c.grid;
        ch.options.scales.y.ticks.color = c.text;
        ch.options.scales.y.grid.color = c.grid;
    });
    chart.data.datasets[0].backgroundColor = c.fed;
    chart.data.datasets[1].backgroundColor = c.loc;
    chart.options.plugins.legend.labels.color = c.text;
    marginalChart.options.plugins.legend.labels.color = c.text;
    [chart, allLocationsChart, marginalChart].forEach(ch => ch.update());
}

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    applyChartTheme();
    calc();
});

// ========== GEO TILE MAP ==========
function rateColor(pct) {
    let r, g, b;
    if (pct <= 20) {
        const t = pct / 20;
        r = Math.round(34 + (234 - 34) * t);
        g = Math.round(197 + (179 - 197) * t);
        b = Math.round(94 + (8 - 94) * t);
    } else {
        const t = Math.min(1, (pct - 20) / 30);
        r = Math.round(234 + (239 - 234) * t);
        g = Math.round(179 - 179 * t + 68 * t);
        b = Math.round(8 + (68 - 8) * t);
    }
    return `rgb(${r},${g},${b})`;
}

function updateGeoMap(loc, opts, lt, st, inc, loss) {
    const totalEarned = lt + st + inc;
    document.querySelectorAll('.map-region').forEach(el => {
        const code = el.dataset.loc;
        const tax = calcForLocation(lt, st, inc, loss, code, opts).total;
        const rate = totalEarned > 0 ? (tax / totalEarned * 100) : 0;
        const bg = rateColor(rate);
        if (el.tagName === 'path') {
            el.setAttribute('fill', bg);
        } else {
            el.querySelector('circle').setAttribute('fill', bg);
        }
        el.dataset.rate = rate.toFixed(1);
        el.classList.toggle('active', code === loc);
    });
}

// Clickable map regions
document.querySelectorAll('.map-region').forEach(el => {
    el.addEventListener('click', () => {
        const code = el.dataset.loc;
        document.getElementById('state').value = code;
        document.getElementById('waToggle').classList.toggle('visible', code === 'WA');
        calc();
    });
});

// Map tooltip
const mapTooltip = document.getElementById('mapTooltip');
const ttName = mapTooltip.querySelector('.tt-name');
const ttRate = mapTooltip.querySelector('.tt-rate');
const locNames = {};
document.querySelectorAll('#state option').forEach(o => { locNames[o.value] = o.textContent; });

document.querySelectorAll('.map-region').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
        const code = el.dataset.loc;
        ttName.textContent = locNames[code] || code;
        ttRate.textContent = ' ' + (el.dataset.rate || '--') + '%';
        mapTooltip.classList.add('visible');
    });
    el.addEventListener('mousemove', (e) => {
        const container = document.getElementById('geoMap');
        const rect = container.getBoundingClientRect();
        mapTooltip.style.left = (e.clientX - rect.left + 12) + 'px';
        mapTooltip.style.top = (e.clientY - rect.top - 10) + 'px';
    });
    el.addEventListener('mouseleave', () => {
        mapTooltip.classList.remove('visible');
    });
});

// ========== LANGUAGE / i18n ==========
let currentLang = localStorage.getItem('lang') || 'en';
const T = {
    en: {
        title1: 'tax', title2: 'estimator',
        filing_status: 'filing status', location: 'location',
        single: 'single', mfj: 'married filing jointly', hoh: 'head of household',
        compare_with: 'compare with',
        income_gains: 'income & gains',
        se_label: 'self-employed (include FICA / SE tax)',
        income_work: 'personal income from work',
        ltcg: 'long term capital gains', stcg: 'short term capital gains',
        losses: 'capital losses (deduction)',
        use_itemized: 'use itemized deduction instead of standard',
        itemized_amt: 'itemized deduction amount',
        std_ded: 'standard deduction', itemized_ded: 'itemized deduction',
        work_income: 'work income', long_term: 'long term', short_term: 'short term',
        tax_breakdown: 'tax breakdown',
        show_brackets: 'show bracket breakdown', hide_brackets: 'hide bracket breakdown',
        bracket_breakdown: 'bracket breakdown',
        total_earned: 'total earned', total_owed: 'total owed', total_profit: 'total profit',
        copy_link: 'copy shareable link', copied: 'copied!',
        h_comparison: 'location comparison',
        h_marginal: 'marginal tax rate', h_location_tax: 'tax owed by location',
        h_sandbox: 'income restructuring sandbox',
        sb_total: 'total income', sb_ordinary: 'ordinary income',
        sb_st: 'short-term gains', sb_lt: 'long-term gains',
        sb_tax: 'total tax', sb_rate: 'effective rate', sb_net: 'take-home',
        sb_drag: 'drag sliders to explore', sb_same: 'same as current allocation',
        sb_less: 'less tax than current mix', sb_more: 'more tax than current mix',
        federal_tax: 'federal tax', loc_tax: ' tax',
        ded_applied: 'deduction applied', loss_applied: 'losses applied',
        effective_rate: 'effective rate',
        save_with: 'you save {amt} with {loc}', costs_more: '{loc} costs {amt} more',
        same_burden: 'same tax burden',
        loc_same: 'location: same', status_same: 'status: same',
        wa_label: 'include WA millionaires tax (9.9% on income > $1M)',
        geo_us: 'US', geo_asia: 'ASIA & MIDDLE EAST', geo_oceania: 'OCEANIA',
        // Locations
        l_CA: 'california', l_NY: 'new york', l_UT: 'utah', l_TX: 'texas',
        l_FL: 'florida', l_WA: 'washington (seattle)', l_NV: 'nevada (las vegas)',
        l_PR: 'puerto rico (act 60)', l_SG: 'singapore resident', l_JP: 'japan resident',
        l_AE: 'dubai (UAE)', l_AU: 'australia', l_NZ: 'new zealand',
        l_TW: 'taiwan', l_HK: 'hong kong',
        // Tooltips
        tip_filing: 'Your tax filing status determines your tax brackets, standard deduction, and thresholds. Choose the one that matches your IRS filing.',
        tip_single: 'Unmarried, divorced, or legally separated. Uses the narrowest tax brackets and a $16,100 standard deduction for 2026.',
        tip_mfj: 'Married couples filing one return together. Gets the widest brackets (roughly 2x single) and a $32,200 standard deduction. Usually the lowest combined tax for married couples.',
        tip_hoh: 'For unmarried taxpayers who pay more than half the cost of keeping up a home for a qualifying dependent. Wider brackets than single and a $24,150 standard deduction.',
        tip_compare: 'Compare your tax across different locations or filing statuses to see potential savings.',
        tip_se: 'FICA is the Federal Insurance Contributions Act tax — it funds Social Security (12.4%) and Medicare (2.9%). Self-employed workers pay both the employee and employer portions.',
        tip_ltcg: 'Profits from selling assets held longer than 1 year. Taxed at lower federal rates (0%, 15%, or 20%) than ordinary income.',
        tip_stcg: 'Profits from selling assets held 1 year or less. Taxed as ordinary income at your regular federal tax rate.',
        tip_losses: 'Losses from selling assets for less than you paid. Offsets gains first, then up to $3,000 can be deducted from ordinary income (US).',
        tip_itemized: 'Itemized deductions let you list specific expenses (mortgage interest, state taxes, charity, etc.) instead of taking the flat standard deduction. Use whichever is higher.',
        tip_std_ded: 'A flat amount subtracted from your income before federal tax is calculated. Reduces your taxable income without needing to itemize expenses.',
        tip_item_ded: 'The total of your specific deductible expenses (mortgage interest, state taxes, charity, medical, etc.) that you choose to list instead of the standard deduction.',
        tip_marginal: 'The tax rate applied to your next dollar of income. This changes as you cross bracket thresholds — it\'s not the rate on all your income.',
        tip_sandbox: 'Drag the sliders to shift your total income between ordinary income, short-term gains, and long-term gains. Watch how restructuring changes your total tax in real time.',
        tip_sandbox_total: 'Your total income stays fixed. Only the allocation between income types changes.',
        tip_niit: 'Net Investment Income Tax — a 3.8% surtax on investment income (capital gains, dividends) when your adjusted gross income exceeds $200k (single) or $250k (married).',
        tip_fica: 'Self-employment tax covering Social Security (12.4% up to $184,500) and Medicare (2.9% uncapped, plus 0.9% on earnings over $200k/$250k).',
        tip_effective: 'Your total tax as a percentage of total income. This is the actual rate you pay overall, not your top marginal bracket.',
    },
    zh: {
        title1: '稅務', title2: '估算器',
        filing_status: '報稅身份', location: '地點',
        single: '單身', mfj: '夫妻合併申報', hoh: '戶主',
        compare_with: '比較對象',
        income_gains: '收入與利得',
        se_label: '自僱（含 FICA / 自僱稅）',
        income_work: '工作所得',
        ltcg: '長期資本利得', stcg: '短期資本利得',
        losses: '資本損失（扣除）',
        use_itemized: '使用列舉扣除（取代標準扣除）',
        itemized_amt: '列舉扣除金額',
        std_ded: '標準扣除額', itemized_ded: '列舉扣除額',
        work_income: '工作所得', long_term: '長期', short_term: '短期',
        tax_breakdown: '稅額明細',
        show_brackets: '顯示稅率級距', hide_brackets: '隱藏稅率級距',
        bracket_breakdown: '稅率級距明細',
        total_earned: '總收入', total_owed: '應繳稅額', total_profit: '稅後所得',
        copy_link: '複製分享連結', copied: '已複製！',
        h_comparison: '地區比較',
        h_marginal: '邊際稅率', h_location_tax: '各地區稅額',
        h_sandbox: '收入結構模擬器',
        sb_total: '總收入', sb_ordinary: '一般所得',
        sb_st: '短期利得', sb_lt: '長期利得',
        sb_tax: '總稅額', sb_rate: '實際稅率', sb_net: '實收',
        sb_drag: '拖動滑桿探索', sb_same: '與目前配置相同',
        sb_less: '比目前少繳', sb_more: '比目前多繳',
        federal_tax: '聯邦稅', loc_tax: '稅',
        ded_applied: '已扣除額', loss_applied: '已抵損失',
        effective_rate: '實際稅率',
        save_with: '選擇{loc}可省 {amt}', costs_more: '{loc}多繳 {amt}',
        same_burden: '稅負相同',
        loc_same: '地點：相同', status_same: '身份：相同',
        wa_label: '含華州百萬富翁稅（收入逾 $1M 課 9.9%）',
        geo_us: '美國', geo_asia: '亞洲與中東', geo_oceania: '大洋洲',
        l_CA: '加州', l_NY: '紐約', l_UT: '猶他', l_TX: '德州',
        l_FL: '佛州', l_WA: '華盛頓（西雅圖）', l_NV: '內華達（拉斯維加斯）',
        l_PR: '波多黎各（Act 60）', l_SG: '新加坡', l_JP: '日本',
        l_AE: '杜拜（阿聯酋）', l_AU: '澳洲', l_NZ: '紐西蘭',
        l_TW: '台灣', l_HK: '香港',
        tip_filing: '報稅身份決定你的稅率級距、標準扣除額和各項門檻。請選擇符合你 IRS 申報的身份。',
        tip_single: '未婚、離婚或合法分居。使用最窄的稅率級距，2026 年標準扣除額為 $16,100。',
        tip_mfj: '夫妻共同申報一份稅表。享有最寬的級距（約為單身的兩倍）和 $32,200 標準扣除額。通常是已婚夫妻稅負最低的方式。',
        tip_hoh: '適用於未婚且負擔超過一半家庭費用、撫養合格被扶養人的納稅人。級距比單身寬，標準扣除額為 $24,150。',
        tip_compare: '比較不同地區或報稅身份的稅負差異，找出潛在節省空間。',
        tip_se: 'FICA 是聯邦保險貢獻法稅——用於社會安全（12.4%）和醫療保險（2.9%）。自僱者需同時繳納雇主和員工部分。',
        tip_ltcg: '持有超過一年的資產出售獲利。聯邦稅率（0%、15% 或 20%）低於一般所得。',
        tip_stcg: '持有一年以內的資產出售獲利。按一般所得稅率課稅。',
        tip_losses: '以低於購入價格出售資產的損失。先抵銷利得，剩餘最多可從一般所得扣除 $3,000（美國）。',
        tip_itemized: '列舉扣除讓你列出特定費用（房貸利息、州稅、捐款等），取代固定的標準扣除額。選擇金額較高的方式。',
        tip_std_ded: '在計算聯邦稅前從收入中減去的固定金額，無需逐項列舉費用即可降低應稅所得。',
        tip_item_ded: '你選擇逐項列舉的特定可扣除費用總額（房貸利息、州稅、捐款、醫療費等），取代標準扣除額。',
        tip_marginal: '你下一塊錢收入適用的稅率。隨著跨越級距門檻而變化——不是所有收入的稅率。',
        tip_sandbox: '拖動滑桿在一般所得、短期利得和長期利得之間重新分配總收入，即時觀察稅額變化。',
        tip_sandbox_total: '總收入保持不變，只改變各類所得的配置比例。',
        tip_niit: '淨投資所得稅——當調整後總所得超過 $200k（單身）或 $250k（已婚）時，對投資所得課徵 3.8% 附加稅。',
        tip_fica: '自僱稅涵蓋社會安全（12.4%，上限 $184,500）和醫療保險（2.9% 無上限，收入超過 $200k/$250k 再加 0.9%）。',
        tip_effective: '你的總稅額佔總收入的百分比。這是你實際繳納的整體稅率，不是最高邊際稅率。',
    },
    ja: {
        title1: '税金', title2: '計算ツール',
        filing_status: '申告区分', location: '地域',
        single: '独身', mfj: '夫婦合算申告', hoh: '世帯主',
        compare_with: '比較対象',
        income_gains: '所得・利益',
        se_label: '自営業（FICA / 自営業税を含む）',
        income_work: '給与所得',
        ltcg: '長期キャピタルゲイン', stcg: '短期キャピタルゲイン',
        losses: 'キャピタルロス（控除）',
        use_itemized: '項目別控除を使用（標準控除の代わり）',
        itemized_amt: '項目別控除額',
        std_ded: '標準控除', itemized_ded: '項目別控除',
        work_income: '給与所得', long_term: '長期', short_term: '短期',
        tax_breakdown: '税額内訳',
        show_brackets: '税率区分を表示', hide_brackets: '税率区分を非表示',
        bracket_breakdown: '税率区分の内訳',
        total_earned: '総収入', total_owed: '納税額', total_profit: '手取り',
        copy_link: '共有リンクをコピー', copied: 'コピー済み！',
        h_comparison: '地域比較',
        h_marginal: '限界税率', h_location_tax: '地域別税額',
        h_sandbox: '収入構成シミュレーター',
        sb_total: '総収入', sb_ordinary: '給与所得',
        sb_st: '短期利益', sb_lt: '長期利益',
        sb_tax: '総税額', sb_rate: '実効税率', sb_net: '手取り',
        sb_drag: 'スライダーを動かして探索', sb_same: '現在の配分と同じ',
        sb_less: '現在より節税', sb_more: '現在より増税',
        federal_tax: '連邦税', loc_tax: '税',
        ded_applied: '控除適用額', loss_applied: '損失適用額',
        effective_rate: '実効税率',
        save_with: '{loc}で{amt}の節税', costs_more: '{loc}は{amt}多く課税',
        same_burden: '税負担は同じ',
        loc_same: '地域：同じ', status_same: '区分：同じ',
        wa_label: 'WA州富裕層税を含む（所得 $1M超に 9.9%）',
        geo_us: 'アメリカ', geo_asia: 'アジア・中東', geo_oceania: 'オセアニア',
        l_CA: 'カリフォルニア', l_NY: 'ニューヨーク', l_UT: 'ユタ', l_TX: 'テキサス',
        l_FL: 'フロリダ', l_WA: 'ワシントン（シアトル）', l_NV: 'ネバダ（ラスベガス）',
        l_PR: 'プエルトリコ（Act 60）', l_SG: 'シンガポール', l_JP: '日本',
        l_AE: 'ドバイ（UAE）', l_AU: 'オーストラリア', l_NZ: 'ニュージーランド',
        l_TW: '台湾', l_HK: '香港',
        tip_filing: '申告区分は税率区分、標準控除額、各種しきい値を決定します。IRSへの申告に合った区分を選んでください。',
        tip_single: '未婚、離婚、または法的別居。最も狭い税率区分を使用し、2026年の標準控除は$16,100です。',
        tip_mfj: '夫婦で一つの確定申告書を提出。最も広い税率区分（独身の約2倍）と$32,200の標準控除。通常、夫婦の税負担が最も軽い方法です。',
        tip_hoh: '未婚で、扶養家族のために住居費の半分以上を負担している納税者向け。独身より広い税率区分と$22,500の標準控除。',
        tip_compare: '異なる地域や申告区分の税負担を比較し、節約の可能性を確認。',
        tip_se: 'FICAは連邦保険拠出法の税金で、社会保障（12.4%）とメディケア（2.9%）に充てられます。自営業者は雇用主・従業員の両方の負担分を支払います。',
        tip_ltcg: '1年超保有した資産の売却益。連邦税率（0%、15%、20%）は通常所得より低くなります。',
        tip_stcg: '1年以内に保有した資産の売却益。通常の所得税率で課税されます。',
        tip_losses: '購入価格より低く売却した場合の損失。まず利益と相殺し、残りは最大$3,000まで通常所得から控除可能（米国）。',
        tip_itemized: '項目別控除では、定額の標準控除の代わりに特定の経費（住宅ローン利息、州税、寄付金など）を個別に申告できます。金額の大きい方を選択。',
        tip_std_ded: '連邦税の計算前に所得から差し引かれる定額。経費を項目別に申告せずに課税所得を減らせます。',
        tip_item_ded: '標準控除の代わりに項目別に申告する控除対象経費の合計額（住宅ローン利息、州税、寄付金、医療費など）。',
        tip_marginal: '次の1ドルの所得に適用される税率。税率区分のしきい値を超えると変わります。全所得の税率ではありません。',
        tip_sandbox: 'スライダーを動かして総所得を給与所得・短期利益・長期利益の間で再配分し、税額の変化をリアルタイムで確認。',
        tip_sandbox_total: '総収入は固定のまま。所得の種類の配分だけが変わります。',
        tip_niit: '純投資所得税 — 調整後総所得が$200k（独身）/$250k（夫婦）を超える場合、投資所得に3.8%の付加税。',
        tip_fica: '自営業税。社会保障（12.4%、上限$184,500）とメディケア（2.9%上限なし、$200k/$250k超の所得に追加0.9%）をカバー。',
        tip_effective: '総税額の総所得に対する割合。最高限界税率ではなく、実際に支払う全体の税率です。',
    }
};

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.querySelectorAll('.lang-pill').forEach(p => p.classList.toggle('active', p.dataset.lang === lang));

    // Update static i18n text
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (T[lang][key]) el.textContent = T[lang][key];
    });

    // Update tooltips
    document.querySelectorAll('[data-tip-i18n]').forEach(el => {
        const key = el.dataset.tipI18n;
        if (T[lang][key]) el.setAttribute('data-tip', T[lang][key]);
    });

    // Update select options
    document.querySelectorAll('option[data-i18n]').forEach(opt => {
        const key = opt.dataset.i18n;
        if (T[lang][key]) opt.textContent = T[lang][key];
    });

    // Update bracket toggle btn
    const bBtn = document.getElementById('bracketToggleBtn');
    bBtn.textContent = bracketTableOpen ? T[lang].hide_brackets : T[lang].show_brackets;

    calc();
}

document.querySelectorAll('.lang-pill').forEach(pill => {
    pill.addEventListener('click', () => setLang(pill.dataset.lang));
});

// ========== INCOME RESTRUCTURING SANDBOX ==========
const sbSliders = { inc: document.getElementById('sbInc'), st: document.getElementById('sbSt'), lt: document.getElementById('sbLt') };
const sbPcts = { inc: document.getElementById('sbIncPct'), st: document.getElementById('sbStPct'), lt: document.getElementById('sbLtPct') };
const sbAmts = { inc: document.getElementById('sbIncAmt'), st: document.getElementById('sbStAmt'), lt: document.getElementById('sbLtAmt') };
let sbLocked = null; // which slider is being dragged

function sandboxSync(changed) {
    const vals = { inc: +sbSliders.inc.value, st: +sbSliders.st.value, lt: +sbSliders.lt.value };
    const others = ['inc', 'st', 'lt'].filter(k => k !== changed);
    const remaining = 100 - vals[changed];

    const otherSum = vals[others[0]] + vals[others[1]];
    if (otherSum > 0) {
        vals[others[0]] = Math.round(remaining * vals[others[0]] / otherSum);
        vals[others[1]] = remaining - vals[others[0]];
    } else {
        vals[others[0]] = Math.round(remaining / 2);
        vals[others[1]] = remaining - vals[others[0]];
    }

    // Clamp
    for (const k of others) vals[k] = Math.max(0, Math.min(100, vals[k]));

    // Update sliders and labels
    for (const k of ['inc', 'st', 'lt']) {
        sbSliders[k].value = vals[k];
        sbPcts[k].textContent = vals[k] + '%';
    }

    sandboxCalc(vals);
}

function sandboxCalc(pcts) {
    const lt = +document.getElementById('lt').value || 0;
    const st = +document.getElementById('st').value || 0;
    const inc = +document.getElementById('inc').value || 0;
    const loss = +document.getElementById('loss').value || 0;
    const loc = document.getElementById('state').value;
    const status = document.querySelector('.status-pill.active').dataset.status;
    const waMillionaires = document.getElementById('waMillionaires').checked;
    const selfEmployed = document.getElementById('selfEmployed').checked;
    const useItemized = document.getElementById('useItemized').checked;
    const itemizedAmt = +document.getElementById('itemized').value || 0;
    const deduction = useItemized ? itemizedAmt : stdDeduction[status];
    const total = lt + st + inc;

    // Sandbox allocation
    const sbInc = Math.round(total * pcts.inc / 100);
    const sbSt = Math.round(total * pcts.st / 100);
    const sbLt = total - sbInc - sbSt; // remainder to avoid rounding drift

    sbAmts.inc.textContent = fmtK(sbInc);
    sbAmts.st.textContent = fmtK(sbSt);
    sbAmts.lt.textContent = fmtK(sbLt);

    const opts = { waMillionaires, selfEmployed, status, deduction };
    const sbResult = calcForLocation(sbLt, sbSt, sbInc, loss, loc, opts);
    const origResult = calcForLocation(lt, st, inc, loss, loc, opts);

    document.getElementById('sbTax').textContent = fmt(sbResult.total);
    const sbEffRate = total ? ((sbResult.total / total) * 100).toFixed(1) : '0.0';
    document.getElementById('sbRate').textContent = sbEffRate + '%';
    document.getElementById('sbNet').textContent = fmt(total - sbResult.total);

    const diff = origResult.total - sbResult.total;
    const diffEl = document.getElementById('sbDiff');
    const st2 = T[currentLang];
    if (Math.abs(diff) < 1) {
        diffEl.className = 'sandbox-diff neutral';
        diffEl.textContent = st2.sb_same;
    } else if (diff > 0) {
        diffEl.className = 'sandbox-diff save';
        diffEl.textContent = `${fmt(diff)} ${st2.sb_less}`;
    } else {
        diffEl.className = 'sandbox-diff cost';
        diffEl.textContent = `${fmt(-diff)} ${st2.sb_more}`;
    }
}

function sandboxInit() {
    const lt = +document.getElementById('lt').value || 0;
    const st = +document.getElementById('st').value || 0;
    const inc = +document.getElementById('inc').value || 0;
    const total = lt + st + inc;

    document.getElementById('sandboxTotal').textContent = fmt(total);

    if (total > 0) {
        const pInc = Math.round(inc / total * 100);
        const pSt = Math.round(st / total * 100);
        const pLt = 100 - pInc - pSt;
        sbSliders.inc.value = pInc; sbSliders.st.value = pSt; sbSliders.lt.value = pLt;
        sbPcts.inc.textContent = pInc + '%'; sbPcts.st.textContent = pSt + '%'; sbPcts.lt.textContent = pLt + '%';
        sandboxCalc({ inc: pInc, st: pSt, lt: pLt });
    } else {
        for (const k of ['inc', 'st', 'lt']) {
            sbSliders[k].value = k === 'lt' ? 34 : 33;
            sbPcts[k].textContent = (k === 'lt' ? 34 : 33) + '%';
        }
        sandboxCalc({ inc: 33, st: 33, lt: 34 });
    }
}

['inc', 'st', 'lt'].forEach(k => {
    sbSliders[k].addEventListener('input', () => sandboxSync(k));
});

// Charts are created while this panel may be display:none (router activates it
// after import), so resize them whenever the estimator tab becomes visible.
document.addEventListener('tab:shown', e => {
    if (e.detail.tab === 'estimator') {
        [chart, allLocationsChart, marginalChart].forEach(c => c.resize());
    }
});

// ========== INIT ==========
decodeState();
document.getElementById('waToggle').classList.toggle('visible', document.getElementById('state').value === 'WA');
if (currentLang !== 'en') setLang(currentLang);
calc();
applyChartTheme();
