(function () {
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(alertEl, message, allowHtml) {
    if (!alertEl) return;
    alertEl.innerHTML =
      '<div class="its-admin-alert its-admin-alert--error">' +
      (allowHtml ? message : escapeHtml(message)) +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('login-form');
    var alertEl = document.getElementById('login-alert');

    adminApi('/api/admin/me').then(function (data) {
      if (data.authenticated) window.location.replace('/admin/');
    }).catch(function (err) {
      if (err.message !== 'redirect') {
        showError(alertEl, err.message);
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      alertEl.innerHTML = '';
      var password = document.getElementById('password').value;

      fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
      })
        .then(function (r) {
          var ct = r.headers.get('content-type') || '';
          if (ct.indexOf('application/json') === -1) {
            showError(alertEl, 'Admin API neběží. Spusťte <code>npm start</code>.', true);
            return null;
          }
          return r.json().then(function (d) { return { ok: r.ok, data: d }; });
        })
        .then(function (res) {
          if (!res) return;
          if (res.ok) {
            window.location.replace('/admin/');
            return;
          }
          showError(alertEl, res.data.error || 'Chyba přihlášení');
        })
        .catch(function (err) {
          showError(alertEl, err.message || 'Chyba přihlášení');
        });
    });
  });
})();
