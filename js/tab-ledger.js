// Tab 2 — real-time income & trade ledger.
// Spreadsheet-style entry; computes YTD income, realized ST/LT gains, per-position
// performance (% + annualized CAGR), and live tax via the shared engine.
import { calcForLocation, fmt, fmt2, fmtK } from './calc.js';
import { LOCATIONS, stdDeduction } from '../data/brackets.js';
import { load, save, downloadText, pickFileText } from './store.js';

const KEY = 'ledger.v1';
const CUR_YEAR = new Date().getFullYear();
const INCOME_CATS = ['salary', 'bonus', 'adsense', 'sponsorships', 'affiliates', 'sales', 'dividend', 'interest', 'other'];
const EXPENSE_CATS = ['rent', 'payroll', 'taxes/fees', 'professional services', 'subscriptions', 'software', 'food', 'transport', 'utilities', 'equipment', 'travel', 'marketing', 'healthcare', 'other'];

const DEFAULT = { homeLoc: 'CA', compareLoc: '', status: 'single', selfEmployed: false, income: [], expenses: [], trades: [] };
let state = load(KEY, DEFAULT);
state.expenses ||= []; // migrate older saved ledgers
// migrate trades: derive `type` from old acquired→sold dates, and convert old TOTAL
// cost/proceeds into per-share avgCost/salePrice (using qty; qty-less rows fall back to qty 1).
function migrateTrade(t) {
    if (!t.type) {
        if (!t.sold) t.type = 'open';
        else { const d = t.acquired ? (new Date(t.sold) - new Date(t.acquired)) / 86400000 : 0; t.type = d > 365 ? 'lt' : 'st'; }
    }
    if (t.avgCost == null && (t.cost != null || t.proceeds != null)) {
        const q = parseFloat(t.qty) || 0;
        const cost = parseFloat(t.cost) || 0;
        const hasP = t.proceeds != null && t.proceeds !== '';
        const proceeds = parseFloat(t.proceeds) || 0;
        if (q > 0) {
            t.avgCost = cost / q;                       // full precision so qty×avgCost == original total
            if (hasP) t.salePrice = proceeds / q;
        } else {
            t.qty = 1;
            t.avgCost = cost;
            if (hasP) t.salePrice = proceeds;
        }
        delete t.cost; delete t.proceeds;
    }
    return t;
}
(state.trades || []).forEach(migrateTrade);
let wired = false;     // panel-level delegated listeners are attached only once
let tradeSort = { key: null, dir: 1 }; // trades table sort: dir 1 = asc, -1 = desc
const expandedTickers = new Set();     // which by-ticker rows are expanded to show their trades
let tickerOpen = false;                // the whole by-ticker card is collapsed by default

const uid = () => Math.random().toString(36).slice(2, 9);

// Prompt the user can paste into any LLM to turn their invoices/statements into import-ready JSON.
function buildLLMPrompt() {
    return `You are helping me build a JSON file for my personal tax & income ledger tool (tax.reysu.io). I will import the JSON you produce directly into the app, so your FINAL output must be ONE valid JSON object in EXACTLY the format below — no markdown fences, no comments, no extra prose.

WHAT THIS IS: a year-to-date ledger of my income, expenses, and investment trades. The app uses it to estimate my taxes and track investment performance. The current tax year is ${CUR_YEAR}.

STEP 1 — Before generating anything, ASK me how I want to provide the data. Offer these options:
  • I paste in invoices / pay stubs / brokerage statements / receipts and you extract the data from them
  • A guided question-and-answer flow where you ask me about each income source, expense, and trade one at a time
  • I describe everything in free text and you structure it
Also ask whether I have documents ready to paste or I'm working from memory. Ask clarifying follow-ups until you have what you need. Never invent amounts or dates — if you're unsure, ask me.

STEP 2 — Produce the JSON. Schema:

{
  "homeLoc": "CA",            // where I'm taxed. one of: CA NY UT TX FL WA NV PR SG JP AE AU NZ TW HK
  "status": "single",         // "single", "mfj" (married filing jointly), or "hoh" (head of household)
  "selfEmployed": false,      // true if I pay self-employment / FICA tax
  "income": [
    { "source": "Google", "category": "salary", "amount": 2000, "date": "${CUR_YEAR}-10-25" }
  ],
  "expenses": [
    { "desc": "office rent", "category": "rent", "amount": 2000, "date": "${CUR_YEAR}-01-05", "deductible": true }
  ],
  "trades": [
    { "asset": "VOO", "qty": 100, "avgCost": 380, "type": "lt", "sold": "${CUR_YEAR}-04-01", "salePrice": 520 }
  ]
}

RULES:
- All dates are "YYYY-MM-DD". All amounts are plain numbers — no "$", no commas.
- income.category must be one of: ${INCOME_CATS.join(', ')}.
- expenses.category must be one of: ${EXPENSE_CATS.join(', ')}.
- expenses.deductible = true for business write-offs (these reduce my taxable income), false for personal spending.
- trades: "type" is "st" (short-term, held ≤ 1 year), "lt" (long-term, held > 1 year), or "open" (still holding).
  "qty" is the number of shares/units; "avgCost" is your average cost PER SHARE. For "st"/"lt": include "sold" (the sale date — sets the tax year) and "salePrice" (the sale price PER SHARE). For "open": omit "sold"/"salePrice" and include "price" (current price per share) for unrealized P/L. (totals = qty × per-share.)
- Do NOT include any "id" fields — the app generates them.
- Your final message must be ONLY the JSON object, nothing else.`;
}
const persist = () => save(KEY, state);
const todayStr = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const daysBetween = (a, b) => (a && b) ? (new Date(b) - new Date(a)) / 86400000 : 0;

function cagr(start, end, days) {
    if (start <= 0 || end <= 0 || days < 2) return null;
    const years = days / 365.25;
    if (years < 0.01) return null;
    return Math.pow(end / start, 1 / years) - 1;
}

// ---- per-trade derived numbers (avgCost & salePrice are PER SHARE; × qty = totals) ----
function tradeCalc(t) {
    const qty = num(t.qty);
    const cost = qty * num(t.avgCost);                 // total cost basis
    const type = t.type || 'st';                       // 'st' | 'lt' | 'open'
    const open = type === 'open';
    const closed = !open;
    const exitPx = open ? num(t.price) : num(t.salePrice); // per share
    const end = qty * exitPx;                           // total proceeds / current value
    const gain = end - cost;
    const pct = cost > 0 ? gain / cost : 0;
    const isLT = type === 'lt';
    // realized gains count toward this tax year if sold this year (no date → assume current year)
    const ytd = closed && (!t.sold || new Date(t.sold).getFullYear() === CUR_YEAR);
    return { cost, end, gain, pct, isLT, open, closed, ytd, type };
}

