// Small vanilla helpers: validation, loading buttons, confirm dialogs, print/back, geolocation, countdown.
(function () {
  // Bootstrap-style client validation + loading state on submit
  document.querySelectorAll('form.needs-validation').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
        form.classList.add('was-validated');
        return;
      }
      form.classList.add('was-validated');
      form.querySelectorAll('button[type=submit][data-loading-text]').forEach(function (btn) {
        setTimeout(function () {
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>' + btn.dataset.loadingText;
        }, 0);
      });
    });
  });

  // Confirm password must match
  document.querySelectorAll('input[data-match]').forEach(function (input) {
    var target = document.querySelector(input.dataset.match);
    if (!target) return;
    var check = function () { input.setCustomValidity(input.value === target.value ? '' : 'Passwords do not match'); };
    input.addEventListener('input', check);
    target.addEventListener('input', check);
  });

  // Confirm dialogs: <form data-confirm="Are you sure?">
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  document.querySelectorAll('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { window.history.back(); }); });

  // "Use my location" on the search page
  var locBtn = document.getElementById('useLocation');
  if (locBtn && navigator.geolocation) {
    locBtn.addEventListener('click', function () {
      locBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        document.getElementById('lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('lng').value = pos.coords.longitude.toFixed(6);
        locBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Location set';
        locBtn.disabled = false;
      }, function () {
        locBtn.disabled = false;
        window.alert('We could not read your location. Check the browser permission and try again.');
      });
    });
  } else if (locBtn) { locBtn.style.display = 'none'; }

  // Hold countdown: <span data-countdown="ISO date">
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var end = new Date(el.dataset.countdown).getTime();
    function tick() {
      var left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (left === 0) { clearInterval(timer); window.location.reload(); }
    }
    var timer = setInterval(tick, 1000);
    tick();
  });
})();
