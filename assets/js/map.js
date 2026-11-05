/* Travel map: great-circle arcs from Roorkee to the meetings and schools.
   Geometry is precomputed in world-data.js (Natural Earth 1:110m land). */
(function () {
  'use strict';
  var W = window.WORLD;
  if (!W) return;
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  document.querySelectorAll('[data-map]').forEach(function (box) {
    var svg = el('svg', { viewBox: '0 0 ' + W.w + ' ' + W.h, role: 'img', 'aria-label': 'World map with arcs from Roorkee to Sapporo, Chiba, Washington D.C., Singapore, Pune, Vienna, Lauenburg, Bengaluru and Hyderabad' });
    svg.appendChild(el('path', { d: W.grat, class: 'grat' }));
    svg.appendChild(el('path', { d: W.land, class: 'land' }));
    var arcs = el('g', {}), dots = el('g', {}), labels = el('g', {});
    var home = W.places.filter(function (p) { return p.home; })[0];
    var order = W.places.filter(function (p) { return !p.home; });
    order.forEach(function (p, i) {
      var a = el('path', { d: p.arc, class: 'arc ' + p.kind });
      a.style.setProperty('--k', i);
      arcs.appendChild(a);
    });
    var tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'status');
    W.places.forEach(function (p, i) {
      var kind = p.home ? 'home' : p.kind;
      var g = el('g', { class: 'dot', tabindex: '0', role: 'button', 'aria-label': p.name + ': ' + p.what });
      g.style.setProperty('--k', p.home ? 0 : i);
      g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 9, class: 'pulse ' + kind }));
      g.appendChild(el('circle', { cx: p.x, cy: p.y, r: p.home ? 5 : 4, class: 'core ' + kind }));
      g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 14, fill: 'transparent' }));
      function on() {
        var r = box.getBoundingClientRect(), s = r.width / W.w;
        tip.innerHTML = '<b></b><span></span>'; tip.firstChild.textContent = p.name; tip.lastChild.textContent = p.what;
        tip.style.left = Math.min(r.width - 130, Math.max(130, p.x * s)) + 'px'; tip.style.top = (p.y * s) + 'px';
        tip.classList.add('on');
      }
      function off() { tip.classList.remove('on'); }
      g.addEventListener('pointerenter', on); g.addEventListener('pointerleave', off);
      g.addEventListener('focus', on); g.addEventListener('blur', off);
      g.addEventListener('click', on);
      dots.appendChild(g);
      /* labels where they do not collide in the crowded Indian and Japanese clusters */
      if (['roorkee', 'sapporo', 'washington', 'singapore', 'vienna', 'bengaluru'].indexOf(p.id) > -1) {
        var dx = { roorkee: -10, sapporo: 10, washington: 10, singapore: 10, vienna: -10, bengaluru: 10 }[p.id];
        var t = el('text', { x: p.x + dx, y: p.y + 4, class: 'lbl', 'text-anchor': dx < 0 ? 'end' : 'start' });
        t.textContent = p.id === 'vienna' ? 'Vienna, Lauenburg' : p.id === 'sapporo' ? 'Sapporo, Chiba' : p.id === 'bengaluru' ? 'Pune, Hyderabad, Bengaluru' : p.name;
        labels.appendChild(t);
      }
    });
    svg.appendChild(arcs); svg.appendChild(dots); svg.appendChild(labels);
    box.appendChild(svg); box.appendChild(tip);
    var leg = document.createElement('div'); leg.className = 'legend';
    leg.innerHTML = '<span><i style="background:var(--pine)"></i>Conference talks</span><span><i style="background:var(--sun)"></i>Schools and training</span>';
    box.appendChild(leg);
    arcs.querySelectorAll('.arc').forEach(function (a) { a.style.setProperty('--len', Math.ceil(a.getTotalLength())); });
    document.addEventListener('pointerdown', function (e) { if (!box.contains(e.target)) tip.classList.remove('on'); });
    if (!('IntersectionObserver' in window)) { box.classList.add('in'); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { box.classList.add('in'); io.disconnect(); } }, { threshold: .25 });
    io.observe(box);
  });
})();
