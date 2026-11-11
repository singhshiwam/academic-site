/* Gallery: albums are read from gallery/gallery.json, which
   tools/add_photos.py writes. Each album opens in a full-screen viewer. */
(function () {
  'use strict';
  var grid = document.querySelector('[data-gal]');
  if (!grid) return;
  var bar = document.querySelector('[data-gal-filters]'), empty = document.querySelector('[data-gal-empty]');
  var lb = document.querySelector('[data-lb]'), img = lb.querySelector('[data-lb-img]');
  var cap = lb.querySelector('[data-lb-cap]'), num = lb.querySelector('[data-lb-n]'), alb = lb.querySelector('[data-lb-album]');
  var LABELS = { field: 'Fieldwork', conference: 'Conferences', school: 'Schools and workshops', campus: 'Campus and group', travel: 'Travel' };
  var albums = [], cur = null, idx = 0, lastFocus = null;

  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function when(d) {
    if (!d) return '';
    var p = d.split('-'), m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return (p[2] ? +p[2] + ' ' : '') + (p[1] ? m[+p[1] - 1] + ' ' : '') + p[0];
  }

  var SHOW = window.innerWidth < 600 ? 4 : 6, reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var openAlbums = {};
  function fig(a, c, i, extra) {
    return '<figure tabindex="0" role="button" class="' + (extra ? 'extra' : '') + '" data-album="' + esc(a.id) + '" data-i="' + i + '" aria-label="Open photo: ' + esc(c.caption || a.title) + '">' +
      '<img src="' + esc(c.thumb) + '" width="' + c.tw + '" height="' + c.th + '" alt="' + esc(c.caption || a.title) + '" loading="lazy" decoding="async">' +
      (c.caption ? '<figcaption>' + esc(c.caption) + '</figcaption>' : '') + '</figure>';
  }
  function render(filter) {
    var list = albums.filter(function (a) { return filter === 'all' || a.category === filter; });
    grid.innerHTML = list.map(function (a) {
      var more = a.photos.length - SHOW, opened = openAlbums[a.id];
      return '<section class="album' + (opened ? ' open' : '') + '" id="' + esc(a.id) + '"><header class="album-h"><h2>' + esc(a.title) + '</h2><p>' + esc([a.place, when(a.date)].filter(Boolean).join(', ')) +
        ' <span>' + a.photos.length + (a.photos.length > 1 ? ' photos' : ' photo') + '</span></p></header><div class="gal">' +
        a.photos.map(function (c, i) { return (i < SHOW || opened) ? fig(a, c, i, i >= SHOW) : ''; }).join('') + '</div>' +
        (more > 0 && !opened ? '<button type="button" class="more" data-more="' + esc(a.id) + '">Show ' + more + ' more ' + (more > 1 ? 'photos' : 'photo') + '</button>' : '') +
        '</section>';
    }).join('');
    reveal(grid.querySelectorAll('figure'));
  }
  /* photos rise in as they come into view, a few at a time */
  var gio = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    var k = 0;
    es.forEach(function (e) { if (e.isIntersecting) { var f = e.target; setTimeout(function () { f.classList.add('in'); }, reduce ? 0 : 70 * k++); gio.unobserve(f); } });
  }, { rootMargin: '0px 0px -6% 0px' }) : null;
  function reveal(figs) { Array.prototype.forEach.call(figs, function (f) { if (gio) gio.observe(f); else f.classList.add('in'); }); }
  function expand(id) {
    var a = albums.filter(function (x) { return x.id === id; })[0], sec = document.getElementById(id); if (!a || !sec) return;
    openAlbums[id] = true; sec.classList.add('open');
    var gal = sec.querySelector('.gal'), btn = sec.querySelector('[data-more]');
    var h0 = gal.offsetHeight;
    gal.insertAdjacentHTML('beforeend', a.photos.slice(SHOW).map(function (c, k) { return fig(a, c, SHOW + k, true); }).join(''));
    if (btn) btn.remove();
    var h1 = gal.offsetHeight;
    if (!reduce) gal.animate([{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: Math.min(900, 300 + (h1 - h0) / 3), easing: 'cubic-bezier(.2,.7,.2,1)' });
    reveal(gal.querySelectorAll('figure.extra:not(.in)'));
    var first = gal.querySelector('figure.extra'); if (first) first.focus({ preventScroll: true });
  }
  grid.addEventListener('click', function (e) { var m = e.target.closest('[data-more]'); if (m) expand(m.getAttribute('data-more')); });

  function show(dir) {
    var p = cur.photos[idx];
    var swap = function () {
      img.src = p.src; img.alt = p.caption || cur.title;
      num.textContent = (idx + 1) + ' of ' + cur.photos.length;
      alb.textContent = cur.title;
      cap.innerHTML = esc(p.caption || cur.title) + '<small>' + esc([cur.place, when(p.date || cur.date)].filter(Boolean).join(', ')) + '</small>';
    };
    if (dir && !reduce && img.animate) {
      img.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-dir * 28) + 'px)' }], { duration: 160, easing: 'ease-in' }).onfinish = function () {
        swap();
        var go2 = function () { img.animate([{ opacity: 0, transform: 'translateX(' + (dir * 28) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' }); };
        if (img.complete) go2(); else img.onload = function () { img.onload = null; go2(); };
      };
    } else swap();
    var nx = cur.photos[(idx + 1) % cur.photos.length]; if (nx) { var pre = new Image(); pre.src = nx.src; }
    lb.querySelector('[data-lb-prev]').hidden = lb.querySelector('[data-lb-next]').hidden = cur.photos.length < 2;
  }
  function open(id, i) {
    cur = albums.filter(function (a) { return a.id === id; })[0]; if (!cur) return;
    idx = i || 0; lastFocus = document.activeElement; lb.hidden = false; document.body.style.overflow = 'hidden';
    show(); lb.querySelector('[data-lb-close]').focus();
    if (!reduce) {
      lb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      var from = lastFocus && lastFocus.getBoundingClientRect ? lastFocus.getBoundingClientRect() : null;
      if (from && from.width) {
        var cx = from.left + from.width / 2 - innerWidth / 2, cy = from.top + from.height / 2 - innerHeight / 2;
        img.animate([{ opacity: .2, transform: 'translate(' + cx + 'px,' + cy + 'px) scale(.35)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
    }
  }
  function close() {
    if (!reduce && !lb.hidden) { lb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' }); }
    lb.hidden = true; document.body.style.overflow = ''; img.removeAttribute('src'); if (lastFocus) lastFocus.focus(); }
  function go(d) { if (!cur) return; idx = (idx + d + cur.photos.length) % cur.photos.length; show(d); }

  grid.addEventListener('click', function (e) { var f = e.target.closest('[data-album]'); if (f) open(f.getAttribute('data-album'), +f.getAttribute('data-i')); });
  grid.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-album]')) { e.preventDefault(); open(e.target.getAttribute('data-album'), +e.target.getAttribute('data-i')); } });
  lb.querySelector('[data-lb-close]').addEventListener('click', close);
  lb.querySelector('[data-lb-prev]').addEventListener('click', function () { go(-1); });
  lb.querySelector('[data-lb-next]').addEventListener('click', function () { go(1); });
  lb.addEventListener('click', function (e) { if (e.target.classList.contains('lb-stage')) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1);
  });
  var sx = null;
  lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); sx = null; });

  fetch('gallery/gallery.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : { albums: [] }; }).catch(function () { return { albums: [] }; })
    .then(function (j) {
      albums = (j.albums || []).filter(function (a) { return a.photos && a.photos.length; })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      if (!albums.length) { empty.hidden = false; return; }
      var cats = [];
      albums.forEach(function (a) { if (a.category && cats.indexOf(a.category) < 0) cats.push(a.category); });
      if (cats.length > 1) {
        bar.hidden = false;
        bar.innerHTML = '<button type="button" data-f="all" aria-pressed="true">All</button>' + cats.map(function (c) {
          return '<button type="button" data-f="' + esc(c) + '" aria-pressed="false">' + esc(LABELS[c] || c) + '</button>';
        }).join('');
        if (window.sitePill) window.sitePill(bar);
        bar.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
          bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          var f = b.getAttribute('data-f');
          if (reduce || !grid.animate) { render(f); return; }
          grid.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 180, easing: 'ease-in' }).onfinish = function () {
            render(f);
            grid.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
          };
        });
      }
      /* an album linked from elsewhere (gallery.html#egu-2026) opens in full */
      var want = location.hash && decodeURIComponent(location.hash.slice(1));
      if (want) openAlbums[want] = true;
      render('all');
      var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 60);
    });
})();
