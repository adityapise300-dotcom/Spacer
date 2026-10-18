// SPACER driver dashboard: "Parking near you" map (Leaflet + OpenStreetMap: free, no API key).
// - Zones come from a JSON data block in the page (no extra request, CSP-safe).
// - Location is never asked automatically: the map opens on all zones; if the browser already
//   allowed location it centres on the driver, otherwise the "Use my location" button asks.
// - All text is written with textContent (zone names are owner-supplied, so never innerHTML).
(function () {
  'use strict';

  var root = document.querySelector('[data-db-map]');
  if (!root) return;

  var canvas = root.querySelector('[data-map-canvas]');
  var fallback = root.querySelector('[data-map-fallback]');
  var statusEl = document.querySelector('[data-map-status]');
  var locateBtn = document.querySelector('[data-map-locate]');
  var nf = new Intl.NumberFormat('en-IN');

  var PUNE = [18.5204, 73.8567]; // centre used when there are no zones yet
  var NEAR_KM = 5;               // "near you" radius for framing + the status line

  var zones = [];
  try { zones = JSON.parse(root.querySelector('[data-map-zones]').textContent) || []; } catch (e) { zones = []; }

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
  function showFallback(title, text) {
    if (canvas) canvas.hidden = true;
    if (locateBtn) locateBtn.hidden = true;
    if (!fallback) return;
    fallback.querySelector('[data-map-fallback-title]').textContent = title;
    fallback.querySelector('[data-map-fallback-text]').textContent = text;
    fallback.hidden = false;
    setStatus('');
  }

  // Leaflet comes from jsDelivr (deferred script in the view). If it was blocked or offline:
  if (typeof window.L === 'undefined') {
    showFallback('Map could not load', 'Check your connection and try again. You can still search for parking.');
    return;
  }
  var L = window.L;

  var toRad = function (x) { return (x * Math.PI) / 180; };
  function distanceKm(lat1, lng1, lat2, lng2) { // same formula as distanceKm() in utils/helpers.js
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var map = L.map(canvas, { center: PUNE, zoom: 12, zoomControl: true, scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    // OpenStreetMap blocks tile requests that carry no Referer. Helmet's default Referrer-Policy is
    // "no-referrer", so send just the site origin for these tile images only.
    referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  }).addTo(map);
  // Wheel-zoom only after the map is clicked, so scrolling the page never gets "stuck" on the map.
  map.on('click focus', function () { map.scrollWheelZoom.enable(); });
  map.on('blur mouseout', function () { map.scrollWheelZoom.disable(); });

  var userPos = null;
  var userMarker = null;
  var activePin = null;

  // ---------- popup (built with DOM nodes, never HTML strings) ----------
  function popupContent(z) {
    var box = el('div', 'db-iw');
    box.appendChild(el('strong', 'db-iw__name', z.name));
    box.appendChild(el('p', 'db-iw__addr', z.address));
    var facts = el('ul', 'db-iw__facts');
    if (z.booked) facts.appendChild(el('li', '', '★ Your next booking is here'));
    if (z.total > 0) {
      facts.appendChild(el('li', '', !z.open ? 'Closed right now' : z.free === 0 ? 'Full right now (0 of ' + z.total + ')' : z.free + ' of ' + z.total + ' bays free'));
    } else if (!z.booked) {
      facts.appendChild(el('li', '', 'No bays listed yet'));
    }
    if (z.price) facts.appendChild(el('li', '', 'From ₹' + nf.format(z.price) + '/hour'));
    if (userPos) facts.appendChild(el('li', '', distanceKm(userPos[0], userPos[1], z.lat, z.lng).toFixed(1) + ' km from you'));
    box.appendChild(facts);
    var actions = el('div', 'db-iw__actions');
    var book = el('a', 'btn btn-primary btn-sm rounded-pill px-3', 'View and book');
    book.href = z.url;
    actions.appendChild(book);
    if (z.dir) {
      var dir = el('a', 'btn btn-outline-success btn-sm rounded-pill px-3', 'Directions');
      dir.href = z.dir; dir.target = '_blank'; dir.rel = 'noopener noreferrer';
      actions.appendChild(dir);
    }
    box.appendChild(actions);
    return box;
  }

  // ---------- pins ----------
  zones.forEach(function (z) {
    var html = el('div', 'db-pin db-pin--' + z.tone + (z.booked ? ' db-pin--booked' : ''));
    html.appendChild(el('span', 'db-pin__dot', z.booked ? '★' : z.tone === 'full' ? '×' : 'P'));
    var icon = L.divIcon({ html: html, className: '', iconSize: [44, 58], iconAnchor: [22, 58], popupAnchor: [0, -54] });
    var marker = L.marker([z.lat, z.lng], {
      icon: icon, zIndexOffset: z.booked ? 200 : 100, keyboard: true, riseOnHover: true,
      title: z.name + (z.total > 0 ? ' — ' + z.free + ' of ' + z.total + ' bays free' : ''),
    }).addTo(map);
    marker.bindPopup(function () { return popupContent(z); }, { maxWidth: 260, autoPanPadding: [30, 30] });
    marker.on('popupopen', function () {
      if (activePin) activePin.classList.remove('is-active');
      html.classList.add('is-active'); activePin = html;
    });
    marker.on('popupclose', function () { html.classList.remove('is-active'); });
  });

  // ---------- framing ----------
  function frame() {
    var pts = [];
    if (userPos) {
      pts.push(userPos);
      var sorted = zones.map(function (z) { return { z: z, d: distanceKm(userPos[0], userPos[1], z.lat, z.lng) }; })
        .sort(function (a, b) { return a.d - b.d; });
      var near = sorted.filter(function (x) { return x.d <= NEAR_KM; });
      (near.length ? near : sorted.slice(0, 3)).forEach(function (x) { pts.push([x.z.lat, x.z.lng]); });
    } else {
      zones.forEach(function (z) { pts.push([z.lat, z.lng]); });
    }
    if (!pts.length) { map.setView(PUNE, 12); return; }
    if (pts.length === 1) { map.setView(pts[0], 15); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  }

  function describeNearby() {
    if (!zones.length) { setStatus('No parking zones have been listed yet.'); return; }
    if (!userPos) { setStatus(zones.length + ' parking zone' + (zones.length === 1 ? '' : 's') + ' on the map. Allow location to see the ones around you.'); return; }
    var sorted = zones.map(function (z) { return { z: z, d: distanceKm(userPos[0], userPos[1], z.lat, z.lng) }; })
      .sort(function (a, b) { return a.d - b.d; });
    var within = sorted.filter(function (x) { return x.d <= NEAR_KM; }).length;
    setStatus((within
      ? within + ' zone' + (within === 1 ? '' : 's') + ' within ' + NEAR_KM + ' km. '
      : 'No zones within ' + NEAR_KM + ' km. ') + 'Nearest: ' + sorted[0].z.name + ' (' + sorted[0].d.toFixed(1) + ' km).');
  }

  // ---------- driver location ----------
  function placeUser(pos) {
    userPos = pos;
    if (userMarker) { userMarker.setLatLng(pos); }
    else {
      var dot = el('div', 'db-me');
      dot.setAttribute('aria-hidden', 'true');
      userMarker = L.marker(pos, {
        icon: L.divIcon({ html: dot, className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: 300, interactive: false, keyboard: false,
      }).addTo(map);
    }
    describeNearby();
    frame();
  }
  function locate() {
    if (!navigator.geolocation) { setStatus('This browser cannot share its location.'); return; }
    if (locateBtn) locateBtn.disabled = true;
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(function (p) {
      if (locateBtn) { locateBtn.disabled = false; locateBtn.lastChild.textContent = ' Recentre'; }
      placeUser([p.coords.latitude, p.coords.longitude]);
    }, function () {
      if (locateBtn) locateBtn.disabled = false;
      setStatus('Location is off, so the map shows all zones. Allow location access in your browser to see the ones near you.');
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  if (locateBtn) { locateBtn.hidden = false; locateBtn.addEventListener('click', locate); }
  frame();
  describeNearby();
  // Already allowed for this site: no prompt, just centre on the driver.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
      if (st.state === 'granted') locate();
    }).catch(function () { /* unsupported: wait for the button */ });
  }
})();
