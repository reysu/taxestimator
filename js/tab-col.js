// Tab 4 — cost of living: the gross income needed in each location to sustain a target monthly
// lifestyle (spend + investing), via the engine's grossForNet. (Net-worth / compounding lives on
// the "calculate" tab.)
import { grossForNet, fmt } from './calc.js';
import { LOCATIONS, stdDeduction } from '../data/brackets.js';
import { load, save } from './store.js';

const KEY = 'col.v1';
const DEFAULT = {
    status: 'single', selfEmployed: false,
    housing: 2500, food: 800, transport: 400, lifestyle: 800, savings: 1000, tier: 'comfortable',
    baseCountry: 'CA', baseTier: 'comfortable',
};
let state = { ...DEFAULT, ...load(KEY, {}) };

const FIELDS = [
    { k: 'housing', label: 'housing / rent', max: 15000 },
    { k: 'food', label: 'food & groceries', max: 5000 },
    { k: 'transport', label: 'transportation', max: 5000 },
    { k: 'lifestyle', label: 'lifestyle & other', max: 10000 },
    { k: 'savings', label: 'monthly investing', max: 20000 },
];

// ≈ rough monthly all-in cost of living for a single 'comfortable' lifestyle (USD), ballpark only
const COL_BASE = { CA: 4800, NY: 5200, UT: 3300, TX: 3500, FL: 3700, WA: 4200, NV: 3400, PR: 2600, SG: 4200, JP: 3000, AE: 3600, AU: 3800, NZ: 3300, TW: 2300, HK: 4000 };
const TIERS = [
    { id: 'budget', name: 'budget', mult: 0.65 },
    { id: 'comfortable', name: 'comfortable', mult: 1.0 },
    { id: 'family', name: 'family of 4', mult: 1.9 },
    { id: 'luxury', name: 'luxury / fat', mult: 2.6 },
];
// ≈ rough individual pre-tax income percentile thresholds (USD), scaled per location by income level
const PCT_BASE = { p50: 45000, p75: 75000, p90: 130000, p95: 190000, p99: 430000, p999: 1300000 };
const INCOME_MULT = { CA: 1.15, NY: 1.15, UT: 0.95, TX: 0.95, FL: 0.9, WA: 1.1, NV: 0.9, PR: 0.5, SG: 0.9, JP: 0.75, AE: 0.85, AU: 0.95, NZ: 0.85, TW: 0.6, HK: 0.95 };

// baseline lifestyle presets — spend multiplier (× local comfortable cost), savings multiplier, and flavor
const LIFETIERS = {
    budget: { name: 'budget', spendMult: 0.6, saveMult: 0.05, flavor: "ramen, roommates, and a bus pass — but hey, you're free." },
    comfortable: { name: 'comfortable', spendMult: 1.0, saveMult: 0.3, flavor: "nice apartment, eat out a few times a week, a trip or two a year." },
    fire: { name: 'FIRE', spendMult: 0.85, saveMult: 1.2, flavor: "living lean on purpose — every spare dollar is buying back your time." },
    fatfire: { name: 'fat FIRE', spendMult: 2.2, saveMult: 2.5, flavor: "mansion vibes, business class, Uber Eats for every meal if you feel like it." },
    top01: { name: 'top 0.1%', spendMult: 3.6, saveMult: 3.5, flavor: "top 0.1% — private jet, a staff, and money that makes money while you sleep." },
};
const LIFETIER_ORDER = ['budget', 'comfortable', 'fire', 'fatfire', 'top01'];
const round50 = v => Math.round(v / 50) * 50;

