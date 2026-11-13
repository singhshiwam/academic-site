/* Forecast for where the visitor is.

   Location, every visit: the device's own position if the visitor allows it,
   otherwise an approximate city from their connection (ipapi.co, then geojs.io).
   The last shared position is kept only to draw something at once while the
   fresh one arrives.

   Data, no keys:
   - weather: Open-Meteo forecast API (best-match model blend), hourly and daily
   - temperature range: Google WeatherNext 2 ensemble through Open-Meteo's ensemble API
   - air quality: CAMS through Open-Meteo's air quality API
   Coordinates are rounded to two decimals (about 1 km) before they are sent. */
(function () {
  'use strict';
  var sec = document.getElementById('forecast');
  if (!sec) return;
  function $(s) { return sec.querySelector(s); }
  var box = $('[data-fc]'), placeEl = $('[data-fc-place]'), howEl = $('[data-fc-how]'), locBtn = $('[data-fc-locate]');
  var alertsEl = $('[data-fc-alerts]'), nowEl = $('[data-fc-now]'), plot = $('[data-fc-plot]'), legend = $('[data-fc-legend]');
  var tableEl = $('[data-fc-table]'), daysEl = $('[data-fc-days]'), airEl = $('[data-fc-air]'), noteEl = $('[data-fc-note]'), tabs = $('[data-fc-tabs]');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var D = null, AQ = null, GW = null, LOC = null, HOW = '', VAR = 't', seq = 0, lastFetch = 0, blocked = false;
  var DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function num(v, d) { return v == null || isNaN(v) ? '--' : (+v).toFixed(d || 0).replace('-', '\u2212'); }
  function compass(d) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8]; }
  function hm(s) { return s ? s.slice(11, 16) : '--'; }
  function dayNo(s) { var p = s.slice(0, 10).split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]) / 864e5; }
  function dow(s) { return new Date(dayNo(s) * 864e5).getUTCDay(); }
  /* "today", "tomorrow" or the weekday, relative to the forecast's own clock */
  function dayWord(s) { var k = dayNo(s) - dayNo(D.current.time); return k === 0 ? 'today' : k === 1 ? 'tomorrow' : 'on ' + DAYL[dow(s)]; }
  function arrow(dir, cls) {
    return '<svg class="fc-arrow ' + (cls || '') + '" viewBox="0 0 16 16" style="transform:rotate(' + ((+dir || 0) + 180) + 'deg)" aria-hidden="true"><path d="M8 1 L12 12 L8 9.4 L4 12 Z" fill="currentColor"/></svg>';
  }

  /* ---------- WMO weather codes ---------- */
  var WMO = {
    0: ['Clear sky', 'sun'], 1: ['Mainly clear', 'sun'], 2: ['Partly cloudy', 'part'], 3: ['Overcast', 'cloud'],
    45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
    51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'], 56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
    61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
    71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
    80: ['Light showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Violent showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'],
    95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with hail', 'storm']
  };
  function wmo(c) { return WMO[c] || ['', 'cloud']; }
  var CLOUD = '<path d="M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.6 4.2 4.2 0 0 0 7 18Z"/>';
  var ICON = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/>',
    part: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.3 4.3l1.2 1.2M12.7 4.3l-1.2 1.2"/><path d="M9.5 20h8a3.3 3.3 0 0 0 .5-6.56A4.6 4.6 0 0 0 9.6 13 3.5 3.5 0 0 0 9.5 20Z"/>',
    cloud: CLOUD,
    fog: '<path d="M7 14h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 5.6 4.2 4.2 0 0 0 7 14Z"/><path d="M5 17.5h14M7 21h10"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 6.6 4.2 4.2 0 0 0 7 15Z"/><path d="M8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3"/>',
    snow: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 6.6 4.2 4.2 0 0 0 7 15Z"/><path d="M8 19h.01M12 19h.01M16 19h.01M10 21.5h.01M14 21.5h.01"/>',
    storm: '<path d="M7 14h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 5.6 4.2 4.2 0 0 0 7 14Z"/><path d="M12.5 15.5l-2.5 3.5h3l-2 3.5"/>'
  };
  function icon(name) { return '<svg class="fc-ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[name] || ICON.cloud) + '</svg>'; }

  /* ---------- heading: where, and how we know ---------- */
  function head(msg) {
    placeEl.textContent = LOC && LOC.name ? LOC.name : LOC ? Math.abs(LOC.lat).toFixed(2) + '°' + (LOC.lat < 0 ? 'S' : 'N') + ', ' + Math.abs(LOC.lon).toFixed(2) + '°' + (LOC.lon < 0 ? 'W' : 'E') : 'Finding your location';
    var t = msg || (HOW === 'device' ? 'From your device location.' :
      HOW === 'last' ? 'Your last shared location. Updating.' :
      HOW === 'ip' ? 'Estimated from your internet connection, which can be a different city.' : '');
    if (blocked && HOW !== 'device' && !msg) t += ' Location is blocked for this site in your browser settings.';
    howEl.textContent = t;
    locBtn.hidden = HOW === 'device' || blocked || !navigator.geolocation;
  }

  /* ---------- fetch ---------- */
  function load(loc, how) {
    LOC = loc; HOW = how; head();
    var run = ++seq, q = 'latitude=' + loc.lat.toFixed(2) + '&longitude=' + loc.lon.toFixed(2);
    box.setAttribute('aria-busy', 'true');
    var f = getJSON('https://api.open-meteo.com/v1/forecast?' + q +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day' +
      '&hourly=temperature_2m,precipitation,precipitation_probability,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset' +
      '&forecast_days=7&timezone=auto&wind_speed_unit=ms');
    var a = getJSON('https://air-quality-api.open-meteo.com/v1/air-quality?' + q +
      '&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=us_aqi&forecast_days=3&timezone=auto').catch(function () { return null; });
    var g = getJSON('https://ensemble-api.open-meteo.com/v1/ensemble?' + q +
      '&hourly=temperature_2m&forecast_days=3&timezone=auto&models=google_weathernext2_ensemble').catch(function () { return null; });
    return f.then(function (d) {
      if (run !== seq) return;
      if (!d || !d.current || !d.hourly || !d.daily) throw new Error('shape');
      D = d; AQ = null; GW = null; lastFetch = Date.now();
      box.classList.add('ready'); box.classList.remove('failed'); box.removeAttribute('aria-busy');
      drawNow(); drawDays(); chart(true); table(); drawAir(); alerts(); notes();
      a.then(function (x) { if (run !== seq) return; AQ = x && x.current ? x : false; drawAir(); alerts(); notes(); });
      g.then(function (x) { if (run !== seq) return; GW = members(x); if (GW) { if (VAR === 't') chart(false); notes(); } });
    }).catch(function () { if (run === seq) fail(); });
  }
  function fail() {
    box.removeAttribute('aria-busy');
    if (D) return;                       /* keep what is on screen */
    box.classList.add('failed');
    alertsEl.innerHTML = '';
    nowEl.innerHTML = '<p class="fc-msg">The forecast could not be loaded right now. <button type="button" class="loc-btn" data-fc-retry>Try again</button></p>';
  }
  sec.addEventListener('click', function (e) { if (e.target.closest('[data-fc-retry]')) start(); });

  /* ensemble: every hourly key that starts with temperature_2m is one member */
  function members(x) {
    if (!x || !x.hourly || !x.hourly.time) return null;
    var keys = Object.keys(x.hourly).filter(function (k) { return k.indexOf('temperature_2m') === 0; });
    if (keys.length < 5) return null;
    var out = {};
    x.hourly.time.forEach(function (t, i) {
      var lo = Infinity, hi = -Infinity, s = 0, n = 0;
      keys.forEach(function (k) { var v = x.hourly[k][i]; if (v == null) return; if (v < lo) lo = v; if (v > hi) hi = v; s += v; n++; });
      if (n >= 5) out[t] = [lo, hi, s / n];
    });
    out.n = keys.length;
    return out;
  }

  /* ---------- now ---------- */
  function window48() {
    var h = D.hourly, i0 = h.time.indexOf(D.current.time.slice(0, 13) + ':00');
    if (i0 < 0) i0 = 0;
    return { i0: i0, n: Math.min(48, h.time.length - i0) };
  }
  function drawNow() {
    var c = D.current, w = wmo(c.weather_code), win = window48(), h = D.hourly, rain = 0, pop = 0;
    for (var i = win.i0; i < win.i0 + Math.min(24, win.n); i++) { rain += h.precipitation[i] || 0; pop = Math.max(pop, h.precipitation_probability ? h.precipitation_probability[i] || 0 : 0); }
    var ic = w[1] === 'sun' && c.is_day === 0 ? 'moon' : w[1];
    nowEl.innerHTML =
      '<p class="fc-k">Now, ' + hm(c.time) + ' local time</p>' +
      '<p class="fc-big">' + icon(ic) + '<span>' + num(c.temperature_2m, 1) + '<small>°C</small></span></p>' +
      '<p class="fc-desc">' + esc(w[0]) + (w[0] ? '. ' : '') + 'Feels like ' + num(c.apparent_temperature, 0) + ' °C.</p>' +
      '<dl class="fc-stats">' +
      '<div><dt>Pressure, sea level</dt><dd>' + num(c.pressure_msl, 0) + '<small>hPa</small></dd></div>' +
      '<div><dt>Wind at 10 m</dt><dd>' + arrow(c.wind_direction_10m) + num(c.wind_speed_10m, 1) + '<small>m/s ' + compass(c.wind_direction_10m) + ', ' + num(c.wind_direction_10m, 0) + '°</small></dd></div>' +
      '<div><dt>Gusts</dt><dd>' + num(c.wind_gusts_10m, 1) + '<small>m/s</small></dd></div>' +
      '<div><dt>Rain, next 24 hours</dt><dd>' + num(rain, 1) + '<small>mm</small><em>' + num(pop, 0) + '% chance</em></dd></div>' +
      '<div><dt>Humidity</dt><dd>' + num(c.relative_humidity_2m, 0) + '<small>%</small></dd></div>' +
      '<div><dt>Cloud cover</dt><dd>' + num(c.cloud_cover, 0) + '<small>%</small></dd></div>' +
      '</dl>' +
      '<p class="fc-sun">Sunrise ' + hm(D.daily.sunrise[0]) + ', sunset ' + hm(D.daily.sunset[0]) + '</p>';
  }

  /* ---------- seven days ---------- */
  function drawDays() {
    var d = D.daily, lo = Math.min.apply(null, d.temperature_2m_min), hi = Math.max.apply(null, d.temperature_2m_max), span = (hi - lo) || 1;
    daysEl.innerHTML = d.time.map(function (t, i) {
      var w = wmo(d.weather_code[i]), mn = d.temperature_2m_min[i], mx = d.temperature_2m_max[i], r = d.precipitation_sum[i] || 0;
      var p = t.split('-');
      return '<li style="--i:' + i + '">' +
        '<p class="d"><b>' + (i === 0 ? 'Today' : DAY3[dow(t)]) + '</b><span>' + (+p[2]) + ' ' + MON[p[1] - 1] + '</span></p>' +
        '<p class="w">' + icon(w[1]) + '<span>' + esc(w[0]) + '</span></p>' +
        '<p class="t" title="Minimum and maximum temperature"><span>' + num(mn, 0) + '°</span><i><em style="left:' + ((mn - lo) / span * 100).toFixed(1) + '%;right:' + ((hi - mx) / span * 100).toFixed(1) + '%"></em></i><span>' + num(mx, 0) + '°</span></p>' +
        '<p class="r">' + (r < 0.1 ? 'Dry' : num(r, 1) + ' mm') + '</p>' +
        '<p class="wd">' + arrow(d.wind_direction_10m_dominant[i]) + num(d.wind_speed_10m_max[i], 1) + ' m/s ' + compass(d.wind_direction_10m_dominant[i]) + '</p>' +
        '</li>';
    }).join('');
  }

  /* ---------- hourly chart ---------- */
  var VARS = {
    t: { cap: 'Air temperature at 2 m, in °C' },
    r: { cap: 'Rain in each hour, in mm' },
    w: { cap: 'Wind at 10 m, in m/s. Arrows show where the wind is blowing to.' },
    p: { cap: 'Pressure at mean sea level, in hPa' }
  };
  function ticks(lo, hi, n) {
    var span = (hi - lo) || 1, raw = span / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), m = raw / p;
    var step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p, a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
    for (var v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(6));
    return out;
  }
  var hover = null;
  function chart(animate) {
    if (!D) return;
    var h = D.hourly, win = window48(), i0 = win.i0, N = win.n;
    if (N < 2) { plot.innerHTML = ''; return; }
    var T = h.time.slice(i0, i0 + N);
    function sl(k) { return h[k] ? h[k].slice(i0, i0 + N) : []; }
    var W = Math.max(280, plot.clientWidth || 600), small = W < 520, H = small ? 236 : 286;
    var m = { l: 44, r: 16, t: 22, b: VAR === 'w' ? 54 : 30 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    var bars = VAR === 'r', A = [], B = null, band = null, lo, hi;
    if (VAR === 't') {
      A = sl('temperature_2m'); lo = Math.min.apply(null, A); hi = Math.max.apply(null, A);
      if (GW) {
        band = T.map(function (t) { return GW[t] || null; });
        if (band.filter(Boolean).length < N * .6) band = null;
        else band.forEach(function (b) { if (b) { lo = Math.min(lo, b[0]); hi = Math.max(hi, b[1]); } });
      }
      lo -= .6; hi += .9;
    } else if (VAR === 'r') { A = sl('precipitation'); lo = 0; hi = Math.max(1, Math.max.apply(null, A)); }
    else if (VAR === 'w') { A = sl('wind_speed_10m'); B = sl('wind_gusts_10m'); lo = 0; hi = Math.max(2, Math.max.apply(null, A.concat(B))); }
    else { A = sl('pressure_msl'); lo = Math.min.apply(null, A) - .5; hi = Math.max.apply(null, A) + .5; }
    var tk = ticks(lo, hi, small ? 3 : 4), y0 = tk[0], y1 = tk[tk.length - 1];
    function X(i) { return m.l + (bars ? (i + .5) * pw / N : i * pw / (N - 1)); }
    function Y(v) { return m.t + ph * (1 - (v - y0) / (y1 - y0)); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">';
    /* grid and y labels */
    tk.forEach(function (v) {
      s += '<line class="g' + (bars && v === 0 ? ' base' : '') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/>' +
        '<text class="yl" x="' + (m.l - 8) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + String(v).replace('-', '\u2212') + '</text>';
    });
    /* x labels: every six hours, the weekday at midnight */
    var stepH = small ? 12 : 6;
    T.forEach(function (t, i) {
      var hr = +t.slice(11, 13);
      if (hr === 0 && i > 0) s += '<line class="day" x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ph) + '"/>';
      if (hr % stepH !== 0) return;
      if (X(i) < m.l + 14 && hr !== 0) return;
      s += '<text class="xl' + (hr === 0 ? ' dl' : '') + '" x="' + X(i).toFixed(1) + '" y="' + (m.t + ph + 18) + '" text-anchor="middle">' + (hr === 0 ? DAY3[dow(t)] : t.slice(11, 16)) + '</text>';
    });
    function path(arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(''); }
    if (band) {
      var up = '', dn = '', mid = '', started = false;
      band.forEach(function (b, i) { if (!b) return; up += (started ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(b[1]).toFixed(1); mid += (started ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(b[2]).toFixed(1); dn = 'L' + X(i).toFixed(1) + ' ' + Y(b[0]).toFixed(1) + dn; started = true; });
      s += '<path class="band" d="' + up + dn + 'Z"/><path class="ln2" d="' + mid + '"/>';
    }
    if (bars) {
      var bw = Math.max(2, pw / N - 2);
      A.forEach(function (v, i) {
        if (!(v > 0)) return;
        var top = Y(v), ht = Math.max(1.5, Y(0) - top), r = Math.min(3, bw / 2, ht);
        s += '<path class="bar" style="--i:' + i + '" data-i="' + i + '" d="M' + (X(i) - bw / 2).toFixed(1) + ' ' + Y(0).toFixed(1) + 'V' + (top + r).toFixed(1) + 'q0 -' + r + ' ' + r + ' -' + r + 'h' + (bw - 2 * r).toFixed(1) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + Y(0).toFixed(1) + 'Z"/>';
      });
      if (Math.max.apply(null, A) <= 0) s += '<text class="none" x="' + (m.l + pw / 2) + '" y="' + (m.t + ph / 2) + '" text-anchor="middle">No rain expected in the next ' + N + ' hours</text>';
    } else {
      if (B) s += '<path class="ln gust" d="' + path(B) + '"/>';
      s += '<path class="ln main" pathLength="1" d="' + path(A) + '"/>';
    }
    /* direct labels: only the extremes */
    function mark(i, v, txt, above) {
      var x = X(i), y = Y(v), tx = Math.max(m.l + 16, Math.min(W - m.r - 16, x));
      return '<circle class="pt" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4"/><text class="vl" x="' + tx.toFixed(1) + '" y="' + (y + (above ? -10 : 18)).toFixed(1) + '" text-anchor="middle">' + txt + '</text>';
    }
    if (VAR === 't' || VAR === 'p') {
      var imx = A.indexOf(Math.max.apply(null, A)), imn = A.indexOf(Math.min.apply(null, A)), dp = VAR === 't' ? 1 : 0;
      s += mark(imx, A[imx], num(A[imx], dp), true); if (imn !== imx) s += mark(imn, A[imn], num(A[imn], dp), false);
    } else if (VAR === 'w' && B && B.length) {
      var ig = B.indexOf(Math.max.apply(null, B)); s += mark(ig, B[ig], 'gust ' + num(B[ig], 1), true);
    } else if (VAR === 'r' && Math.max.apply(null, A) > 0) {
      var ir = A.indexOf(Math.max.apply(null, A));
      s += '<text class="vl" x="' + Math.max(m.l + 18, Math.min(W - m.r - 18, X(ir))).toFixed(1) + '" y="' + (Y(A[ir]) - 7).toFixed(1) + '" text-anchor="middle">' + num(A[ir], 1) + '</text>';
    }
    if (VAR === 'w') {
      var dir = sl('wind_direction_10m'), every = small ? 6 : 3;
      for (var i = 0; i < N; i += every) s += '<g class="wa" transform="translate(' + X(i).toFixed(1) + ' ' + (H - 13) + ') rotate(' + ((dir[i] || 0) + 180) + ')"><path d="M0 -6.5L4.2 5 0 2.6 -4.2 5Z"/></g>';
    }
    s += '<g class="cross" visibility="hidden"><line y1="' + m.t + '" y2="' + (m.t + ph) + '"/><circle class="c2" r="4"/><circle class="c1" r="4.5"/></g></svg><div class="fc-tip" hidden></div>';
    plot.innerHTML = s;
    plot.classList.toggle('anim', !!animate && !reduce);
    plot.setAttribute('aria-label', VARS[VAR].cap + ', next ' + N + ' hours, from ' + num(Math.min.apply(null, A), 1) + ' to ' + num(Math.max.apply(null, A), 1) + '. Use the left and right arrow keys to read values, or open the table below.');

    /* legend: a caption always, keys only when there are two series */
    var L = '<span class="cap">' + esc(VARS[VAR].cap) + '</span>';
    if (VAR === 't' && band) L += '<span class="key"><i class="k1"></i>Open-Meteo forecast</span><span class="key"><i class="k2"></i>Google WeatherNext 2: mean and range of ' + GW.n + ' ensemble members</span>';
    if (VAR === 'w') L += '<span class="key"><i class="k1"></i>Wind speed</span><span class="key"><i class="k3"></i>Gusts</span>';
    legend.innerHTML = L;

    /* hover and keyboard: one readout for everything at that hour */
    var cross = plot.querySelector('.cross'), cl = cross.querySelector('line'), c1 = cross.querySelector('.c1'), c2 = cross.querySelector('.c2'), tip = plot.querySelector('.fc-tip');
    var pop = sl('precipitation_probability'), dirs = sl('wind_direction_10m'), cur = -1;
    function row(key, label, val) { return '<p><i class="' + key + '"></i><b>' + val + '</b><span>' + label + '</span></p>'; }
    function show(i) {
      i = Math.max(0, Math.min(N - 1, i)); cur = i;
      var x = X(i), t = T[i];
      cross.setAttribute('visibility', 'visible'); cl.setAttribute('x1', x); cl.setAttribute('x2', x);
      if (bars) { c1.setAttribute('visibility', 'hidden'); } else { c1.setAttribute('cx', x); c1.setAttribute('cy', Y(A[i])); }
      var second = B ? B[i] : band && band[i] ? band[i][2] : null;
      if (second == null) c2.setAttribute('visibility', 'hidden'); else { c2.setAttribute('visibility', 'visible'); c2.setAttribute('class', 'c2 ' + (B ? 'gust' : 'gw')); c2.setAttribute('cx', x); c2.setAttribute('cy', Y(second)); }
      plot.querySelectorAll('.bar.on').forEach(function (b) { b.classList.remove('on'); });
      var bar = bars && plot.querySelector('.bar[data-i="' + i + '"]'); if (bar) bar.classList.add('on');
      var k = dayNo(t) - dayNo(D.current.time), hd = '<p class="h">' + (k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : DAYL[dow(t)]) + ', ' + t.slice(11, 16) + '</p>', body;
      if (VAR === 't') body = row('k1', '°C' + (band ? ', Open-Meteo' : ''), num(A[i], 1)) + (band && band[i] ? row('k2', '°C, Google mean', num(band[i][2], 1)) + row('k2b', '°C, Google range', num(band[i][0], 1) + ' to ' + num(band[i][1], 1)) : '');
      else if (VAR === 'r') body = row('k4', 'mm', num(A[i], 1)) + (pop.length ? row('', 'chance of rain', num(pop[i], 0) + '%') : '');
      else if (VAR === 'w') body = row('k1', 'm/s wind', num(A[i], 1)) + row('k3', 'm/s gusts', num(B[i], 1)) + row('', 'from ' + compass(dirs[i]), num(dirs[i], 0) + '°');
      else body = row('k1', 'hPa', num(A[i], 1));
      tip.innerHTML = hd + body; tip.hidden = false;
      var tw = tip.offsetWidth, left = x + 14; if (left + tw > W - 4) left = x - tw - 14;
      tip.style.left = Math.max(4, left) + 'px'; tip.style.top = (m.t + 4) + 'px';
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; cur = -1; plot.querySelectorAll('.bar.on').forEach(function (b) { b.classList.remove('on'); }); }
    function at(e) { var r = plot.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width) - m.l; return bars ? Math.floor(px / (pw / N)) : Math.round(px / (pw / (N - 1))); }
    hover = { show: show, hide: hide, at: at, get cur() { return cur; }, n: N };
  }
  plot.addEventListener('pointermove', function (e) { if (hover) hover.show(hover.at(e)); });
  plot.addEventListener('pointerdown', function (e) { if (hover) hover.show(hover.at(e)); });
  plot.addEventListener('pointerleave', function (e) { if (hover && e.pointerType === 'mouse') hover.hide(); });
  plot.addEventListener('blur', function () { if (hover) hover.hide(); });
  plot.addEventListener('keydown', function (e) {
    if (!hover) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); hover.show((hover.cur < 0 ? 0 : hover.cur) + (e.key === 'ArrowRight' ? 1 : -1)); }
    else if (e.key === 'Escape') hover.hide();
  });
  if (window.sitePill) window.sitePill(tabs);
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
    tabs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    VAR = b.getAttribute('data-v'); chart(true);
  });
  var rz = 0, lastW = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (plot.clientWidth !== lastW) { lastW = plot.clientWidth; chart(false); } }, 160); });

  /* ---------- the same numbers as a table ---------- */
  function table() {
    var h = D.hourly, win = window48(), rows = '';
    for (var i = win.i0; i < win.i0 + win.n; i += 3) {
      var t = h.time[i];
      rows += '<tr><th scope="row">' + DAY3[dow(t)] + ' ' + t.slice(11, 16) + '</th><td>' + num(h.temperature_2m[i], 1) + '</td><td>' + num(h.precipitation[i], 1) + '</td><td>' + (h.precipitation_probability ? num(h.precipitation_probability[i], 0) : '--') + '</td><td>' + num(h.wind_speed_10m[i], 1) + '</td><td>' + num(h.wind_gusts_10m[i], 1) + '</td><td>' + compass(h.wind_direction_10m[i]) + ' ' + num(h.wind_direction_10m[i], 0) + '°</td><td>' + num(h.pressure_msl[i], 0) + '</td></tr>';
    }
    tableEl.innerHTML = '<table><thead><tr><th scope="col">Local time</th><th scope="col">Temp, °C</th><th scope="col">Rain, mm</th><th scope="col">Chance, %</th><th scope="col">Wind, m/s</th><th scope="col">Gust, m/s</th><th scope="col">From</th><th scope="col">Pressure, hPa</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ---------- air quality ---------- */
  var AQI = [[50, 'Good', 'good'], [100, 'Moderate', 'mod'], [150, 'Unhealthy for sensitive groups', 'usg'], [200, 'Unhealthy', 'unh'], [300, 'Very unhealthy', 'vun'], [9999, 'Hazardous', 'haz']];
  function aqiCat(v) { for (var i = 0; i < AQI.length; i++) if (v <= AQI[i][0]) return AQI[i]; return AQI[5]; }
  /* WHO 2021 guideline levels: 24-hour means, 8-hour for ozone. In µg/m³. */
  var POLL = [['pm2_5', 'PM<sub>2.5</sub>', 'Fine particles', 15], ['pm10', 'PM<sub>10</sub>', 'Coarse particles', 45], ['ozone', 'O<sub>3</sub>', 'Ozone', 100],
    ['nitrogen_dioxide', 'NO<sub>2</sub>', 'Nitrogen dioxide', 25], ['sulphur_dioxide', 'SO<sub>2</sub>', 'Sulphur dioxide', 40], ['carbon_monoxide', 'CO', 'Carbon monoxide', 4000]];
  function aqPeak() {
    if (!AQ || !AQ.hourly || !AQ.hourly.us_aqi) return null;
    var t = AQ.hourly.time, i0 = t.indexOf(AQ.current.time.slice(0, 13) + ':00'); if (i0 < 0) i0 = 0;
    var best = -1, bi = -1;
    for (var i = i0; i < Math.min(t.length, i0 + 24); i++) { var v = AQ.hourly.us_aqi[i]; if (v != null && v > best) { best = v; bi = i; } }
    return bi < 0 ? null : { v: best, t: t[bi] };
  }
  function drawAir() {
    if (AQ === null) { airEl.innerHTML = '<p class="fc-msg">Loading air quality</p>'; return; }
    if (!AQ) { airEl.innerHTML = '<p class="fc-msg">Air quality data could not be loaded for this place.</p>'; return; }
    var c = AQ.current, v = c.us_aqi, cat = aqiCat(v), pk = aqPeak();
    /* marker position on a scale drawn 0 to 400, with the class widths to scale */
    var pos = Math.min(100, Math.max(0, v / 400 * 100));
    var left = '<div class="aq-main"><p class="fc-k">Air quality now, US AQI</p>' +
      '<p class="aq-n" data-c="' + cat[2] + '"><span>' + num(v, 0) + '</span><b><i></i>' + cat[1] + '</b></p>' +
      '<div class="aq-scale" aria-hidden="true"><i data-c="good"></i><i data-c="mod"></i><i data-c="usg"></i><i data-c="unh"></i><i data-c="vun"></i><i data-c="haz"></i><em style="left:' + pos.toFixed(1) + '%"></em></div>' +
      '<p class="aq-ticks" aria-hidden="true"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>300</span><span>400+</span></p>' +
      (pk ? '<p class="aq-pk">Highest in the next 24 hours: <b>' + num(pk.v, 0) + '</b> (' + aqiCat(pk.v)[1].toLowerCase() + ') around ' + hm(pk.t) + ' ' + dayWordAQ(pk.t) + '.</p>' : '') + '</div>';
    var rows = POLL.map(function (p) {
      var x = c[p[0]]; if (x == null) return '';
      var ratio = x / p[3], co = p[0] === 'carbon_monoxide';
      return '<li' + (ratio > 1 ? ' class="over"' : '') + '><p class="n"><b>' + p[1] + '</b><span>' + p[2] + '</span></p>' +
        '<p class="v">' + (co ? num(x / 1000, 2) : num(x, x < 10 ? 1 : 0)) + '<small>' + (co ? 'mg/m³' : 'µg/m³') + '</small></p>' +
        '<div class="b" aria-hidden="true"><i style="width:' + Math.min(100, ratio * 25).toFixed(1) + '%"></i><em></em></div>' +
        '<p class="x">' + (ratio > 1 ? num(ratio, 1) + ' times the WHO guideline' : 'Within the WHO guideline') + '</p></li>';
    }).join('');
    airEl.innerHTML = left + '<ul class="aq-list">' + rows + '</ul>';
  }
  function dayWordAQ(s) { var k = dayNo(s) - dayNo(AQ.current.time); return k === 0 ? 'today' : k === 1 ? 'tomorrow' : 'on ' + DAYL[dow(s)]; }

  /* ---------- advisories, worked out from the forecast ---------- */
  var LV = { watch: 'Watch', warn: 'Warning', severe: 'Severe' }, ORDER = { severe: 0, warn: 1, watch: 2 };
  var TRI = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 18.5 17h-17Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 8v4.2M10 14.6v.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var OK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.4 10.3l2.4 2.4 4.8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function alerts() {
    if (!D) return;
    var out = [], d = D.daily, h = D.hourly, win = window48();
    function add(l, head, text) { out.push({ l: l, h: head, t: text }); }
    /* by day: today and the next two days. One line per kind: the worst day leads, the others are named after it. */
    var kinds = {};
    function day(kind, l, head, val, text, when, worse) {
      var k = kinds[kind] || (kinds[kind] = { days: [] });
      k.days.push(when);
      if (!k.l || ORDER[l] < ORDER[k.l] || (l === k.l && worse(val, k.val))) { k.l = l; k.h = head; k.val = val; k.t = text; k.when = when; }
    }
    function more(a, b) { return a > b; } function less(a, b) { return a < b; }
    for (var i = 0; i < Math.min(3, d.time.length); i++) {
      var when = dayWord(d.time[i]), r = d.precipitation_sum[i] || 0, g = d.wind_gusts_10m_max[i] || 0, mx = d.temperature_2m_max[i], mn = d.temperature_2m_min[i];
      /* India Meteorological Department rainfall classes for 24 hours */
      if (r >= 64.5) day('rain', r >= 115.6 ? 'severe' : 'warn', r >= 204.5 ? 'Extremely heavy rain' : r >= 115.6 ? 'Very heavy rain' : 'Heavy rain', r, num(r, 0) + ' mm forecast', when, more);
      /* Beaufort 7 (near gale) and 8 (gale) */
      if (g >= 13.9) day('wind', g >= 17.2 ? 'warn' : 'watch', g >= 17.2 ? 'Gale-force gusts' : 'Strong gusts', g, 'Gusts up to ' + num(g, 0) + ' m/s', when, more);
      if (mx >= 40) day('heat', mx >= 45 ? 'severe' : 'warn', mx >= 45 ? 'Extreme heat' : 'Very hot', mx, 'Maximum of ' + num(mx, 0) + ' °C', when, more);
      if (mn <= 4) day('cold', mn <= 2 ? 'warn' : 'watch', mn <= 2 ? 'Severe cold' : 'Cold night', mn, 'Minimum of ' + num(mn, 0) + ' °C', when, less);
    }
    Object.keys(kinds).forEach(function (key) {
      var k = kinds[key], rest = k.days.filter(function (w) { return w !== k.when; });
      add(k.l, k.h, k.t + ' ' + k.when + '.' + (rest.length ? ' Also ' + rest.join(' and ') + '.' : ''));
    });
    /* by hour: first occurrence in the next 48 hours */
    var seen = {};
    for (var j = win.i0; j < win.i0 + win.n; j++) {
      var c = h.weather_code[j], t = h.time[j], at = 'around ' + hm(t) + ' ' + dayWord(t) + '.';
      if (c >= 95 && !seen.ts) { seen.ts = 1; add(c > 95 ? 'warn' : 'watch', c > 95 ? 'Thunderstorm with hail' : 'Thunderstorm', 'Possible ' + at); }
      if ((c === 45 || c === 48) && !seen.fog) { seen.fog = 1; add('watch', 'Fog', 'Possible ' + at); }
      if (((c >= 71 && c <= 77) || c === 85 || c === 86) && !seen.snow) { seen.snow = 1; add('watch', 'Snowfall', 'Possible ' + at); }
    }
    if (AQ) {
      var v = AQ.current.us_aqi, pk = aqPeak(), top = pk && pk.v > v ? pk.v : v;
      var txt = 'US AQI ' + num(v, 0) + ' now' + (pk && pk.v > v ? ', rising to ' + num(pk.v, 0) + ' around ' + hm(pk.t) + ' ' + dayWordAQ(pk.t) : '') + '.';
      if (top > 300) add('severe', 'Hazardous air', txt);
      else if (top > 200) add('severe', 'Very unhealthy air', txt);
      else if (top > 150) add('warn', 'Unhealthy air', txt);
      else if (top > 100) add('watch', 'Air unhealthy for sensitive groups', txt);
    }
    out.sort(function (a, b) { return ORDER[a.l] - ORDER[b.l]; });
    alertsEl.innerHTML = out.length ? out.map(function (a, i) {
      return '<li data-l="' + a.l + '" style="--i:' + i + '">' + TRI + '<span class="lv">' + LV[a.l] + '</span><p><b>' + a.h + '.</b> ' + a.t + '</p></li>';
    }).join('') : '<li data-l="none">' + OK + '<p><b>No advisories.</b> Nothing in the forecast for the next two days crosses the rain, wind, temperature' + (AQ ? ' or air quality' : '') + ' thresholds used here.</p></li>';
  }

  function notes() {
    noteEl.innerHTML = 'Updated ' + hm(D.current.time) + ' local time, ' + esc(D.timezone_abbreviation || D.timezone || '') + '. Weather from the <a href="https://open-meteo.com/" rel="noopener" target="_blank">Open-Meteo</a> forecast' +
      (GW ? ', with the temperature range from the Google WeatherNext 2 ensemble (a 0.25° global model with six-hourly steps, so it is smoother than the main forecast)' : '') +
      (AQ ? '. Air quality from the Copernicus Atmosphere Monitoring Service (CAMS) through Open-Meteo' : '') +
      '. These are model values for the grid cell around you, not station measurements. Pollutant bars mark the WHO 2021 guideline for a 24-hour mean (8 hours for ozone) and compare it with the current hourly value, so read them as a rough guide. ' +
      'Advisories are worked out automatically from this forecast with fixed thresholds. They are not official warnings. For official warnings in India, see the <a href="https://mausam.imd.gov.in/" rel="noopener" target="_blank">India Meteorological Department</a>.';
  }

  /* ---------- location ---------- */
  function saved() { try { var s = JSON.parse(localStorage.getItem('ss-loc') || 'null'); return s && isFinite(s.lat) && isFinite(s.lon) ? s : null; } catch (e) { return null; } }
  function approx() {
    return getJSON('https://ipapi.co/json/').then(function (j) {
      if (j.error || j.latitude == null) throw new Error('ipapi');
      return { lat: +j.latitude, lon: +j.longitude, name: [j.city, j.region || j.country_name].filter(Boolean).join(', ') };
    }).catch(function () {
      return getJSON('https://get.geojs.io/v1/ip/geo.json').then(function (j) {
        if (j.latitude == null) throw new Error('geojs');
        return { lat: +j.latitude, lon: +j.longitude, name: [j.city, j.region || j.country].filter(Boolean).join(', ') };
      });
    });
  }
  function ipLoad() { return approx().then(function (l) { if (HOW !== 'device') return load(l, 'ip'); }).catch(fail); }
  var locating = false;
  function locate(asked) {
    if (!navigator.geolocation || locating) return Promise.resolve(false);
    locating = true;
    if (asked) head('Waiting for your browser to share your location.');
    return new Promise(function (res) {
      navigator.geolocation.getCurrentPosition(function (p) {
        var loc = { lat: p.coords.latitude, lon: p.coords.longitude, name: '' };
        getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + loc.lat.toFixed(3) + '&longitude=' + loc.lon.toFixed(3) + '&localityLanguage=en')
          .then(function (g) { loc.name = [g.city || g.locality, g.principalSubdivision || g.countryName].filter(Boolean).join(', '); }).catch(function () {})
          .then(function () {
            locating = false; blocked = false;
            try { localStorage.setItem('ss-loc', JSON.stringify(loc)); } catch (e) {}
            load(loc, 'device'); res(true);
          });
      }, function (err) {
        locating = false;
        if (err && err.code === 1) blocked = true;
        if (!D && !LOC) ipLoad(); else head(asked && !blocked ? 'Your device did not return a location, so this stays as it is.' : undefined);
        res(false);
      }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 15000 });
    });
  }
  locBtn.addEventListener('click', function () { locate(true); });

  function start() {
    var last = saved();
    if (last) load(last, 'last');
    var perm = navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: 'geolocation' }).then(function (s) { return s.state; }).catch(function () { return 'prompt'; }) : Promise.resolve('prompt');
    perm.then(function (state) {
      if (state === 'granted') {                                       /* already allowed: read it quietly on every visit */
        locate(false);
        if (!last) setTimeout(function () { if (!LOC) ipLoad(); }, 2500);   /* slow device: show the approximate place meanwhile */
        return;
      }
      if (!last) ipLoad();
      if (state === 'denied') { blocked = true; head(); return; }
      /* not decided yet: ask once the section is on screen */
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); locate(false); } }, { rootMargin: '0px 0px -20% 0px' });
        io.observe(sec);
      }
    });
  }
  /* stay current while the page is open */
  function refresh() {
    if (document.hidden || !LOC || Date.now() - lastFetch < 6e5) return;
    if (HOW === 'device') locate(false); else load(LOC, HOW);
  }
  setInterval(refresh, 6e5);
  document.addEventListener('visibilitychange', refresh);
  start();
})();
