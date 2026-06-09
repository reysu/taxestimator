// Hash-based tab router. Tabs: #estimator (default) #ledger #optimize #col
const TABS = ['estimator', 'ledger', 'optimize', 'col'];
const DEFAULT_TAB = 'estimator';

function tabFromHash() {
    const h = (location.hash || '').replace('#', '');
    return TABS.includes(h) ? h : DEFAULT_TAB;
}

export function showTab(name) {
    const tab = TABS.includes(name) ? name : DEFAULT_TAB;
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (location.hash.replace('#', '') !== tab) {
        // preserve query string (estimator share links) when changing hash
        history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    }
    // Let tab modules react (e.g. Chart.js needs a resize when its panel becomes visible)
    document.dispatchEvent(new CustomEvent('tab:shown', { detail: { tab } }));
}

export function initRouter() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    window.addEventListener('hashchange', () => showTab(tabFromHash()));
    showTab(tabFromHash());
}