// ---- aggregate the whole ledger ---- (loc defaults to home; pass another for comparison)
function aggregate(loc = state.homeLoc) {
    let incomeYTD = 0, incomeAll = 0;
    for (const r of state.income) {
        const amt = num(r.amount);
        incomeAll += amt;
        if (r.date && new Date(r.date).getFullYear() === CUR_YEAR) incomeYTD += amt;
    }
    let expensesYTD = 0, deductibleYTD = 0, expensesAll = 0;
    for (const x of state.expenses) {
        const amt = num(x.amount);
        expensesAll += amt;
        if (x.date && new Date(x.date).getFullYear() !== CUR_YEAR) continue;
        expensesYTD += amt;
        if (x.deductible) deductibleYTD += amt;
    }
    let stGains = 0, ltGains = 0, losses = 0, realizedNet = 0, unrealized = 0;
    for (const t of state.trades) {
        const c = tradeCalc(t);
        if (!c.closed) { unrealized += c.gain; continue; }
        realizedNet += c.gain;
        if (!c.ytd) continue;
        if (c.gain >= 0) { if (c.isLT) ltGains += c.gain; else stGains += c.gain; }
        else losses += -c.gain;
    }
    // Deductible business expenses reduce taxable ordinary income (and SE/FICA base).
    const taxableInc = Math.max(0, incomeYTD - deductibleYTD);
    const opts = {
        status: state.status,
        selfEmployed: state.selfEmployed,
        deduction: stdDeduction[state.status],
        waMillionaires: true,
    };
    const r = calcForLocation(ltGains, stGains, taxableInc, losses, loc, opts);
    const taxableEarned = taxableInc + stGains + ltGains;
    const effRate = taxableEarned > 0 ? (r.total / taxableEarned * 100) : 0;
    // What you keep from your earnings: income minus spending and tax. (Investment P/L is
    // tracked separately in the realized/unrealized stats — not folded into "savings".)
    const savings = incomeYTD - expensesYTD - r.total;
    // Clean, location-aware tax breakdown (e.g. "california tax", "japan tax").
    const locRaw = (LOCATIONS.find(l => l.code === loc) || {}).name || 'location';
    const locName = locRaw.replace(/resident/i, '').replace(/\([^)]*\)/g, '').trim();
    const taxBreakdown = {
        fedInc: r.fedIncomeTax,
        fedSt: r.fedShortTax,
        fedLt: r.fedLongTax,
        niit: r.niitTax,
        fica: r.ficaTax,
        locInc: r.locIncomeTax,
        locSt: r.locShortTax,
        locLt: r.locLongTax,
        locName,
        locLabel: locName + ' tax',
    };
    return {
        incomeYTD, incomeAll, expensesYTD, expensesAll, deductibleYTD,
        stGains, ltGains, losses, realizedNet, unrealized, tradePL: realizedNet + unrealized,
        tax: r.total, effRate, net: taxableEarned - r.total, savings, taxBreakdown,
    };
}

// ---- rendering ----
function locOptions(selected) {
    return LOCATIONS.map(l => `<option value="${l.code}"${l.code === selected ? ' selected' : ''}>${l.name}</option>`).join('');
}

function pct(n) {
    const s = (n * 100).toFixed(1) + '%';
    return n >= 0 ? `<span class="led-pos">+${s}</span>` : `<span class="led-neg">${s}</span>`;
}
function money(n) {
    const cls = n >= 0 ? 'led-pos' : 'led-neg';
    return `<span class="${cls}">${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}</span>`;
}

