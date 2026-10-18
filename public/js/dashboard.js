// SPACER dashboards: photo fallback, count-up tiles, listing sort + list/grid toggle,
// optional "nearest" distances, and the owner's 7-day revenue chart.
// No inline code anywhere (CSP-safe). Loaded with `defer` from the two dashboard views only.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nf = new Intl.NumberFormat('en-IN');

  // Run each feature on its own so one failure can never break the others.
  function safely(fn) { try { fn(); } catch (e) { if (window.console) console.warn('dashboard.js:', e.message); } }

  // ---------------------------------------------------------------- 1. Photos
  // A broken image URL is swapped for the same "P" placeholder used when there is no photo at all.
  function toPlaceholder(img) {
    var ph = document.createElement('div');
    ph.className = 'db-ph';
    ph.setAttribute('aria-hidden', 'true');
    ph.innerHTML = '<span>P</span>';
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  }
  safely(function () {
    // "error" does not bubble, so listen in the capture phase.
    document.addEventListener('error', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('db-img')) toPlaceholder(e.target);
    }, true);
    // Images that already failed before this deferred script ran
    document.querySelectorAll('img.db-img').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) toPlaceholder(img);
    });
  });

  // ---------------------------------------------------------------- 2. Count-up
  // The real value is already in the HTML; this only animates it (skipped for reduced motion).
  safely(function () {
    if (reduceMotion) return;
    document.querySelectorAll('[data-db-count]').forEach(function (el) {
      var target = Number(el.getAttribute('data-db-count'));
      if (!isFinite(target) || target <= 0) return;
      var prefix = el.getAttribute('data-db-prefix') || '';
      var suffix = el.getAttribute('data-db-suffix') || '';
      var finalText = el.textContent;
      var start = null;
      var duration = 700;
      el.textContent = prefix + '0' + suffix;
      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        if (p < 1) {
          el.textContent = prefix + nf.format(Math.round(target * eased)) + suffix;
          window.requestAnimationFrame(step);
        } else {
          el.textContent = finalText;
        }
      }
      window.requestAnimationFrame(step);
    });
  });

  // ---------------------------------------------------------------- 3. Listing (driver)
  safely(function () {
    var root = document.querySelector('[data-db-listing]');
    var list = root && root.querySelector('[data-db-zonelist]');
    if (!list) return;

    var cards = Array.prototype.slice.call(list.querySelectorAll('[data-db-zone]'));
    var viewBtns = root.querySelectorAll('[data-db-view]');
    var sortBtns = root.querySelectorAll('[data-db-sort]');
    var note = root.querySelector('[data-db-note]');
    var live = root.querySelector('[data-db-live]');
    var nearBtn = root.querySelector('[data-db-sort="near"]');
    var VIEW_KEY = 'spacer.db.view';
    var userPos = null;
    var locating = false;

    function announce(msg) { if (live) live.textContent = msg; }
    function showNote(msg) { if (!note) return; note.textContent = msg; note.hidden = !msg; }

    // --- list / grid (remembered; on phones the CSS keeps a single column regardless) ---
    function setView(view, save) {
      list.setAttribute('data-view', view);
      viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-db-view') === view)); });
      if (save) { try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* storage blocked: fine */ } }
    }
    var saved = null;
    try { saved = localStorage.getItem(VIEW_KEY); } catch (e) { /* ignore */ }
    setView(saved === 'grid' ? 'grid' : 'list', false);
    viewBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-db-view');
        setView(v, true);
        announce(v === 'grid' ? 'Grid view' : 'List view');
      });
    });

    // --- sorting (client-side, on the cards already in the page) ---
    var num = function (el, key) { return Number(el.getAttribute('data-' + key)); };
    var idx = function (el) { return num(el, 'index'); };
    var comparators = {
      price: function (a, b) { return num(a, 'price') - num(b, 'price'); },
      free: function (a, b) { return num(b, 'free') - num(a, 'free'); },
      near: function (a, b) {
        var da = a.hasAttribute('data-dist') ? num(a, 'dist') : Infinity;
        var db = b.hasAttribute('data-dist') ? num(b, 'dist') : Infinity;
        return da === db ? 0 : da - db;
      },
    };
    var labels = { price: 'Sorted by lowest price', free: 'Sorted by most free bays', near: 'Sorted by nearest' };

    function setPressed(key) {
      sortBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-db-sort') === key)); });
    }
    function applySort(key) {
      var cmp = key ? comparators[key] : null;
      cards.slice().sort(function (a, b) { return (cmp ? cmp(a, b) : 0) || idx(a) - idx(b); })
        .forEach(function (c) { list.appendChild(c); });
      setPressed(key);
      announce(key ? labels[key] : 'Original order');
    }

    // --- distances (only if the browser shares its location; never asked automatically) ---
    var toRad = function (x) { return (x * Math.PI) / 180; };
    function distanceKm(lat1, lng1, lat2, lng2) { // same formula as distanceKm() in utils/helpers.js
      var dLat = toRad(lat2 - lat1);
      var dLng = toRad(lng2 - lng1);
      var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
      return 2 * 6371 * Math.asin(Math.sqrt(a));
    }
    function showDistances() {
      cards.forEach(function (c) {
        var lat = parseFloat(c.getAttribute('data-lat'));
        var lng = parseFloat(c.getAttribute('data-lng'));
        var out = c.querySelector('[data-db-distance]');
        if (!isFinite(lat) || !isFinite(lng) || !userPos) return;
        var km = distanceKm(userPos.lat, userPos.lng, lat, lng);
        c.setAttribute('data-dist', km.toFixed(3));
        if (out) { out.textContent = km.toFixed(1) + ' km away'; out.hidden = false; }
      });
    }
    function locate(onDone) {
      if (!navigator.geolocation) {
        showNote('This browser cannot share its location, so distances are not available.');
        if (nearBtn) nearBtn.setAttribute('aria-disabled', 'true');
        return;
      }
      if (locating) return;
      locating = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        locating = false;
        userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        showNote('');
        showDistances();
        if (onDone) onDone();
      }, function () {
        locating = false;
        setPressed(null);
        showNote('Location is off, so distances cannot be shown. Allow location access in your browser to use "Nearest".');
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    }

    sortBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-db-sort');
        if (b.getAttribute('aria-disabled') === 'true') return;
        if (b.getAttribute('aria-pressed') === 'true') { applySort(null); return; } // tap again = back to default
        if (key === 'near' && !userPos) { locate(function () { applySort('near'); }); return; }
        applySort(key);
      });
    });

    // If the visitor already allowed location for this site, show distances without a prompt.
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
        if (st.state === 'granted') locate();
      }).catch(function () { /* unsupported: wait for the Nearest pill */ });
    }
  });

  // ---------------------------------------------------------------- 4. Revenue chart (owner)
  // Chart.js comes from jsDelivr, which the CSP already allows (the Insights page uses it too).
  safely(function () {
    var canvas = document.getElementById('db-rev-chart');
    if (!canvas) return;
    var fallback = document.querySelector('[data-db-chart-fallback]');
    if (typeof window.Chart === 'undefined') {
      // CDN blocked or offline: show the same 7 numbers as a plain table instead.
      if (fallback) fallback.hidden = false;
      if (canvas.parentNode) canvas.parentNode.hidden = true;
      return;
    }
    var labels = JSON.parse(canvas.getAttribute('data-labels'));
    var values = JSON.parse(canvas.getAttribute('data-values'));
    var rupee = function (v) { return '₹' + nf.format(v); };
    new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: values.map(function (v, i) { return i === values.length - 1 ? '#2f3fbf' : '#aab3ee'; }),
          borderRadius: 6,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion ? false : { duration: 700 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return rupee(ctx.parsed.y); } } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { maxTicksLimit: 5, callback: function (v) { return rupee(v); } }, grid: { color: '#eceff7' } },
          x: { grid: { display: false } },
        },
      },
    });
  });
})();
