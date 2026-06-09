// Tab 3 — Tax optimization. WIP placeholder; ideas to be designed after Tabs 2 & 4.
export function initOptimize() {
    const panel = document.querySelector('.tab-panel[data-tab="optimize"]');
    if (!panel) return;
    panel.innerHTML = `
        <div class="wip-block">
            <h3>optimize</h3>
            <p>Tax optimization tools — coming after the ledger and cost-of-living tabs are done.</p>
        </div>`;
}