function incomeRows() {
    if (!state.income.length) return `<tr><td colspan="5" class="led-empty">no income yet — add a row below</td></tr>`;
    return pageSlice(state.income, 'income').map(r => `
        <tr data-kind="income" data-id="${r.id}">
            <td><input class="led-in" data-f="source" value="${r.source || ''}" placeholder="e.g. Google"></td>
            <td>
                <select class="led-in" data-f="category">
                    ${INCOME_CATS.map(c => `<option value="${c}"${r.category === c ? ' selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td><input class="led-in led-num" data-f="amount" type="number" value="${r.amount ?? ''}" placeholder="0"></td>
            <td><input class="led-in" data-f="date" type="date" value="${r.date || ''}"></td>
            <td class="led-actions"><button class="led-del" title="delete">×</button></td>
        </tr>`).join('');
}

function expenseRows() {
    if (!state.expenses.length) return `<tr><td colspan="6" class="led-empty">no expenses yet — add a row below</td></tr>`;
    return pageSlice(state.expenses, 'expense').map(x => `
        <tr data-kind="expense" data-id="${x.id}">
            <td><input class="led-in" data-f="desc" value="${x.desc || ''}" placeholder="e.g. office rent"></td>
            <td>
                <select class="led-in" data-f="category">
                    ${EXPENSE_CATS.map(c => `<option value="${c}"${x.category === c ? ' selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td><input class="led-in led-num" data-f="amount" type="number" value="${x.amount ?? ''}" placeholder="0"></td>
            <td><input class="led-in" data-f="date" type="date" value="${x.date || ''}"></td>
            <td class="led-center"><input type="checkbox" class="led-in led-check-cell" data-f="deductible"${x.deductible ? ' checked' : ''} title="business write-off (reduces taxable income)"></td>
            <td class="led-actions"><button class="led-del" title="delete">×</button></td>
        </tr>`).join('');
}

// Aggregate every trade by ticker → total P/L (realized + unrealized), sorted best→worst.
function byTicker() {
    const m = {};
    for (const t of state.trades) {
        const c = tradeCalc(t);
        const k = (t.asset || '—').toUpperCase();
        (m[k] ||= { ticker: k, count: 0, cost: 0, gain: 0 });
        m[k].count++; m[k].cost += c.cost; m[k].gain += c.gain;
    }
    return Object.values(m)
        .map(x => ({ ...x, pct: x.cost > 0 ? x.gain / x.cost : 0 }))
        .sort((a, b) => b.gain - a.gain);
}

function tickerRows() {
    const list = byTicker();
    if (!list.length) return `<tr><td colspan="5" class="led-empty">no trades yet</td></tr>`;
    let html = '';
    for (const r of list) {
        const open = expandedTickers.has(r.ticker);
        html += `
        <tr data-ticker="${r.ticker}" class="led-ticker-row">
            <td><span class="led-caret">${open ? '▾' : '▸'}</span> ${r.ticker}</td>
            <td class="led-calc">${r.count}</td>
            <td class="led-calc">${fmt(r.cost)}</td>
            <td class="led-calc">${money(r.gain)}</td>
            <td class="led-calc">${r.cost > 0 ? pct(r.pct) : '—'}</td>
        </tr>`;
        if (open) {
            for (const t of state.trades.filter(x => (x.asset || '—').toUpperCase() === r.ticker)) {
                const c = tradeCalc(t);
                const ty = c.open ? 'open' : (c.isLT ? 'LT' : 'ST');
                html += `
                <tr class="led-subrow">
                    <td>↳ ${t.sold || '—'} <span class="led-sub-ty">${ty}</span></td>
                    <td></td>
                    <td class="led-calc">${fmt(c.cost)}</td>
                    <td class="led-calc">${money(c.gain)}</td>
                    <td class="led-calc">${c.cost > 0 ? pct(c.pct) : '—'}</td>
                </tr>`;
            }
        }
    }
    return html;
}

// Sorted copy for display (never reorders the stored data). Sort by the active column.
function sortedTrades() {
    if (!tradeSort.key) return state.trades;
    const val = t => {
        switch (tradeSort.key) {
            case 'asset': return (t.asset || '').toLowerCase();
            case 'qty': return num(t.qty);
            case 'cost': return num(t.qty) * num(t.avgCost);
            case 'sold': return t.sold ? new Date(t.sold).getTime() : 0;
            case 'proceeds': return tradeCalc(t).end;
            case 'gain': return tradeCalc(t).gain;
            default: return 0;
        }
    };
    return [...state.trades].sort((a, b) => {
        const va = val(a), vb = val(b);
        return va < vb ? -tradeSort.dir : va > vb ? tradeSort.dir : 0;
    });
}

function tradeRows() {
    if (!state.trades.length) return `<tr><td colspan="8" class="led-empty">no trades yet — add a row below</td></tr>`;
    return pageSlice(sortedTrades(), 'trade').map(t => {
        const c = tradeCalc(t);
        const gainCell = (c.cost > 0 || c.end > 0) ? money(c.gain) : '—';
        const pctCell = c.cost > 0 ? pct(c.pct) : '—';
        const typeSel = `<select class="led-in" data-f="type">
            <option value="st"${c.type === 'st' ? ' selected' : ''}>short-term</option>
            <option value="lt"${c.type === 'lt' ? ' selected' : ''}>long-term</option>
            <option value="open"${c.type === 'open' ? ' selected' : ''}>open</option>
        </select>`;
        // exit column (per share): sale price when realized, current price when open
        const exitCell = c.open
            ? `<input class="led-in led-num" data-f="price" type="number" value="${t.price ?? ''}" placeholder="cur. px">`
            : `<input class="led-in led-num" data-f="salePrice" type="number" value="${t.salePrice ?? ''}" placeholder="$/share">`;
        return `
        <tr data-kind="trade" data-id="${t.id}">
            <td><input class="led-in" data-f="asset" value="${t.asset || ''}" placeholder="VOO"></td>
            <td><input class="led-in led-num" data-f="qty" type="number" value="${t.qty ?? ''}" placeholder="0"></td>
            <td><input class="led-in led-num" data-f="avgCost" type="number" value="${t.avgCost ?? ''}" placeholder="$/share"></td>
            <td>${typeSel}</td>
            <td><input class="led-in" data-f="sold" type="date" value="${t.sold || ''}" ${c.open ? 'disabled' : ''}></td>
            <td>${exitCell}</td>
            <td class="led-calc">${gainCell}<div class="led-sub">${pctCell}</div></td>
            <td class="led-actions"><button class="led-del" title="delete">×</button></td>
        </tr>`;
    }).join('');
}

function summaryHTML() {
    const a = aggregate();
    const cell = (key, label, val, cls = '') => `
        <div class="led-stat ${cls}" data-stat="${key}" role="button" tabindex="0" title="click for breakdown">
            <div class="led-stat-l">${label}</div><div class="led-stat-v">${val}</div></div>`;
    // show deductible inline (smaller) only when it differs from the total; keeps the box one line tall
    const partlyDeductible = a.deductibleYTD > 0 && Math.round(a.deductibleYTD) !== Math.round(a.expensesYTD);
    const expVal = partlyDeductible
        ? `${fmt(a.expensesYTD)} <span class="led-stat-side">${fmt(a.deductibleYTD)} ded.</span>`
        : fmt(a.expensesYTD);
    // optional comparison location — second blue line in the tax / rate / savings boxes
    const c = state.compareLoc ? aggregate(state.compareLoc) : null;
    const cmp = val => c ? `<div class="led-cmp">${val} <span class="led-cmp-loc">${state.compareLoc}</span></div>` : '';
    return `
        ${cell('income', `income (${CUR_YEAR})`, fmt(a.incomeYTD))}
        ${cell('expenses', `expenses (${CUR_YEAR})`, expVal)}
        ${cell('st', 'realized short-term', fmt(a.stGains))}
        ${cell('lt', 'realized long-term', fmt(a.ltGains))}
        ${cell('losses', 'realized losses', fmt(a.losses))}
        ${cell('tax', 'est. tax', fmt(a.tax) + cmp(fmt(c?.tax)), 'owed')}
        ${cell('effrate', 'effective rate', a.effRate.toFixed(1) + '%' + cmp(c ? c.effRate.toFixed(1) + '%' : ''))}
        ${cell('savings', 'net savings', fmt(a.savings) + cmp(fmt(c?.savings)), 'profit')}`;
}

// ---- breakdown modal content ----
const YTD = d => d && new Date(d).getFullYear() === CUR_YEAR;
function bdTable(headers, rows) {
    if (!rows.length) return `<p class="led-bd-empty">nothing here yet.</p>`;
    return `<table class="led-bd-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
// closed YTD trades passing filter → table rows
function closedTradeRows(filter) {
    return state.trades.map(t => ({ t, c: tradeCalc(t) }))
        .filter(({ c }) => c.closed && c.ytd && filter(c))
        .map(({ t, c }) => [t.asset || '—', t.sold || '—', fmt(c.cost), fmt(c.end), money(c.gain)]);
}

function statContent(key) {
    const a = aggregate();
    const tradeHdr = ['asset', 'sold', 'cost', 'proceeds', 'gain'];
    switch (key) {
        case 'income': {
            const byCat = Object.entries(incomeByCategory()).map(([c, v]) => [c, fmt(v)]);
            const entries = state.income.filter(r => YTD(r.date)).map(r => [r.source || '—', r.category || '—', fmt(num(r.amount)), r.date || '—']);
            return { title: `income · ${CUR_YEAR}`, body: `<p class="led-bd-tot">total <strong>${fmt(a.incomeYTD)}</strong></p><h4>by category</h4>${bdTable(['category', 'amount'], byCat)}<h4>entries</h4>${bdTable(['source', 'category', 'amount', 'date'], entries)}` };
        }
        case 'expenses': {
            const byCat = {};
            state.expenses.filter(x => YTD(x.date)).forEach(x => { const c = x.category || 'other'; byCat[c] = (byCat[c] || 0) + num(x.amount); });
            const rows = Object.entries(byCat).map(([c, v]) => [c, fmt(v)]);
            return { title: `expenses · ${CUR_YEAR}`, body: `<p class="led-bd-tot">total <strong>${fmt(a.expensesYTD)}</strong> · deductible <strong>${fmt(a.deductibleYTD)}</strong></p>${bdTable(['category', 'amount'], rows)}` };
        }
        case 'st':
            return { title: `realized short-term gains · ${CUR_YEAR}`, body: `<p class="led-bd-tot">total <strong>${fmt(a.stGains)}</strong></p><p class="led-bd-note">trades sold this year that you held ≤ 365 days, with a gain. taxed as ordinary income.</p>${bdTable(tradeHdr, closedTradeRows(c => !c.isLT && c.gain >= 0))}` };
        case 'lt':
            return { title: `realized long-term gains · ${CUR_YEAR}`, body: `<p class="led-bd-tot">total <strong>${fmt(a.ltGains)}</strong></p><p class="led-bd-note">trades sold this year that you held > 365 days, with a gain. taxed at lower long-term rates.</p>${bdTable(tradeHdr, closedTradeRows(c => c.isLT && c.gain >= 0))}` };
        case 'losses':
            return { title: `realized losses · ${CUR_YEAR}`, body: `<p class="led-bd-tot">total <strong>${fmt(a.losses)}</strong></p><p class="led-bd-note">trades sold this year at a loss. these offset your gains first, then up to $3,000 of ordinary income (US).</p>${bdTable(tradeHdr, closedTradeRows(c => c.gain < 0))}` };
        case 'unrealized': {
            const rows = state.trades.filter(t => (t.type || 'st') === 'open').map(t => { const c = tradeCalc(t); return [t.asset || '—', fmt(c.cost), num(t.price) ? fmt(c.end) : '<span class="led-bd-warn">no price</span>', money(c.gain)]; });
            return { title: 'unrealized P/L', body: `<p class="led-bd-tot">total <strong>${money(a.unrealized)}</strong></p><p class="led-bd-note">your open positions (type set to “open”), valued at the current price you entered. not taxed until you sell. leave a current price blank and it counts as $0.</p>${bdTable(['asset', 'cost', 'current value', 'unrealized'], rows)}` };
        }
        case 'tax': {
            const t = a.taxBreakdown;
            const rows = [
                ['federal income tax', fmt(t.fedInc)],
                ['federal short-term gains', fmt(t.fedSt)],
                ['federal long-term gains', fmt(t.fedLt)],
                ['NIIT (investment surtax)', fmt(t.niit)],
                ['FICA / self-employment', fmt(t.fica)],
                [`${t.locName} income tax`, fmt(t.locInc)],
                [`${t.locName} short-term gains`, fmt(t.locSt)],
                [`${t.locName} long-term gains`, fmt(t.locLt)],
            ].filter(r => r[1] !== '$0');
            return { title: 'estimated tax', body: `<p class="led-bd-tot">total <strong>${fmt(a.tax)}</strong></p><p class="led-bd-note">estimated on this year's income + realized gains at your home location (${state.homeLoc}).</p>${bdTable(['component', 'amount'], rows)}` };
        }
        case 'effrate': {
            const base = a.incomeYTD + a.stGains + a.ltGains;
            return { title: 'effective tax rate', body: `<p class="led-bd-note">the share of everything you earned this year that goes to tax — not your top bracket.</p><p class="led-bd-formula">${fmt(a.tax)} tax ÷ ${fmt(base)} earned = <strong>${a.effRate.toFixed(1)}%</strong></p><p class="led-bd-note">“earned” = income + realized short-term + realized long-term gains.</p>` };
        }
        case 'savings':
            return { title: 'net savings', body: `<p class="led-bd-note">what you keep from your earnings this year after spending and taxes. (investment gains/losses are tracked separately above.)</p><p class="led-bd-formula">income ${fmt(a.incomeYTD)}<br>− expenses ${fmt(a.expensesYTD)}<br>− tax ${fmt(a.tax)}<br>= <strong>${fmt(a.savings)}</strong></p>` };
        default:
            return { title: 'breakdown', body: '' };
    }
}

function showModal(title, body) {
    document.getElementById('ledModalTitle').textContent = title;
    document.getElementById('ledModalBody').innerHTML = body;
    document.getElementById('ledModal').style.display = 'flex';
}
function openStatModal(key) {
    const { title, body } = statContent(key);
    showModal(title, body);
}

// Per-slice / per-legend breakdown: a single income or expense category, or one tax component.
function openSliceModal(chartKey, label) {
    if (chartKey === 'tax') {
        if (/short-term/.test(label)) return openStatModal('st');
        if (/long-term/.test(label)) return openStatModal('lt');
        if (/income tax/.test(label)) return openStatModal('income');
        if (/NIIT/.test(label)) return showModal('NIIT · investment surtax', `<p class="led-bd-note">a 3.8% federal surtax on net investment income (capital gains, dividends, interest) when your adjusted gross income exceeds $200k single / $250k married.</p>`);
        if (/FICA/.test(label)) return showModal('FICA · self-employment', `<p class="led-bd-note">self-employment tax: 12.4% Social Security on net earnings up to $176,100, plus 2.9% Medicare (uncapped) and an extra 0.9% above $200k single / $250k married. The self-employed pay both the employer and employee halves.</p>`);
        return openStatModal('tax');
    }
    const isIncome = chartKey === 'income';
    const list = isIncome ? state.income : state.expenses;
    let sum = 0; const rows = [];
    list.forEach(r => {
        if (!YTD(r.date) || (r.category || 'other') !== label) return;
        const amt = num(r.amount); if (amt <= 0) return;
        sum += amt;
        rows.push(isIncome ? [r.source || '—', fmt(amt), r.date || '—'] : [r.desc || '—', fmt(amt), r.date || '—', r.deductible ? 'yes' : '—']);
    });
    const hdr = isIncome ? ['source', 'amount', 'date'] : ['description', 'amount', 'date', 'deductible'];
    showModal(`${isIncome ? 'income' : 'expenses'} · ${label}`, `<p class="led-bd-tot">total <strong>${fmt(sum)}</strong></p>${bdTable(hdr, rows)}`);
}
function closeModal() {
    const m = document.getElementById('ledModal');
    if (m) m.style.display = 'none';
}

// Snapshot of the ledger's current YTD figures — used by the estimator's "import from ledger".
export function ledgerSummary() {
    const a = aggregate();
    return {
        // income net of deductible business expenses — the same taxable income the ledger uses,
        // so the estimator reproduces the ledger's tax (the estimator has no business-expense field).
        inc: Math.round(Math.max(0, a.incomeYTD - a.deductibleYTD)),
        st: Math.round(a.stGains),
        lt: Math.round(a.ltGains),
        loss: Math.round(a.losses),
        loc: state.homeLoc,
        status: state.status,
        selfEmployed: state.selfEmployed,
        hasData: (state.income.length + state.expenses.length + state.trades.length) > 0,
    };
}

// US filing status + FICA only apply to US locations; hide them elsewhere.
const usesUSFederal = loc => !['PR', 'SG', 'JP', 'AE', 'AU', 'NZ', 'TW', 'HK'].includes(loc);
function syncTaxProfile() {
    const us = usesUSFederal(state.homeLoc);
    const statusEl = document.getElementById('ledStatus');
    const seEl = document.getElementById('ledSEWrap');
    const note = document.getElementById('ledTaxNote');
    if (statusEl) statusEl.style.display = us ? '' : 'none';
    if (seEl) seEl.style.display = us ? '' : 'none';
    if (note) {
        note.style.display = us ? 'none' : '';
        if (!us) {
            const name = (LOCATIONS.find(l => l.code === state.homeLoc) || {}).name || 'this location';
            note.textContent = `${name} uses its own tax rules — US filing status and self-employment (FICA) tax don't apply here.`;
        }
    }
}

function render() {
    syncTaxProfile();
    document.getElementById('ledIncomeBody').innerHTML = incomeRows();
    document.getElementById('ledExpenseBody').innerHTML = expenseRows();
    document.getElementById('ledTradeBody').innerHTML = tradeRows();
    // pad short (last) pages with empty rows so the table height — and the pager position — stays fixed
    padBody('ledIncomeBody', state.income.length, 5);
    padBody('ledExpenseBody', state.expenses.length, 6);
    padBody('ledTradeBody', state.trades.length, 8);
    document.getElementById('ledTickerBody').innerHTML = tickerRows();
    document.getElementById('ledTickerCard').style.display = state.trades.length ? '' : 'none';
    document.getElementById('ledTickerWrap').style.display = tickerOpen ? '' : 'none';
    document.getElementById('ledTickerCaret').textContent = tickerOpen ? '▾' : '▸';
    document.getElementById('ledIncomePager').innerHTML = pagerHTML('income', state.income.length);
    document.getElementById('ledExpensePager').innerHTML = pagerHTML('expense', state.expenses.length);
    document.getElementById('ledTradePager').innerHTML = pagerHTML('trade', state.trades.length);
    document.getElementById('ledSummary').innerHTML = summaryHTML();
    document.querySelectorAll('.led-trades th[data-sort]').forEach(th => {
        const ind = th.querySelector('.led-sort-ind');
        if (ind) ind.textContent = tradeSort.key === th.dataset.sort ? (tradeSort.dir === 1 ? ' ▲' : ' ▼') : '';
    });
    updateBadges();
    updateLedgerCharts();
}

// Colored +/- net total in each section header.
function updateBadges() {
    const a = aggregate();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = money(val); };
    set('ledIncomeTotal', a.incomeAll);
    set('ledExpenseTotal', -a.expensesAll);
    set('ledTradeTotal', a.tradePL);
}

