// Tab 3 — compound interest / net-worth calculator.
// Starting amount + monthly contribution compounding at an expected return, over a horizon,
// with an optional target net worth (→ years to reach). Standalone tool.
import { fmt, fmtK } from './calc.js';
import { load, save } from './store.js';

const KEY = 'calc.v1';
const DEFAULT = { start: 10000, monthly: 1000, returnRate: 7, asset: 'custom', years: 30, target: 1000000 };
let state = { ...DEFAULT, ...load(KEY, {}) };
let chart = null, wired = false;

// representative long-run nominal annual returns (~10–15yr) — approximations, past ≠ future
const ASSETS = [
    { id: 'custom', name: 'custom rate', rate: null },
    { id: 'voo', name: 'S&P 500 (VOO)', rate: 10 },
    { id: 'vti', name: 'total US market (VTI)', rate: 10 },
    { id: 'qqq', name: 'Nasdaq-100 (QQQ)', rate: 15 },
    { id: 'btc', name: 'Bitcoin (BTC)', rate: 40 },
    { id: 'gld', name: 'gold (GLD)', rate: 8 },
    { id: 'vnq', name: 'REIT (VNQ)', rate: 7 },
    { id: 'bnd', name: 'US bonds (BND)', rate: 2 },
    { id: 'cash', name: 'HYSA / cash', rate: 4 },
];

const persist = () => save(KEY, state);
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function project() {
    const start = +state.start || 0;
    const monthly = +state.monthly || 0;
    const years = Math.max(1, Math.min(60, +state.years || 30));
    const target = +state.target || 0;
    const im = (+state.returnRate || 0) / 100 / 12;
    const labels = [0], data = [Math.round(start)], contribLine = [Math.round(start)];
    let bal = start, contrib = start, hit = null;
    for (let m = 1; m <= years * 12; m++) {
        bal = bal * (1 + im) + monthly;
        contrib += monthly;
        if (hit === null && target > 0 && bal >= target) hit = m;
        if (m % 12 === 0) { labels.push(m / 12); data.push(Math.round(bal)); contribLine.push(Math.round(contrib)); }
    }
    // years to target may exceed the horizon — search up to 60y
    if (hit === null && target > 0) {
        let b = start;
        for (let m = 1; m <= 60 * 12; m++) { b = b * (1 + im) + monthly; if (b >= target) { hit = m; break; } }
    }
    const finalBal = data[data.length - 1];
    const totalContrib = Math.round(start + monthly * years * 12);
    return { start, monthly, years, target, labels, data, contribLine, finalBal, totalContrib, growth: finalBal - totalContrib, yearsToTarget: hit ? hit / 12 : null };
}

function render() {
    const p = project();
    document.getElementById('calcFinal').textContent = fmt(p.finalBal);
    document.getElementById('calcFinalSub').innerHTML =
        `after <strong>${p.years}</strong> years — you put in <strong>${fmt(p.totalContrib)}</strong>, growth added <strong>${fmt(p.growth)}</strong>.`;
    const tEl = document.getElementById('calcTargetLine');
    if (p.target > 0 && p.yearsToTarget != null) tEl.innerHTML = `you'd hit <strong>${fmt(p.target)}</strong> in <strong>${p.yearsToTarget.toFixed(1)} years</strong>.`;
    else if (p.target > 0) tEl.innerHTML = `at this rate you don't reach <strong>${fmt(p.target)}</strong> within 60 years — raise your contribution or return.`;
    else tEl.textContent = '';
    document.getElementById('calcYears').textContent = p.years;
    updateChart(p);
}

function makeChart(canvas) {
    return new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'balance', data: [], borderColor: cssVar('--accent'), backgroundColor: 'rgba(224,112,80,0.12)', fill: true, tension: 0.2, pointRadius: 0, borderWidth: 2 },
            { label: 'contributed', data: [], borderColor: cssVar('--text-muted'), pointRadius: 0, fill: false, borderWidth: 1.5 },
            { label: 'target', data: [], borderColor: cssVar('--green'), borderDash: [5, 5], pointRadius: 0, fill: false, borderWidth: 1.5 },
        ] },
        options: {
            responsive: false, maintainAspectRatio: false, animation: false,
            plugins: {
                legend: { labels: { color: cssVar('--chart-text'), font: { size: 10 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
            },
            scales: {
                x: { title: { display: true, text: 'years', color: cssVar('--chart-text') }, ticks: { color: cssVar('--chart-text') }, grid: { color: cssVar('--chart-grid') } },
                y: { ticks: { color: cssVar('--chart-text'), callback: v => fmtK(v) }, grid: { color: cssVar('--chart-grid') } },
            },
        },
    });
}
function updateChart(p) {
    if (!chart) return;
    chart.data.labels = p.labels;
    chart.data.datasets[0].data = p.data;
    chart.data.datasets[0].borderColor = cssVar('--accent');
    chart.data.datasets[1].data = p.contribLine;
    chart.data.datasets[1].borderColor = cssVar('--text-muted');
    chart.data.datasets[2].data = p.target > 0 ? p.labels.map(() => p.target) : [];
    chart.data.datasets[2].borderColor = cssVar('--green');
    chart.options.plugins.legend.labels.color = cssVar('--chart-text');
    chart.options.scales.x.ticks.color = chart.options.scales.y.ticks.color = cssVar('--chart-text');
    chart.options.scales.x.title.color = cssVar('--chart-text');
    chart.options.scales.x.grid.color = chart.options.scales.y.grid.color = cssVar('--chart-grid');
    chart.update();
}
function resizeChart() {
    if (!chart) return;
    const box = chart.canvas.parentElement;
    const w = box ? box.clientWidth : 0;
    if (w > 0) chart.resize(w, box.clientHeight || 360);
}

