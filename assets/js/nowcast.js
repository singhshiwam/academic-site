/* Current conditions near the Ranichauri tower site from the Open-Meteo
   forecast API (model values, not tower observations). No key needed. */
(function () {
  'use strict';
  var box = document.getElementById('now');
  if (!box) return;
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=30.31&longitude=78.41' +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover' +
    '&daily=sunrise,sunset&forecast_days=1&timezone=Asia%2FKolkata&wind_speed_unit=ms';
  function set(k, html) { var el = box.querySelector('[data-v="' + k + '"]'); if (el) el.innerHTML = html; }
  function compass(d) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8]; }
  function hm(s) { return s ? s.slice(11, 16) : '--'; }

  fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    var c = j.current || {}, dl = j.daily || {};
    set('t', Math.round(c.temperature_2m * 10) / 10 + '<small>°C</small>');
    set('rh', Math.round(c.relative_humidity_2m) + '<small>%</small>');
    var dir = c.wind_direction_10m;
    set('w', '<svg class="arrow" viewBox="0 0 16 16" style="transform:rotate(' + (dir + 180) + 'deg)" aria-hidden="true"><path d="M8 1 L12 11 L8 8.6 L4 11 Z" fill="currentColor"/></svg>' +
      (Math.round(c.wind_speed_10m * 10) / 10) + '<small>m/s ' + compass(dir) + '</small>');
    set('cc', Math.round(c.cloud_cover) + '<small>%</small>');
    set('sun', hm(dl.sunrise && dl.sunrise[0]) + '<small>to</small> ' + hm(dl.sunset && dl.sunset[0]));
    var when = c.time ? c.time.slice(11, 16) : '';
    var src = box.querySelector('[data-src]');
    if (src) src.textContent = 'Open-Meteo model estimate for ' + when + ' IST, not tower measurements.';
  }).catch(function () {
    var src = box.querySelector('[data-src]');
    if (src) src.textContent = 'Live values could not be loaded. Refresh the page to try again.';
  });
})();
