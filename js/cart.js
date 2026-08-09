(function () {
  var STORAGE_KEY = 'itservistrebic-cart';

  function formatPrice(amount) {
    return Number(amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeSrc(src) {
    var value = String(src || '').trim();
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value) || value.indexOf('data:') === 0 || value.indexOf('javascript:') === 0) {
      return '';
    }
    return escapeHtml(value);
  }

  function readCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    document.dispatchEvent(new CustomEvent('its-cart-updated', { detail: { items: items } }));
  }

  function itemKey(item) {
    return item.modelId + '::' + item.repairId;
  }

  var cart = {
    getItems: function () {
      return readCart();
    },

    getCount: function () {
      return readCart().length;
    },

    getTotal: function () {
      return readCart().reduce(function (sum, item) {
        return sum + (Number(item.price) || 0);
      }, 0);
    },

    addItem: function (item) {
      var items = readCart();
      var key = itemKey(item);
      if (items.some(function (i) { return itemKey(i) === key; })) {
        return { added: false, duplicate: true, items: items };
      }
      items.push(item);
      writeCart(items);
      return { added: true, duplicate: false, items: items };
    },

    removeItem: function (key) {
      var items = readCart().filter(function (i) { return itemKey(i) !== key; });
      writeCart(items);
      return items;
    },

    clear: function () {
      writeCart([]);
    }
  };

  window.ITSCart = cart;

  function cartIconSvg() {
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<circle cx="9" cy="21" r="1"/>' +
        '<circle cx="20" cy="21" r="1"/>' +
        '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
      '</svg>'
    );
  }

  function ensureNavButton() {
    var actions = document.querySelector('.its-nav__actions');
    if (!actions || document.getElementById('nav-cart-btn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'nav-cart-btn';
    btn.className = 'its-nav__cart';
    btn.setAttribute('aria-label', 'Košík');
    btn.innerHTML =
      cartIconSvg() +
      '<span class="its-nav__cart-count" id="cart-count" hidden>0</span>';

    var phone = actions.querySelector('.its-nav__phone');
    if (phone) {
      actions.insertBefore(btn, phone);
    } else {
      actions.prepend(btn);
    }

    btn.addEventListener('click', function () {
      openModal(false);
    });
  }

  function ensureModal() {
    if (document.getElementById('cart-modal')) return;

    var modal = document.createElement('div');
    modal.id = 'cart-modal';
    modal.className = 'its-cart-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cart-modal-title');
    modal.innerHTML =
      '<div class="its-cart-modal__backdrop" data-cart-close></div>' +
      '<div class="its-cart-modal__panel">' +
        '<button type="button" class="its-cart-modal__close" data-cart-close aria-label="Zavřít">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
          '</svg>' +
        '</button>' +
        '<div class="its-cart-modal__head">' +
          '<h2 class="its-cart-modal__title" id="cart-modal-title">Košík</h2>' +
          '<p class="its-cart-modal__subtitle" id="cart-modal-subtitle"></p>' +
        '</div>' +
        '<div class="its-cart-modal__body" id="cart-modal-body"></div>' +
        '<div class="its-cart-modal__footer">' +
          '<div class="its-cart-modal__total">' +
            '<span>Celkem vč. DPH</span>' +
            '<strong id="cart-modal-total">0 Kč</strong>' +
          '</div>' +
          '<div class="its-cart-modal__actions">' +
            '<button type="button" class="its-btn its-btn--outline" data-cart-close>Pokračovat v nákupu</button>' +
            '<a href="pokladna.html" class="its-btn its-btn--primary" id="cart-modal-checkout">Dokončit rezervaci</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-cart-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    var checkoutBtn = modal.querySelector('#cart-modal-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function (e) {
        if (checkoutBtn.classList.contains('is-disabled')) {
          e.preventDefault();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  function renderModalItems(items) {
    var body = document.getElementById('cart-modal-body');
    var subtitle = document.getElementById('cart-modal-subtitle');
    var totalEl = document.getElementById('cart-modal-total');
    var checkoutBtn = document.getElementById('cart-modal-checkout');

    if (!body) return;

    if (!items.length) {
      if (subtitle) subtitle.textContent = 'Košík je prázdný.';
      body.innerHTML = '<p class="its-cart-modal__empty">Přidejte opravy z ceníku iPhonu.</p>';
      if (totalEl) totalEl.textContent = '0 Kč';
      if (checkoutBtn) checkoutBtn.classList.add('is-disabled');
      return;
    }

    if (subtitle) {
      subtitle.textContent = items.length === 1
        ? '1 položka v košíku'
        : items.length + ' položky v košíku';
    }

    body.innerHTML =
      '<ul class="its-cart-modal__list">' +
        items.map(function (item) {
          var key = escapeHtml(itemKey(item));
          var icon = safeSrc(item.icon);
          return (
            '<li class="its-cart-modal__item">' +
              '<div class="its-cart-modal__item-icon">' +
                (icon ? '<img src="' + icon + '" alt="">' : '') +
              '</div>' +
              '<div class="its-cart-modal__item-info">' +
                '<strong>' + escapeHtml(item.repairTitle) + '</strong>' +
                '<span>' + escapeHtml(item.modelName) + '</span>' +
              '</div>' +
              '<div class="its-cart-modal__item-price">' + formatPrice(item.price) + '</div>' +
              '<button type="button" class="its-cart-modal__remove" data-cart-remove="' + key + '" aria-label="Odebrat">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
                '</svg>' +
              '</button>' +
            '</li>'
          );
        }).join('') +
      '</ul>';

    body.querySelectorAll('[data-cart-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cart.removeItem(btn.getAttribute('data-cart-remove'));
        renderModalItems(cart.getItems());
      });
    });

    if (totalEl) totalEl.textContent = formatPrice(cart.getTotal());
    if (checkoutBtn) checkoutBtn.classList.remove('is-disabled');
  }

  function openModal(justAdded) {
    ensureModal();
    var modal = document.getElementById('cart-modal');
    var title = document.getElementById('cart-modal-title');
    if (!modal) return;

    if (title) {
      title.textContent = justAdded ? 'Přidáno do košíku' : 'Košík';
    }

    renderModalItems(cart.getItems());
    modal.hidden = false;
    document.body.classList.add('its-cart-open');

    var closeBtn = modal.querySelector('.its-cart-modal__close');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    var modal = document.getElementById('cart-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('its-cart-open');
  }

  function updateBadge() {
    var badge = document.getElementById('cart-count');
    if (!badge) return;
    var count = cart.getCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  cart.openModal = openModal;
  cart.closeModal = closeModal;

  document.addEventListener('DOMContentLoaded', function () {
    ensureNavButton();
    ensureModal();
    updateBadge();
  });

  document.addEventListener('its-cart-updated', function () {
    var modal = document.getElementById('cart-modal');
    if (modal && !modal.hidden) {
      renderModalItems(cart.getItems());
    }
  });
})();
