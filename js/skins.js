// Skin system — drastically different looks built around the same app.
//   hacker (default): the original terminal look. Zero overhead, nothing injected.
//   aqua:   Mac OS X (2007) — menu bar, Aqua window + traffic lights, Dock with
//           magnification & bounce, gel buttons, synthesized UI sounds.
// Switching skins reloads the page so each skin bootstraps a clean DOM.
import { showTab } from './router.js';

export const SKINS = [
    { id: 'hacker', name: 'hacker' },
    { id: 'aqua', name: 'aqua 2007' },
];
export const currentSkin = () => localStorage.getItem('skin') || 'hacker';
export function setSkin(id) {
    localStorage.setItem('skin', id);
    // strip any ?skin= override so it can't force the old skin back on reload
    const url = new URL(location.href);
    url.searchParams.delete('skin');
    if (url.href !== location.href) location.assign(url.href);
    else location.reload();
}

const TAB_NAMES = { estimator: 'estimator', ledger: 'ledger', calculate: 'calculate', col: 'cost of living' };
const TAB_ICONS = { estimator: '🧾', ledger: '📒', calculate: '📈', col: '🌍' };

// ==================== SOUNDS (WebAudio — no asset files) ====================
let actx = null;
const muted = () => localStorage.getItem('aquaMute') === '1';
function ac() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
}
function tone(freq, dur, { type = 'sine', vol = 0.08, to = null, delay = 0 } = {}) {
    if (muted()) return;
    try {
        const c = ac(), t = c.currentTime + delay;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + dur + 0.02);
    } catch {}
}
const sndClick = () => tone(1400, 0.035, { type: 'sine', vol: 0.05 });
const sndBounce = () => tone(190, 0.08, { type: 'triangle', vol: 0.07 });
function sndChime() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.9, { vol: 0.05, delay: i * 0.04 })); }

// ==================== AQUA BOOTSTRAP ====================
function buildAqua() {
    document.body.classList.add('aqua-boot');

    // ---- desktop wallpaper ----
    const desk = el('div', 'aqua-desktop');
    document.body.prepend(desk);

    // ---- window: move the whole app inside ----
    const win = el('div', 'aqua-window');
    win.innerHTML = `
        <div class="aqua-titlebar" id="aqTitlebar">
            <div class="aqua-lights">
                <button class="aq-light aq-red" id="aqRed" title="quit"><span>×</span></button>
                <button class="aq-light aq-yellow" id="aqYellow" title="minimize"><span>−</span></button>
                <button class="aq-light aq-green" id="aqGreen" title="zoom"><span>+</span></button>
            </div>
            <div class="aqua-title" id="aqTitle">tax estimator</div>
        </div>
        <div class="aqua-content" id="aqContent"></div>`;
    const content = win.querySelector('#aqContent');
    // move everything that was in <body> (the whole app) into the window
    [...document.body.children].forEach(n => {
        if (n === desk || n === win || n.tagName === 'SCRIPT') return;
        content.appendChild(n);
    });
    document.body.appendChild(win);

    // ---- menu bar ----
    const bar = el('div', 'aqua-menubar');
    bar.innerHTML = `
        <div class="aq-menus">
            <div class="aq-menu aq-apple" data-menu="apple"><span class="aq-apple-logo">🍎</span></div>
            <div class="aq-menu aq-appname" data-menu="app">Tax Estimator</div>
            <div class="aq-menu" data-menu="view">View</div>
            <div class="aq-menu" data-menu="lang">Language</div>
        </div>
        <div class="aq-status">
            <span class="aq-menu" id="aqSound" title="UI sounds">${muted() ? '🔇' : '🔊'}</span>
            <span class="aq-clock" id="aqClock"></span>
        </div>`;
    document.body.appendChild(bar);

    // ---- dock ----
    const dock = el('div', 'aqua-dock-wrap');
    dock.innerHTML = `<div class="aqua-dock" id="aqDock">${
        Object.keys(TAB_NAMES).map(tab =>
            `<button class="aq-dock-icon" data-tab="${tab}" title="${TAB_NAMES[tab]}"><span class="aq-icon-art">${TAB_ICONS[tab]}</span><span class="aq-dock-label">${TAB_NAMES[tab]}</span></button>`
        ).join('')}</div>`;
    document.body.appendChild(dock);

    wireWindow(win);
    wireMenus(bar);
    wireDock(win);
    wireClock();
    wireGelSounds(content);

    // opening animation
    requestAnimationFrame(() => win.classList.add('aqua-open'));

    // keep titlebar + dock in sync with the router
    document.addEventListener('tab:shown', e => {
        document.getElementById('aqTitle').textContent = `tax estimator — ${TAB_NAMES[e.detail.tab] || e.detail.tab}`;
        document.querySelectorAll('.aq-dock-icon').forEach(i =>
            i.classList.toggle('active', i.dataset.tab === e.detail.tab));
    });
    const initial = (location.hash || '#estimator').replace('#', '');
    document.getElementById('aqTitle').textContent = `tax estimator — ${TAB_NAMES[initial] || 'estimator'}`;
    document.querySelectorAll('.aq-dock-icon').forEach(i => i.classList.toggle('active', i.dataset.tab === initial));
}

