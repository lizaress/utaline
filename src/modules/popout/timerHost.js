// popout/timerHost.js
// ytlyric: lets the extension's timers keep running at full speed while the YT Music tab is
// hidden (other tab selected or Edge minimized) but the popout window is visible.
//
// Browsers throttle setTimeout / requestAnimationFrame of hidden tabs. While the popout is
// open, this shim schedules them on the (visible) popout window instead. It only affects the
// extension's own content scripts (isolated world), not YouTube Music's page code.
// Must be loaded BEFORE the other content scripts.

(function () {
  'use strict';

  if (window.__ytlyricTimerHost) return;

  const native = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };

  let pip = null;
  // Start far above native ids so ours never collide with timers created before this shim.
  let seq = 1e9;
  const entries = new Map(); // id -> { kind, fn, args, due, real, onPip, gen }

  function usePip() {
    return !!(pip && !pip.closed);
  }

  function schedule(entry) {
    const gen = ++entry.gen;
    entry.onPip = usePip();
    if (entry.kind === 'timeout') {
      const fire = () => {
        if (entries.get(entry.id) !== entry || entry.gen !== gen) return;
        entries.delete(entry.id);
        entry.fn(...entry.args);
      };
      const delay = Math.max(0, entry.due - performance.now());
      entry.real = entry.onPip ? pip.setTimeout(fire, delay) : native.setTimeout(fire, delay);
    } else {
      const fire = (ts) => {
        if (entries.get(entry.id) !== entry || entry.gen !== gen) return;
        entries.delete(entry.id);
        entry.fn(ts);
      };
      entry.real = entry.onPip ? pip.requestAnimationFrame(fire) : native.requestAnimationFrame(fire);
    }
  }

  function cancelReal(entry) {
    try {
      if (entry.kind === 'timeout') {
        if (entry.onPip) { if (usePip()) pip.clearTimeout(entry.real); } else native.clearTimeout(entry.real);
      } else if (entry.onPip) {
        if (usePip()) pip.cancelAnimationFrame(entry.real);
      } else {
        native.cancelAnimationFrame(entry.real);
      }
    } catch (e) { /* window already gone */ }
  }

  window.setTimeout = function (fn, delay, ...args) {
    if (typeof fn !== 'function') return native.setTimeout(fn, delay, ...args);
    const entry = { id: ++seq, kind: 'timeout', fn, args, due: performance.now() + (Number(delay) || 0), gen: 0 };
    entries.set(entry.id, entry);
    schedule(entry);
    return entry.id;
  };

  window.clearTimeout = function (id) {
    const entry = entries.get(id);
    if (!entry) return native.clearTimeout(id);
    entries.delete(id);
    cancelReal(entry);
  };

  window.requestAnimationFrame = function (fn) {
    const entry = { id: ++seq, kind: 'raf', fn, args: [], due: 0, gen: 0 };
    entries.set(entry.id, entry);
    schedule(entry);
    return entry.id;
  };

  window.cancelAnimationFrame = function (id) {
    const entry = entries.get(id);
    if (!entry) return native.cancelAnimationFrame(id);
    entries.delete(id);
    cancelReal(entry);
  };

  // Move every pending timer to the current host (popout window or the tab).
  function migrate() {
    for (const entry of entries.values()) {
      if (entry.onPip === usePip()) continue;
      cancelReal(entry);
      schedule(entry);
    }
  }

  window.__ytlyricTimerHost = {
    attach(win) {
      pip = win;
      migrate();
    },
    detach() {
      // Popout is closing: its timers die with it, so reschedule them on the tab.
      pip = null;
      for (const entry of entries.values()) {
        if (entry.onPip) schedule(entry);
      }
    },
  };
})();