// jump to the last page of a list (so a newly-added row is visible)
const lastPage = (arr, kind) => { page[kind] = Math.max(0, Math.ceil((arr.length) / PAGE_SIZE) - 1); };

// On a paginated table, fill a short page up to PAGE_SIZE with empty filler rows so the
// table height (and the prev/next buttons) don't move between pages.
function padBody(bodyId, total, cols) {
    if (total <= PAGE_SIZE) return;
    const body = document.getElementById(bodyId);
    const have = body.querySelectorAll('tr').length;
    let filler = '';
    for (let i = have; i < PAGE_SIZE; i++) filler += `<tr class="led-filler"><td colspan="${cols}"></td></tr>`;
    if (filler) body.insertAdjacentHTML('beforeend', filler);
}

// Reflect current state onto the settings controls (used after import/clear, no full rebuild).
function syncSettingsControls() {
    const loc = document.getElementById('ledLoc'); if (loc) loc.value = state.homeLoc;
    const se = document.getElementById('ledSE'); if (se) se.checked = state.selfEmployed;
    document.querySelectorAll('#ledStatus .status-pill').forEach(p => p.classList.toggle('active', p.dataset.s === state.status));
    page.income = page.expense = page.trade = 0;
}

const listFor = kind => kind === 'income' ? state.income : kind === 'expense' ? state.expenses : state.trades;
// Imported (e.g. LLM-generated) rows won't have ids — assign them so edit/delete work.
const withIds = arr => Array.isArray(arr) ? arr.map(r => ({ ...r, id: r.id || uid() })) : [];

