// popout/popout.js
// ytlyric: floating always-on-top lyrics window using the Document Picture-in-Picture API.
//
// How it works: the existing YouLy+ lyrics panel (#lyplus-patch-container, which holds
// #lyrics-plus-container) is MOVED into the PiP window, so the same renderer keeps driving
// the karaoke. When the PiP window closes, the panel is moved back to where it was.

(function () {
  'use strict';

  if (window.__ytlyricPopout) return;
  window.__ytlyricPopout = true;

  const PATCH_ID = 'lyplus-patch-container';
  const STORE_KEY = 'ytlyric.popout';
  const TITLE_SEL = '.title.style-scope.ytmusic-player-bar';
  const BYLINE_SEL = '.byline.style-scope.ytmusic-player-bar';

  // Localized UI text (_locales/*/messages.json), with an English fallback.
  function msg(key, fallback) {
    try {
      const pBrowser = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
      return pBrowser?.i18n?.getMessage(key) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  const state = {
    pipWin: null,
    panel: null,
    placeholder: null,
    originalParent: null,
    songInfo: null,
  };

  // ---------- persisted prefs (per-viewer convenience only) ----------
  function loadPrefs() {
    try {
      return Object.assign({ width: 420, height: 620, scale: 1 }, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
    } catch (e) {
      return { width: 420, height: 620, scale: 1 };
    }
  }
  function savePrefs(patch) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign(loadPrefs(), patch)));
    } catch (e) { /* storage blocked: ignore */ }
  }

  // ---------- song info (from songTracker, with DOM fallback) ----------
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'LYPLUS_SONG_CHANGED') {
      state.songInfo = event.data.songInfo || null;
      renderHeader();
      setTimeout(() => renderModeButtons(), 1500);
    }
  });

  function currentSong() {
    const s = state.songInfo || {};
    const title = s.title || document.querySelector(TITLE_SEL)?.textContent?.trim() || '';
    const artist = s.artist || document.querySelector(BYLINE_SEL)?.textContent?.split('•')[0]?.trim() || '';
    return { title, artist, artwork: s.artwork || '' };
  }

  // ---------- player controls ----------
  function video() { return document.querySelector('video'); }
  function clickBar(selector) {
    const btn = document.querySelector(`ytmusic-player-bar ${selector}`);
    if (btn) btn.click();
  }
  function togglePlay() {
    const v = video();
    if (!v) return clickBar('#play-pause-button');
    if (v.paused) v.play(); else v.pause();
  }

  // ---------- styles ----------
  function copyStyles(targetDoc) {
    // Copy every stylesheet of the page (YT Music variables + YouLy+ CSS) into the PiP document.
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
        const style = targetDoc.createElement('style');
        style.textContent = css;
        targetDoc.head.appendChild(style);
      } catch (e) {
        // Cross-origin sheet: clone the <link> instead.
        if (sheet.href) {
          const link = targetDoc.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          targetDoc.head.appendChild(link);
        }
      }
    }
    // Theme attributes (dark mode, etc.) live on <html>.
    for (const attr of Array.from(document.documentElement.attributes)) {
      if (attr.name !== 'style') targetDoc.documentElement.setAttribute(attr.name, attr.value);
    }
    targetDoc.documentElement.style.cssText = document.documentElement.style.cssText;

    const own = targetDoc.createElement('style');
    own.textContent = POPOUT_CSS;
    targetDoc.head.appendChild(own);
  }

  const POPOUT_CSS = `
    html, body { margin: 0; height: 100%; background: #0f0f0f; overflow: hidden; }
    body { display: flex; flex-direction: column; font-family: Roboto, 'Segoe UI', sans-serif; color: #fff; }
    #ytl-header { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
      background: rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.08); flex: none; }
    #ytl-art { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: #222; flex: none; }
    #ytl-meta { flex: 1; min-width: 0; }
    #ytl-title, #ytl-artist { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #ytl-title { font-size: 14px; font-weight: 600; }
    #ytl-artist { font-size: 12px; opacity: 0.7; }
    #ytl-controls { display: flex; gap: 2px; flex: none; }
    #ytl-controls button { background: none; border: 0; color: #fff; font-size: 15px; width: 30px; height: 30px;
      border-radius: 6px; cursor: pointer; opacity: 0.85; }
    #ytl-controls button:hover { background: rgba(255,255,255,0.12); opacity: 1; }
    #ytl-controls button[data-act="romanize"], #ytl-controls button[data-act="translate"] { width: auto; padding: 0 6px; font-size: 12px; font-weight: 700; }
    #ytl-controls button.is-on { background: rgba(255,255,255,0.22); opacity: 1; box-shadow: inset 0 -2px 0 #fff; }
    #ytl-palette { display: flex; gap: 8px; padding: 8px 10px; flex-wrap: wrap; flex: none;
      background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.08); }
    #ytl-palette[hidden] { display: none; }
    .ytl-swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25);
      cursor: pointer; padding: 0; background: #333; color: #fff; font-size: 11px; font-weight: 700; }
    .ytl-swatch.is-active { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.35); }
    #ytl-body { flex: 1; min-height: 0; position: relative; }
    #ytl-empty { padding: 24px; text-align: center; opacity: 0.7; font-size: 14px; line-height: 1.5; }
    #${PATCH_ID} { display: block !important; width: 100% !important; height: 100% !important;
      --lyrics-scroll-padding-top: 30%; scroll-padding-top: 30%; mix-blend-mode: normal !important; }
    #lyrics-plus-container { display: block !important; visibility: visible !important;
      --lyplus-font-size-base: calc(25px * var(--ytl-scale, 1)) !important; }
  `;

  // ---------- PiP UI ----------
  function buildShell(doc) {
    doc.title = 'ytlyric';
    doc.body.innerHTML = `
      <div id="ytl-header">
        <img id="ytl-art" alt="">
        <div id="ytl-meta"><div id="ytl-title"></div><div id="ytl-artist"></div></div>
        <div id="ytl-controls">
          <button data-act="prev" title="${msg('ytlPrev', 'Previous')}">⏮</button>
          <button data-act="play" title="${msg('ytlPlayPause', 'Play / pause')}">⏯</button>
          <button data-act="next" title="${msg('ytlNext', 'Next')}">⏭</button>
          <button data-act="smaller" title="${msg('ytlSmaller', 'Smaller lyrics')}">A-</button>
          <button data-act="bigger" title="${msg('ytlBigger', 'Bigger lyrics')}">A+</button>
          <button data-act="romanize" title="${msg('ytlRomanize', 'Romanization (romaji / pinyin / Latin)')}">Aa</button>
          <button data-act="translate" title="${msg('ytlTranslate', 'Translation')}">文A</button>
          <button data-act="color" title="${msg('ytlColor', 'Lyrics color')}">🎨</button>
        </div>
      </div>
      <div id="ytl-palette" hidden></div>
      <div id="ytl-body"></div>`;

    doc.getElementById('ytl-palette').addEventListener('click', (e) => {
      const sw = e.target.closest('.ytl-swatch');
      if (sw) setLyricsColor(sw.dataset.color || '');
    });

    doc.getElementById('ytl-controls').addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'romanize' || act === 'translate') {
        toggleDisplayMode(act);
        return;
      }
      if (act === 'color') {
        const box = doc.getElementById('ytl-palette');
        box.hidden = !box.hidden;
        renderPalette();
        return;
      }
      if (act === 'prev') clickBar('.previous-button');
      else if (act === 'next') clickBar('.next-button');
      else if (act === 'play') togglePlay();
      else if (act === 'smaller') setScale(loadPrefs().scale - 0.1);
      else if (act === 'bigger') setScale(loadPrefs().scale + 0.1);
    });
  }

  function setScale(value) {
    const scale = Math.min(2, Math.max(0.6, Math.round(value * 10) / 10));
    savePrefs({ scale });
    state.pipWin?.document.documentElement.style.setProperty('--ytl-scale', String(scale));
  }

  function renderHeader() {
    const doc = state.pipWin?.document;
    if (!doc) return;
    const { title, artist, artwork } = currentSong();
    doc.getElementById('ytl-title').textContent = title || 'YouTube Music';
    doc.getElementById('ytl-artist').textContent = artist;
    const art = doc.getElementById('ytl-art');
    if (artwork) art.src = artwork; else art.removeAttribute('src');
  }

  // ---------- open / close ----------
  async function openPopout() {
    if (state.pipWin) { state.pipWin.focus(); return; }
    if (!('documentPictureInPicture' in window)) {
      alert(msg('ytlUnsupported', 'ytlyric: this browser does not support floating windows (Document Picture-in-Picture). Use Edge or Chrome 116+.'));
      return;
    }

    const prefs = loadPrefs();
    const pipWin = await window.documentPictureInPicture.requestWindow({
      width: prefs.width,
      height: prefs.height,
    });
    state.pipWin = pipWin;

    copyStyles(pipWin.document);
    buildShell(pipWin.document);
    setScale(prefs.scale);
    renderHeader();
    renderModeButtons();

    const panel = document.getElementById(PATCH_ID);
    const body = pipWin.document.getElementById('ytl-body');
    if (panel) {
      state.panel = panel;
      state.originalParent = panel.parentNode;
      state.placeholder = document.createComment('ytlyric-popout-placeholder');
      panel.parentNode.insertBefore(state.placeholder, panel);
      body.appendChild(panel);
    } else {
      const empty = pipWin.document.createElement('div');
      empty.id = 'ytl-empty';
      empty.textContent = msg('ytlOpenLyricsTab', 'Open the Lyrics tab in YouTube Music once, then open the floating window again.');
      body.appendChild(empty);
    }

    // Keep the renderer running while the YT Music tab is hidden: it checks this flag,
    // and its timers / animation frames run on the (visible) PiP window instead of the hidden tab.
    window.__lyplusPopoutActive = true;
    window.__ytlyricTimerHost?.attach(pipWin);
    resyncRenderer();

    // Let the renderer re-measure for the new size.
    pipWin.addEventListener('resize', () => window.dispatchEvent(new Event('resize')));
    window.dispatchEvent(new Event('resize'));

    pipWin.addEventListener('pagehide', closeCleanup, { once: true });
  }

  function closeCleanup() {
    const pipWin = state.pipWin;
    if (pipWin) savePrefs({ width: pipWin.innerWidth, height: pipWin.innerHeight });

    window.__lyplusPopoutActive = false;
    window.__ytlyricTimerHost?.detach();

    if (state.panel) {
      // YouLy+ may have created a fresh empty wrapper while ours was away: drop it.
      const dup = document.getElementById(PATCH_ID);
      if (dup && dup !== state.panel) dup.remove();

      if (state.placeholder?.isConnected) {
        state.placeholder.parentNode.insertBefore(state.panel, state.placeholder);
      } else if (state.originalParent?.isConnected) {
        state.originalParent.appendChild(state.panel);
      } else {
        document.querySelector('#tab-renderer')?.appendChild(state.panel);
      }
    }
    state.placeholder?.remove();
    Object.assign(state, { pipWin: null, panel: null, placeholder: null, originalParent: null });
    window.dispatchEvent(new Event('resize'));
    resyncRenderer();
  }

  // The renderer instance lives in ytmusic/index.js (shared content-script scope).
  function renderer() {
    try { return typeof lyricsRendererInstance !== 'undefined' ? lyricsRendererInstance : null; } catch (e) { return null; }
  }

  function resyncRenderer() {
    const r = renderer();
    try { r?._runScheduledSync?.(true); } catch (e) { /* no lyrics loaded yet */ }
  }

  // ---------- romanization / translation toggles ----------
  // YouLy+ keeps these in lyricsManager.js: `currentDisplayMode` ('none'|'translate'|'romanize'|'both')
  // and `setCurrentDisplayModeAndRender(mode)`. Its own toggle button stays in the YT Music page,
  // so the popout needs its own.
  function getDisplayMode() {
    try { return typeof currentDisplayMode !== 'undefined' ? currentDisplayMode : 'none'; } catch (e) { return 'none'; }
  }

  function toggleDisplayMode(which) {
    const mode = getDisplayMode();
    let rom = mode === 'romanize' || mode === 'both';
    let tr = mode === 'translate' || mode === 'both';
    if (which === 'romanize') rom = !rom; else tr = !tr;
    const next = rom && tr ? 'both' : rom ? 'romanize' : tr ? 'translate' : 'none';

    // Remember for next songs / next session (same settings YouLy+ uses).
    const pBrowser = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    try { pBrowser?.storage?.local?.set({ romanizationEnabled: rom, translationEnabled: tr }); } catch (e) { /* ignore */ }

    if (typeof setCurrentDisplayModeAndRender === 'function') {
      setCurrentDisplayModeAndRender(next);
    } else {
      console.warn('ytlyric: setCurrentDisplayModeAndRender is not available');
    }
    renderModeButtons(next);
  }

  function renderModeButtons(mode = getDisplayMode()) {
    const doc = state.pipWin?.document;
    if (!doc) return;
    const rom = mode === 'romanize' || mode === 'both';
    const tr = mode === 'translate' || mode === 'both';
    doc.querySelector('[data-act="romanize"]')?.classList.toggle('is-on', rom);
    doc.querySelector('[data-act="translate"]')?.classList.toggle('is-on', tr);
  }

  // ---------- lyrics color ----------
  // '' = automatic (song colors / YouLy+ default).
  const COLORS = [
    ['', 'ytlColorAuto', 'Automatic'],
    ['#FF0033', 'ytlColorRed', 'YouTube red'],
    ['#10B981', 'ytlColorEmerald', 'Emerald green'],
    ['#00E5FF', 'ytlColorCyan', 'Neon cyan'],
    ['#FFD700', 'ytlColorGold', 'Gold'],
    ['#B026FF', 'ytlColorPurple', 'Neon purple'],
    ['#FF6B00', 'ytlColorOrange', 'Fire orange'],
    ['#FFFFFF', 'ytlColorWhite', 'White'],
  ];

  function currentColor() {
    try { return (typeof currentSettings !== 'undefined' && currentSettings.overridePaletteColor) || ''; } catch (e) { return ''; }
  }

  function setLyricsColor(hex) {
    // Persist in YouLy+'s own setting so the panel in YT Music and future songs use it too.
    const pBrowser = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    try { pBrowser?.storage?.local?.set({ overridePaletteColor: hex }); } catch (e) { /* ignore */ }
    try { if (typeof currentSettings !== 'undefined') currentSettings.overridePaletteColor = hex; } catch (e) { /* ignore */ }

    // Apply right away to the current lyrics.
    const r = renderer();
    const container = document.getElementById('lyrics-plus-container')
      || state.pipWin?.document.getElementById('lyrics-plus-container');
    if (r && container && typeof r._applyPaletteSettings === 'function') {
      try {
        r._applyPaletteSettings(container, Object.assign({}, typeof currentSettings !== 'undefined' ? currentSettings : {}, { overridePaletteColor: hex }));
        if (!hex) container.style.removeProperty('--lyplus-override-pallete');
      } catch (e) { console.warn('ytlyric: could not apply the color', e); }
    }
    renderPalette();
  }

  function renderPalette() {
    const doc = state.pipWin?.document;
    const box = doc?.getElementById('ytl-palette');
    if (!box) return;
    const active = currentColor().toUpperCase();
    box.innerHTML = '';
    for (const [hex, key, fallback] of COLORS) {
      const b = doc.createElement('button');
      b.className = 'ytl-swatch' + (hex.toUpperCase() === active ? ' is-active' : '');
      b.title = msg(key, fallback);
      b.dataset.color = hex;
      if (hex) b.style.background = hex;
      else b.textContent = 'A';
      box.appendChild(b);
    }
  }

  function togglePopout() {
    if (state.pipWin) state.pipWin.close();
    else openPopout().catch((err) => console.error('ytlyric: could not open the floating window', err));
  }

  // ---------- entry points: player-bar button + Alt+L ----------
  function injectButton() {
    if (document.getElementById('ytlyric-popout-btn')) return;
    const host = document.querySelector('ytmusic-player-bar .right-controls-buttons')
      || document.querySelector('ytmusic-player-bar #right-controls');
    if (!host) return;
    const btn = document.createElement('button');
    btn.id = 'ytlyric-popout-btn';
    btn.title = msg('ytlPopoutButton', 'Lyrics in a floating window (Alt+L)');
    btn.textContent = '⧉';
    btn.style.cssText = 'background:none;border:0;color:var(--yt-spec-text-primary,#fff);font-size:20px;'
      + 'width:40px;height:40px;border-radius:50%;cursor:pointer;opacity:.8;';
    btn.addEventListener('click', (e) => { e.stopPropagation(); togglePopout(); });
    host.prepend(btn);
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      togglePopout();
    }
  }, true);

  // YT Music re-renders its player bar; re-add the button if it disappears (debounced).
  let injectTimer = null;
  new MutationObserver(() => {
    if (injectTimer || document.getElementById('ytlyric-popout-btn')) return;
    injectTimer = setTimeout(() => { injectTimer = null; injectButton(); }, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });
  injectButton();

  window.ytlyricPopout = { open: openPopout, toggle: togglePopout };
})();
