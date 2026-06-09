// Tab 4 — cost of living (reverse income calc) + compound-interest backtest.
// (Built after the ledger; placeholder for Step 0.)
export function initCol() {
    const panel = document.querySelector('.tab-panel[data-tab="col"]');
    if (!panel) return;
    panel.innerHTML = `
        <div class="wip-block">
            <h3>cost of living</h3>
            <p>Set a monthly spend + savings target to see the gross income needed in each location,
            plus a historical compound-interest backtest — planned after the ledger.</p>
        </div>`;
}