// ---- pagination (10 rows per table) ----
const PAGE_SIZE = 10;
const page = { income: 0, expense: 0, trade: 0 };

function pageSlice(arr, kind) {
    const maxPage = Math.max(0, Math.ceil(arr.length / PAGE_SIZE) - 1);
    if (page[kind] > maxPage) page[kind] = maxPage; // clamp after deletions
    const start = page[kind] * PAGE_SIZE;
    return arr.slice(start, start + PAGE_SIZE);
}

function pagerHTML(kind, total) {
    if (total <= PAGE_SIZE) return '';
    const pages = Math.ceil(total / PAGE_SIZE);
    const cur = Math.min(page[kind], pages - 1);
    return `<div class="led-pager">
        <button class="led-page-btn" data-page="prev" data-kind="${kind}"${cur === 0 ? ' disabled' : ''}>‹ prev</button>
        <span class="led-page-info">page ${cur + 1} / ${pages} · ${total} entries</span>
        <button class="led-page-btn" data-page="next" data-kind="${kind}"${cur >= pages - 1 ? ' disabled' : ''}>next ›</button>
    </div>`;
}

// ---- doughnut charts (income by category, tax breakdown) ----
const PALETTE = ['#e07050', '#6a8cba', '#5a9a6e', '#b89a3a', '#c45a5a', '#9c7bb0', '#5fa8a0', '#cf8a4f', '#7f9c5a', '#b06a8a'];
let incomeChart = null, expenseChart = null, taxChart = null;

function incomeByCategory() {
    const m = {};
    for (const r of state.income) {
        if (r.date && new Date(r.date).getFullYear() !== CUR_YEAR) continue;
        const amt = num(r.amount); if (amt <= 0) continue;
        const c = r.category || 'other';
        m[c] = (m[c] || 0) + amt;
    }
    return m;
}
function expenseByCategory() {
    const m = {};
    for (const x of state.expenses) {
        if (x.date && new Date(x.date).getFullYear() !== CUR_YEAR) continue;
        const amt = num(x.amount); if (amt <= 0) continue;
        const c = x.category || 'other';
        m[c] = (m[c] || 0) + amt;
    }
    return m;
}

const chartTextColor = () => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#999';

// statKey: clicking any slice opens that section's breakdown modal (same as the boxes above)
function makeDoughnut(canvas, statKey) {
    return new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }] },
        options: {
            // responsive:false → Chart.js attaches NO ResizeObserver, so it can never
            // enter a resize feedback loop. We size the canvas manually instead.
            responsive: false, maintainAspectRatio: false, cutout: '56%',
            animation: false,
            onClick: (evt, els, chart) => { if (els && els.length) openSliceModal(statKey, chart.data.labels[els[0].index]); },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: chartTextColor(), font: { size: 10 }, boxWidth: 10, boxHeight: 10, padding: 8 },
                    // clicking a legend entry opens its breakdown (easier than hitting a tiny slice)
                    onClick: (e, item) => openSliceModal(statKey, item.text),
                },
                tooltip: { callbacks: { label: c => {
                    const total = c.dataset.data.reduce((s, v) => s + v, 0);
                    const p = total ? (c.parsed / total * 100).toFixed(1) : '0.0';
                    return ` ${c.label}: ${fmt(c.parsed)} (${p}%)`;
                } } },
            },
        },
    });
}

// Size the canvases to their containers exactly once per call (no observer = no loop).
function resizeLedgerCharts() {
    [incomeChart, expenseChart, taxChart].forEach(ch => {
        if (!ch) return;
        const box = ch.canvas.parentElement;
        const w = box ? box.clientWidth : 0;
        if (w > 0) ch.resize(w, 260);
    });
}

