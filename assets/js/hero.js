/* Home page scene: a Himalayan valley in cross-section with a flux tower on
   the ridge. By day the scene shows a convective mixed layer (thermals,
   upslope flow, cumulus over the ridge). By night it shows a stable layer
   (downslope drainage flow, a cold-air pool in the valley, a residual
   layer aloft, gravity waves on the isentropes). The scene follows the
   site's day / night switch. */
(function () {
  'use strict';
  var cv = document.getElementById('scene');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1, t = 0, running = true, visible = true;
  var mix = document.documentElement.getAttribute('data-mode') === 'night' ? 1 : 0, target = mix;

  /* deterministic random so the stars and ridges do not jump on resize */
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mixc(a, b, k, alpha) {
    var A = hex(a), B = hex(b);
    var r = Math.round(A[0] + (B[0] - A[0]) * k), g = Math.round(A[1] + (B[1] - A[1]) * k), bl = Math.round(A[2] + (B[2] - A[2]) * k);
    return 'rgba(' + r + ',' + g + ',' + bl + ',' + (alpha == null ? 1 : alpha) + ')';
  }
  function smooth(e0, e1, x) { var k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); }

  /* ---------- terrain ---------- */
  /* near terrain: height above the bottom edge as a fraction of H */
  var ctrl = [[0, .05], [.30, .07], [.42, .18], [.50, .27], [.56, .19], [.63, .11], [.70, .17], [.79, .33], [.865, .43], [.93, .40], [1, .34]];
  var ridgeU = .865;
  function nearFrac(u) {
    for (var i = 0; i < ctrl.length - 1; i++) {
      var a = ctrl[i], b = ctrl[i + 1];
      if (u <= b[0]) {
        var k = (u - a[0]) / (b[0] - a[0]); k = (1 - Math.cos(k * Math.PI)) / 2;
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return ctrl[ctrl.length - 1][1];
  }
  var bump = [];
  function ground(x) { /* screen y of the near surface */
    var u = x / W, i = Math.max(0, Math.min(bump.length - 1, Math.round(u * (bump.length - 1))));
    return H - (nearFrac(u) * H * scaleY() + (bump[i] || 0));
  }
  function slope(x) { return (ground(x + 2) - ground(x - 2)) / 4; }
  function scaleY() { return W < 700 ? 1.25 : 1; }

  var far = [], mid = [];
  function buildRidges() {
    seed = 11; far = []; mid = []; bump = [];
    var n = 160;
    for (var i = 0; i <= n; i++) {
      var u = i / n;
      far.push(.50 + .10 * Math.sin(u * 7.1 + 1.3) + .06 * Math.sin(u * 17.3) + .05 * Math.abs(Math.sin(u * 4.2 + .4)) + .025 * rnd());
      mid.push(.34 + .07 * Math.sin(u * 5.3 + 2.2) + .04 * Math.sin(u * 13.7 + .7) + .02 * rnd());
      bump.push((Math.sin(u * 61) * 1.6 + Math.sin(u * 23 + 1) * 2.2) * (W < 700 ? .6 : 1));
    }
  }

  /* ---------- particles ---------- */
  var thermals = [], surf = [], stars = [];
  function spawnThermal(p, fresh) {
    var x;
    do { x = W * (.38 + rnd() * .6); } while (Math.abs(slope(x)) > 1.2);
    p.x = x; p.y = ground(x) - 2; p.x0 = x;
    p.v = .35 + rnd() * .5; p.ph = rnd() * 6.28; p.r = 1 + rnd() * 1.6;
    p.trail = []; p.life = 0;
    if (fresh) { p.y -= rnd() * (ground(x) - mlTop(x)); }
  }
  function spawnSurf(p, fresh) {
    p.x = W * (.36 + rnd() * .64); p.off = 3 + rnd() * 16; p.v = .5 + rnd() * .7; p.trail = []; p.age = fresh ? rnd() * 200 : 0;
  }
  function buildParticles() {
    seed = 23; thermals = []; surf = []; stars = [];
    var nt = W < 700 ? 34 : 64, ns = W < 700 ? 60 : 120;
    for (var i = 0; i < nt; i++) { var p = {}; spawnThermal(p, true); thermals.push(p); }
    for (var j = 0; j < ns; j++) { var q = {}; spawnSurf(q, true); surf.push(q); }
    for (var k = 0; k < (W < 700 ? 90 : 180); k++) stars.push({ x: rnd() * W, y: rnd() * H * .62, r: rnd() * 1.2 + .2, ph: rnd() * 6.28 });
  }

  /* boundary layer heights */
  function mlTop(x) { return Math.min(H * .34 + 7 * Math.sin(x * .012 + t * .01) + 4 * Math.sin(x * .031 - t * .017), ground(x) - 70); }
  function residual(x) { return H * .36 + 5 * Math.sin(x * .009 + 1); }
  var valleyX = function () { return W * .63; };
  function poolTop() { return ground(valleyX()) - H * (W < 700 ? .09 : .085); }

  /* ---------- drawing ---------- */
  function ridgePath(arr, base) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (var i = 0; i < arr.length; i++) ctx.lineTo(i / (arr.length - 1) * W, H - arr[i] * H * base);
    ctx.lineTo(W, H); ctx.closePath();
  }
  function nearPath() {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (var x = 0; x <= W; x += 3) ctx.lineTo(x, ground(x));
    ctx.lineTo(W, H); ctx.closePath();
  }

  function draw() {
    var m = mix, d = 1 - m;
    ctx.clearRect(0, 0, W, H);

    /* sky */
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mixc('#9EC2DC', '#08101F', m));
    sky.addColorStop(.55, mixc('#D9E6EA', '#122039', m));
    sky.addColorStop(1, mixc('#EEF2F0', '#1C2D4C', m));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    /* sun / moon */
    var sx = W * .80, sy = H * .16;
    if (d > .01) {
      var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * .45);
      g.addColorStop(0, 'rgba(255,236,190,' + (.85 * d) + ')'); g.addColorStop(.12, 'rgba(255,226,170,' + (.35 * d) + ')'); g.addColorStop(1, 'rgba(255,226,170,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,248,226,' + d + ')'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(14, H * .028), 0, 7); ctx.fill();
    }
    if (m > .01) {
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s], a = (.35 + .65 * (0.5 + 0.5 * Math.sin(t * .03 + st.ph))) * m;
        ctx.fillStyle = 'rgba(226,234,255,' + a.toFixed(3) + ')';
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
      var mx = W * .74, my = H * .14, mr = Math.max(11, H * .022);
      ctx.fillStyle = 'rgba(236,240,252,' + m + ')'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
      ctx.fillStyle = mixc('#08101F', '#0E1830', .5, m); ctx.beginPath(); ctx.arc(mx + mr * .45, my - mr * .2, mr * .92, 0, 7); ctx.fill();
    }

    /* far snow range */
    ridgePath(far, 1);
    ctx.fillStyle = mixc('#C6D6DE', '#1A2843', m); ctx.fill();
    ctx.save(); ridgePath(far, 1); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,' + (.75 * d + .12 * m) + ')';
    ctx.beginPath(); ctx.moveTo(0, 0);
    var snowline = H * (1 - .56);
    for (var i = 0; i < far.length; i++) ctx.lineTo(i / (far.length - 1) * W, Math.min(snowline + 6 * Math.sin(i * 1.3), H - far[i] * H + 30));
    ctx.lineTo(W, 0); ctx.closePath(); ctx.fill(); ctx.restore();

    /* mid ridge */
    ridgePath(mid, 1);
    ctx.fillStyle = mixc('#A8C1C1', '#152239', m); ctx.fill();

    /* day: hazy mixed layer below its top */
    if (d > .01) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += 6) ctx.lineTo(x, mlTop(x));
      ctx.lineTo(W, H); ctx.closePath();
      var hz = ctx.createLinearGradient(0, H * .3, 0, H);
      hz.addColorStop(0, 'rgba(236,214,170,' + (.30 * d) + ')'); hz.addColorStop(1, 'rgba(236,214,170,' + (.10 * d) + ')');
      ctx.fillStyle = hz; ctx.fill(); ctx.restore();
    }

    /* night: residual layer and wavy isentropes */
    if (m > .01) {
      ctx.lineWidth = 1;
      for (var L = 0; L < 6; L++) {
        var base = H * (.22 + L * .075);
        ctx.strokeStyle = 'rgba(141,182,234,' + (.10 + L * .02) * m + ')';
        ctx.beginPath();
        for (var x2 = 0; x2 <= W; x2 += 6) {
          var lee = smooth(W * ridgeU, W * 1.05, x2) + smooth(W * .5, W * .62, x2) * .5;
          var y2 = base + Math.sin(x2 * .018 - t * .012 + L) * (2 + 7 * lee);
          y2 = Math.min(y2, ground(x2) - 4);
          if (x2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
    }

    /* near terrain */
    nearPath();
    var ng = ctx.createLinearGradient(0, H * .45, 0, H);
    ng.addColorStop(0, mixc('#6E9A88', '#13213A', m));
    ng.addColorStop(1, mixc('#4D7A6A', '#0B1426', m));
    ctx.fillStyle = ng; ctx.fill();
    /* sunlit edge */
    ctx.save(); nearPath(); ctx.clip();
    ctx.strokeStyle = mixc('#D8E7C9', '#3A5A86', m, .55); ctx.lineWidth = 2;
    ctx.beginPath(); for (var x3 = 0; x3 <= W; x3 += 3) { if (x3 === 0) ctx.moveTo(x3, ground(x3)); else ctx.lineTo(x3, ground(x3)); } ctx.stroke();
    ctx.restore();

    /* trees on the ridge, for scale */
    ctx.fillStyle = mixc('#2F5A4D', '#0A1222', m);
    for (var tx = W * .76; tx < W * .99; tx += W * .011) {
      if (Math.abs(tx - W * ridgeU) < W * .02) continue;
      var gy = ground(tx), th = 9 + 7 * Math.abs(Math.sin(tx * .37)), tw = th * .34;
      if (W < 700) { th *= .7; tw *= .7; }
      ctx.beginPath(); ctx.moveTo(tx, gy - th); ctx.lineTo(tx + tw, gy + 1); ctx.lineTo(tx - tw, gy + 1); ctx.closePath(); ctx.fill();
    }

    /* night: cold-air pool in the valley */
    if (m > .01) {
      var pt = poolTop();
      ctx.save(); nearPath(); ctx.rect(0, 0, W, H); ctx.clip('evenodd');
      var pg = ctx.createLinearGradient(0, pt, 0, ground(valleyX()));
      pg.addColorStop(0, 'rgba(120,170,235,0)'); pg.addColorStop(.35, 'rgba(120,170,235,' + .16 * m + ')'); pg.addColorStop(1, 'rgba(150,195,250,' + .34 * m + ')');
      ctx.fillStyle = pg; ctx.fillRect(W * .38, pt, W * .5, ground(valleyX()) - pt + 2);
      ctx.restore();
    }

    /* boundary layer top line */
    ctx.setLineDash([5, 6]); ctx.lineWidth = 1.3;
    if (d > .01) {
      ctx.strokeStyle = 'rgba(164,100,15,' + .75 * d + ')';
      ctx.beginPath(); for (var x4 = 0; x4 <= W; x4 += 5) { var y4 = mlTop(x4); if (x4 === 0) ctx.moveTo(x4, y4); else ctx.lineTo(x4, y4); } ctx.stroke();
    }
    if (m > .01) {
      ctx.strokeStyle = 'rgba(141,182,234,' + .45 * m + ')';
      ctx.beginPath(); for (var x5 = 0; x5 <= W; x5 += 5) { var y5 = residual(x5); if (x5 === 0) ctx.moveTo(x5, y5); else ctx.lineTo(x5, y5); } ctx.stroke();
      ctx.strokeStyle = 'rgba(176,214,255,' + .7 * m + ')';
      var py = poolTop();
      ctx.beginPath(); var pen = false;
      for (var xp = W * .40; xp <= W * .84; xp += 3) {
        if (ground(xp) > py + 2) { if (!pen) { ctx.moveTo(xp, py); pen = true; } else ctx.lineTo(xp, py); } else pen = false;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* cumulus over the ridge in the day */
    if (d > .01) {
      var cx = W * (ridgeU - .01), cy = mlTop(cx) - 6, grow = 1 + .06 * Math.sin(t * .006);
      cloud(cx, cy, Math.max(26, W * .03) * grow, d);
      cloud(W * .47, mlTop(W * .47) - 4, Math.max(18, W * .019) * grow, d * .9);
    }

    /* thermals */
    if (d > .01) {
      for (var a1 = 0; a1 < thermals.length; a1++) {
        var p = thermals[a1];
        trail(p.trail, 'rgba(201,130,31,' + .45 * d + ')', 1.2);
        ctx.fillStyle = 'rgba(201,130,31,' + .85 * d + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    }

    /* surface flow: upslope by day, downslope by night */
    for (var b1 = 0; b1 < surf.length; b1++) {
      var q = surf[b1];
      trail(q.trail, mixc('#FFFFFF', '#B6D4FF', m, .75), 1.3);
    }

    /* flux tower */
    tower(m);

    /* labels */
    label(m);
  }

  function cloud(x, y, r, a) {
    ctx.fillStyle = 'rgba(255,255,255,' + .92 * a + ')';
    ctx.beginPath();
    ctx.arc(x, y - r * .2, r * .62, 0, 7); ctx.arc(x - r * .62, y + r * .12, r * .44, 0, 7);
    ctx.arc(x + r * .6, y + r * .1, r * .48, 0, 7); ctx.arc(x + r * .1, y - r * .62, r * .46, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(205,216,224,' + .7 * a + ')';
    ctx.fillRect(x - r * 1.02, y + r * .1, r * 2.05, r * .44);
  }
  function trail(tr, col, w) {
    if (tr.length < 2) return;
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tr[0][0], tr[0][1]);
    for (var i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0], tr[i][1]);
    ctx.stroke();
  }
  function tower(m) {
    var x = W * ridgeU, gy = ground(x), h = Math.max(54, H * .095);
    var col = mixc('#13221F', '#C9D6EC', m);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - h); ctx.stroke();
    ctx.lineWidth = .7; ctx.globalAlpha = .55;
    ctx.beginPath(); ctx.moveTo(x, gy - h * .9); ctx.lineTo(x - h * .45, gy + 2); ctx.moveTo(x, gy - h * .9); ctx.lineTo(x + h * .45, gy + 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.2;
    [.07, .27, .53, .9].forEach(function (f) {
      var y = gy - h * f;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - 10, y, 1.8, 0, 7); ctx.fill();
    });
    if (m > .5) {
      var on = (Math.floor(t / 40) % 2) === 0 || reduce;
      ctx.fillStyle = on ? 'rgba(255,90,80,' + m + ')' : 'rgba(255,90,80,.25)';
      ctx.beginPath(); ctx.arc(x, gy - h - 2, 2.2, 0, 7); ctx.fill();
    }
  }
  function label(m) {
    if (W < 700) return;
    ctx.font = '500 12px "Instrument Sans", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    var x = W * ridgeU, gy = ground(x), h = Math.max(54, H * .095);
    ctx.fillStyle = mixc('#3F514B', '#AEBBD0', m);
    ctx.textAlign = 'left';
    ctx.fillText('flux tower', x + 8, gy - h + 4);
    var lx = W * .985;
    ctx.textAlign = 'right';
    if (m < .5) {
      ctx.fillStyle = 'rgba(164,100,15,' + (1 - 2 * m) + ')';
      ctx.fillText('mixed-layer top', lx, mlTop(lx) - 4);
    } else {
      ctx.fillStyle = 'rgba(176,206,240,' + (2 * m - 1) + ')';
      ctx.fillText('residual layer', lx, residual(lx) - 4);
      ctx.textAlign = 'left';
      ctx.fillText('cold-air pool', W * .555, poolTop() - 5);
    }
  }

  /* ---------- physics-ish update ---------- */
  function step() {
    t++;
    mix += (target - mix) * .045; if (Math.abs(target - mix) < .002) mix = target;
    var night = mix > .5;
    for (var i = 0; i < thermals.length; i++) {
      var p = thermals[i];
      p.life++;
      p.y -= p.v * (1 + .6 * Math.min(1, p.life / 120));
      p.x = p.x0 + Math.sin(p.life * .03 + p.ph) * 6 + p.life * .05;
      p.trail.push([p.x, p.y]); if (p.trail.length > 16) p.trail.shift();
      if (p.y < mlTop(p.x) + 2 || p.x > W) spawnThermal(p, false);
    }
    for (var j = 0; j < surf.length; j++) {
      var q = surf[j], s = slope(q.x), dir = (s > 0 ? 1 : -1); /* +1 when the ground rises to the left */
      /* upslope: move towards decreasing screen y; downslope: the other way */
      var mv = (night ? 1 : -1) * dir;
      var steep = Math.min(1.6, Math.abs(s) * 1.6 + .25);
      q.x += mv * q.v * steep * (night ? 1.15 : 1);
      q.age++;
      var gy = ground(q.x), y = gy - q.off * (night ? .45 : 1);
      if (night && gy > poolTop() && Math.abs(s) < .25) y = Math.max(poolTop() + 6, y);
      q.trail.push([q.x, y]); if (q.trail.length > (night ? 14 : 12)) q.trail.shift();
      var flat = Math.abs(s) < .06;
      if (q.x < W * .36 || q.x > W || (flat && q.age > 40) || q.age > 420) { spawnSurf(q, false); }
    }
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, r.width); H = Math.max(260, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildRidges(); buildParticles();
    if (reduce) { for (var i = 0; i < 260; i++) step(); }
    draw();
  }

  function loop() {
    if (running && visible && !reduce) { step(); draw(); }
    else if (reduce && mix !== target) { mix = target; draw(); }
    requestAnimationFrame(loop);
  }

  window.addEventListener('modechange', function (e) { target = e.detail === 'night' ? 1 : 0; if (reduce) { mix = target; draw(); } });
  var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(cv); else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
  document.addEventListener('visibilitychange', function () { running = !document.hidden; });
  resize(); requestAnimationFrame(loop);
})();
