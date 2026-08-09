(function (w) {
  function goLogin() {
    if (window.location.pathname.indexOf('login.html') === -1) {
      window.location.href = '/admin/login.html';
    }
  }

  function parseResponse(r) {
    var ct = r.headers.get('content-type') || '';
    if (ct.indexOf('application/json') === -1) {
      throw new Error('Admin API neběží. Zastavte starý server a spusťte <code>npm start</code>.');
    }
    return r.json().then(function (data) {
      if (r.status === 401) {
        goLogin();
        throw new Error('redirect');
      }
      if (!r.ok) throw new Error(data.error || 'Chyba serveru');
      return data;
    });
  }

  w.adminApi = function (url, options) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('Prohlížeč nepodporuje fetch.'));
    }
    return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})).then(parseResponse);
  };

  w.adminGoLogin = goLogin;
})(window);