function createLedgerCharts() {
    [incomeChart, expenseChart, taxChart].forEach(c => c && c.destroy());
    incomeChart = expenseChart = taxChart = null;
    const ic = document.getElementById('ledIncomeChart');
    const ec = document.getElementById('ledExpenseChart');
    const tc = document.getElementById('ledTaxChart');
    if (ic) incomeChart = makeDoughnut(ic, 'income');
    if (ec) expenseChart = makeDoughnut(ec, 'expenses');
    if (tc) taxChart = makeDoughnut(tc, 'tax');
    resizeLedgerCharts(); // size now if the ledger tab is already visible (e.g. #ledger on load)
}

// entries: array of [label, value, color]
function setDoughnut(chart, entries) {
    if (!chart) return;
    const e = entries.filter(x => x[1] > 0.5);
    chart.data.labels = e.map(x => x[0]);
    chart.data.datasets[0].data = e.map(x => x[1]);
    chart.data.datasets[0].backgroundColor = e.map(x => x[2]);
    chart.options.plugins.legend.labels.color = chartTextColor();
    chart.update();
}

const toggleWrap = (id, show) => { const w = document.getElementById(id); if (w) w.style.display = show ? '' : 'none'; };

function updateLedgerCharts() {
    const a = aggregate();
    // income / expenses — one palette color per category
    const incomeEntries = Object.entries(incomeByCategory()).map(([l, v], i) => [l, v, PALETTE[i % PALETTE.length]]);
    const expenseEntries = Object.entries(expenseByCategory()).map(([l, v], i) => [l, v, PALETTE[i % PALETTE.length]]);
    setDoughnut(incomeChart, incomeEntries);
    setDoughnut(expenseChart, expenseEntries);

    // tax — federal in cool blues (gains as lighter shades), location in warm oranges
    const t = a.taxBreakdown;
    setDoughnut(taxChart, [
        ['federal income tax', t.fedInc, '#3f6593'],
        ['federal short-term gains', t.fedSt, '#6e96c8'],
        ['federal long-term gains', t.fedLt, '#a3c4e6'],
        ['NIIT · investment surtax', t.niit, '#9c7bb0'],
        ['FICA · self-employment', t.fica, '#2e4a6e'],
        [`${t.locName} income tax`, t.locInc, '#d85f3c'],
        [`${t.locName} short-term gains`, t.locSt, '#e8915f'],
        [`${t.locName} long-term gains`, t.locLt, '#f2bd96'],
    ]);

    // show each chart only when it has data; hide the whole card when there's nothing
    const hasIncome = incomeEntries.length > 0, hasExpense = expenseEntries.length > 0;
    const hasTax = a.tax > 0.5;
    const taxable = (a.incomeYTD + a.stGains + a.ltGains) > 0; // something that *could* be taxed
    toggleWrap('ledIncomeChartWrap', hasIncome);
    toggleWrap('ledExpenseChartWrap', hasExpense);
    toggleWrap('ledTaxChartWrap', taxable);
    // when there's income/gains but $0 tax (e.g. wiped by deductions), show a note instead of a blank pie
    const taxBox = document.querySelector('#ledTaxChartWrap .led-chart-box');
    const taxNone = document.getElementById('ledTaxNone');
    if (taxBox) taxBox.style.display = hasTax ? '' : 'none';
    if (taxNone) taxNone.style.display = (taxable && !hasTax) ? '' : 'none';
    const card = document.getElementById('ledBreakdownCard');
    if (card) card.style.display = (hasIncome || hasExpense || taxable) ? '' : 'none';
    resizeLedgerCharts(); // widths change when wraps toggle
}

// Update one trade row's type / gain / annualized cells without touching its inputs.
function updateTradeRowCalcs(row, t) {
    const c = tradeCalc(t);
    const cell = row.querySelector('.led-calc');
    if (!cell) return;
    cell.innerHTML = `${(c.cost > 0 || c.end > 0) ? money(c.gain) : '—'}<div class="led-sub">${c.cost > 0 ? pct(c.pct) : '—'}</div>`;
}