// ---- window controls ----
function wireWindow(win) {
    const restore = () => {
        win.classList.remove('aqua-min');
        win.classList.add('aqua-restoring');
        setTimeout(() => win.classList.remove('aqua-restoring'), 450);
    };
    document.getElementById('aqYellow').addEventListener('click', () => {
        win.classList.add('aqua-min');
        hint('window minimized — click an icon in the Dock to bring it back');
    });
    document.getElementById('aqGreen').addEventListener('click', () => {
        win.classList.toggle('aqua-zoomed');
    });
    document.getElementById('aqRed').addEventListener('click', () => {
        sndClick();
        dialog('Are you sure you want to quit doing your taxes?',
            'Your data is saved locally. The IRS, however, remembers everything.',
            [
                { label: 'Quit', primary: false, fn: () => { win.classList.add('aqua-min'); hint('💀 you can run, but April always comes. click the Dock to resume.'); } },
                { label: 'Keep Grinding', primary: true, fn: () => {} },
            ]);
    });
    win._restore = restore;
}

// ---- menu bar ----
const MENU_ITEMS = {
    apple: [
        { label: 'About This Tax Estimator…', fn: () => { sndChime(); dialog('Tax Estimator', 'Mac OS X flavored · 2026 tax data<br>Engine: 28/28 checks passing<br><br>tax.reysu.io', [{ label: 'OK', primary: true, fn: () => {} }]); } },
        { sep: true },
        { label: 'Theme', sub: SKINS.map(s => ({ label: s.name + (currentSkin() === s.id ? '  ✓' : ''), fn: () => setSkin(s.id) })) },
        { label: () => (muted() ? 'Turn Sounds On' : 'Turn Sounds Off'), fn: toggleMute },
        { sep: true },
        { label: 'Restart Tax Estimator', fn: () => location.reload() },
    ],
    app: [
        { label: 'About This Tax Estimator…', fn: () => document.querySelector('.aq-apple').click() },
        { sep: true },
        { label: 'Hide (minimize)', fn: () => document.getElementById('aqYellow').click() },
    ],
    view: Object.keys(TAB_NAMES).map(tab => ({ label: TAB_NAMES[tab], fn: () => { sndClick(); showTab(tab); } })),
    lang: [
        { label: 'English', fn: () => proxyLang('en') },
        { label: '中文', fn: () => proxyLang('zh') },
        { label: '日本語', fn: () => proxyLang('ja') },
    ],
};
function proxyLang(lang) {
    const pill = document.querySelector(`.lang-pill[data-lang="${lang}"]`);
    if (pill) { sndClick(); pill.click(); }
}
function toggleMute() {
    localStorage.setItem('aquaMute', muted() ? '0' : '1');
    document.getElementById('aqSound').textContent = muted() ? '🔇' : '🔊';
    if (!muted()) sndClick();
}
function wireMenus(bar) {
    let open = null;
    const closeAll = () => {
        bar.querySelectorAll('.aq-dropdown').forEach(d => d.remove());
        bar.querySelectorAll('.aq-menu.open').forEach(m => m.classList.remove('open'));
        open = null;
    };
    const openMenu = menuEl => {
        closeAll();
        const items = MENU_ITEMS[menuEl.dataset.menu];
        if (!items) return;
        const dd = el('div', 'aq-dropdown');
        items.forEach(item => {
            if (item.sep) { dd.appendChild(el('div', 'aq-sep')); return; }
            const row = el('div', 'aq-item');
            row.textContent = typeof item.label === 'function' ? item.label() : item.label;
            if (item.sub) {
                row.classList.add('has-sub');
                const sub = el('div', 'aq-subdropdown');
                item.sub.forEach(si => {
                    const sr = el('div', 'aq-item');
                    sr.textContent = si.label;
                    sr.addEventListener('click', e => { e.stopPropagation(); closeAll(); si.fn(); });
                    sub.appendChild(sr);
                });
                row.appendChild(sub);
            } else {
                row.addEventListener('click', () => { closeAll(); item.fn(); });
            }
            dd.appendChild(row);
        });
        menuEl.classList.add('open');
        menuEl.appendChild(dd);
        open = menuEl;
    };
    bar.querySelectorAll('.aq-menu[data-menu]').forEach(m => {
        m.addEventListener('click', e => {
            e.stopPropagation();
            sndClick();
            open === m ? closeAll() : openMenu(m);
        });
        m.addEventListener('mouseenter', () => { if (open && open !== m) openMenu(m); });
    });
    document.getElementById('aqSound').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });
    document.addEventListener('click', closeAll);
}

