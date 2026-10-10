// Opens Razorpay Checkout, then sends the result to our server for verification.
(function () {
  var btn = document.getElementById('payBtn');
  if (!btn) return;
  var msg = document.getElementById('payMsg');

  function show(text) {
    msg.textContent = text;
    msg.classList.remove('d-none');
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Something went wrong.');
        return d;
      });
    });
  }
  function reset() { btn.disabled = false; }

  btn.addEventListener('click', function () {
    msg.classList.add('d-none');
    btn.disabled = true;
    post(btn.dataset.orderUrl)
      .then(function (o) {
        var rzp = new Razorpay({
          key: o.keyId, amount: o.amount, currency: o.currency, order_id: o.orderId,
          name: 'SPACER', description: o.description, prefill: o.prefill, theme: { color: '#2f3fbf' },
          handler: function (resp) {
            post(btn.dataset.verifyUrl, resp)
              .then(function (d) { window.location.href = d.redirect; })
              .catch(function (e) { show(e.message); reset(); });
          },
          modal: { ondismiss: reset },
        });
        rzp.on('payment.failed', function (r) {
          show('Payment failed: ' + ((r.error && r.error.description) || 'please try again.'));
          reset();
        });
        rzp.open();
      })
      .catch(function (e) { show(e.message); reset(); });
  });
})();
