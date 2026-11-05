/* Current weather where the visitor is.
   Location: a precise position the visitor chose to share earlier, if any;
   otherwise an approximate city from their connection (ipapi.co, then
   geojs.io). Weather: Open-Meteo forecast API, model values, local time.
   No keys. Nothing is sent anywhere else. */
(function () {
  'use strict';
  var box = document.getElementById('now');
  if (!box) return;
  var placeEl = box.querySelector('[data-place]'), src = box.querySelector('[data-src]');
  function set(k, html) { var el = box.querySelector('[data-v="' + k + '"]'); if (el) el.innerHTML = html; }
  function compass(d) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8]; }
  function hm(s) { return s ? s.slice(11, 16) : '--'; }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  function weather(loc, how) {
    placeEl.textContent = loc.name || '';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat.toFixed(3) + '&longitude=' + loc.lon.toFixed(3) +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover' +
      '&daily=sunrise,sunset&forecast_days=1&timezone=auto&wind_speed_unit=ms';
    return getJSON(url).then(function (j) {
      var c = j.current || {}, dl = j.daily || {};
      set('t', Math.round(c.temperature_2m * 10) / 10 + '<small>°C</small>');
      set('rh', Math.round(c.relative_humidity_2m) + '<small>%</small>');
      var dir = c.wind_direction_10m;
      set('w', '<svg class="arrow" viewBox="0 0 16 16" style="transform:rotate(' + (dir + 180) + 'deg)" aria-hidden="true"><path d="M8 1 L12 11 L8 8.6 L4 11 Z" fill="currentColor"/></svg>' +
        (Math.round(c.wind_speed_10m * 10) / 10) + '<small>m/s ' + compass(dir) + '</small>');
      set('cc', Math.round(c.cloud_cover) + '<small>%</small>');
      set('sun', hm(dl.sunrise && dl.sunrise[0]) + ' <small>to</small> ' + hm(dl.sunset && dl.sunset[0]));
      src.innerHTML = '';
      src.appendChild(document.createTextNode('Open-Meteo model values at ' + (c.time ? c.time.slice(11, 16) : '') + ' local time. ' +
        (how === 'precise' ? 'Using the location you shared.' : 'Location estimated from your connection. ')));
      if (how !== 'precise') src.appendChild(button());
      return true;
    });
  }

  function button() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'loc-btn'; b.textContent = 'Use my exact location';
    b.addEventListener('click', precise);
    return b;
  }

  function precise() {
    if (!navigator.geolocation) { src.textContent = 'Your browser does not share location.'; return; }
    src.textContent = 'Waiting for your browser to share your location';
    navigator.geolocation.getCurrentPosition(function (p) {
      var loc = { lat: p.coords.latitude, lon: p.coords.longitude, name: '' };
      getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + loc.lat.toFixed(3) + '&longitude=' + loc.lon.toFixed(3) + '&localityLanguage=en')
        .then(function (g) { loc.name = g.city || g.locality || g.principalSubdivision || ''; }).catch(function () {})
        .then(function () {
          try { localStorage.setItem('ss-loc', JSON.stringify(loc)); } catch (e) {}
          weather(loc, 'precise').catch(fail);
        });
    }, function () {
      src.textContent = 'Location was not shared, so the weather stays at the approximate place. ';
      src.appendChild(button());
    }, { maximumAge: 600000, timeout: 12000 });
  }

  function approx() {
    return getJSON('https://ipapi.co/json/').then(function (j) {
      if (j.error || j.latitude == null) throw new Error('ipapi');
      return { lat: +j.latitude, lon: +j.longitude, name: [j.city, j.country_name].filter(Boolean).join(', ') };
    }).catch(function () {
      return getJSON('https://get.geojs.io/v1/ip/geo.json').then(function (j) {
        if (j.latitude == null) throw new Error('geojs');
        return { lat: +j.latitude, lon: +j.longitude, name: [j.city, j.country].filter(Boolean).join(', ') };
      });
    });
  }

  function fail() {
    src.textContent = 'The weather could not be loaded right now. ';
    src.appendChild(button());
  }

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('ss-loc') || 'null'); } catch (e) {}
  if (saved && isFinite(saved.lat)) weather(saved, 'precise').catch(fail);
  else approx().then(function (loc) { return weather(loc, 'approx'); }).catch(fail);
})();