// city-specific flavor for each location × tier
const FLAVOR = {
    CA: { budget: "a studio in the Valley, In-N-Out runs, and a beach that's technically free.", comfortable: "a 1-bed near the coast, taco trucks, and weekends in wine country.", fire: "skipping the avocado toast and maxing the 401k while rent quietly eats you alive.", fatfire: "a house in the Hills, a Tesla in the driveway, Tahoe on long weekends.", top01: "a Malibu beach house, a private chef, and you fund startups for fun." },
    NY: { budget: "a 4th-floor walk-up with roommates, bodega bacon-egg-and-cheese, the subway.", comfortable: "a doorman 1-bed, brunch in the Village, the occasional Broadway splurge.", fire: "eating dollar-slice pizza and stacking index funds in a 'charming' walk-up.", fatfire: "a Tribeca loft, summers in the Hamptons, a standing Michelin reservation.", top01: "a Central Park penthouse, a car service, and a table wherever you want it." },
    UT: { budget: "a room in Provo, ramen, and free hikes through five national parks.", comfortable: "a townhouse, a season ski pass, and big Sunday dinners with the crew.", fire: "no vices, no debt, and a paid-off cabin by 40 — very on-brand.", fatfire: "a Park City chalet, fresh powder before work, a Sprinter van for the gear.", top01: "a slopeside estate and a helicopter to the backcountry lines." },
    TX: { budget: "a cheap apartment, Whataburger, and zero state income tax to soften it.", comfortable: "a house with a yard, brisket on the smoker, and a big ol' truck.", fire: "no state tax, low rent, and you're shoveling every dollar into VTI.", fatfire: "a ranch outside Austin, a lifted truck, and a lake house for the boat.", top01: "oil money — a compound, a jet at the private terminal, your own water rights." },
    FL: { budget: "a studio inland, cheap tacos, and the beach to keep you sane.", comfortable: "a condo near the water, a boat on weekends, and no state income tax.", fire: "retiring at 40 to do exactly what the retirees here already do all day.", fatfire: "a Miami waterfront pad, a yacht slip, and bottle service in South Beach.", top01: "a Palm Beach estate, the megayacht, and a tee time whenever you feel like it." },
    WA: { budget: "a rainy studio, endless coffee, and ferry rides that count as recreation.", comfortable: "a Craftsman home, vesting RSUs, and weekends up in the mountains.", fire: "no state income tax, a fat tech salary, and FI before the next reorg.", fatfire: "a lake-view house, a Rivian, and a cabin tucked in the Cascades.", top01: "a waterfront compound, a seaplane, and you angel-invest between hikes." },
    NV: { budget: "a cheap place off the Strip, five-dollar buffets, and free pool days.", comfortable: "a suburban home, no state tax, weekend shows and brunch buffets.", fire: "low cost, no income tax, and you treat the casinos as a free museum.", fatfire: "a Strip penthouse, comped suites, and front-row to every show.", top01: "you own a piece of the casino — the whales are your customers now." },
    PR: { budget: "a room in San Juan, rice and beans, and a beach around every corner.", comfortable: "a place near the water, salsa nights, and that island-time pace.", fire: "Act 60 vibes — 0% on gains and a piña colada next to your spreadsheet.", fatfire: "a beachfront villa, a boat, and the full crypto-bro tax holiday.", top01: "a private cove, a catamaran, and your accountant on speed dial." },
    SG: { budget: "an HDB room, four-dollar hawker plates, and the MRT everywhere.", comfortable: "a condo with a pool, chili crab nights, no car (the COE is insane).", fire: "hawker meals, no car, and CPF plus index funds doing the heavy lifting.", fatfire: "a Marina Bay condo, a COE-priced Porsche, a rooftop infinity pool.", top01: "a Sentosa Cove bungalow, a yacht at the door, a banker who knows your name." },
    JP: { budget: "a tiny Tokyo apartment, konbini meals, and a rail pass that just works.", comfortable: "a clean 1LDK, izakaya after work, shinkansen trips on long weekends.", fire: "hundred-yen konbini coffee, no car, quietly stacking toward an early exit.", fatfire: "a Minato-ku flat, omakase counters, and first-class to anywhere.", top01: "a Ginza penthouse, a private sushi chef, and a place up in Karuizawa." },
    AE: { budget: "a shared flat in Deira, shawarma runs, and 0% tax to ease the rent.", comfortable: "a Marina apartment, Friday brunch, and tax-free take-home.", fire: "a tax-free salary funneled straight into the market — easy mode.", fatfire: "a Palm villa, a matte-black G-Wagon, and gold-flake everything.", top01: "a Burj penthouse, a yacht at the marina, a Bugatti for the school run." },
    AU: { budget: "a sharehouse, flat whites, and a beach that's basically free therapy.", comfortable: "a home near the coast, weekend BBQs, and a surf before work.", fire: "frugal flat whites, super maxed out, an early retirement by the beach.", fatfire: "a Bondi pad, a boat on the harbour, and ski trips to the (other) Alps.", top01: "a harbourfront mansion, a superyacht on the bay, and a station out west." },
    NZ: { budget: "a flat in Welly, mince pies, and hikes straight out of a movie.", comfortable: "a house with a view, weekend tramps, and a quiet good life.", fire: "low-key living, KiwiSaver ticking, and a paid-off bach by the lake.", fatfire: "a lakeside lodge, a chopper to the fjords, and your own little vineyard.", top01: "a high-country station, a private jet, and a bunker (just in case)." },
    TW: { budget: "a room in Taipei, two-dollar beef noodle, a scooter, and 7-Eleven for everything.", comfortable: "an apartment on the MRT line, night-market dinners, weekend hot springs.", fire: "night-market cheap, a scooter not a car, and ETFs on full autopilot.", fatfire: "a Xinyi high-rise, a driver, and omakase whenever the mood strikes.", top01: "a penthouse over Taipei 101, a chip fortune, and a place in the mountains." },
    HK: { budget: "a 200-square-foot flat, four-dollar dim sum, and the MTR as your living room.", comfortable: "a small but slick apartment, dim sum Sundays, junk-boat weekends.", fire: "a tiny flat, no car, and a fat finance bonus going straight to the market.", fatfire: "an apartment on The Peak, a junk for parties, and tailored everything.", top01: "a mansion on The Peak, a yacht, and a helipad to skip the traffic." },
};

