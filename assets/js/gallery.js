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

  function render(filter) {
    var list = albums.filter(function (a) { return filter === 'all' || a.category === filter; });
    grid.innerHTML = list.map(function (a) {
      return '<section class="album" id="' + esc(a.id) + '"><header class="album-h"><h2>' + esc(a.title) + '</h2><p>' + esc([a.place, when(a.date)].filter(Boolean).join(', ')) +
        ' <span>' + a.photos.length + (a.photos.length > 1 ? ' photos' : ' photo') + '</span></p></header><div class="gal">' +
        a.photos.map(function (c, i) {
          return '<figure tabindex="0" role="button" data-album="' + esc(a.id) + '" data-i="' + i + '" aria-label="Open photo: ' + esc(c.caption || a.title) + '">' +
            '<img src="' + esc(c.thumb) + '" width="' + c.tw + '" height="' + c.th + '" alt="' + esc(c.caption || a.title) + '" loading="lazy" decoding="async">' +
            (c.caption ? '<figcaption>' + esc(c.caption) + '</figcaption>' : '') + '</figure>';
        }).join('') + '</div></section>';
    }).join('');
    grid.querySelectorAll('figure').forEach(function (f, i) { setTimeout(function () { f.classList.add('in'); }, 50 * i + 30); });
  }

  function show() {
    var p = cur.photos[idx];
    img.src = p.src; img.alt = p.caption || cur.title;
    num.textContent = (idx + 1) + ' of ' + cur.photos.length;
    alb.textContent = cur.title;
    cap.innerHTML = esc(p.caption || cur.title) + '<small>' + esc([cur.place, when(p.date || cur.date)].filter(Boolean).join(', ')) + '</small>';
    var nx = cur.photos[(idx + 1) % cur.photos.length]; if (nx) { var pre = new Image(); pre.src = nx.src; }
    lb.querySelector('[data-lb-prev]').hidden = lb.querySelector('[data-lb-next]').hidden = cur.photos.length < 2;
  }
  function open(id, i) {
    cur = albums.filter(function (a) { return a.id === id; })[0]; if (!cur) return;
    idx = i || 0; lastFocus = document.activeElement; lb.hidden = false; document.body.style.overflow = 'hidden';
    show(); lb.querySelector('[data-lb-close]').focus();
  }
  function close() { lb.hidden = true; document.body.style.overflow = ''; img.removeAttribute('src'); if (lastFocus) lastFocus.focus(); }
  function go(d) { if (!cur) return; idx = (idx + d + cur.photos.length) % cur.photos.length; show(); }

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
        bar.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          render(b.getAttribute('data-f'));
        });
      }
      render('all');
      /* links such as gallery.html#egu-2026 land on that album once it exists */
      var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 60);
    });
})();