// ---- dock: magnification + bounce + launch ----
function wireDock(win) {
    const dock = document.getElementById('aqDock');
    const icons = [...dock.querySelectorAll('.aq-dock-icon')];
    dock.addEventListener('mousemove', e => {
        for (const icon of icons) {
            const r = icon.getBoundingClientRect();
            const d = Math.abs(e.clientX - (r.left + r.width / 2));
            const scale = 1 + 0.55 * Math.exp(-(d * d) / (2 * 80 * 80));
            icon.style.transform = `scale(${scale.toFixed(3)})`;
        }
    });
    dock.addEventListener('mouseleave', () => icons.forEach(i => (i.style.transform = '')));
    icons.forEach(icon => {
        icon.addEventListener('click', () => {
            sndBounce();
            icon.classList.remove('bouncing');
            void icon.offsetWidth; // restart animation
            icon.classList.add('bouncing');
            if (win.classList.contains('aqua-min')) win._restore();
            showTab(icon.dataset.tab);
            hideHint();
        });
    });
}

// ---- desktop hint + dialogs ----
let hintEl = null;
function hint(text) {
    hideHint();
    hintEl = el('div', 'aqua-hint');
    hintEl.textContent = text;
    document.body.appendChild(hintEl);
}
function hideHint() { if (hintEl) { hintEl.remove(); hintEl = null; } }

function dialog(title, bodyHTML, buttons) {
    const overlay = el('div', 'aqua-dialog-overlay');
    const d = el('div', 'aqua-dialog');
    d.innerHTML = `<div class="aq-dialog-icon">🧾</div>
        <div class="aq-dialog-text"><strong>${title}</strong><p>${bodyHTML}</p></div>
        <div class="aq-dialog-btns"></div>`;
    const btns = d.querySelector('.aq-dialog-btns');
    buttons.forEach(b => {
        const btn = el('button', 'aq-gel' + (b.primary ? ' aq-gel-blue' : ''));
        btn.textContent = b.label;
        btn.addEventListener('click', () => { sndClick(); overlay.remove(); b.fn(); });
        btns.appendChild(btn);
    });
    overlay.appendChild(d);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
}

// ---- clock ----
function wireClock() {
    const elc = document.getElementById('aqClock');
    const tick = () => {
        elc.textContent = new Date().toLocaleString('en-US',
            { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 15000);
}

// ---- subtle click sounds on the app's own controls ----
function wireGelSounds(content) {
    content.addEventListener('click', e => {
        if (e.target.closest('button, .status-pill, .lang-pill, .map-region, select, input[type="checkbox"]')) sndClick();
    });
}

function el(tag, cls) { const n = document.createElement(tag); n.className = cls; return n; }

// ==================== INIT ====================
export function initSkins() {
    document.documentElement.dataset.skin = currentSkin();
    // hacker-skin theme selector (lives in the header; aqua uses the  menu instead)
    const sel = document.getElementById('skinSelect');
    if (sel) {
        sel.value = currentSkin();
        sel.addEventListener('change', () => setSkin(sel.value));
    }
    if (currentSkin() === 'aqua') buildAqua();
}
