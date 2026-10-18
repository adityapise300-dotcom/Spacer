/* SPACER landing page behaviour. No libraries, no inline scripts (CSP-safe).
   1) scroll-reveal with IntersectionObserver  2) a tiny "live" flip in the hero mock.
   Both are skipped for visitors who prefer reduced motion; the page works fully without this file. */
(function () {
  'use strict';

  var page = document.querySelector('.lp-page');
  if (!page) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;

  /* ---------- 1. Scroll reveal ---------- */
  var items = page.querySelectorAll('[data-lp-reveal]');
  if (!reduceMotion && canObserve && items.length) {
    // Small stagger for cards inside a group (capped so long lists don't feel slow)
    page.querySelectorAll('[data-lp-reveal-group]').forEach(function (group) {
      var kids = group.querySelectorAll(':scope > [data-lp-reveal]');
      kids.forEach(function (el, i) { el.style.setProperty('--lp-d', Math.min(i, 5) * 70 + 'ms'); });
    });

    page.classList.add('lp-js'); // CSS hides [data-lp-reveal] only once this class exists

    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach(function (el) { revealer.observe(el); });

    // Make sure everything is visible when printing
    window.addEventListener('beforeprint', function () {
      items.forEach(function (el) { el.classList.add('is-in'); });
    });
  }

  /* ---------- 2. Hero mock: one slot flips free <-> booked every few seconds ---------- */
  var mock = page.querySelector('.lp-mock');
  var slots = Array.prototype.slice.call(page.querySelectorAll('.lp-hero [data-lp-slot]:not([data-lp-static])'))
    .filter(function (el) { return !el.classList.contains('lp-slot--maint'); });

  if (!reduceMotion && mock && slots.length) {
    var timer = null;
    var inView = true;

    var flip = function () {
      var el = slots[Math.floor(Math.random() * slots.length)];
      var wasFree = el.classList.contains('lp-slot--free');
      el.classList.toggle('lp-slot--free', !wasFree);
      el.classList.toggle('lp-slot--booked', wasFree);
      var icon = el.querySelector('i');
      if (icon) icon.className = 'bi bi-' + (wasFree ? 'car-front-fill' : 'p-circle');
      el.classList.remove('is-flip');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('is-flip');
    };

    var sync = function () {
      var shouldRun = inView && !document.hidden;
      if (shouldRun && !timer) timer = window.setInterval(flip, 2800);
      if (!shouldRun && timer) { window.clearInterval(timer); timer = null; }
    };

    if (canObserve) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }).observe(mock);
    }
    document.addEventListener('visibilitychange', sync);
    sync();
  }
})();