// ---- CSV export (one file each) ----
function exportCSV() {
    const inc = ['source,category,amount,date', ...state.income.map(r =>
        [r.source, r.category, r.amount, r.date].map(csvCell).join(','))].join('\n');
    const exp = ['description,category,amount,date,deductible', ...state.expenses.map(x =>
        [x.desc, x.category, x.amount, x.date, x.deductible ? 'yes' : 'no'].map(csvCell).join(','))].join('\n');
    const trd = ['asset,qty,avgCost,type,sold,salePrice,price', ...state.trades.map(t =>
        [t.asset, t.qty, t.avgCost, t.type, t.sold, t.salePrice, t.price].map(csvCell).join(','))].join('\n');
    downloadText(`ledger-income-${todayStr()}.csv`, inc, 'text/csv');
    downloadText(`ledger-expenses-${todayStr()}.csv`, exp, 'text/csv');
    downloadText(`ledger-trades-${todayStr()}.csv`, trd, 'text/csv');
}
function csvCell(v) {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---- wiring ----
export function initLedger() {
    const panel = document.querySelector('.tab-panel[data-tab="ledger"]');
    if (!panel) return;

    panel.innerHTML = `
        <div class="led-notice">
            <strong>private &amp; local.</strong> none of this data is uploaded or saved anywhere — it only lives
            in your browser's local storage. I recommend <strong>exporting the JSON</strong> and reimporting it
            to keep a real backup. you can also update the JSON automatically by feeding the export format into an
            LLM along with your invoices or trades, then re-importing it here.
            <div class="led-notice-actions">
                <button class="copy-btn" id="ledCopyPrompt">click here to copy LLM prompt</button>
            </div>
        </div>
        <div class="card">
            <div class="card-label">ledger settings</div>
            <div class="led-loc-grid">
                <div class="select-wrap"><select id="ledLoc">${locOptions(state.homeLoc)}</select></div>
                <div class="select-wrap"><select id="ledCompare"><option value="">compare with… (none)</option>${LOCATIONS.map(l => `<option value="${l.code}"${state.compareLoc === l.code ? ' selected' : ''}>vs ${l.name}</option>`).join('')}</select></div>
            </div>
            <div class="status-pills" id="ledStatus">
                <button class="status-pill${state.status === 'single' ? ' active' : ''}" data-s="single">single</button>
                <button class="status-pill${state.status === 'mfj' ? ' active' : ''}" data-s="mfj">married jointly</button>
                <button class="status-pill${state.status === 'hoh' ? ' active' : ''}" data-s="hoh">head of household</button>
            </div>
            <label class="led-check" id="ledSEWrap"><input type="checkbox" id="ledSE"${state.selfEmployed ? ' checked' : ''}> <span class="help" data-tip="Turn on if your income is self-employment / 1099 / business income (freelancing, creator income, sole-prop). You then owe FICA — the self-employment tax: 12.4% Social Security on net earnings up to $176,100, plus 2.9% Medicare (no cap), plus 0.9% extra Medicare above $200k single / $250k married. Self-employed people pay BOTH the employee and employer halves. W-2 employees leave this off (their employer withholds it).">self-employed (include FICA / SE tax)</span></label>
            <p class="led-note" id="ledTaxNote" style="display:none"></p>
        </div>

        <div class="led-summary" id="ledSummary"></div>

        <div class="card" id="ledBreakdownCard">
            <div class="card-label">breakdown <span class="led-chart-hint">— click a slice for details</span></div>
            <div class="led-charts">
                <div class="led-chart" id="ledIncomeChartWrap">
                    <div class="led-chart-t" data-chart="income">income by category (${CUR_YEAR})</div>
                    <div class="led-chart-box"><canvas id="ledIncomeChart"></canvas></div>
                </div>
                <div class="led-chart" id="ledExpenseChartWrap">
                    <div class="led-chart-t" data-chart="expenses">expenses by category (${CUR_YEAR})</div>
                    <div class="led-chart-box"><canvas id="ledExpenseChart"></canvas></div>
                </div>
                <div class="led-chart" id="ledTaxChartWrap">
                    <div class="led-chart-t" data-chart="tax">estimated tax</div>
                    <div class="led-chart-box"><canvas id="ledTaxChart"></canvas></div>
                    <div class="led-chart-none" id="ledTaxNone" style="display:none">$0 — no tax owed 🎉</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="led-head"><div class="card-label" style="margin:0">income</div><span class="led-total" id="ledIncomeTotal"></span></div>
            <div class="led-table-wrap">
                <table class="led-table">
                    <thead><tr><th style="width:32%">source</th><th style="width:22%">category</th><th class="r" style="width:18%">amount</th><th style="width:22%">date</th><th style="width:6%"></th></tr></thead>
                    <tbody id="ledIncomeBody"></tbody>
                </table>
            </div>
            <div id="ledIncomePager"></div>
            <button class="led-add" id="ledAddIncome">+ add income</button>
        </div>

        <div class="card">
            <div class="led-head"><div class="card-label" style="margin:0">expenses</div><span class="led-total" id="ledExpenseTotal"></span></div>
            <div class="led-table-wrap">
                <table class="led-table led-expense">
                    <thead><tr><th style="width:28%">description</th><th style="width:18%">category</th><th class="r" style="width:16%">amount</th><th style="width:20%">date</th><th class="led-center" style="width:12%">deductible</th><th style="width:6%"></th></tr></thead>
                    <tbody id="ledExpenseBody"></tbody>
                </table>
            </div>
            <div id="ledExpensePager"></div>
            <button class="led-add" id="ledAddExpense">+ add expense</button>
            <p class="led-note">check <strong>deductible</strong> for business write-offs — they reduce your taxable income (and SE/FICA base). leave it unchecked for personal spending.</p>
        </div>

        <div class="card">
            <div class="led-head"><div class="card-label" style="margin:0">trades</div><span class="led-total" id="ledTradeTotal"></span></div>
            <div class="led-table-wrap">
                <table class="led-table led-trades">
                    <thead><tr>
                        <th class="led-sortable" data-sort="asset" style="width:10%">asset<span class="led-sort-ind"></span></th>
                        <th class="r led-sortable" data-sort="qty" style="width:9%">qty<span class="led-sort-ind"></span></th>
                        <th class="r led-sortable" data-sort="cost" style="width:14%">avg cost<span class="led-sort-ind"></span></th>
                        <th style="width:14%">type</th>
                        <th class="led-sortable" data-sort="sold" style="width:19%">sold<span class="led-sort-ind"></span></th>
                        <th class="r led-sortable" data-sort="proceeds" style="width:14%">sale price<span class="led-sort-ind"></span></th>
                        <th class="r led-sortable" data-sort="gain" style="width:14%">gain<span class="led-sort-ind"></span></th>
                        <th style="width:6%"></th>
                    </tr></thead>
                    <tbody id="ledTradeBody"></tbody>
                </table>
            </div>
            <div id="ledTradePager"></div>
            <button class="led-add" id="ledAddTrade">+ add trade</button>
            <p class="led-note">set <strong>type</strong> to short-term (held ≤ 1yr), long-term (held > 1yr), or open (still holding —
            uses current price for unrealized P/L, not taxed). tax uses ${CUR_YEAR} realized gains at your home location.</p>
        </div>

        <div class="card" id="ledTickerCard">
            <div class="led-head led-collapse-head" id="ledTickerToggle">
                <div class="card-label" style="margin:0"><span class="led-caret" id="ledTickerCaret">▸</span> by ticker</div>
                <span class="led-chart-hint">— performance per stock</span>
            </div>
            <div class="led-table-wrap" id="ledTickerWrap" style="display:none">
                <table class="led-table">
                    <thead><tr>
                        <th style="width:24%">ticker</th><th class="r" style="width:14%">trades</th>
                        <th class="r" style="width:24%">cost basis</th><th class="r" style="width:20%">P/L</th><th class="r" style="width:18%">return</th>
                    </tr></thead>
                    <tbody id="ledTickerBody"></tbody>
                </table>
                <p class="led-note">click a ticker to expand its individual trades.</p>
            </div>
        </div>

        <div class="led-toolbar">
            <button class="copy-btn" id="ledExportJSON">export json</button>
            <button class="copy-btn" id="ledExportCSV">export csv</button>
            <button class="copy-btn" id="ledImport">import json</button>
            <button class="copy-btn led-danger" id="ledClear">clear all</button>
        </div>
        <div class="led-import-box" id="ledImportBox" style="display:none">
            <textarea id="ledImportText" class="led-import-text" placeholder="paste your ledger JSON here (or the JSON an LLM generated for you), then press load…"></textarea>
            <div class="led-import-actions">
                <button class="copy-btn" id="ledImportLoad">load</button>
                <button class="copy-btn" id="ledImportCancel">cancel</button>
            </div>
        </div>

        <div class="led-modal" id="ledModal" style="display:none">
            <div class="led-modal-card">
                <div class="led-modal-head"><span id="ledModalTitle"></span><button class="led-modal-x" id="ledModalClose" title="close">×</button></div>
                <div class="led-modal-body" id="ledModalBody"></div>
            </div>
        </div>`;

    // clickable summary stats → breakdown modal (#ledSummary persists across renders)
    const summaryEl = document.getElementById('ledSummary');
    summaryEl.addEventListener('click', e => {
        const cell = e.target.closest('.led-stat[data-stat]'); if (!cell) return;
        openStatModal(cell.dataset.stat);
    });
    summaryEl.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cell = e.target.closest('.led-stat[data-stat]'); if (!cell) return;
        e.preventDefault(); openStatModal(cell.dataset.stat);
    });
    document.getElementById('ledModalClose').addEventListener('click', closeModal);
    document.getElementById('ledModal').addEventListener('click', e => { if (e.target.id === 'ledModal') closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // settings
    document.getElementById('ledLoc').addEventListener('change', e => { state.homeLoc = e.target.value; persist(); render(); });
    document.getElementById('ledCompare').addEventListener('change', e => { state.compareLoc = e.target.value; persist(); render(); });
    document.getElementById('ledSE').addEventListener('change', e => { state.selfEmployed = e.target.checked; persist(); render(); });
    document.getElementById('ledStatus').addEventListener('click', e => {
        const b = e.target.closest('.status-pill'); if (!b) return;
        state.status = b.dataset.s; persist();
        document.querySelectorAll('#ledStatus .status-pill').forEach(p => p.classList.toggle('active', p === b));
        render();
    });

    // add rows
    document.getElementById('ledAddIncome').addEventListener('click', () => {
        state.income.push({ id: uid(), source: '', category: 'salary', amount: '', date: todayStr() });
        lastPage(state.income, 'income'); persist(); render();
    });
    document.getElementById('ledAddExpense').addEventListener('click', () => {
        state.expenses.push({ id: uid(), desc: '', category: 'rent', amount: '', date: todayStr(), deductible: false });
        lastPage(state.expenses, 'expense'); persist(); render();
    });
    document.getElementById('ledAddTrade').addEventListener('click', () => {
        state.trades.push({ id: uid(), asset: '', qty: '', avgCost: '', type: 'st', sold: todayStr(), salePrice: '', price: '' });
        tradeSort = { key: null, dir: 1 };   // clear sort so the new row lands on the last page (insertion order)
        lastPage(state.trades, 'trade'); persist(); render();
    });

    // edit + delete (event delegation on the panel) — attach ONCE, even across rebuilds
    if (!wired) {
    wired = true;
    panel.addEventListener('input', e => {
        const inp = e.target.closest('.led-in'); if (!inp) return;
        const row = inp.closest('tr'); if (!row) return;
        const rec = listFor(row.dataset.kind).find(x => x.id === row.dataset.id); if (!rec) return;
        rec[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value;
        persist();
        document.getElementById('ledSummary').innerHTML = summaryHTML();
        updateBadges();
        updateLedgerCharts();
        // Live-update this trade row's computed cells in place (keeps input focus).
        // Toggling the sold date swaps the proceeds/price field, so do a full re-render then.
        if (row.dataset.kind === 'trade') {
            // only `type` swaps the proceeds/price field + disables sold → needs a rebuild.
            // editing sold/cost/proceeds/etc. updates this row's cells in place so focus/tab survive.
            if (inp.dataset.f === 'type') render();
            else updateTradeRowCalcs(row, rec);
        }
    });
    panel.addEventListener('change', e => {
        const inp = e.target.closest('.led-in'); if (!inp) return;
        if (inp.dataset.f === 'type') render(); // only type changes the row's field layout
    });
    panel.addEventListener('click', e => {
        // chart title → that section's overall breakdown
        const chartTitle = e.target.closest('.led-chart-t[data-chart]');
        if (chartTitle) { openStatModal(chartTitle.dataset.chart); return; }
        // by-ticker card header → collapse/expand the whole box
        if (e.target.closest('#ledTickerToggle')) {
            tickerOpen = !tickerOpen;
            document.getElementById('ledTickerWrap').style.display = tickerOpen ? '' : 'none';
            document.getElementById('ledTickerCaret').textContent = tickerOpen ? '▾' : '▸';
            return;
        }
        // by-ticker row → expand/collapse its trades inline
        const tickerRow = e.target.closest('tr[data-ticker]');
        if (tickerRow) {
            const tk = tickerRow.dataset.ticker;
            expandedTickers.has(tk) ? expandedTickers.delete(tk) : expandedTickers.add(tk);
            document.getElementById('ledTickerBody').innerHTML = tickerRows();
            return;
        }
        // sortable trade headers
        const sortTh = e.target.closest('th[data-sort]');
        if (sortTh) {
            const key = sortTh.dataset.sort;
            if (tradeSort.key === key) tradeSort.dir *= -1;     // toggle direction
            else tradeSort = { key, dir: key === 'asset' ? 1 : -1 }; // text A→Z, numbers/dates biggest→smallest first
            page.trade = 0;
            render();
            return;
        }
        // pagination buttons
        const pb = e.target.closest('.led-page-btn');
        if (pb) {
            const k = pb.dataset.kind;
            const pages = Math.ceil(listFor(k).length / PAGE_SIZE);
            page[k] = pb.dataset.page === 'prev'
                ? Math.max(0, page[k] - 1)
                : Math.min(pages - 1, page[k] + 1);
            render();
            return;
        }
        const del = e.target.closest('.led-del'); if (!del) return;
        const row = del.closest('tr');
        const k = row.dataset.kind;
        if (k === 'income') state.income = state.income.filter(x => x.id !== row.dataset.id);
        else if (k === 'expense') state.expenses = state.expenses.filter(x => x.id !== row.dataset.id);
        else state.trades = state.trades.filter(x => x.id !== row.dataset.id);
        persist(); render();
    });
    // Charts are created while the ledger panel may be hidden (clientWidth 0);
    // size them when the tab is shown and on window resize. No observer → no loop.
    document.addEventListener('tab:shown', e => {
        if (e.detail.tab === 'ledger') resizeLedgerCharts();
    });
    let rt;
    window.addEventListener('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(() => { if (document.querySelector('.tab-panel[data-tab="ledger"].active')) resizeLedgerCharts(); }, 150);
    });
    } // end if(!wired)

    // copy LLM prompt
    document.getElementById('ledCopyPrompt').addEventListener('click', e => {
        const btn = e.currentTarget;
        navigator.clipboard.writeText(buildLLMPrompt()).then(() => {
            const orig = btn.textContent;
            btn.textContent = 'copied! paste into any LLM';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2500);
        });
    });

    // toolbar
    document.getElementById('ledExportJSON').addEventListener('click', () =>
        downloadText(`ledger-${todayStr()}.json`, JSON.stringify(state, null, 2)));
    document.getElementById('ledExportCSV').addEventListener('click', exportCSV);
    // Import = paste JSON into a textarea (no native file dialog → cannot crash on open).
    const importBox = document.getElementById('ledImportBox');
    const importText = document.getElementById('ledImportText');
    document.getElementById('ledImport').addEventListener('click', () => {
        const show = importBox.style.display === 'none';
        importBox.style.display = show ? 'block' : 'none';
        if (show) importText.focus();
    });
    document.getElementById('ledImportCancel').addEventListener('click', () => {
        importText.value = '';
        importBox.style.display = 'none';
    });
    document.getElementById('ledImportLoad').addEventListener('click', () => {
        const txt = importText.value.trim();
        if (!txt) { alert('paste some JSON first'); return; }
        let data;
        try { data = JSON.parse(txt); }
        catch (err) { alert('that is not valid JSON: ' + err.message); return; }
        state = {
            homeLoc: data.homeLoc || DEFAULT.homeLoc,
            status: data.status || DEFAULT.status,
            selfEmployed: !!data.selfEmployed,
            income: withIds(data.income),
            expenses: withIds(data.expenses),
            trades: withIds(data.trades).map(migrateTrade),
        };
        persist();
        syncSettingsControls();   // reflect imported settings without a full rebuild
        importText.value = '';
        importBox.style.display = 'none';
        render();
    });
    document.getElementById('ledClear').addEventListener('click', () => {
        if (!confirm('clear the entire ledger? this cannot be undone.')) return;
        state = structuredClone(DEFAULT);
        persist();
        syncSettingsControls();
        render();
    });

    createLedgerCharts(); // fresh canvases each (re)build
    render();
}
