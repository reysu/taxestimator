// Entry point — wires up the router and every tab module.

// Visible error box — surfaces any uncaught error/rejection so we can diagnose without the console.
const BUILD = 'skins-2026-06-11a';
console.log('taxestimator build', BUILD);
function showFatal(msg) {
    let el = document.getElementById('__fatal');
    if (!el) {
        el = document.createElement('div');
        el.id = '__fatal';
        el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;z-index:99999;background:#7a1f1f;color:#fff;font:12px/1.4 monospace;padding:10px;white-space:pre-wrap';
        document.body.appendChild(el);
    }
    el.textContent += msg + '\n\n';
}
window.addEventListener('error', e => showFatal(`[${BUILD}] ERROR: ${e.message}\n  at ${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}\n${(e.error && e.error.stack) || ''}`));
window.addEventListener('unhandledrejection', e => showFatal(`[${BUILD}] PROMISE REJECTION: ${(e.reason && e.reason.stack) || e.reason}`));

import { initRouter } from './router.js';
import { initSkins } from './skins.js';
import './tab-estimator.js'; // self-initializing (runs the original estimator on import)
import { initLedger } from './tab-ledger.js';
import { initCalculate } from './tab-calculate.js';
import { initCol } from './tab-col.js';

initLedger();
initCalculate();
initCol();
initRouter();
initSkins();