function applyBaseline(panel) {
    const base = COL_BASE[state.baseCountry] || 3500;
    const t = LIFETIERS[state.baseTier] || LIFETIERS.comfortable;
    const spend = base * t.spendMult;
    state.housing = round50(spend * 0.45);
    state.food = round50(spend * 0.18);
    state.transport = round50(spend * 0.12);
    state.lifestyle = round50(spend * 0.25);
    state.savings = round50(base * t.saveMult);
    FIELDS.forEach(f => panel.querySelectorAll(`[data-k="${f.k}"]`).forEach(o => {
        o.value = o.classList.contains('num-comma') ? Number(state[f.k]).toLocaleString('en-US') : state[f.k];
    }));
    persist();
    render();
}

const persist = () => save(KEY, state);
const spendMonthly = () => (+state.housing || 0) + (+state.food || 0) + (+state.transport || 0) + (+state.lifestyle || 0);
const needMonthly = () => spendMonthly() + (+state.savings || 0); // income must cover spending + investing
const tierMult = () => (TIERS.find(t => t.id === state.tier) || TIERS[1]).mult;
const avgCOL = loc => (COL_BASE[loc] || 3500) * tierMult();
function percentileLabel(loc, gross) {
    const m = INCOME_MULT[loc] || 1, t = PCT_BASE;
    if (gross >= t.p999 * m) return 'top 0.1%';
    if (gross >= t.p99 * m) return 'top 1%';
    if (gross >= t.p95 * m) return 'top 5%';
    if (gross >= t.p90 * m) return 'top 10%';
    if (gross >= t.p75 * m) return 'top 25%';
    if (gross >= t.p50 * m) return 'top 50%';
    return 'below median';
}
// green (low tax) → red (high tax) for the gross/year figure
function rateColor(pct) {
    const t = Math.min(1, pct / 45);
    return `rgb(${Math.round(90 + 106 * t)},${Math.round(154 - 64 * t)},${Math.round(110 - 20 * t)})`;
}

function incomeNeeded() {
    const annualNet = needMonthly() * 12;
    const opts = { status: state.status, selfEmployed: state.selfEmployed, deduction: stdDeduction[state.status], waMillionaires: false };
    return LOCATIONS.map(l => {
        const gross = annualNet > 0 ? grossForNet(annualNet, l.code, opts, { inc: 1 }) : 0;
        return { code: l.code, name: l.name, gross, grossMo: gross / 12, rate: gross > 0 ? (gross - annualNet) / gross * 100 : 0 };
    }).sort((a, b) => a.gross - b.gross);
}

function sliderRow(f) {
    const v = +state[f.k] || 0;
    return `
    <div class="col-row">
        <div class="col-row-top">
            <span class="col-label">${f.label}</span>
            <span class="col-amt">$ <input type="text" inputmode="numeric" class="col-num num-comma" data-k="${f.k}" value="${v.toLocaleString('en-US')}"></span>
        </div>
        <input type="range" class="col-range" data-k="${f.k}" min="0" max="${f.max}" step="50" value="${v}">
    </div>`;
}

function render() {
    const fl = document.getElementById('colFlavor');
    if (fl) fl.textContent = (FLAVOR[state.baseCountry] && FLAVOR[state.baseCountry][state.baseTier]) || (LIFETIERS[state.baseTier] || LIFETIERS.comfortable).flavor;
    document.getElementById('colNeed').textContent = fmt(needMonthly());
    document.getElementById('colNeedHdr').textContent = `to make a monthly income of ${fmt(needMonthly())}, this is how much you'd need to earn in each location`;
    const rows = incomeNeeded();
    document.getElementById('colResults').innerHTML = rows.map((r, i) => `
        <tr${i === 0 ? ' class="col-best"' : ''}>
            <td>${r.name}${i === 0 ? ' <span class="col-tag">cheapest</span>' : ''}</td>
            <td class="r" style="color:${rateColor(r.rate)};font-weight:700">${fmt(r.gross)}<div class="col-pctile">${percentileLabel(r.code, r.gross)} earner</div></td>
            <td class="r">${fmt(r.grossMo)}</td>
            <td class="r">${r.rate.toFixed(1)}%</td>
            <td class="r">${fmt(avgCOL(r.code))}</td>
        </tr>`).join('');
}

