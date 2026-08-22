(function () {
  function formatPrice(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clockIcon() {
    return (
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<polyline points="12 6 12 12 16 14"/>' +
      '</svg>'
    );
  }

  function chevronIcon() {
    return (
      '<svg class="its-repair-variant__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<polyline points="9 18 15 12 9 6"/>' +
      '</svg>'
    );
  }

  function featureIcon(label) {
    var icons = {
      Barvy:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
      Dotyk:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M8 14v-4a2 2 0 1 1 4 0v6"/><path d="M12 16v2a2 2 0 0 0 4 0v-6a2 2 0 1 0-4 0"/><path d="M8 14a2 2 0 0 0-2 2v1a5 5 0 0 0 5 5h1"/></svg>',
      Spotřeba:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 7h2M11 11h2"/></svg>',
      Materiál:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="M12 22V12M3 7l9 5 9-5"/></svg>',
      Záruka:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
      'Dodatečné informace':
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>'
    };
    return icons[label] || icons['Dodatečné informace'];
  }

  function findItemInCatalog(priceData, repairId) {
    var found = null;
    priceData.sections.forEach(function (section) {
      section.items.forEach(function (item) {
        if (item.id === repairId) found = item;
      });
    });
    return found;
  }

  function findGroup(repairId) {
    var groups = window.ITS_REPAIR_CONTENT.groups;
    var key;
    for (key in groups) {
      if (groups[key].ids.indexOf(repairId) !== -1) return groups[key];
    }
    return null;
  }

  function getVariants(priceData, group, currentId) {
    if (!group) {
      var single = findItemInCatalog(priceData, currentId);
      return single ? [single] : [];
    }
    return group.ids
      .map(function (id) { return findItemInCatalog(priceData, id); })
      .filter(Boolean);
  }

  function renderComparison(activeId) {
    var cmp = window.ITS_REPAIR_CONTENT.comparison;
    var intro = cmp.intro;
    var activeTier = cmp.tiers.find(function (t) { return t.id === activeId; }) || cmp.tiers[0];

    return (
      '<div class="its-repair-detail__tabs">' +
        '<button type="button" class="its-repair-detail__tab is-active">Popis</button>' +
      '</div>' +
      '<div class="its-repair-compare">' +
        '<article class="its-repair-compare__card">' +
          '<h2 class="its-repair-compare__title">' + escapeHtml(intro.title) + '</h2>' +
          '<p class="its-repair-compare__text">' + escapeHtml(intro.text) + '</p>' +
          '<div class="its-repair-compare__img">' +
            '<img src="' + escapeAttr(intro.image) + '" alt="Porovnání variant displeje" loading="lazy">' +
          '</div>' +
        '</article>' +
        '<article class="its-repair-compare__card">' +
          '<h2 class="its-repair-compare__title">' + escapeHtml(activeTier.title) + '</h2>' +
          '<p class="its-repair-compare__score">' + escapeHtml(activeTier.score) + ' <sup>1)</sup></p>' +
          '<ul class="its-repair-compare__list">' +
            activeTier.features.map(function (f) {
              return (
                '<li class="its-repair-compare__item">' +
                  '<span class="its-repair-compare__icon" aria-hidden="true">' + featureIcon(f.label) + '</span>' +
                  '<div>' +
                    '<strong>' + escapeHtml(f.label) + '</strong>' +
                    '<p>' + escapeHtml(f.text) + '</p>' +
                  '</div>' +
                '</li>'
              );
            }).join('') +
          '</ul>' +
        '</article>' +
      '</div>' +
      '<div class="its-repair-compare its-repair-compare--more">' +
        cmp.tiers.filter(function (t) { return t.id !== activeTier.id; }).map(function (tier) {
          return (
            '<article class="its-repair-compare__card">' +
              '<h2 class="its-repair-compare__title">' + escapeHtml(tier.title) + '</h2>' +
              '<p class="its-repair-compare__score">' + escapeHtml(tier.score) + ' <sup>1)</sup></p>' +
              '<ul class="its-repair-compare__list">' +
                tier.features.map(function (f) {
                  return (
                    '<li class="its-repair-compare__item">' +
                      '<span class="its-repair-compare__icon" aria-hidden="true">' + featureIcon(f.label) + '</span>' +
                      '<div>' +
                        '<strong>' + escapeHtml(f.label) + '</strong>' +
                        '<p>' + escapeHtml(f.text) + '</p>' +
                      '</div>' +
                    '</li>'
                  );
                }).join('') +
              '</ul>' +
            '</article>'
          );
        }).join('') +
      '</div>' +
      '<p class="its-repair-compare__note"><sup>1)</sup> Orientační skóre kvality vůči originálnímu dílu výrobce.</p>'
    );
  }

  function renderSimpleDescription(itemContent, catalogItem) {
    return (
      '<div class="its-repair-detail__tabs">' +
        '<button type="button" class="its-repair-detail__tab is-active">Popis</button>' +
      '</div>' +
      '<div class="its-repair-compare">' +
        '<article class="its-repair-compare__card its-repair-compare__card--wide">' +
          '<h2 class="its-repair-compare__title">' +
            escapeHtml(itemContent.sidebarTitle || catalogItem.title) +
          '</h2>' +
          '<p class="its-repair-compare__text">' +
            escapeHtml(itemContent.description || 'Profesionální servisní úkon včetně diagnostiky a montáže.') +
          '</p>' +
          '<p class="its-repair-compare__text">Na provedený servisní úkon poskytujeme záruku 12 měsíců.</p>' +
        '</article>' +
      '</div>'
    );
  }

  function renderPage(device, priceData, repairId) {
    var catalogItem = findItemInCatalog(priceData, repairId);
    if (!catalogItem) return null;

    var content = window.ITS_REPAIR_CONTENT;
    var itemContent = content.items[repairId] || {};
    var group = findGroup(repairId);
    var variants = getVariants(priceData, group, repairId);
    var vatRate = priceData.vatRate || 21;
    var heroImage = (group && group.image) || itemContent.image || catalogItem.icon;
    var sidebarTitle = itemContent.sidebarTitle || catalogItem.title;
    var description = itemContent.description ||
      (group && group.description) ||
      'Profesionální servisní úkon včetně diagnostiky a montáže.';

    var modelHref = 'iphone.html?model=' + encodeURIComponent(device.id);

    return (
      '<nav class="its-breadcrumb" aria-label="Drobečková navigace">' +
        '<a href="index.html#cenik">Zařízení</a>' +
        '<span class="its-breadcrumb__sep" aria-hidden="true">/</span>' +
        '<a href="index.html?kategorie=iphone#cenik">iPhone</a>' +
        '<span class="its-breadcrumb__sep" aria-hidden="true">/</span>' +
        '<a href="' + modelHref + '">' + escapeHtml(device.name) + '</a>' +
        '<span class="its-breadcrumb__sep" aria-hidden="true">/</span>' +
        '<span class="its-breadcrumb__current">' + escapeHtml(sidebarTitle) + '</span>' +
      '</nav>' +

      '<div class="its-repair-detail">' +
        '<div class="its-repair-detail__main">' +
          '<div class="its-repair-detail__hero">' +
            '<img src="' + escapeAttr(heroImage) + '" alt="' + escapeAttr(sidebarTitle) + '" loading="eager">' +
          '</div>' +
          (group && group.showComparison
            ? renderComparison(repairId)
            : renderSimpleDescription(itemContent, catalogItem)) +
        '</div>' +

        '<aside class="its-repair-detail__side">' +
          '<p class="its-repair-detail__eyebrow">Servis na ' + escapeHtml(device.name) + '</p>' +
          '<h1 class="its-repair-detail__title" id="repair-side-title">' + escapeHtml(sidebarTitle) + '</h1>' +
          '<p class="its-repair-detail__desc" id="repair-side-desc">' + escapeHtml(description) + '</p>' +

          (variants.length > 1
            ? (
              '<div class="its-repair-detail__variants">' +
                '<h2 class="its-repair-detail__variants-title">Varianty</h2>' +
                '<div class="its-repair-variants" id="repair-variants">' +
                  variants.map(function (v) {
                    var meta = content.items[v.id] || {};
                    var isActive = v.id === repairId;
                    return (
                      '<a class="its-repair-variant' + (isActive ? ' is-active' : '') + '" ' +
                        'href="oprava.html?model=' + encodeURIComponent(device.id) +
                        '&oprava=' + encodeURIComponent(v.id) + '">' +
                        '<span class="its-repair-variant__icon">' +
                          '<img src="' + escapeAttr(v.icon) + '" alt="">' +
                        '</span>' +
                        '<span class="its-repair-variant__info">' +
                          '<strong>' + escapeHtml(meta.sidebarTitle || v.title) + '</strong>' +
                          '<span>Servis na ' + escapeHtml(device.name) + '</span>' +
                        '</span>' +
                        '<span class="its-repair-variant__price">' + formatPrice(v.price) + '</span>' +
                        chevronIcon() +
                      '</a>'
                    );
                  }).join('') +
                '</div>' +
              '</div>'
            )
            : '') +

          '<div class="its-repair-detail__price-block">' +
            '<span class="its-repair-detail__price-label">Konečná cena včetně dílu a práce:</span>' +
            '<strong class="its-repair-detail__price" id="repair-final-price">' +
              formatPrice(catalogItem.price) + ' / ks' +
            '</strong>' +
            '<span class="its-repair-detail__vat">vč. DPH ' + Number(vatRate) + ' %</span>' +
          '</div>' +

          '<button type="button" class="its-btn its-btn--primary its-btn--block its-repair-detail__cta" ' +
            'id="repair-add-cart" ' +
            'data-cart-add ' +
            'data-model-id="' + escapeAttr(device.id) + '" ' +
            'data-model-name="' + escapeAttr(device.name) + '" ' +
            'data-repair-id="' + escapeAttr(catalogItem.id) + '" ' +
            'data-repair-title="' + escapeAttr(catalogItem.title) + '" ' +
            'data-price="' + Number(catalogItem.price || 0) + '" ' +
            'data-time="' + escapeAttr(catalogItem.time) + '" ' +
            'data-icon="' + escapeAttr(catalogItem.icon) + '" ' +
            'data-vat-rate="' + Number(vatRate) + '">' +
            'Přidat do košíku' +
          '</button>' +

          '<span class="its-repair-detail__time" id="repair-time">' +
            clockIcon() + escapeHtml(catalogItem.time) +
          '</span>' +
        '</aside>' +
      '</div>'
    );
  }

  function bindCart() {
    var btn = document.getElementById('repair-add-cart');
    if (!btn || !window.ITSCart) return;

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
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('repair-detail-root');
    var devices = window.ITS_DEVICES;
    if (!root || !devices) return;

    var params = new URLSearchParams(window.location.search);
    var modelId = params.get('model');
    var repairId = params.get('oprava');
    var device = devices.IPHONES.find(function (d) { return d.id === modelId; });

    if (!device || !repairId) {
      window.location.replace('index.html?kategorie=iphone#cenik');
      return;
    }

    Promise.all([
      fetch('/data/iphone-cenik/' + encodeURIComponent(modelId) + '.json').then(function (r) {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      }),
      fetch('/data/iphone-repair-content.json').then(function (r) {
        if (!r.ok) throw new Error('content failed');
        return r.json();
      })
    ])
      .then(function (results) {
        var priceData = results[0];
        window.ITS_REPAIR_CONTENT = results[1];

        var html = renderPage(device, priceData, repairId);
        if (!html) {
          root.innerHTML = '<p class="its-repair-empty">Tato oprava nebyla nalezena.</p>';
          return;
        }

        var content = window.ITS_REPAIR_CONTENT;
        var item = findItemInCatalog(priceData, repairId);
        var meta = content.items[repairId] || {};
        var repairTitle = meta.sidebarTitle || item.title;
        document.title = repairTitle + ' — ' + device.name + ' | IT Servis Třebíč';

        if (window.ITSSeo) {
          window.ITSSeo.apply({
            title: document.title,
            description: (meta.description || 'Profesionální servisní úkon v Třebíči včetně diagnostiky a montáže.') +
              (item.price ? ' Cena od ' + Number(item.price).toLocaleString('cs-CZ') + ' Kč vč. DPH.' : ''),
            canonical:
              '/oprava.html?model=' + encodeURIComponent(device.id) +
              '&oprava=' + encodeURIComponent(repairId),
            image: meta.image || item.icon || 'images/photos/main-page-photo.jpg',
            breadcrumbs: [
              { name: 'Domů', path: '/' },
              { name: 'iPhone', path: '/index.html?kategorie=iphone#cenik' },
              { name: device.name, path: '/iphone.html?model=' + encodeURIComponent(device.id) },
              {
                name: repairTitle,
                path:
                  '/oprava.html?model=' + encodeURIComponent(device.id) +
                  '&oprava=' + encodeURIComponent(repairId)
              }
            ],
            service: {
              name: repairTitle,
              description: meta.description || '',
              price: item.price || null
            }
          });
        }

        root.innerHTML = html;
        bindCart();
      })
      .catch(function () {
        root.innerHTML =
          '<div class="its-repair-empty">Detail se nepodařilo načíst. Spusťte web přes <code>npm start</code>.</div>';
      });
  });
})();
