// Owner insights: predicted vs actual occupancy for the last 7 days (Chart.js from CDN)
(function () {
  var canvas = document.getElementById('forecastChart');
  if (!canvas || typeof Chart === 'undefined') return;

  fetch(canvas.dataset.url, { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.hasData) return;
      new Chart(canvas, {
        type: 'line',
        data: {
          labels: d.chart.labels,
          datasets: [
            { label: 'Actual', data: d.chart.actual, borderColor: '#14182b', backgroundColor: '#14182b', borderWidth: 2, pointRadius: 0, tension: 0.25 },
            { label: 'Forecast', data: d.chart.predicted, borderColor: '#2f3fbf', backgroundColor: '#2f3fbf', borderWidth: 2, pointRadius: 0, tension: 0.25 },
            { label: 'Baseline (same hour yesterday)', data: d.chart.baseline, borderColor: '#8a90a3', backgroundColor: '#8a90a3', borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, tension: 0.25 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          spanGaps: true,
          scales: {
            y: { min: 0, max: 100, title: { display: true, text: 'Occupancy (%)' } },
            x: { ticks: { maxTicksLimit: 14, maxRotation: 0 } },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    })
    .catch(function () {
      canvas.parentElement.insertAdjacentHTML('beforeend', '<p class="text-danger small">Could not load the chart data.</p>');
    });
})();
