/* Home page scene: a Himalayan valley in cross-section with a flux tower on
   the ridge, run through a full 24-hour boundary layer cycle.

   After sunrise the nocturnal inversion erodes and a convective mixed layer
   grows, with thermals, upslope winds and, by early afternoon, cumulus over
   the ridge. Around sunset turbulence decays, the mixed layer is left aloft
   as a residual layer, the slopes cool, cold air drains downslope and pools
   in the valley under a stable layer.

   The scene starts at the current time in India and follows the clock. The
   scrubber lets a visitor move through the day; the page's day/night palette
   follows the scene so the text stays readable. */
(function () {
  'use strict';
  var cv = document.getElementById('scene');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d', { alpha: false });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1, frame = 0, running = true, visible = true;
  var scrollY = 0, px = 0, pxT = 0;

  /* ---------------- time ---------------- */
  /* sunrise and sunset for the Central Himalaya (30.3 N, 78.4 E) today, in IST,
     from the solar declination and equation of time (accurate to a few minutes) */
  /* computed in the page head (src/layout.html) and shared with every page */
  var SR = 6.6, SS = 17.6;
  function daySun() { if (window.siteSun) { var s = window.siteSun.sun(); SR = s.sr; SS = s.ss; } }
  daySun();
  function istHour() {
    if (window.siteSun) return window.siteSun.ist();
    var d = new Date(), u = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    return (u + 5.5) % 24;
  }
  var T = istHour();                          /* unwrapped scene time in hours */
  var live = true, playing = false, anim = null, coupling = true;
  function hour() { return ((T % 24) + 24) % 24; }

  function smooth(e0, e1, x) { var k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function since(h, from) { return ((h - from) % 24 + 24) % 24; }

  /* everything the drawing needs, from the hour */
  var S = {};
  function state() {
    var h = hour(), dayLen = SS - SR, nightLen = 24 - dayLen;
    var isDay = h >= SR && h <= SS;
    var e = isDay ? Math.sin(Math.PI * (h - SR) / dayLen) : -0.6 * Math.sin(Math.PI * since(h, SS) / nightLen);
    var sRise = since(h, SR), sSet = since(h, SS);
    S.h = h; S.e = e; S.isDay = isDay;
    S.N = 1 - smooth(-0.10, 0.12, e);                         /* night weight */
    S.dusk = Math.exp(-Math.pow(e / 0.16, 2));                 /* low-sun warmth */
    S.grow = isDay ? smooth(0.3, 6.5, sRise) : 0;              /* mixed-layer growth */
    S.therm = Math.max(0, Math.min(1, (e - 0.06) * 2.2));       /* thermal strength */
    S.cu = isDay ? smooth(4.2, 6.8, sRise) * smooth(0.22, 0.5, e) : 0;
    S.pool = isDay ? 1 - smooth(0.2, 2.6, sRise) : smooth(0.2, 4, sSet);
    S.flow = smooth(-0.06, 0.16, e) * 2 - 1;                   /* +1 upslope, -1 downslope */
    S.resid = isDay ? 1 - smooth(1.2, 4.5, sRise) : smooth(0, 1.5, sSet);
    if (isDay && sRise < 2.4) S.phase = 'morning';
    else if (isDay && SS - h < 1.6 || !isDay && sSet < 1.2) S.phase = 'evening';
    else S.phase = isDay ? 'day' : 'night';
    S.sunP = isDay ? (h - SR) / dayLen : null;
    S.moonP = isDay ? null : sSet / nightLen;
  }

  /* ---------------- colour ---------------- */
  var C = {};
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix3(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }
  var P = {
    day: { t: '#86B6DA', m: '#CFE2EA', b: '#EAF0EE', far: '#C2D3DC', mid: '#A2BEBE', n1: '#6F9C89', n2: '#4B7868', tree: '#2E5A4C', edge: '#E5F0D8' },
    dusk: { t: '#3E4C7C', m: '#E39B6D', b: '#F5CFA0', far: '#9C93A8', mid: '#7D8392', n1: '#5B6B5E', n2: '#3E4B44', tree: '#28352F', edge: '#FFC48A' },
    night: { t: '#0D2646', m: '#1D4C82', b: '#6399C6', far: '#4E80B1', mid: '#366594', n1: '#264F7B', n2: '#1A3C63', tree: '#112B49', edge: '#D2E5F7' }
  };
  Object.keys(P).forEach(function (k) { Object.keys(P[k]).forEach(function (j) { P[k][j] = hex(P[k][j]); }); });
  function palette() {
    var k = 1 - S.N, d = S.dusk * 0.9;
    Object.keys(P.day).forEach(function (j) {
      var base = mix3(P.night[j], P.day[j], k);
      C[j] = mix3(base, P.dusk[j], d * (j === 't' ? 0.55 : 1) * (S.N > 0.5 ? 0.75 : 1));
    });
  }

  /* ---------------- terrain ---------------- */
  var ctrl = [[0, .05], [.30, .07], [.42, .18], [.50, .27], [.56, .19], [.63, .11], [.70, .17], [.79, .33], [.865, .43], [.93, .40], [1, .34]];
  var ridgeU = .865, valleyU = .63;
  function nearFrac(u) {
    for (var i = 0; i < ctrl.length - 1; i++) {
      var a = ctrl[i], b = ctrl[i + 1];
      if (u <= b[0]) { var k = (u - a[0]) / (b[0] - a[0]); k = (1 - Math.cos(k * Math.PI)) / 2; return a[1] + (b[1] - a[1]) * k; }
    }
    return ctrl[ctrl.length - 1][1];
  }
  var G = null, far = [], mid = [];
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function buildTerrain() {
    var sc = W < 700 ? 1.25 : 1;
    G = new Float32Array(Math.ceil(W) + 4);
    for (var x = 0; x < G.length; x++) {
      var u = x / W;
      var bump = (Math.sin(u * 61) * 1.6 + Math.sin(u * 23 + 1) * 2.2) * (W < 700 ? .6 : 1);
      G[x] = H - (nearFrac(u) * H * sc + bump);
    }
    seed = 11; far = []; mid = [];
    for (var i = 0; i <= 180; i++) {
      var v = i / 180;
      far.push(.50 + .10 * Math.sin(v * 7.1 + 1.3) + .06 * Math.sin(v * 17.3) + .05 * Math.abs(Math.sin(v * 4.2 + .4)) + .022 * rnd());
      mid.push(.34 + .07 * Math.sin(v * 5.3 + 2.2) + .04 * Math.sin(v * 13.7 + .7) + .018 * rnd());
    }
  }
  function ground(x) { var i = x < 0 ? 0 : x >= G.length - 1 ? G.length - 1 : x | 0; return G[i]; }
  function slope(x) { return (ground(x + 3) - ground(x - 3)) / 6; }

  /* boundary-layer heights in screen y */
  function mlFull(x) { return H * .34 + 7 * Math.sin(x * .012 + frame * .01) + 4 * Math.sin(x * .031 - frame * .017); }
  function mlTop(x) { var g = ground(x); return Math.min(lerp(g - 26, mlFull(x), S.grow), g - 22); }
  function residual(x) { return H * .355 + 5 * Math.sin(x * .009 + 1); }
  function poolTop() { return ground(W * valleyU) - H * (W < 700 ? .095 : .088) * S.pool; }

  /* ---------------- particles ---------------- */
  var thermals = [], surf = [], stars = [];
  function spawnThermal(p, fresh) {
    var x, tries = 0;
    do { x = W * (.36 + rnd() * .63); tries++; } while (Math.abs(slope(x)) > 1.2 && tries < 20);
    p.x0 = p.x = x; p.y = ground(x) - 2;
    p.v = .35 + rnd() * .5; p.ph = rnd() * 6.28; p.r = 1 + rnd() * 1.5; p.trail = []; p.life = 0;
    if (fresh) p.y -= rnd() * Math.max(0, ground(x) - mlTop(x));
  }
  function spawnSurf(p, fresh) { p.x = W * (.36 + rnd() * .64); p.off = 3 + rnd() * 16; p.v = .5 + rnd() * .7; p.trail = []; p.age = fresh ? rnd() * 200 : 0; }
  function buildParticles() {
    seed = 23; thermals = []; surf = []; stars = [];
    var small = W < 700;
    for (var i = 0; i < (small ? 34 : 70); i++) { var p = {}; spawnThermal(p, true); thermals.push(p); }
    for (var j = 0; j < (small ? 60 : 130); j++) { var q = {}; spawnSurf(q, true); surf.push(q); }
    for (var k = 0; k < (small ? 110 : 240); k++) stars.push({ x: rnd() * W, y: rnd() * H * .64, r: rnd() * 1.3 + .25, ph: rnd() * 6.28, s: .02 + rnd() * .04 });
  }

  /* ---------------- drawing ---------------- */
  function ridge(arr, base, dy) {
    ctx.beginPath(); ctx.moveTo(-20, H + 2);
    for (var i = 0; i < arr.length; i++) ctx.lineTo(i / (arr.length - 1) * (W + 40) - 20 + px * (base === 1 ? 10 : 6), H - arr[i] * H + dy);
    ctx.lineTo(W + 20, H + 2); ctx.closePath();
  }
  function nearPath() {
    ctx.beginPath(); ctx.moveTo(0, H + 2);
    for (var x = 0; x <= W; x += 3) ctx.lineTo(x, ground(x));
    ctx.lineTo(W, H + 2); ctx.closePath();
  }
  function line(fn, x0, x1, step) {
    ctx.beginPath();
    for (var x = x0; x <= x1; x += step) { var y = fn(x); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  }

  function draw() {
    state(); palette();
    var N = S.N, D = 1 - N;
    var farDy = scrollY * .22, midDy = scrollY * .12;

    /* sky */
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgba(C.t)); sky.addColorStop(.58, rgba(C.m)); sky.addColorStop(1, rgba(C.b));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    /* stars */
    if (N > .02) {
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s], a = (.3 + .7 * (.5 + .5 * Math.sin(frame * st.s + st.ph))) * N * (1 - S.dusk * .8);
        if (a < .02) continue;
        ctx.fillStyle = 'rgba(226,234,255,' + a.toFixed(3) + ')'; ctx.fillRect(st.x, st.y - farDy * .3, st.r, st.r);
      }
    }

    /* sun and moon on arcs, setting behind the far range */
    var horizon = H * .64;
    if (S.sunP !== null) {
      var sx = W * (.05 + .9 * S.sunP), sy = horizon - S.e * H * .56 - farDy * .3, warm = S.dusk;
      var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * (.42 + .25 * warm));
      g.addColorStop(0, 'rgba(255,' + (236 - 60 * warm | 0) + ',' + (190 - 90 * warm | 0) + ',' + (.9) + ')');
      g.addColorStop(.1, 'rgba(255,' + (226 - 70 * warm | 0) + ',' + (170 - 90 * warm | 0) + ',.38)');
      g.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgb(255,' + (248 - 40 * warm | 0) + ',' + (226 - 80 * warm | 0) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(14, H * .027), 0, 7); ctx.fill();
    }
    if (S.moonP !== null) {
      var mx = W * (.05 + .9 * S.moonP), my = horizon + S.e / .6 * H * .5 - farDy * .3, mr = Math.max(11, H * .021);
      var mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 7);
      mg.addColorStop(0, 'rgba(200,215,255,.22)'); mg.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = mg; ctx.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
      ctx.drawImage(moonImg(mr), mx - mr - 2, my - mr - 2, (mr + 2) * 2, (mr + 2) * 2);
    }

    /* far snow range */
    ridge(far, 1, farDy); ctx.fillStyle = rgba(C.far); ctx.fill();
    ctx.save(); ridge(far, 1, farDy); ctx.clip();
    var snowA = .78 * D + .14 * N;
    ctx.fillStyle = 'rgba(' + (255) + ',' + (250 - 30 * S.dusk * D | 0) + ',' + (245 - 60 * S.dusk * D | 0) + ',' + snowA + ')';
    ctx.beginPath(); ctx.moveTo(-20, 0);
    var snowline = H * (1 - .56) + farDy;
    for (var i = 0; i < far.length; i++) ctx.lineTo(i / (far.length - 1) * (W + 40) - 20 + px * 10, Math.min(snowline + 6 * Math.sin(i * 1.3), H - far[i] * H + 30 + farDy));
    ctx.lineTo(W + 20, 0); ctx.closePath(); ctx.fill();
    /* aerial perspective */
    var ap = ctx.createLinearGradient(0, H * .3, 0, H);
    ap.addColorStop(0, rgba(C.m, 0)); ap.addColorStop(1, rgba(C.m, .45));
    ctx.fillStyle = ap; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* mid ridge */
    ridge(mid, 2, midDy); ctx.fillStyle = rgba(C.mid); ctx.fill();

    /* hazy mixed layer below its top */
    if (D > .02 && S.grow > .02) {
      ctx.beginPath(); ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += 6) ctx.lineTo(x, mlTop(x));
      ctx.lineTo(W, H); ctx.closePath();
      var hz = ctx.createLinearGradient(0, H * .3, 0, H);
      hz.addColorStop(0, 'rgba(236,212,166,' + (.30 * D * S.grow) + ')'); hz.addColorStop(1, 'rgba(236,212,166,' + (.10 * D * S.grow) + ')');
      ctx.fillStyle = hz; ctx.fill();
    }

    /* stable stratification: wavy isentropes */
    if (N > .02) {
      ctx.lineWidth = 1;
      for (var L = 0; L < 6; L++) {
        var base = H * (.22 + L * .075);
        ctx.strokeStyle = 'rgba(141,182,234,' + ((.09 + L * .02) * N).toFixed(3) + ')';
        ctx.beginPath();
        for (var x2 = 0; x2 <= W; x2 += 6) {
          var lee = smooth(W * ridgeU, W * 1.05, x2) + smooth(W * .5, W * .62, x2) * .5;
          var y2 = Math.min(base + Math.sin(x2 * .018 - frame * .012 + L) * (2 + 7 * lee), ground(x2) - 4);
          if (x2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
    }

    /* near terrain */
    nearPath();
    var ng = ctx.createLinearGradient(0, H * .45, 0, H);
    ng.addColorStop(0, rgba(C.n1)); ng.addColorStop(1, rgba(C.n2));
    ctx.fillStyle = ng; ctx.fill();
    ctx.save(); nearPath(); ctx.clip();
    ctx.strokeStyle = rgba(C.edge, .6); ctx.lineWidth = 2; line(ground, 0, W, 3); ctx.stroke();
    ctx.restore();

    /* trees on the ridge, for scale */
    ctx.fillStyle = rgba(C.tree);
    for (var tx = W * .76; tx < W * .995; tx += W * .011) {
      if (Math.abs(tx - W * ridgeU) < W * .02) continue;
      var gy = ground(tx), th = (9 + 7 * Math.abs(Math.sin(tx * .37))) * (W < 700 ? .7 : 1), tw = th * .34;
      ctx.beginPath(); ctx.moveTo(tx, gy - th); ctx.lineTo(tx + tw, gy + 1); ctx.lineTo(tx - tw, gy + 1); ctx.closePath(); ctx.fill();
    }

    /* cold-air pool */
    if (S.pool > .02) {
      var pt = poolTop(), vb = ground(W * valleyU);
      ctx.save(); nearPath(); ctx.rect(0, 0, W, H); ctx.clip('evenodd');
      var pg = ctx.createLinearGradient(0, pt, 0, vb);
      pg.addColorStop(0, 'rgba(120,170,235,0)'); pg.addColorStop(.35, 'rgba(120,170,235,' + .16 * S.pool + ')'); pg.addColorStop(1, 'rgba(150,195,250,' + .36 * S.pool + ')');
      ctx.fillStyle = pg; ctx.fillRect(W * .38, pt, W * .5, vb - pt + 2);
      ctx.restore();
    }

    /* boundary-layer lines */
    ctx.setLineDash([5, 6]); ctx.lineWidth = 1.3;
    if (S.grow > .02 && D > .02) { ctx.strokeStyle = 'rgba(176,108,18,' + (.8 * D) + ')'; line(mlTop, 0, W, 5); ctx.stroke(); }
    if (S.resid > .02) { ctx.strokeStyle = 'rgba(141,182,234,' + (.5 * S.resid) + ')'; line(residual, 0, W, 5); ctx.stroke(); }
    if (S.pool > .15) {
      var py = poolTop(); ctx.strokeStyle = 'rgba(176,214,255,' + (.7 * S.pool) + ')';
      ctx.beginPath(); var pen = false;
      for (var xp = W * .40; xp <= W * .84; xp += 3) { if (ground(xp) > py + 2) { if (!pen) { ctx.moveTo(xp, py); pen = true; } else ctx.lineTo(xp, py); } else pen = false; }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* cumulus over the ridge */
    if (S.cu > .02) {
      var grow = .7 + .3 * S.cu + .04 * Math.sin(frame * .006);
      cloud(W * (ridgeU - .01), mlTop(W * ridgeU) - 6, Math.max(26, W * .03) * grow, S.cu);
      cloud(W * .47, mlTop(W * .47) - 4, Math.max(18, W * .019) * grow, S.cu * .85);
    }

    /* thermals */
    if (S.therm > .02) {
      ctx.lineCap = 'round';
      for (var a1 = 0; a1 < thermals.length; a1++) {
        var p = thermals[a1];
        trail(p.trail, 'rgba(201,130,31,', .55 * S.therm, 1.5);
        ctx.fillStyle = 'rgba(214,140,36,' + (.75 * S.therm) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .8, 0, 7); ctx.fill();
      }
    }

    /* surface flow */
    var sf = Math.abs(S.flow);
    if (sf > .05) {
      var col = N > .5 ? 'rgba(182,212,255,' : 'rgba(255,255,255,';
      if (N > .5) ctx.globalCompositeOperation = 'lighter';
      for (var b1 = 0; b1 < surf.length; b1++) trail(surf[b1].trail, col, .75 * Math.min(1, sf * 1.4), 1.3);
      ctx.globalCompositeOperation = 'source-over';
    }

    birds(N);
    tower(N);
    label(N);
  }

  /* a few birds riding the daytime air */
  var flock = [];
  function birds(N) {
    var a = (1 - N) * (1 - S.dusk * .6);
    if (a < .05 || reduce) return;
    if (!flock.length) for (var i = 0; i < 7; i++) flock.push({ u: Math.random(), y: .13 + Math.random() * .2, v: .00018 + Math.random() * .0002, ph: Math.random() * 6.28, s: .75 + Math.random() * .6 });
    ctx.strokeStyle = 'rgba(38,56,64,' + (.6 * a) + ')'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var j = 0; j < flock.length; j++) {
      var b = flock[j]; b.u += b.v; if (b.u > 1.05) { b.u = -.05; b.y = .12 + Math.random() * .22; }
      var x = (.3 + b.u * .72) * W, y = H * b.y + Math.sin(frame * .011 + b.ph) * 9, w = 6.5 * b.s, f = Math.sin(frame * .15 + b.ph) * 3.4 * b.s;
      ctx.beginPath(); ctx.moveTo(x - w, y - f); ctx.quadraticCurveTo(x - w * .45, y - f * .25 - 2.2, x, y); ctx.quadraticCurveTo(x + w * .45, y - f * .25 - 2.2, x + w, y - f); ctx.stroke();
    }
  }

  var moonC = null, moonR = 0;
  function moonImg(mr) {
    if (moonC && moonR === mr) return moonC;
    moonR = mr; moonC = document.createElement('canvas');
    var sz = Math.ceil((mr + 2) * 2 * dpr); moonC.width = moonC.height = sz;
    var m = moonC.getContext('2d'); m.scale(dpr, dpr);
    var c = mr + 2;
    m.fillStyle = 'rgba(240,244,253,.97)'; m.beginPath(); m.arc(c, c, mr, 0, 7); m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.beginPath(); m.arc(c + mr * .45, c - mr * .25, mr * .9, 0, 7); m.fill();
    return moonC;
  }
  function cloud(x, y, r, a) {
    ctx.fillStyle = 'rgba(255,255,255,' + .94 * a + ')';
    ctx.beginPath();
    ctx.arc(x, y - r * .2, r * .62, 0, 7); ctx.arc(x - r * .62, y + r * .12, r * .44, 0, 7);
    ctx.arc(x + r * .6, y + r * .1, r * .48, 0, 7); ctx.arc(x + r * .1, y - r * .62, r * .46, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,212,222,' + .7 * a + ')';
    ctx.fillRect(x - r * 1.02, y + r * .1, r * 2.05, r * .42);
  }
  function trail(tr, col, a, w) {
    if (tr.length < 2 || a < .02) return;
    ctx.lineWidth = w;
    for (var i = 1; i < tr.length; i++) {
      ctx.strokeStyle = col + (a * i / tr.length).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke();
    }
  }
  var cupA = 0;
  function tower(N) {
    var x = W * ridgeU, gy = ground(x), h = Math.max(54, H * .095);
    var col = rgba(mix3([19, 34, 31], [201, 214, 236], N));
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - h); ctx.stroke();
    ctx.lineWidth = .7; ctx.globalAlpha = .5;
    ctx.beginPath(); ctx.moveTo(x, gy - h * .9); ctx.lineTo(x - h * .45, gy + 2); ctx.moveTo(x, gy - h * .9); ctx.lineTo(x + h * .45, gy + 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.2;
    [.07, .27, .53, .9].forEach(function (f) {
      var y = gy - h * f; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - 10, y, 1.8, 0, 7); ctx.fill();
    });
    /* cup anemometer spinning with the wind */
    cupA += reduce ? 0 : .04 + .2 * (S.therm + Math.abs(S.flow) * .5);
    var cy = gy - h - 5;
    ctx.lineWidth = 1;
    for (var k = 0; k < 3; k++) {
      var an = cupA + k * 2.094, ex = x + Math.cos(an) * 6, ey = cy + Math.sin(an) * 1.8;
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 1.4, 0, 7); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(x, gy - h); ctx.lineTo(x, cy); ctx.stroke();
    if (N > .5) {
      var on = reduce || (Math.floor(frame / 40) % 2) === 0;
      ctx.fillStyle = on ? 'rgba(255,90,80,' + N + ')' : 'rgba(255,90,80,.2)';
      ctx.beginPath(); ctx.arc(x, cy - 3, 2, 0, 7); ctx.fill();
    }
  }
  function label(N) {
    if (W < 700) return;
    ctx.font = '500 12px "Instrument Sans", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    var x = W * ridgeU, gy = ground(x), h = Math.max(54, H * .095), lx = W * .985;
    ctx.fillStyle = rgba(mix3([63, 81, 75], [174, 187, 208], N)); ctx.textAlign = 'left';
    ctx.fillText('flux tower', x + 10, gy - h + 4);
    ctx.textAlign = 'right';
    if (S.grow > .3 && N < .5) { ctx.fillStyle = 'rgba(164,100,15,' + Math.min(1, (S.grow - .3) * 3) * (1 - 2 * N) + ')'; ctx.fillText('mixed-layer top', lx, mlTop(lx) - 5); }
    if (S.resid > .3) { ctx.fillStyle = 'rgba(150,186,232,' + Math.min(1, (S.resid - .3) * 2) + ')'; ctx.fillText('residual layer', lx, residual(lx) - 5); }
    if (S.pool > .4) { ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(176,206,240,' + Math.min(1, (S.pool - .4) * 2) + ')'; ctx.fillText('cold-air pool', W * .555, poolTop() - 6); }
  }

  /* ---------------- update ---------------- */
  function step() {
    frame++;
    var night = S.flow < 0;
    var tv = .55 + S.therm;
    for (var i = 0; i < thermals.length; i++) {
      var p = thermals[i]; p.life++;
      p.y -= p.v * tv * (1 + .6 * Math.min(1, p.life / 120));
      p.x = p.x0 + Math.sin(p.life * .03 + p.ph) * 6 + p.life * .05;
      p.trail.push([p.x, p.y]); if (p.trail.length > 16) p.trail.shift();
      if (p.y < mlTop(p.x) + 2 || p.x > W) spawnThermal(p, false);
    }
    var sp = Math.abs(S.flow);
    for (var j = 0; j < surf.length; j++) {
      var q = surf[j], s = slope(q.x), dir = s > 0 ? 1 : -1;
      var mv = (night ? 1 : -1) * dir, steep = Math.min(1.6, Math.abs(s) * 1.6 + .25);
      q.x += mv * q.v * steep * (night ? 1.15 : 1) * (.25 + sp);
      q.age++;
      var gy = ground(q.x), y = gy - q.off * (night ? .45 : 1);
      if (night && S.pool > .2 && gy > poolTop() && Math.abs(s) < .25) y = Math.max(poolTop() + 6, y);
      q.trail.push([q.x, y]); if (q.trail.length > (night ? 15 : 12)) q.trail.shift();
      if (q.x < W * .36 || q.x > W || (Math.abs(s) < .06 && q.age > 40) || q.age > 420) spawnSurf(q, false);
    }
    px += (pxT - px) * .05;
  }

  /* ---------------- time control ---------------- */
  function ease(k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function goTo(targetHour, ms) {
    var h = hour(), dh = ((targetHour - h) % 24 + 24) % 24;
    if (dh < .05) return;
    anim = { from: T, to: T + dh, t0: performance.now(), ms: reduce ? 1 : (ms || 1500 + dh * 110) };
  }
  function tickTime(now) {
    if (anim) {
      var k = Math.min(1, (now - anim.t0) / anim.ms);
      T = lerp(anim.from, anim.to, ease(k));
      if (k >= 1) { anim = null; coupling = true; }
    } else if (playing) {
      T += 1 / 50;                              /* about 50 seconds for a full day at 60 fps */
    } else if (live) {
      var was = hour();
      T = istHour() + Math.floor(T / 24) * 24;
      if (hour() < was) daySun();              /* past midnight: new day, new sunrise and sunset */
    }
  }

  /* keep the page palette in step with the scene */
  var lastNight = null;
  function couple() {
    var n = S.N > .5;
    if (n === lastNight) return;
    lastNight = n;
    if (!coupling) return;
    var want = n ? 'night' : 'day';
    if (document.documentElement.getAttribute('data-mode') !== want && window.siteSetMode) window.siteSetMode(want, false, 'scene');
  }

  /* ---------------- controls ---------------- */
  var ui = document.querySelector('[data-scene-ui]');
  var range = ui && ui.querySelector('[data-hour]'), clock = ui && ui.querySelector('[data-hour-out]');
  var playBtn = ui && ui.querySelector('[data-play]'), nowBtn = ui && ui.querySelector('[data-now]');
  var phaseEls = ui ? ui.querySelectorAll('[data-phase]') : [];
  var lastPhase = '';
  function fmtH(h) { var m = Math.round(h * 60) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
  function syncUI() {
    if (!ui) return;
    var h = hour();
    if (document.activeElement !== range) range.value = Math.round(h * 60);
    range.style.setProperty('--p', (h / 24 * 100).toFixed(2) + '%');
    clock.textContent = fmtH(h) + ' IST' + (live && !anim && !playing ? ', now' : '');
    if (S.phase !== lastPhase) {
      lastPhase = S.phase;
      phaseEls.forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-phase') === S.phase); });
    }
    nowBtn.hidden = live && !anim && !playing;
  }
  if (ui) {
    range.addEventListener('input', function () {
      live = false; playing = false; anim = null; coupling = true; setPlay();
      T = Math.floor(T / 24) * 24 + range.value / 60;
    });
    playBtn.addEventListener('click', function () { playing = !playing; live = false; anim = null; coupling = true; setPlay(); });
    nowBtn.addEventListener('click', function () { playing = false; setPlay(); var target = istHour(); anim = null; coupling = true; goTo(target, 1400); live = true; });
    function setPlay() { playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false'); playBtn.setAttribute('aria-label', playing ? 'Pause the day cycle' : 'Play the day cycle'); }
    setPlay();
  }

  /* the header switch moves the scene to midday or to the small hours */
  window.addEventListener('modechange', function (e) {
    var d = e.detail || {};
    if (d.source !== 'user') return;
    live = false; playing = false; coupling = false;
    if (playBtn) playBtn.setAttribute('aria-pressed', 'false');
    goTo(d.mode === 'night' ? 1 : 13);
  });

  /* a switch flipped earlier in this visit that disagrees with the clock wins at load */
  (function () {
    var pref = null; try { pref = sessionStorage.getItem('ss-mode'); } catch (e) {}
    state();
    if (pref === 'day' && S.N > .5) { T = Math.floor(T / 24) * 24 + 13; live = false; }
    if (pref === 'night' && S.N < .5) { T = Math.floor(T / 24) * 24 + 1; live = false; }
    state(); lastNight = null;
  })();

  /* ---------------- plumbing ---------------- */
  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, r.width); H = Math.max(240, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTerrain(); state(); buildParticles();
    if (reduce) for (var i = 0; i < 240; i++) step();
    draw(); syncUI();
  }
  var lastSlow = 0;
  function loop(now) {
    tickTime(now);
    if (visible && running) {
      if (!reduce) { step(); draw(); }
      else if (anim || now - lastSlow > 1000) { draw(); lastSlow = now; }
      couple(); syncUI();
    }
    requestAnimationFrame(loop);
  }
  window.addEventListener('scroll', function () { scrollY = Math.min(window.scrollY, H); }, { passive: true });
  cv.parentNode.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') pxT = (e.clientX / window.innerWidth - .5) * 2; });
  var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(cv); else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
  document.addEventListener('visibilitychange', function () { running = !document.hidden; });
  resize(); requestAnimationFrame(loop);
})();
