/* Shared behaviour for every page. No dependencies. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* =========================================================
     Day / night
     source 'user'  : the header switch, remembered for this visit, circular reveal
     source 'scene' : the home-page day cycle, smooth cross-fade, not remembered
     source 'clock' : sunrise or sunset passing on other pages, cross-fade
     ========================================================= */
  function apply(m) {
    root.setAttribute('data-mode', m);
    $$('[data-mode-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', m === 'night' ? 'true' : 'false'); });
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'night' ? '#0D1525' : '#EEF2F0');
  }
  function setMode(m, remember, source, origin) {
    if (m === root.getAttribute('data-mode')) { if (remember) store(m); return; }
    if (remember) store(m);
    var fire = function () { window.dispatchEvent(new CustomEvent('modechange', { detail: { mode: m, source: source || 'user' } })); };
    if (source === 'user' && document.startViewTransition && !reduce) {
      root.classList.add('vt-theme');
      var x = origin ? origin.x : innerWidth - 80, y = origin ? origin.y : 32;
      var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var vt = document.startViewTransition(function () { apply(m); });
      vt.ready.then(function () {
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
      vt.finished.finally(function () { root.classList.remove('vt-theme'); });
    } else {
      root.classList.add('theming');
      apply(m);
      clearTimeout(setMode._t); setMode._t = setTimeout(function () { root.classList.remove('theming'); }, 950);
    }
    fire();
  }
  /* A flip of the switch holds for this visit only; the next visit follows the clock again. */
  function store(m) { try { sessionStorage.setItem('ss-mode', m); } catch (e) {} }
  function chosen() { try { return sessionStorage.getItem('ss-mode'); } catch (e) { return null; } }
  window.siteSetMode = setMode;
  apply(root.getAttribute('data-mode') === 'night' ? 'night' : 'day');
  /* Pages left open change over at sunrise and sunset by themselves. The home page
     does this through its day-cycle scene instead. */
  if (window.siteSun && !document.getElementById('scene')) {
    setInterval(function () {
      if (chosen()) return;
      var m = window.siteSun.mode();
      if (m !== root.getAttribute('data-mode')) setMode(m, false, 'clock');
    }, 60000);
  }
  $$('[data-mode-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = b.getBoundingClientRect();
      setMode(root.getAttribute('data-mode') === 'night' ? 'day' : 'night', true, 'user', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
  });

  /* =========================================================
     Header: shadow line, scroll progress, mobile menu
     ========================================================= */
  var top = $('.top'), ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (top) {
        top.classList.toggle('scrolled', window.scrollY > 8);
        var max = document.documentElement.scrollHeight - innerHeight;
        top.style.setProperty('--sp', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
      }
      altUpdate();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var menu = $('[data-menu]'), sheet = $('#sheet');
  if (menu && sheet) {
    menu.addEventListener('click', function () {
      var open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      sheet.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) $$('a', sheet).forEach(function (a, i) {
        a.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
          { duration: reduce ? 1 : 520, delay: reduce ? 0 : i * 40, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      });
    });
  }

  /* =========================================================
     Clock (IST)
     ========================================================= */
  var clocks = $$('[data-clock]');
  function tick() {
    var s = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    clocks.forEach(function (c) { c.textContent = s; });
  }
  if (clocks.length) { tick(); setInterval(tick, 15000); }

  /* =========================================================
     Toast and copy
     ========================================================= */
  var toastEl;
  window.toast = function (msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove('on'); }, 1800);
  };
  function copyText(text, done) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.toast('Copy failed, select the text instead'); }
      document.body.removeChild(t);
    }
  }
  window.copyText = copyText;
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    e.preventDefault();
    copyText(b.getAttribute('data-copy'), function () { window.toast(b.getAttribute('data-copied') || 'Copied'); });
  });

  /* =========================================================
     Citation boxes
     ========================================================= */
  $$('[data-cite-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = document.getElementById(btn.getAttribute('aria-controls')), open = box.hidden;
      box.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !reduce) box.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
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

  /* =========================================================
     List filters, with a smooth re-flow
     ========================================================= */
  $$('[data-filters]').forEach(function (bar) {
    var list = document.getElementById(bar.getAttribute('data-filters'));
    var counter = document.querySelector('[data-count-for="' + list.id + '"]');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', bar).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var f = b.getAttribute('data-f'), n = 0, shown = [];
      $$('[data-tags]', list).forEach(function (it) {
        var show = f === 'all' || it.getAttribute('data-tags').split(' ').indexOf(f) > -1;
        if (show && it.hidden) shown.push(it);
        it.hidden = !show; if (show) n++;
      });
      if (counter) counter.textContent = n;
      if (!reduce) shown.forEach(function (it, i) {
        it.classList.add('in');
        it.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: i * 50, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      });
    });
  });

  /* =========================================================
     Headings that assemble letter by letter
     ========================================================= */
  function split(el) {
    if (el.getAttribute('data-split-done')) return;
    el.setAttribute('data-split-done', '1');
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.trim());
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (word) {
            if (!word) return;
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            word.split('').forEach(function (ch) {
              var s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = ch; w.appendChild(s);
            });
            frag.appendChild(w);
          });
          c.parentNode.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(el);
  }
  $$('[data-split], .ph h1').forEach(split);
  function ready() {
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      root.classList.add('hero-ready', 'ph-ready'); document.body.classList.remove('hero-load');
      var lines = $('.ph-lines'); if (lines) lines.classList.add('on');
    }); });
  }
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 700); })]).then(ready);
  else ready();

  /* =========================================================
     Page headers: slow drifting isentropes behind the title
     ========================================================= */
  $$('.ph').forEach(function (ph) {
    var page = document.body.className.replace(/.*page-(\w+).*/, '$1'), seed = 0;
    for (var c = 0; c < page.length; c++) seed = (seed * 31 + page.charCodeAt(c)) % 9973;
    var box = document.createElement('div'); box.className = 'ph-lines'; box.setAttribute('aria-hidden', 'true');
    var P = 400, Wd = 3200, Hh = 400, paths = '';
    for (var L = 0; L < 9; L++) {
      var base = 60 + L * 38, a1 = 6 + ((seed + L * 7) % 11), a2 = 2 + ((seed + L * 3) % 5), ph1 = (seed % 7) + L * .8, d = '';
      for (var x = 0; x <= Wd; x += 16) {
        var y = base + a1 * Math.sin(2 * Math.PI * x / P + ph1) + a2 * Math.sin(2 * Math.PI * 2 * x / P + L);
        d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
      }
      paths += '<path d="' + d + '"/>';
    }
    box.innerHTML = '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" preserveAspectRatio="none">' + paths + '</svg>';
    ph.insertBefore(box, ph.firstChild);
  });

  /* =========================================================
     Reveal on scroll
     ========================================================= */
  var REVEAL = [
    ['.sec-h, .statement, .statement-b, .prose, .thesis, .figs, .places, .filters, .lab, .chain, .empty, .reach, .form, .facts, .skills > div, .refs, .travel', 'rv'],
    ['.log li, .pub, .talk, .qs li, .award, .thread, .reach li', 'rv'],
    ['.portrait, .map', 'rv-s']
  ];
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
      if (e.target.hasAttribute('data-count') || e.target.querySelector('[data-count]')) count(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 }) : null;
  REVEAL.forEach(function (r) {
    $$(r[0]).forEach(function (el) {
      if (el.closest('.hero')) return;
      el.classList.add(r[1]);
      var sib = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty('--d', Math.min(sib, 6));
      if (io) io.observe(el); else el.classList.add('in');
    });
  });

  $$('.chain li').forEach(function (li, i) { li.style.setProperty('--n', i); });

  /* numbers count up once */
  function count(scope) {
    $$('[data-count]', scope).concat(scope.hasAttribute('data-count') ? [scope] : []).forEach(function (el) {
      if (el._counted) return; el._counted = true;
      var to = +el.getAttribute('data-count'); if (reduce) { el.textContent = to; return; }
      var t0 = performance.now(), dur = 1400 + to * 40;
      (function f(now) {
        var k = Math.min(1, (now - t0) / dur), v = 1 - Math.pow(1 - k, 4);
        el.textContent = Math.round(to * v);
        if (k < 1) requestAnimationFrame(f);
      })(t0);
    });
  }
  if (io) $$('.figs [data-count]').forEach(function (el) { el.textContent = '0'; });

  /* diagrams on the home page draw themselves; the turbulence trace scrolls */
  $$('.thread svg path, .thread svg rect').forEach(function (p, i) {
    if (p.closest('[data-trace]')) return;
    var fillOnly = p.getAttribute('fill') && p.getAttribute('fill') !== 'none' && !p.getAttribute('stroke');
    if (fillOnly) { p.classList.add('fi'); return; }
    try { var len = Math.ceil(p.getTotalLength()); p.style.setProperty('--len', len); p.style.setProperty('--k', i % 4); p.classList.add('dr'); } catch (e) {}
  });
  $$('[data-trace]').forEach(function (g) {
    var a = g.getAttribute('data-trace').split(' ').map(Number), x0 = a[0], y0 = a[1], w = a[2], amp = a[3];
    var period = w, d = '', s = 3;
    for (var x = 0; x <= period * 2; x += 2.5) {
      var t = x / period * 2 * Math.PI;
      var y = Math.sin(t * 3 + 1) * .35 + Math.sin(t * 7 + 2) * .3 + Math.sin(t * 13) * .22 + Math.sin(t * 23 + s) * .18 + Math.sin(t * 31 + 4) * .12;
      d += (x ? 'L' : 'M') + (x0 + x).toFixed(1) + ' ' + (y0 + y * amp).toFixed(1);
    }
    var NS = 'http://www.w3.org/2000/svg';
    var clip = document.createElementNS(NS, 'clipPath'), id = 'tc' + Math.random().toString(36).slice(2, 7);
    clip.setAttribute('id', id);
    var rc = document.createElementNS(NS, 'rect'); rc.setAttribute('x', x0); rc.setAttribute('y', y0 - amp - 4); rc.setAttribute('width', w); rc.setAttribute('height', 2 * amp + 8);
    clip.appendChild(rc); g.appendChild(clip); g.setAttribute('clip-path', 'url(#' + id + ')');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.3'); p.setAttribute('stroke-linejoin', 'round');
    if (!reduce) { p.classList.add('trace-move'); p.style.setProperty('--period', -period + 'px'); }
    g.appendChild(p);
  });

  /* =========================================================
     Altimeter: the page as a column of air
     ========================================================= */
  var alt = null, altLinks = [], mk = null;
  (function () {
    var secs = $$('main section[id]').filter(function (s) { return s.querySelector('h2') || s.classList.contains('hero'); });
    if (secs.length < 3) return;
    alt = document.createElement('nav'); alt.className = 'alt'; alt.setAttribute('aria-label', 'Sections on this page');
    alt.innerHTML = '<span class="zl t">top</span><span class="zl b">ground</span>';
    secs.forEach(function (s) {
      var h = s.querySelector('h2'), a = document.createElement('a');
      a.href = '#' + s.id; a._sec = s;
      a.innerHTML = '<span></span>'; a.firstChild.textContent = h ? h.textContent.trim() : 'Top';
      alt.appendChild(a); altLinks.push(a);
    });
    mk = document.createElement('span'); mk.className = 'mk'; alt.appendChild(mk);
    document.body.appendChild(alt);
    window.addEventListener('resize', altLayout); altLayout();
  })();
  function altLayout() {
    if (!alt) return;
    var max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    altLinks.forEach(function (a) { a._y = Math.min(1, a._sec.offsetTop / max); a.style.top = (100 - a._y * 100) + '%'; });
    altUpdate();
  }
  function altUpdate() {
    if (!alt) return;
    var max = Math.max(1, document.documentElement.scrollHeight - innerHeight), k = Math.min(1, scrollY / max);
    mk.style.top = (100 - k * 100) + '%';
    alt.classList.toggle('show', scrollY > innerHeight * .55);
    var cur = null;
    altLinks.forEach(function (a) { if (a._sec.getBoundingClientRect().top < innerHeight * .4) cur = a; });
    altLinks.forEach(function (a) { a.classList.toggle('on', a === cur); });
  }
  window.addEventListener('load', altLayout);
  onScroll();

  /* =========================================================
     Home: latest album teaser
     ========================================================= */
  var teaser = $('[data-gal-teaser]');
  if (teaser && window.fetch) fetch('gallery/gallery.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) {
    var a = (j.albums || []).filter(function (x) { return x.photos && x.photos.length; }).sort(function (x, y) { return (y.date || '').localeCompare(x.date || ''); })[0];
    if (!a) return;
    $('[data-teaser-title]', teaser).textContent = a.short || a.title;
    $('[data-teaser-meta]', teaser).textContent = 'Latest photos, ' + (a.place || '');
    var g = $('[data-teaser-grid]', teaser);
    a.photos.slice(0, 4).forEach(function (p, i) {
      var l = document.createElement('a'); l.href = 'gallery.html'; l.className = 'tz'; l.style.setProperty('--d', i);
      var im = document.createElement('img'); im.src = p.thumb; im.alt = p.caption || a.title; im.loading = 'lazy'; im.width = p.tw; im.height = p.th;
      l.appendChild(im); g.appendChild(l);
    });
    teaser.hidden = false;
    if (io) { g.classList.add('rv'); io.observe(g); } altLayout();
  }).catch(function () {});

  /* =========================================================
     Search
     ========================================================= */
  var dlg = $('#search'), q = $('#search-q'), out = $('#search-r'), sel = 0, items = [], lastFocus;
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function render() {
    var data = window.SEARCH_INDEX || [], term = norm(q.value.trim()), words = term.split(/\s+/).filter(Boolean);
    items = data.map(function (e) {
      var hay = norm(e.t + ' ' + e.d + ' ' + e.k), score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], at = hay.indexOf(w); if (at < 0) return null;
        score += (norm(e.t).indexOf(w) > -1 ? 3 : 1) + (at === 0 ? 1 : 0);
      }
      return { e: e, s: score };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 12).map(function (x) { return x.e; });
    if (!words.length) items = data.filter(function (e) { return e.k === 'Page'; });
    sel = 0;
    out.innerHTML = items.length ? items.map(function (e, i) {
      return '<li><a href="' + e.u + '" role="option" aria-selected="' + (i === 0) + '"><span class="t"></span><span class="k"></span><span class="d"></span></a></li>';
    }).join('') : '<li class="none">Nothing matches. Try a shorter word, for example “WRF” or “EGU”.</li>';
    $$('a', out).forEach(function (a, i) { $('.t', a).textContent = items[i].t; $('.k', a).textContent = items[i].k; $('.d', a).textContent = items[i].d; });
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
    if (!reduce) $('.search-box', dlg).animate([{ opacity: 0, transform: 'translateY(-10px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.7,.2,1)' });
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
    var typing = /input|textarea|select/i.test(e.target.tagName || '') || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg && dlg.hidden ? openSearch() : closeSearch(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape') { closeSearch(); if (sheet && !sheet.hidden) menu.click(); }
  });
})();