export function initCol() {
    const panel = document.querySelector('.tab-panel[data-tab="col"]');
    if (!panel) return;

    panel.innerHTML = `
        <div class="col-intro">this page figures out the <strong>monthly income you need</strong> — working backwards from how much you want to
        <strong>spend</strong>, how much you want to <strong>invest</strong>, and the <strong>taxes</strong> you'd owe in each location.</div>

        <div class="card">
            <div class="card-label">your monthly lifestyle</div>
            <div class="col-baseline">
                <span class="col-muted">start from a baseline:</span>
                <span class="select-wrap col-select"><select id="colBaseCountry">${LOCATIONS.map(l => `<option value="${l.code}"${state.baseCountry === l.code ? ' selected' : ''}>${l.name}</option>`).join('')}</select></span>
                <span class="select-wrap col-select"><select id="colBaseTier">${LIFETIER_ORDER.map(id => `<option value="${id}"${state.baseTier === id ? ' selected' : ''}>${LIFETIERS[id].name}</option>`).join('')}</select></span>
            </div>
            <div class="col-flavor" id="colFlavor"></div>
            <div class="col-sliders">${FIELDS.map(sliderRow).join('')}</div>
            <div class="col-target-row">
                <span class="col-target-l">your target income (take-home)</span>
                <span><strong class="col-target-v" id="colNeed"></strong> <span class="col-muted">/ mo</span></span>
            </div>
        </div>

        <div class="card">
            <div class="card-label">tax profile</div>
            <div class="led-settings">
                <div class="status-pills" id="colStatus">
                    <button class="status-pill${state.status === 'single' ? ' active' : ''}" data-s="single">single</button>
                    <button class="status-pill${state.status === 'mfj' ? ' active' : ''}" data-s="mfj">married jointly</button>
                    <button class="status-pill${state.status === 'hoh' ? ' active' : ''}" data-s="hoh">head of household</button>
                </div>
                <label class="led-check" style="margin:0"><input type="checkbox" id="colSE"${state.selfEmployed ? ' checked' : ''}> self-employed (include FICA / SE tax)</label>
            </div>
        </div>

        <h2 id="colNeedHdr"></h2>
        <div class="card">
            <div class="led-head"><div class="card-label" style="margin:0">income needed</div>
                <span class="col-tier">avg cost of living for a
                    <span class="select-wrap col-select"><select id="colTier">${TIERS.map(t => `<option value="${t.id}"${state.tier === t.id ? ' selected' : ''}>${t.name}</option>`).join('')}</select></span>
                    lifestyle</span>
            </div>
            <div class="led-table-wrap">
                <table class="led-table">
                    <thead><tr>
                        <th style="width:25%">location</th><th class="r" style="width:23%">gross / year</th>
                        <th class="r" style="width:17%">gross / mo</th><th class="r" style="width:13%">eff. tax</th>
                        <th class="r" style="width:22%">avg COL / mo</th>
                    </tr></thead>
                    <tbody id="colResults"></tbody>
                </table>
            </div>
            <p class="led-note">gross income you'd need to earn (as ordinary work income) in each place to take home enough for your
            lifestyle <em>and</em> your monthly investing — greener = lower tax. the <strong>percentile</strong> is where that income ranks
            among individual earners locally, and <strong>avg COL</strong> is a typical monthly cost there — both <strong>≈ rough estimates</strong>.</p>
        </div>`;

    document.getElementById('colStatus').addEventListener('click', e => {
        const b = e.target.closest('.status-pill'); if (!b) return;
        state.status = b.dataset.s; persist();
        document.querySelectorAll('#colStatus .status-pill').forEach(p => p.classList.toggle('active', p === b));
        render();
    });
    document.getElementById('colSE').addEventListener('change', e => { state.selfEmployed = e.target.checked; persist(); render(); });
    document.getElementById('colTier').addEventListener('change', e => { state.tier = e.target.value; persist(); render(); });
    document.getElementById('colBaseCountry').addEventListener('change', e => { state.baseCountry = e.target.value; applyBaseline(panel); });
    document.getElementById('colBaseTier').addEventListener('change', e => { state.baseTier = e.target.value; applyBaseline(panel); });
    panel.addEventListener('input', e => {
        const el = e.target.closest('[data-k]'); if (!el) return;
        const k = el.dataset.k;
        const comma = el.classList.contains('num-comma');
        const raw = comma ? el.value.replace(/[^\d]/g, '') : el.value;
        state[k] = Math.max(0, +raw || 0);
        if (comma) el.value = raw ? Number(raw).toLocaleString('en-US') : '';
        // sync the paired control: range gets the raw number, comma inputs get the formatted string
        panel.querySelectorAll(`[data-k="${k}"]`).forEach(o => {
            if (o === el) return;
            o.value = o.classList.contains('num-comma') ? Number(state[k]).toLocaleString('en-US') : state[k];
        });
        persist();
        render();
    });

    render();
}
