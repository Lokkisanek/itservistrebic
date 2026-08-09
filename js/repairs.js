(function () {
  var data = window.ITS_DEVICES;
  if (!data) return;

  var IPHONES = data.IPHONES;
  var PLACEHOLDER = data.PLACEHOLDER;

  var REPAIRS = {
    default: {
      software: [
        { title: 'Instalace Windows', price: 'od 590 Kč' },
        { title: 'Instalace ovladačů a softwaru', price: 'od 390 Kč' },
        { title: 'Odvirování a čištění systému', price: 'od 490 Kč' },
        { title: 'Záloha a obnova dat', price: 'od 590 Kč' },
        { title: 'Přenos dat na nové zařízení', price: 'od 490 Kč' },
        { title: 'Konfigurace e-mailu a tiskárny', price: 'od 390 Kč' }
      ],
      pc: [
        { title: 'Diagnostika PC / notebooku', price: 'zdarma při opravě' },
        { title: 'Čištění zařízení (1 hod)', price: 'od 590 Kč' },
        { title: 'Výměna SSD / HDD', price: 'od 490 Kč' },
        { title: 'Rozšíření RAM', price: 'od 390 Kč' },
        { title: 'Oprava základní desky / napájení', price: 'od 990 Kč' },
        { title: 'Sestavení PC na míru', price: 'od 1 490 Kč' }
      ]
    }
  };

  var CATEGORY_LABELS = {
    iphone: 'iPhone',
    software: 'Instalace softwaru',
    pc: 'PC / Notebook'
  };

  document.addEventListener('DOMContentLoaded', function () {
    var finder = document.getElementById('repair-finder');
    if (!finder) return;

    var categoryBtns = finder.querySelectorAll('.its-repair-cat');
    var resultsEl = document.getElementById('repair-results');
    var panelTitle = document.getElementById('repair-panel-title');
    var activeCategory = 'iphone';

    function setPanelTitle(text) {
      if (panelTitle) panelTitle.textContent = text;
    }

    function parsePrice(priceText) {
      if (typeof priceText === 'number') return priceText;
      var digits = String(priceText || '').replace(/[^\d]/g, '');
      return digits ? Number(digits) : 0;
    }

    function slugify(text) {
      return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderRepairList(items, meta, category) {
      if (!items.length) {
        resultsEl.innerHTML =
          '<div class="its-repair-empty">Pro tento výběr zatím nemáme ceník. ' +
          '<a href="kontakt.html">Kontaktujte nás</a> pro individuální nabídku.</div>';
        return;
      }

      resultsEl.innerHTML = items.map(function (item, index) {
        var priceNum = parsePrice(item.price);
        var repairId = slugify(category + '-' + item.title) || ('item-' + index);
        return (
          '<div class="its-repair-result">' +
            '<div>' +
              '<div class="its-repair-result__title">' + escapeHtml(item.title) + '</div>' +
              (meta ? '<div class="its-repair-result__meta">' + escapeHtml(meta) + '</div>' : '') +
            '</div>' +
            '<div class="its-repair-result__actions">' +
              '<span class="its-repair-result__price">' + escapeHtml(item.price) + '</span>' +
              '<button type="button" class="its-repair-order-btn" ' +
                'data-cart-add ' +
                'data-model-id="' + escapeHtml(category) + '" ' +
                'data-model-name="' + escapeHtml(CATEGORY_LABELS[category] || category) + '" ' +
                'data-repair-id="' + escapeHtml(repairId) + '" ' +
                'data-repair-title="' + escapeHtml(item.title) + '" ' +
                'data-price="' + priceNum + '" ' +
                'data-time="" ' +
                'data-icon="images/devices/iphone-parts/iphone-broken-display-logo.svg" ' +
                'data-vat-rate="21">' +
                'Přidat do košíku' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      if (!window.ITSCart) return;
      resultsEl.querySelectorAll('[data-cart-add]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var result = window.ITSCart.addItem({
            modelId: btn.getAttribute('data-model-id'),
            modelName: btn.getAttribute('data-model-name'),
            repairId: btn.getAttribute('data-repair-id'),
            repairTitle: btn.getAttribute('data-repair-title'),
            price: Number(btn.getAttribute('data-price')) || 0,
            time: btn.getAttribute('data-time') || '',
            icon: btn.getAttribute('data-icon'),
            vatRate: Number(btn.getAttribute('data-vat-rate')) || 21
          });
          if (result.duplicate) {
            btn.textContent = 'Již v košíku';
            setTimeout(function () { btn.textContent = 'Přidat do košíku'; }, 1500);
          }
          window.ITSCart.openModal(true);
        });
      });
    }

    function renderDeviceGrid(devices) {
      setPanelTitle('');

      resultsEl.innerHTML =
        '<div class="its-device-list">' +
        devices.map(function (device) {
          return (
            '<a href="iphone.html?model=' + encodeURIComponent(device.id) + '" class="its-device-row">' +
              '<div class="its-device-row__img">' +
                '<img src="' + escapeHtml(device.image) + '" alt="' + escapeHtml(device.name) +
                  '" width="32" height="40" loading="lazy" onerror="this.src=\'' + escapeHtml(PLACEHOLDER) + '\'">' +
              '</div>' +
              '<div class="its-device-row__body">' +
                '<span class="its-device-row__name">' + escapeHtml(device.name) + '</span>' +
                '<span class="its-device-row__action">Vybrat model &gt;</span>' +
              '</div>' +
            '</a>'
          );
        }).join('') +
        '</div>';
    }

    function renderView() {
      if (activeCategory === 'iphone') {
        renderDeviceGrid(IPHONES);
        return;
      }

      var items = REPAIRS.default[activeCategory] || [];
      setPanelTitle(CATEGORY_LABELS[activeCategory] + ' — orientační ceny');
      renderRepairList(items, CATEGORY_LABELS[activeCategory], activeCategory);
    }

    categoryBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeCategory = btn.getAttribute('data-category');
        categoryBtns.forEach(function (b) {
          var isActive = b === btn;
          b.classList.toggle('its-repair-cat--active', isActive);
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        renderView();
      });
    });

    function activateCategory(cat) {
      var target = finder.querySelector('[data-category="' + cat + '"]');
      if (!target) return;
      activeCategory = cat;
      categoryBtns.forEach(function (b) {
        var isActive = b === target;
        b.classList.toggle('its-repair-cat--active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    var params = new URLSearchParams(window.location.search);
    var catFromUrl = params.get('kategorie');
    if (catFromUrl) {
      activateCategory(catFromUrl);
    }

    renderView();

    if (window.location.hash === '#cenik') {
      var cenikSection = document.getElementById('cenik');
      if (cenikSection) {
        requestAnimationFrame(function () {
          cenikSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  });
})();
