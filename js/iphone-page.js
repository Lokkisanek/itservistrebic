(function () {
  function formatPrice(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clockIcon() {
    return (
      '<svg class="its-repair-card__clock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<polyline points="12 6 12 12 16 14"/>' +
      '</svg>'
    );
  }

  function renderRepairCard(item, device, vatRate) {
    var detailHref =
      'oprava.html?model=' + encodeURIComponent(device.id) +
      '&oprava=' + encodeURIComponent(item.id);

    return (
      '<article class="its-repair-card">' +
        '<a class="its-repair-card__link" href="' + detailHref + '" aria-label="Detail: ' + escapeHtml(item.title) + '">' +
          '<div class="its-repair-card__top">' +
            '<div class="its-repair-card__icon">' +
              '<img src="' + escapeHtml(item.icon || '') + '" alt="" loading="lazy">' +
            '</div>' +
            '<div class="its-repair-card__info">' +
              '<h3 class="its-repair-card__title">' + escapeHtml(item.title) + '</h3>' +
              '<p class="its-repair-card__meta">Servis na ' + escapeHtml(device.name) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="its-repair-card__bottom">' +
            '<div class="its-repair-card__price-wrap">' +
              '<span class="its-repair-card__price">' + formatPrice(item.price) + '</span>' +
              '<span class="its-repair-card__vat">vč. DPH ' + Number(vatRate || 21) + ' %</span>' +
            '</div>' +
            '<span class="its-repair-card__time">' + clockIcon() + escapeHtml(item.time) + '</span>' +
          '</div>' +
        '</a>' +
        '<button type="button" class="its-repair-card__btn its-repair-card__btn--cart" ' +
          'data-cart-add ' +
          'data-model-id="' + escapeHtml(device.id) + '" ' +
          'data-model-name="' + escapeHtml(device.name) + '" ' +
          'data-repair-id="' + escapeHtml(item.id) + '" ' +
          'data-repair-title="' + escapeHtml(item.title) + '" ' +
          'data-price="' + Number(item.price || 0) + '" ' +
          'data-time="' + escapeHtml(item.time) + '" ' +
          'data-icon="' + escapeHtml(item.icon || '') + '" ' +
          'data-vat-rate="' + Number(vatRate || 21) + '">' +
          'Přidat do košíku' +
        '</button>' +
      '</article>'
    );
  }

  function renderRepairs(data, device, repairsEl) {
    var vatRate = data.vatRate || 21;
    repairsEl.innerHTML = data.sections.map(function (section) {
      return (
        '<section class="its-repair-section">' +
          '<h2 class="its-repair-section__title">' + escapeHtml(section.title) + '</h2>' +
          '<div class="its-repair-cards">' +
            section.items.map(function (item) {
              return renderRepairCard(item, device, vatRate);
            }).join('') +
          '</div>' +
        '</section>'
      );
    }).join('');
  }

  function bindCartButtons(root) {
    if (!root || !window.ITSCart) return;

    root.querySelectorAll('[data-cart-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var result = window.ITSCart.addItem({
          modelId: btn.getAttribute('data-model-id'),
          modelName: btn.getAttribute('data-model-name'),
          repairId: btn.getAttribute('data-repair-id'),
          repairTitle: btn.getAttribute('data-repair-title'),
          price: Number(btn.getAttribute('data-price')) || 0,
          time: btn.getAttribute('data-time'),
          icon: btn.getAttribute('data-icon'),
          vatRate: Number(btn.getAttribute('data-vat-rate')) || 21
        });

        if (result.duplicate) {
          btn.textContent = 'Již v košíku';
          setTimeout(function () {
            btn.textContent = 'Přidat do košíku';
          }, 1500);
        }

        window.ITSCart.openModal(true);
      });
    });
  }

  function loadModelPrices(modelId) {
    return fetch('/data/iphone-cenik/' + encodeURIComponent(modelId) + '.json')
      .then(function (r) {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var data = window.ITS_DEVICES;
    if (!data) return;

    var params = new URLSearchParams(window.location.search);
    var modelId = params.get('model');
    var device = data.IPHONES.find(function (d) { return d.id === modelId; });

    if (!device) {
      window.location.replace('index.html?kategorie=iphone#cenik');
      return;
    }

    var titleEl = document.getElementById('device-page-title');
    var breadcrumbEl = document.getElementById('breadcrumb-model');
    var subtitleEl = document.getElementById('device-repairs-subtitle');
    var repairsEl = document.getElementById('device-repairs');

    document.title = 'Oprava ' + device.name + ' | IT Servis Třebíč';

    if (window.ITSSeo) {
      window.ITSSeo.apply({
        title: document.title,
        description:
          'Ceník oprav ' + device.name + ' v Třebíči. Výměna displeje, baterie, nabíjecího konektoru, kamer a Face ID. Ceny vč. DPH, rezervace online.',
        canonical: '/iphone.html?model=' + encodeURIComponent(device.id),
        breadcrumbs: [
          { name: 'Domů', path: '/' },
          { name: 'iPhone', path: '/index.html?kategorie=iphone#cenik' },
          { name: device.name, path: '/iphone.html?model=' + encodeURIComponent(device.id) }
        ]
      });
    }

    if (titleEl) titleEl.textContent = 'Oprava ' + device.name;
    if (breadcrumbEl) breadcrumbEl.textContent = device.name;

    if (!repairsEl) return;

    loadModelPrices(modelId)
      .then(function (priceData) {
        if (subtitleEl) {
          subtitleEl.textContent =
            'Orientační ceny oprav pro ' + device.name +
            ' (vč. DPH ' + (priceData.vatRate || 21) + ' %).';
        }
        renderRepairs(priceData, device, repairsEl);
        bindCartButtons(repairsEl);
      })
      .catch(function () {
        if (subtitleEl) subtitleEl.textContent = 'Ceník pro ' + device.name + ' se nepodařilo načíst.';
        repairsEl.innerHTML = '<div class="its-repair-empty">Ceník se nepodařilo načíst. Spusťte web přes <code>npm start</code>.</div>';
      });
  });
})();