export function initCalculate() {
    const panel = document.querySelector('.tab-panel[data-tab="calculate"]');
    if (!panel) return;

    panel.innerHTML = `
        <div class="callout-blue">a compound-interest calculator: see how a starting amount plus monthly contributions grow over time,
        and how long it takes to hit a net-worth goal.</div>

        <div class="col-banner">
            <div class="col-banner-l">projected net worth in <span id="calcYears"></span> years</div>
            <div class="col-banner-v" id="calcFinal">—</div>
            <div class="col-banner-sub" id="calcFinalSub"></div>
            <div class="col-banner-sub" id="calcTargetLine" style="margin-top:0.35rem"></div>
        </div>

        <div class="card">
            <div class="card-label">inputs</div>
            <div class="col-grid">
                <label class="col-field"><span>starting amount</span>
                    <span class="col-amt">$ <input type="text" inputmode="numeric" class="col-num num-comma" data-k="start" value="${(+state.start).toLocaleString('en-US')}"></span></label>
                <label class="col-field"><span>monthly contribution</span>
                    <span class="col-amt">$ <input type="text" inputmode="numeric" class="col-num num-comma" data-k="monthly" value="${(+state.monthly).toLocaleString('en-US')}"></span></label>
                <label class="col-field"><span>expected return</span>
                    <span class="col-amt"><input type="number" class="col-num col-num-sm" data-k="returnRate" value="${state.returnRate}" min="0" step="0.5"> %</span></label>
                <label class="col-field"><span>or pick an asset</span>
                    <span class="select-wrap col-select"><select id="calcAsset">${ASSETS.map(a => `<option value="${a.id}"${state.asset === a.id ? ' selected' : ''}>${a.name}${a.rate != null ? ` (~${a.rate}%)` : ''}</option>`).join('')}</select></span></label>
                <label class="col-field"><span>time horizon (years)</span>
                    <span class="col-amt"><input type="number" class="col-num col-num-sm" data-k="years" value="${state.years}" min="1" max="60" step="1"></span></label>
                <label class="col-field"><span>net-worth goal</span>
                    <span class="col-amt">$ <input type="text" inputmode="numeric" class="col-num num-comma" data-k="target" value="${(+state.target).toLocaleString('en-US')}"></span></label>
            </div>
            <div class="col-chart-box" style="height:360px"><canvas id="calcChart"></canvas></div>
            <p class="led-note">monthly contributions compound at the expected return. asset returns are rough historical averages —
            <strong>past performance ≠ future results.</strong></p>
        </div>`;

    document.getElementById('calcAsset').addEventListener('change', e => {
        const a = ASSETS.find(x => x.id === e.target.value);
        state.asset = e.target.value;
        if (a && a.rate != null) { state.returnRate = a.rate; panel.querySelector('[data-k="returnRate"]').value = a.rate; }
        persist(); render();
    });
    panel.addEventListener('input', e => {
        const el = e.target.closest('[data-k]'); if (!el) return;
        const comma = el.classList.contains('num-comma');
        const raw = comma ? el.value.replace(/[^\d]/g, '') : el.value;
        state[el.dataset.k] = Math.max(0, +raw || 0);
        if (comma) el.value = raw ? Number(raw).toLocaleString('en-US') : '';
        if (el.dataset.k === 'returnRate') { state.asset = 'custom'; document.getElementById('calcAsset').value = 'custom'; }
        persist(); render();
    });

    if (!wired) {
        wired = true;
        document.addEventListener('tab:shown', e => { if (e.detail.tab === 'calculate') resizeChart(); });
        let rt;
        window.addEventListener('resize', () => {
            clearTimeout(rt);
            rt = setTimeout(() => { if (document.querySelector('.tab-panel[data-tab="calculate"].active')) resizeChart(); }, 150);
        });
    }

    const c = document.getElementById('calcChart');
    if (chart) chart.destroy();
    chart = c ? makeChart(c) : null;
    resizeChart();
    render();
}
