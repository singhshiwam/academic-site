/* Stability function explorer on the research page.
   All functions use the published coefficients listed under the plot. */
(function () {
  'use strict';
  var lab = document.querySelector('[data-lab]');
  if (!lab) return;
  var svg = lab.querySelector('[data-plot]'), rows = lab.querySelector('[data-rows]');
  var zetaOut = lab.querySelector('[data-zeta]'), at = lab.querySelector('[data-at]'), eq = lab.querySelector('[data-eq]');
  var ranges = [0.5, 1, 2, 5];
  var state = { regime: 'stable', q: 'm', range: 1, at: 0.5, hidden: {} };

  /* Cheng and Brutsaert (2005) form */
  function cb(z, a, b) { var zb = Math.pow(z, b); return 1 + a * (z + zb * Math.pow(1 + zb, (1 - b) / b)) / (z + Math.pow(1 + zb, 1 / b)); }
  var BH = { a: 1, b: 2 / 3, c: 5, d: 0.35 };

  var F = {
    stable: [
      { id: 'b71', name: 'Businger et al. (1971)', m: function (z) { return 1 + 4.7 * z; }, h: function (z) { return 0.74 + 4.7 * z; },
        em: 'φm = 1 + 4.7ζ', eh: 'φh = 0.74 + 4.7ζ' },
      { id: 'd74', name: 'Dyer (1974), linear', m: function (z) { return 1 + 5 * z; }, h: function (z) { return 1 + 5 * z; },
        em: 'φm = 1 + 5ζ', eh: 'φh = 1 + 5ζ' },
      { id: 'bh91', name: 'Beljaars and Holtslag (1991)',
        m: function (z) { return 1 + BH.a * z + BH.b * z * (1 + BH.c - BH.d * z) * Math.exp(-BH.d * z); },
        h: function (z) { return 1 + BH.a * z * Math.sqrt(1 + (2 / 3) * BH.a * z) + BH.b * z * (1 + BH.c - BH.d * z) * Math.exp(-BH.d * z); },
        em: 'φm = 1 + aζ + bζ(1 + c − dζ)e^(−dζ)', eh: 'φh = 1 + aζ(1 + 2aζ/3)^½ + bζ(1 + c − dζ)e^(−dζ)' },
      { id: 'cb05', name: 'Cheng and Brutsaert (2005)', m: function (z) { return cb(z, 6.1, 2.5); }, h: function (z) { return cb(z, 5.3, 1.1); },
        em: 'φm = 1 + a[ζ + ζᵇ(1 + ζᵇ)^((1−b)/b)] / [ζ + (1 + ζᵇ)^(1/b)]', eh: 'same form, a = 5.3, b = 1.1' },
      { id: 'gr07', name: 'Grachev et al. (2007), SHEBA',
        m: function (z) { return 1 + 5 * z * Math.pow(1 + z, 1 / 3) / (1 + (5 / 6.5) * z); },
        h: function (z) { return 1 + (5 * z + 5 * z * z) / (1 + 3 * z + z * z); },
        em: 'φm = 1 + aₘζ(1 + ζ)^⅓ / (1 + bₘζ)', eh: 'φh = 1 + (aₕζ + bₕζ²) / (1 + cₕζ + ζ²)' }
    ],
    unstable: [
      { id: 'b71', name: 'Businger et al. (1971)', m: function (z) { return Math.pow(1 - 15 * z, -0.25); }, h: function (z) { return 0.74 * Math.pow(1 - 9 * z, -0.5); },
        em: 'φm = (1 − 15ζ)^(−¼)', eh: 'φh = 0.74(1 − 9ζ)^(−½)' },
      { id: 'd74', name: 'Dyer (1974)', m: function (z) { return Math.pow(1 - 16 * z, -0.25); }, h: function (z) { return Math.pow(1 - 16 * z, -0.5); },
        em: 'φm = (1 − 16ζ)^(−¼)', eh: 'φh = (1 − 16ζ)^(−½)' }
    ]
  };
  var COLORS = {
    day: { b71: '#7A4FB0', d74: '#5B6B75', bh91: '#2F78B8', cb05: '#A85D08', gr07: '#16695A' },
    night: { b71: '#7A4FB0', d74: '#56667A', bh91: '#1D5A8C', cb05: '#8E5E0C', gr07: '#B32D4B' }
  };
  function col(id) { return COLORS[document.documentElement.getAttribute('data-mode') === 'night' ? 'night' : 'day'][id]; }

  var M = { l: 52, r: 18, t: 16, b: 44 }, VW = 640, VH = 380;
  function nice(max) {
    var raw = max / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var s = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
    return { step: s, top: Math.ceil(max / s) * s };
  }
  function fmt(v) { return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2); }
  function el(tag, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text; return e;
  }

  var X0, X1, Y0, Y1;
  function sx(z) { return M.l + (z - X0) / (X1 - X0) * (VW - M.l - M.r); }
  function sy(v) { return VH - M.b - (v - Y0) / (Y1 - Y0) * (VH - M.t - M.b); }

  function draw() {
    var R = ranges[state.range], set = F[state.regime];
    var stable = state.regime === 'stable';
    X0 = stable ? 0 : -R; X1 = stable ? R : 0;
    var ymax = 0, ymin = Infinity, N = 200;
    set.forEach(function (f) {
      if (state.hidden[f.id]) return;
      for (var i = 0; i <= N; i++) { var z = X0 + (X1 - X0) * i / N, v = f[state.q](z); if (isFinite(v)) { ymax = Math.max(ymax, v); ymin = Math.min(ymin, v); } }
    });
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    Y0 = stable ? 0 : 0; var nn = nice(Math.max(ymax, 1.2)); Y1 = nn.top;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var ink = getComputedStyle(document.documentElement).getPropertyValue('--ink-3').trim() || '#66766F';
    var rule = getComputedStyle(document.documentElement).getPropertyValue('--rule').trim();
    var g = el('g', { 'font-family': 'Instrument Sans, system-ui, sans-serif', 'font-size': '12', fill: ink });
    for (var y = 0; y <= Y1 + 1e-9; y += nn.step) {
      g.appendChild(el('line', { x1: M.l, x2: VW - M.r, y1: sy(y), y2: sy(y), stroke: rule }));
      g.appendChild(el('text', { x: M.l - 8, y: sy(y) + 4, 'text-anchor': 'end' }, +y.toFixed(3)));
    }
    var xs = nice(R).step;
    for (var x = 0; x <= R + 1e-9; x += xs) {
      var xv = stable ? x : -x;
      g.appendChild(el('line', { x1: sx(xv), x2: sx(xv), y1: VH - M.b, y2: VH - M.b + 5, stroke: ink }));
      g.appendChild(el('text', { x: sx(xv), y: VH - M.b + 19, 'text-anchor': 'middle' }, +xv.toFixed(3)));
    }
    g.appendChild(el('text', { x: (M.l + VW - M.r) / 2, y: VH - 6, 'text-anchor': 'middle' }, 'ζ = z / L'));
    var yl = el('text', { x: 14, y: (M.t + VH - M.b) / 2, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (M.t + VH - M.b) / 2 + ')' }, state.q === 'm' ? 'φm' : 'φh');
    g.appendChild(yl);
    /* neutral reference */
    g.appendChild(el('line', { x1: M.l, x2: VW - M.r, y1: sy(1), y2: sy(1), stroke: ink, 'stroke-dasharray': '3 4', 'stroke-opacity': '.7' }));
    svg.appendChild(g);

    set.forEach(function (f) {
      if (state.hidden[f.id]) return;
      var d = '';
      for (var i = 0; i <= N; i++) {
        var z = X0 + (X1 - X0) * i / N, v = f[state.q](z);
        if (!isFinite(v)) continue;
        d += (d ? 'L' : 'M') + sx(z).toFixed(1) + ' ' + sy(Math.min(v, Y1)).toFixed(1);
      }
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: col(f.id), 'stroke-width': f.id === 'd74' ? 1.6 : 2.4, 'stroke-dasharray': f.id === 'd74' ? '6 4' : '' }));
    });
    /* marker */
    var zx = state.at * R * (stable ? 1 : -1);
    svg.appendChild(el('line', { x1: sx(zx), x2: sx(zx), y1: M.t, y2: VH - M.b, stroke: ink, 'stroke-opacity': '.6' }));
    set.forEach(function (f) {
      if (state.hidden[f.id]) return;
      var v = f[state.q](zx); if (!isFinite(v) || v > Y1) return;
      svg.appendChild(el('circle', { cx: sx(zx), cy: sy(v), r: 4.5, fill: col(f.id), stroke: 'var(--surface)', 'stroke-width': 2 }));
    });
    side(set, zx);
  }

  function side(set, zx) {
    zetaOut.textContent = 'ζ = ' + zx.toFixed(2);
    rows.innerHTML = '';
    set.forEach(function (f) {
      var r = document.createElement('div'); r.className = 'row';
      var v = f[state.q](zx);
      r.innerHTML = '<label><input type="checkbox"' + (state.hidden[f.id] ? '' : ' checked') + '><span class="sw"></span><span class="nm"></span></label><span class="val"></span>';
      r.querySelector('.sw').style.background = col(f.id);
      r.querySelector('.nm').textContent = f.name;
      r.querySelector('.val').textContent = isFinite(v) ? fmt(v) : '';
      r.title = state.q === 'm' ? f.em : f.eh;
      r.querySelector('input').addEventListener('change', function (e) { state.hidden[f.id] = !e.target.checked; draw(); });
      rows.appendChild(r);
    });
    eq.textContent = 'φ = 1 is the neutral value. Larger φ means turbulence is damped more strongly, so the scheme returns a smaller flux for the same gradient.';
  }

  lab.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-regime')) { state.regime = b.getAttribute('data-regime'); lab.querySelectorAll('[data-regime]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }
    if (b.hasAttribute('data-q')) { state.q = b.getAttribute('data-q'); lab.querySelectorAll('[data-q]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }
    draw();
  });
  lab.querySelector('[data-range]').addEventListener('input', function (e) { state.range = +e.target.value; draw(); });
  at.addEventListener('input', function () { state.at = at.value / 1000; draw(); });
  function pointer(e) {
    var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * VW;
    var k = (x - M.l) / (VW - M.l - M.r); if (k < 0 || k > 1) return;
    state.at = state.regime === 'stable' ? k : 1 - k; at.value = Math.round(state.at * 1000); draw();
  }
  svg.addEventListener('pointermove', pointer);
  svg.addEventListener('pointerdown', pointer);
  window.addEventListener('modechange', function () { setTimeout(draw, 30); });
  draw();
})();
