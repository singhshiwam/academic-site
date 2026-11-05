/* Shared behaviour for every page. No dependencies. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* ---------- day / night ---------- */
  function setMode(m, remember) {
    root.setAttribute('data-mode', m);
    $$('[data-mode-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', m === 'night' ? 'true' : 'false'); });
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'night' ? '#0D1525' : '#EEF2F0');
    if (remember) { try { localStorage.setItem('ss-mode', m); } catch (e) {} }
    window.dispatchEvent(new CustomEvent('modechange', { detail: m }));
  }
  setMode(root.getAttribute('data-mode') === 'night' ? 'night' : 'day', false);
  $$('[data-mode-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(root.getAttribute('data-mode') === 'night' ? 'day' : 'night', true); });
  });

  /* ---------- header ---------- */
  var top = $('.top');
  function onScroll() { if (top) top.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  var menu = $('[data-menu]'), sheet = $('#sheet');
  if (menu && sheet) {
    menu.addEventListener('click', function () {
      var open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      sheet.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  /* ---------- clock (IST) ---------- */
  var clocks = $$('[data-clock]');
  function tick() {
    var s = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    clocks.forEach(function (c) { c.textContent = s; });
  }
  if (clocks.length) { tick(); setInterval(tick, 15000); }

  /* ---------- toast and copy ---------- */
  var toastEl;
  window.toast = function (msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove('on'); }, 1800);
  };
  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.toast('Copy failed, select the text instead'); }
      document.body.removeChild(t);
    }
  }
  window.copyText = copyText;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (!b) return;
    e.preventDefault();
    copyText(b.getAttribute('data-copy'), function () { window.toast(b.getAttribute('data-copied') || 'Copied'); });
  });

  /* ---------- citation boxes ---------- */
  $$('[data-cite-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = document.getElementById(btn.getAttribute('aria-controls'));
      var open = box.hidden;
      box.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  $$('.cite').forEach(function (box) {
    var tabs = $$('[role="tab"]', box), pre = $('pre', box);
    function show(tab) {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
      pre.textContent = $('template[data-fmt="' + tab.getAttribute('data-fmt') + '"]', box).innerHTML.trim()
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { show(t); }); });
    if (tabs[0]) show(tabs[0]);
    var c = $('.copy', box);
    if (c) c.addEventListener('click', function () { copyText(pre.textContent, function () { window.toast('Citation copied'); }); });
  });

  /* ---------- list filters ---------- */
  $$('[data-filters]').forEach(function (bar) {
    var list = document.getElementById(bar.getAttribute('data-filters'));
    var counter = document.querySelector('[data-count-for="' + list.id + '"]');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', bar).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var f = b.getAttribute('data-f'), n = 0;
      $$('[data-tags]', list).forEach(function (it) {
        var show = f === 'all' || it.getAttribute('data-tags').split(' ').indexOf(f) > -1;
        it.hidden = !show; if (show) n++;
      });
      if (counter) counter.textContent = n;
    });
  });

  /* ---------- search ---------- */
  var dlg = $('#search'), q = $('#search-q'), out = $('#search-r'), sel = 0, items = [], lastFocus;
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function render() {
    var data = window.SEARCH_INDEX || [], term = norm(q.value.trim());
    var words = term.split(/\s+/).filter(Boolean);
    items = data.map(function (e) {
      var hay = norm(e.t + ' ' + e.d + ' ' + e.k), score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], at = hay.indexOf(w);
        if (at < 0) return null;
        score += (norm(e.t).indexOf(w) > -1 ? 3 : 1) + (at === 0 ? 1 : 0);
      }
      return { e: e, s: score };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 12).map(function (x) { return x.e; });
    if (!words.length) items = data.filter(function (e) { return e.k === 'Page'; });
    sel = 0;
    out.innerHTML = items.length ? items.map(function (e, i) {
      return '<li><a href="' + e.u + '" role="option" aria-selected="' + (i === 0) + '"><span class="t"></span><span class="k"></span><span class="d"></span></a></li>';
    }).join('') : '<li class="none">Nothing matches. Try a shorter word, for example “WRF” or “EGU”.</li>';
    $$('a', out).forEach(function (a, i) {
      $('.t', a).textContent = items[i].t; $('.k', a).textContent = items[i].k; $('.d', a).textContent = items[i].d;
    });
  }
  function move(d) {
    var as = $$('a', out); if (!as.length) return;
    sel = (sel + d + as.length) % as.length;
    as.forEach(function (a, i) { a.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
    as[sel].scrollIntoView({ block: 'nearest' });
  }
  function openSearch() {
    if (!dlg) return; lastFocus = document.activeElement;
    dlg.hidden = false; q.value = ''; render(); q.focus();
  }
  function closeSearch() { if (!dlg || dlg.hidden) return; dlg.hidden = true; if (lastFocus) lastFocus.focus(); }
  $$('[data-open-search]').forEach(function (b) { b.addEventListener('click', openSearch); });
  if (dlg) {
    q.addEventListener('input', render);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeSearch(); if (e.target.closest('a')) closeSearch(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { var a = $$('a', out)[sel]; if (a) { closeSearch(); location.href = a.href; } }
    });
  }
  document.addEventListener('keydown', function (e) {
    var typing = /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg && dlg.hidden ? openSearch() : closeSearch(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape') {
      closeSearch();
      if (sheet && !sheet.hidden) menu.click();
    }
  });

  /* ---------- hero entrance (home only, once) ---------- */
  if (document.body.classList.contains('hero-load')) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.remove('hero-load'); }); });
  }
})();
