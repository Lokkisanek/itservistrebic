(function () {
  var PAYMENT_LABELS = { hotovost: 'Hotově na místě', qr: 'QR kód na místě' };
  var DELIVERY_LABELS = {
    pobocka: 'Osobní předání na pobočce',
    odvoz: 'Odvoz z vaší adresy',
    'dovoz-instalace': 'Dovoz a instalace',
    'na-miste': 'Práce na místě u vás'
  };

  var state = {
    step: 1,
    items: [],
    slots: [],
    deliveryConfig: null,
    deliveryMethod: '',
    deliveryZoneLabel: '',
    deliveryFee: 0,
    deliveryDistanceKm: null,
    pickupLat: null,
    pickupLng: null,
    slotId: '',
    slotDate: '',
    slotTime: '',
    earliestDate: '',
    pendingDelivery: '',
    pendingPickup: null,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    note: '',
    paymentMethod: 'hotovost',
    consentPrivacy: false,
    consentTerms: false
  };

  var mapCtl = {
    map: null,
    marker: null,
    shopMarker: null,
    bound: false
  };

  function needsTravelFee(deliveryId) {
    return deliveryId === 'odvoz' ||
      deliveryId === 'dovoz-instalace' ||
      deliveryId === 'na-miste';
  }

  function baseDeliveryFee() {
    var p = state.deliveryConfig && state.deliveryConfig.pricing;
    return (p && Number(p.baseFee)) || 39;
  }

  function odvozBadge() {
    return 'od ' + formatPrice(baseDeliveryFee());
  }

  function formatPrice(amount) {
    return Number(amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function formatDateCs(isoDate) {
    if (!isoDate) return '';
    var p = isoDate.split('-');
    if (p.length !== 3) return isoDate;
    return p[2] + '. ' + p[1] + '. ' + p[0];
  }

  function itemCategory(item) {
    var id = item.modelId || '';
    if (id === 'software') return 'software';
    if (id === 'pc') return 'pc';
    return 'mobile';
  }

  function cartCategories(items) {
    var set = {};
    items.forEach(function (item) {
      set[itemCategory(item)] = true;
    });
    return Object.keys(set);
  }

  /** Doprava podle produktů v košíku */
  function deliveryOptionsFor(items) {
    var cats = cartCategories(items);
    var hasSoftware = cats.indexOf('software') !== -1;
    var hasPc = cats.indexOf('pc') !== -1;
    var hasMobile = cats.indexOf('mobile') !== -1;
    var onlySoftware = hasSoftware && !hasPc && !hasMobile;
    var onlyPc = hasPc && !hasSoftware && !hasMobile;

    // PC opravy: jen předání / odvoz, práce vždy v servisu
    if (onlyPc || (hasPc && !hasSoftware)) {
      return [
        {
          id: 'pobocka',
          title: 'Osobní předání na pobočce',
          text: 'Přineste PC / notebook na Novodvorská 1077/15, Nové Dvory. Oprava probíhá vždy u nás v servisu.',
          badge: null
        },
        {
          id: 'odvoz',
          title: 'Odvoz z vaší adresy',
          text: 'Vyzvedneme zařízení u vás a opravíme ho u nás v servisu. Cena odvozu dle vzdálenosti — po Třebíči od 39 Kč.',
          badge: odvozBadge(),
          badgePaid: true
        }
      ];
    }

    // Software: předání, odvoz, dovoz + instalace, práce na místě
    if (onlySoftware) {
      return [
        {
          id: 'pobocka',
          title: 'Osobní předání na pobočce',
          text: 'Přineste zařízení na Novodvorská 1077/15, Nové Dvory. Softwarové úkony uděláme u nás.',
          badge: null
        },
        {
          id: 'odvoz',
          title: 'Odvoz z vaší adresy',
          text: 'Vyzvedneme zařízení, nainstalujeme software u nás a vrátíme zpět. Odvoz dle vzdálenosti — po Třebíči od 39 Kč.',
          badge: odvozBadge(),
          badgePaid: true
        },
        {
          id: 'dovoz-instalace',
          title: 'Dovoz a instalace',
          text: 'Přijedeme k vám, dovezeme potřebné a nainstalujeme / nastavíme na místě. Doprava dle vzdálenosti.',
          badge: odvozBadge(),
          badgePaid: true
        },
        {
          id: 'na-miste',
          title: 'Práce na místě u vás',
          text: 'Přijedeme k vám a softwarové úkony provedeme přímo u vás. Doprava dle vzdálenosti.',
          badge: odvozBadge(),
          badgePaid: true
        }
      ];
    }

    // Mobily (a smíšené s mobilem bez PC-only logiky výše): předání / odvoz
    return [
      {
        id: 'pobocka',
        title: 'Osobní předání na pobočce',
        text: 'Přineste zařízení na Novodvorská 1077/15, Nové Dvory, Třebíč. Vyberte termín návštěvy.',
        badge: null
      },
      {
        id: 'odvoz',
        title: 'Odvoz z vaší adresy',
        text: 'Vyzvedneme zařízení u vás. Označte adresu na mapě — po Třebíči odvoz od 39 Kč.',
        badge: odvozBadge(),
        badgePaid: true
      }
    ];
  }

  function itemKey(item) {
    return item.modelId + '::' + item.repairId;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function itemsTotal() {
    return state.items.reduce(function (sum, i) { return sum + (Number(i.price) || 0); }, 0);
  }

  function total() {
    return itemsTotal() + (Number(state.deliveryFee) || 0);
  }

  function renderStepper() {
    var steps = [
      { n: 1, label: 'Rezervace' },
      { n: 2, label: 'Doprava' },
      { n: 3, label: 'Osobní údaje' }
    ];
    return (
      '<ol class="its-booking__steps">' +
        steps.map(function (s) {
          var cls = 'its-booking__step';
          if (state.step === s.n) cls += ' is-active';
          if (state.step > s.n) cls += ' is-done';
          return (
            '<li class="' + cls + '">' +
              '<span class="its-booking__step-num">' + s.n + '</span>' +
              '<span class="its-booking__step-label">' + s.label + '</span>' +
            '</li>'
          );
        }).join('') +
      '</ol>'
    );
  }

  function renderSummarySidebar() {
    return (
      '<aside class="its-booking__aside">' +
        '<div class="its-booking__card">' +
          '<h2 class="its-booking__aside-title">Souhrn rezervace</h2>' +
          '<p class="its-booking__aside-count">Položek: ' + state.items.length + '</p>' +
          (state.deliveryMethod
            ? '<p class="its-booking__aside-meta"><strong>Doprava:</strong> ' +
              escapeHtml(DELIVERY_LABELS[state.deliveryMethod] || state.deliveryMethod) + '</p>'
            : '') +
          (state.deliveryFee > 0
            ? '<p class="its-booking__aside-meta"><strong>Odvoz / doprava:</strong> ' +
              escapeHtml(state.deliveryZoneLabel) + ' · ' + formatPrice(state.deliveryFee) + '</p>'
            : '') +
          (state.slotDate
            ? '<p class="its-booking__aside-meta"><strong>Termín:</strong> ' +
              formatDateCs(state.slotDate) + ' · ' + escapeHtml(state.slotTime) + '</p>'
            : '') +
          '<div class="its-booking__aside-total">' +
            '<span>Celkem vč. DPH</span>' +
            '<strong>' + formatPrice(total()) + '</strong>' +
          '</div>' +
          (state.step === 1
            ? '<button type="button" class="its-btn its-btn--primary its-btn--block" id="booking-next-1">Pokračovat</button>'
            : '') +
        '</div>' +
      '</aside>'
    );
  }

  function renderStep1() {
    return (
      '<div class="its-booking__layout">' +
        '<div class="its-booking__main">' +
          '<div class="its-booking__card">' +
            '<div class="its-booking__card-head">' +
              '<h1 class="its-booking__title">Rezervace</h1>' +
              '<span class="its-booking__count">Položek: ' + state.items.length + '</span>' +
            '</div>' +
            '<ul class="its-booking__items">' +
              state.items.map(function (item) {
                return (
                  '<li class="its-booking__item">' +
                    '<div class="its-booking__item-icon">' +
                      (item.icon ? '<img src="' + escapeHtml(item.icon) + '" alt="">' : '') +
                    '</div>' +
                    '<div class="its-booking__item-info">' +
                      '<strong>' + escapeHtml(item.repairTitle) + '</strong>' +
                      '<span>Servis na ' + escapeHtml(item.modelName) + '</span>' +
                    '</div>' +
                    '<div class="its-booking__item-price">' + formatPrice(item.price) + '</div>' +
                    '<button type="button" class="its-booking__item-remove" data-remove="' +
                      escapeHtml(itemKey(item)) + '" aria-label="Odebrat">×</button>' +
                  '</li>'
                );
              }).join('') +
            '</ul>' +
          '</div>' +
        '</div>' +
        renderSummarySidebar() +
      '</div>'
    );
  }

  function renderStep2() {
    var options = deliveryOptionsFor(state.items);
    return (
      '<div class="its-booking__layout">' +
        '<div class="its-booking__main">' +
          '<div class="its-booking__card">' +
            '<h1 class="its-booking__title">Doprava</h1>' +
            '<p class="its-booking__hint">Možnosti závisí na typech služeb v košíku.</p>' +
            (earliestSlotHint()
              ? '<p class="its-booking__hint">' + escapeHtml(earliestSlotHint()) + '</p>'
              : '') +
            '<div class="its-booking__delivery">' +
              options.map(function (opt) {
                var selected = state.deliveryMethod === opt.id && state.slotId;
                return (
                  '<div class="its-booking__delivery-row' + (selected ? ' is-selected' : '') + '">' +
                    '<div class="its-booking__delivery-info">' +
                      '<strong>' + escapeHtml(opt.title) + '</strong>' +
                      '<span>' + escapeHtml(opt.text) + '</span>' +
                      (opt.badge
                        ? '<span class="its-booking__badge' + (opt.badgePaid ? ' its-booking__badge--paid' : '') + '">' +
                          escapeHtml(opt.badge) + '</span>'
                        : '') +
                      (selected
                        ? '<span class="its-booking__selected-slot">Termín: ' +
                          formatDateCs(state.slotDate) + ' · ' + escapeHtml(state.slotTime) +
                          (state.deliveryFee > 0
                            ? ' · ' + escapeHtml(state.deliveryZoneLabel) + ' (' + formatPrice(state.deliveryFee) + ')'
                            : '') +
                          '</span>'
                        : '') +
                    '</div>' +
                    '<button type="button" class="its-btn its-btn--primary" data-pick-delivery="' +
                      opt.id + '">' +
                      (selected ? 'Změnit termín' : 'Vybrat') +
                    '</button>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +
            '<div class="its-booking__nav">' +
              '<button type="button" class="its-btn its-btn--outline" id="booking-back-2">Zpět</button>' +
              '<button type="button" class="its-btn its-btn--primary" id="booking-next-2"' +
                (state.deliveryMethod && state.slotId ? '' : ' disabled') +
              '>Pokračovat</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        renderSummarySidebar() +
      '</div>'
    );
  }

  function renderStep3() {
    var needsAddress =
      state.deliveryMethod === 'odvoz' ||
      state.deliveryMethod === 'na-miste' ||
      state.deliveryMethod === 'dovoz-instalace';
    return (
      '<div class="its-booking__layout">' +
        '<div class="its-booking__main">' +
          '<div class="its-booking__card">' +
            '<h1 class="its-booking__title">Osobní údaje</h1>' +
            '<form id="booking-form" class="its-booking__form">' +
              '<div class="its-booking__form-row">' +
                '<label class="its-field">' +
                  '<span class="its-field__label">Jméno</span>' +
                  '<input class="its-field__input" type="text" id="booking-first" required autocomplete="given-name" value="' +
                    escapeHtml(state.firstName) + '">' +
                '</label>' +
                '<label class="its-field">' +
                  '<span class="its-field__label">Příjmení</span>' +
                  '<input class="its-field__input" type="text" id="booking-last" required autocomplete="family-name" value="' +
                    escapeHtml(state.lastName) + '">' +
                '</label>' +
              '</div>' +
              '<label class="its-field">' +
                '<span class="its-field__label">E-mail</span>' +
                '<input class="its-field__input" type="email" id="booking-email" required autocomplete="email" placeholder="vas@email.cz" value="' +
                  escapeHtml(state.email) + '">' +
              '</label>' +
              '<label class="its-field">' +
                '<span class="its-field__label">Telefon</span>' +
                '<input class="its-field__input" type="tel" id="booking-phone" required autocomplete="tel" placeholder="+420 …" value="' +
                  escapeHtml(state.phone) + '">' +
              '</label>' +
              (needsAddress
                ? '<label class="its-field">' +
                    '<span class="its-field__label">Adresa</span>' +
                    '<input class="its-field__input" type="text" id="booking-address" required autocomplete="street-address" placeholder="Ulice, město" value="' +
                      escapeHtml(state.address) + '">' +
                  '</label>'
                : '') +
              '<label class="its-field">' +
                '<span class="its-field__label">Poznámka (volitelné)</span>' +
                '<textarea class="its-field__input its-field__textarea" id="booking-note" rows="2">' +
                  escapeHtml(state.note) +
                '</textarea>' +
              '</label>' +
              '<fieldset class="its-checkout__payment">' +
                '<legend class="its-checkout__heading">Platba na místě</legend>' +
                '<p class="its-checkout__payment-note">Platíte až při převzetí — online platba není potřeba.</p>' +
                '<label class="its-checkout__radio">' +
                  '<input type="radio" name="payment" value="hotovost"' +
                    (state.paymentMethod === 'hotovost' ? ' checked' : '') + '>' +
                  '<span>Hotově</span>' +
                '</label>' +
                '<label class="its-checkout__radio">' +
                  '<input type="radio" name="payment" value="qr"' +
                    (state.paymentMethod === 'qr' ? ' checked' : '') + '>' +
                  '<span>Převodem přes QR kód</span>' +
                '</label>' +
              '</fieldset>' +
              '<label class="its-booking__check">' +
                '<input type="checkbox" id="booking-privacy" required' +
                  (state.consentPrivacy ? ' checked' : '') + '>' +
                '<span>Souhlasím se <a href="ochrana-udaju.html" target="_blank" rel="noopener">zpracováním osobních údajů</a></span>' +
              '</label>' +
              '<label class="its-booking__check">' +
                '<input type="checkbox" id="booking-terms" required' +
                  (state.consentTerms ? ' checked' : '') + '>' +
                '<span>Souhlasím s <a href="obchodni-podminky.html" target="_blank" rel="noopener">obchodními podmínkami</a> (platba na místě)</span>' +
              '</label>' +
              '<div class="its-checkout__message" id="checkout-message" hidden></div>' +
              '<div class="its-booking__nav">' +
                '<button type="button" class="its-btn its-btn--outline" id="booking-back-3">Zpět</button>' +
                '<button type="submit" class="its-btn its-btn--primary" id="checkout-submit">Závazně rezervovat</button>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>' +
        renderSummarySidebar() +
      '</div>'
    );
  }

  function renderSuccess(order) {
    return (
      '<div class="its-booking__card its-booking__card--success">' +
        '<h1 class="its-booking__title">Rezervace přijata</h1>' +
        '<p class="its-checkout__success-lead">Děkujeme. Brzy vás budeme kontaktovat ohledně potvrzení.</p>' +
        '<dl class="its-checkout__success-meta">' +
          '<div><dt>Číslo rezervace</dt><dd>' + escapeHtml(order.id) + '</dd></div>' +
          '<div><dt>Doprava</dt><dd>' + escapeHtml(DELIVERY_LABELS[order.deliveryMethod] || '') +
            (order.deliveryFee
              ? ' · ' + escapeHtml(order.deliveryZoneLabel || '') + ' (' + formatPrice(order.deliveryFee) + ')'
              : '') +
            '</dd></div>' +
          '<div><dt>Termín</dt><dd>' + formatDateCs(order.slotDate) + ' · ' + escapeHtml(order.slotTime) + '</dd></div>' +
          '<div><dt>Platba</dt><dd>' + escapeHtml(PAYMENT_LABELS[order.paymentMethod] || '') + '</dd></div>' +
          '<div><dt>Celkem</dt><dd>' + formatPrice(order.price) + '</dd></div>' +
        '</dl>' +
        '<div class="its-checkout__success-actions">' +
          '<a href="index.html?kategorie=iphone#cenik" class="its-btn its-btn--primary">Zpět do ceníku</a>' +
          '<a href="kontakt.html" class="its-btn its-btn--outline">Kontakt</a>' +
        '</div>' +
      '</div>'
    );
  }

  function renderEmpty() {
    return (
      '<div class="its-booking__card">' +
        '<h1 class="its-booking__title">Košík je prázdný</h1>' +
        '<p class="its-booking__hint">Nejdřív přidejte opravu z ceníku.</p>' +
        '<a href="index.html?kategorie=iphone#cenik" class="its-btn its-btn--primary">Vybrat opravu</a>' +
      '</div>'
    );
  }

  function render() {
    var root = document.getElementById('booking-root');
    if (!root) return;

    if (!state.items.length && state.step !== 'done') {
      root.innerHTML = renderEmpty();
      return;
    }

    if (state.step === 'done') return;

    var body = '';
    if (state.step === 1) body = renderStep1();
    else if (state.step === 2) body = renderStep2();
    else body = renderStep3();

    root.innerHTML = renderStepper() + body;
    bindUi();
  }

  function collectFormIntoState() {
    var first = document.getElementById('booking-first');
    var last = document.getElementById('booking-last');
    var email = document.getElementById('booking-email');
    var phone = document.getElementById('booking-phone');
    var address = document.getElementById('booking-address');
    var note = document.getElementById('booking-note');
    var pay = document.querySelector('input[name="payment"]:checked');
    var privacy = document.getElementById('booking-privacy');
    var terms = document.getElementById('booking-terms');
    if (first) state.firstName = first.value.trim();
    if (last) state.lastName = last.value.trim();
    if (email) state.email = email.value.trim();
    if (phone) state.phone = phone.value.trim();
    if (address) state.address = address.value.trim();
    if (note) state.note = note.value.trim();
    if (pay) state.paymentMethod = pay.value;
    if (privacy) state.consentPrivacy = privacy.checked;
    if (terms) state.consentTerms = terms.checked;
  }

  function bindUi() {
    var next1 = document.getElementById('booking-next-1');
    if (next1) {
      next1.addEventListener('click', function () {
        if (!state.items.length) return;
        loadAvailableSlots().then(function () {
          state.step = 2;
          render();
        });
      });
    }

    var back2 = document.getElementById('booking-back-2');
    if (back2) {
      back2.addEventListener('click', function () {
        state.step = 1;
        render();
      });
    }

    var next2 = document.getElementById('booking-next-2');
    if (next2) {
      next2.addEventListener('click', function () {
        if (!state.deliveryMethod || !state.slotId) return;
        state.step = 3;
        render();
      });
    }

    var back3 = document.getElementById('booking-back-3');
    if (back3) {
      back3.addEventListener('click', function () {
        collectFormIntoState();
        state.step = 2;
        render();
      });
    }

    document.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.ITSCart.removeItem(btn.getAttribute('data-remove'));
        state.items = window.ITSCart.getItems();
        loadAvailableSlots().then(function () { render(); });
      });
    });

    document.querySelectorAll('[data-pick-delivery]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var deliveryId = btn.getAttribute('data-pick-delivery');
        loadAvailableSlots().then(function () {
          openSlotModal(deliveryId);
        });
      });
    });

    var form = document.getElementById('booking-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        collectFormIntoState();
        submitOrder();
      });
    }
  }

  function uniqueDates(slots) {
    var map = {};
    slots.forEach(function (s) { map[s.date] = true; });
    return Object.keys(map).sort();
  }

  function timesForDate(date) {
    return state.slots.filter(function (s) { return s.date === date; });
  }

  function cartItemsPayload() {
    return state.items.map(function (i) {
      return { modelId: i.modelId, repairId: i.repairId };
    });
  }

  function loadAvailableSlots() {
    return fetch('/api/slots/available', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cartItemsPayload() })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.slots = data.slots || [];
        state.earliestDate = data.earliestDate || '';
        return data;
      })
      .catch(function () {
        state.slots = [];
        state.earliestDate = '';
      });
  }

  function earliestSlotHint() {
    if (!state.earliestDate) return '';
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1).padStart(2, '0');
    var d = String(today.getDate()).padStart(2, '0');
    var todayIso = y + '-' + m + '-' + d;
    if (state.earliestDate <= todayIso) return '';
    return 'Nejbližší dostupné termíny od ' + formatDateCs(state.earliestDate) + '.';
  }

  function openSlotModal(deliveryId) {
    state.pendingDelivery = deliveryId;
    state.pendingPickup = null;
    var modal = document.getElementById('slot-modal');
    var text = document.getElementById('slot-modal-text');
    var mapWrap = document.getElementById('slot-map-wrap');
    var feeEl = document.getElementById('slot-map-fee');
    var searchInput = document.getElementById('slot-address-search');
    var dateSel = document.getElementById('slot-date');
    var timeSel = document.getElementById('slot-time');
    var confirmBtn = document.getElementById('slot-confirm');
    if (!modal || !dateSel || !timeSel) return;

    var hint = earliestSlotHint();
    if (text) {
      var base = '';
      if (deliveryId === 'pobocka') base = 'Zvolte datum a čas návštěvy pobočky.';
      else if (deliveryId === 'odvoz') base = 'Označte adresu na mapě a zvolte termín vyzvednutí.';
      else if (deliveryId === 'dovoz-instalace') base = 'Označte adresu na mapě a zvolte termín.';
      else base = 'Označte adresu na mapě a zvolte termín práce na místě.';
      text.textContent = hint ? base + ' ' + hint : base;
    }

    var travel = needsTravelFee(deliveryId);
    if (mapWrap) mapWrap.hidden = !travel;
    if (feeEl) {
      feeEl.hidden = true;
      feeEl.textContent = '';
      feeEl.classList.remove('is-error');
    }
    if (searchInput) searchInput.value = '';

    var dates = uniqueDates(state.slots);
    dateSel.innerHTML =
      '<option value="">Vyberte datum</option>' +
      dates.map(function (d) {
        return '<option value="' + d + '">' + formatDateCs(d) + '</option>';
      }).join('');
    timeSel.innerHTML = '<option value="">Vyberte čas</option>';
    timeSel.disabled = true;
    if (confirmBtn) confirmBtn.disabled = true;

    if (!dates.length) {
      dateSel.innerHTML = '<option value="">Žádné volné termíny</option>';
    }

    modal.hidden = false;
    if (travel) {
      setTimeout(function () {
        ensurePickupMap();
      }, 40);
    }
    updateSlotConfirmEnabled();
  }

  function originLatLng() {
    var o = (state.deliveryConfig && state.deliveryConfig.origin) || {};
    return {
      lat: Number(o.lat) || 49.2178325,
      lng: Number(o.lng) || 15.8984422
    };
  }

  function ensurePickupMap() {
    if (typeof window.L === 'undefined') return;
    var el = document.getElementById('slot-map');
    if (!el) return;
    var origin = originLatLng();

    if (!mapCtl.map) {
      mapCtl.map = window.L.map(el, { scrollWheelZoom: false });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(mapCtl.map);
      mapCtl.shopMarker = window.L.circleMarker([origin.lat, origin.lng], {
        radius: 7,
        color: '#0ea5e9',
        fillColor: '#0ea5e9',
        fillOpacity: 0.9,
        weight: 2
      }).addTo(mapCtl.map).bindTooltip('Servis');
      mapCtl.map.on('click', function (e) {
        setPickupFromCoords(e.latlng.lat, e.latlng.lng, true);
      });
    }

    mapCtl.map.setView([origin.lat, origin.lng], 13);
    if (mapCtl.marker) {
      mapCtl.map.removeLayer(mapCtl.marker);
      mapCtl.marker = null;
    }
    setTimeout(function () {
      if (mapCtl.map) mapCtl.map.invalidateSize();
    }, 80);
  }

  function setPickupMarker(lat, lng) {
    if (!mapCtl.map || typeof window.L === 'undefined') return;
    if (mapCtl.marker) {
      mapCtl.marker.setLatLng([lat, lng]);
    } else {
      mapCtl.marker = window.L.marker([lat, lng], { draggable: true }).addTo(mapCtl.map);
      mapCtl.marker.on('dragend', function () {
        var pos = mapCtl.marker.getLatLng();
        setPickupFromCoords(pos.lat, pos.lng, true);
      });
    }
    mapCtl.map.panTo([lat, lng]);
  }

  function showMapFee(message, isError) {
    var feeEl = document.getElementById('slot-map-fee');
    if (!feeEl) return;
    feeEl.hidden = false;
    feeEl.textContent = message;
    feeEl.classList.toggle('is-error', !!isError);
  }

  function setPickupFromCoords(lat, lng, reverse) {
    setPickupMarker(lat, lng);
    showMapFee('Počítám cenu odvozu…', false);

    var quoteReq = fetch('/api/delivery-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: lat, lng: lng })
    }).then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, data: data };
      });
    });

    var addressReq = reverse
      ? fetch('/api/reverse-geocode?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng))
          .then(function (r) { return r.json(); })
          .then(function (data) { return data.label || ''; })
          .catch(function () { return ''; })
      : Promise.resolve((state.pendingPickup && state.pendingPickup.address) || '');

    Promise.all([quoteReq, addressReq]).then(function (results) {
      var quoteRes = results[0];
      var address = results[1];
      var searchInput = document.getElementById('slot-address-search');

      if (!quoteRes.ok) {
        state.pendingPickup = null;
        showMapFee(quoteRes.data.error || 'Tuto adresu nelze použít.', true);
        updateSlotConfirmEnabled();
        return;
      }

      var q = quoteRes.data;
      if (!address) {
        address = (state.pendingPickup && state.pendingPickup.address) ||
          (lat.toFixed(5) + ', ' + lng.toFixed(5));
      }
      state.pendingPickup = {
        lat: lat,
        lng: lng,
        address: address,
        fee: q.fee,
        distanceKm: q.distanceKm,
        label: q.label
      };
      if (searchInput) searchInput.value = address;
      showMapFee(q.label + ' od servisu · odvoz ' + formatPrice(q.fee), false);
      updateSlotConfirmEnabled();
    }).catch(function () {
      state.pendingPickup = null;
      showMapFee('Nepodařilo se spočítat cenu. Zkuste to znovu.', true);
      updateSlotConfirmEnabled();
    });
  }

  function searchPickupAddress() {
    var searchInput = document.getElementById('slot-address-search');
    var q = searchInput ? searchInput.value.trim() : '';
    if (q.length < 3) {
      showMapFee('Zadejte alespoň 3 znaky adresy.', true);
      return;
    }
    showMapFee('Hledám adresu…', false);
    fetch('/api/geocode?q=' + encodeURIComponent(q))
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Adresa nenalezena');
          return data;
        });
      })
      .then(function (data) {
        var hit = (data.results || [])[0];
        if (!hit) throw new Error('Adresa nenalezena. Zkuste přesnější zápis.');
        state.pendingPickup = {
          lat: hit.lat,
          lng: hit.lng,
          address: hit.label,
          fee: 0,
          distanceKm: null,
          label: ''
        };
        if (searchInput) searchInput.value = hit.label;
        setPickupFromCoords(hit.lat, hit.lng, false);
      })
      .catch(function (err) {
        state.pendingPickup = null;
        showMapFee(err.message || 'Adresa nenalezena.', true);
        updateSlotConfirmEnabled();
      });
  }

  function updateSlotConfirmEnabled() {
    var confirmBtn = document.getElementById('slot-confirm');
    var timeSel = document.getElementById('slot-time');
    if (!confirmBtn || !timeSel) return;
    var travel = needsTravelFee(state.pendingDelivery);
    var pickupOk = !travel || (state.pendingPickup && state.pendingPickup.fee != null && state.pendingPickup.address);
    confirmBtn.disabled = !(timeSel.value && pickupOk);
  }

  function closeSlotModal() {
    var modal = document.getElementById('slot-modal');
    if (modal) modal.hidden = true;
    state.pendingDelivery = '';
  }

  function bindSlotModal() {
    if (mapCtl.bound) return;
    mapCtl.bound = true;
    var modal = document.getElementById('slot-modal');
    if (!modal) return;

    modal.querySelectorAll('[data-slot-close]').forEach(function (el) {
      el.addEventListener('click', closeSlotModal);
    });

    var dateSel = document.getElementById('slot-date');
    var timeSel = document.getElementById('slot-time');
    var confirmBtn = document.getElementById('slot-confirm');
    var searchBtn = document.getElementById('slot-address-btn');
    var searchInput = document.getElementById('slot-address-search');

    if (searchBtn) searchBtn.addEventListener('click', searchPickupAddress);
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchPickupAddress();
        }
      });
    }

    if (dateSel) {
      dateSel.addEventListener('change', function () {
        var date = dateSel.value;
        var times = timesForDate(date);
        timeSel.disabled = !date || !times.length;
        timeSel.innerHTML =
          '<option value="">Vyberte čas</option>' +
          times.map(function (s) {
            return '<option value="' + s.id + '">' + s.time + '</option>';
          }).join('');
        updateSlotConfirmEnabled();
      });
    }

    if (timeSel) {
      timeSel.addEventListener('change', updateSlotConfirmEnabled);
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        var slotId = timeSel.value;
        var slot = state.slots.find(function (s) { return s.id === slotId; });
        if (!slot || !state.pendingDelivery) return;

        var travel = needsTravelFee(state.pendingDelivery);
        if (travel && !state.pendingPickup) return;

        state.deliveryMethod = state.pendingDelivery;
        state.slotId = slot.id;
        state.slotDate = slot.date;
        state.slotTime = slot.time;
        if (travel && state.pendingPickup) {
          state.pickupLat = state.pendingPickup.lat;
          state.pickupLng = state.pendingPickup.lng;
          state.deliveryFee = Number(state.pendingPickup.fee) || 0;
          state.deliveryDistanceKm = state.pendingPickup.distanceKm;
          state.deliveryZoneLabel = state.pendingPickup.label;
          state.address = state.pendingPickup.address || state.address;
        } else {
          state.pickupLat = null;
          state.pickupLng = null;
          state.deliveryFee = 0;
          state.deliveryDistanceKm = null;
          state.deliveryZoneLabel = '';
        }
        closeSlotModal();
        render();
      });
    }
  }

  function submitOrder() {
    var msgEl = document.getElementById('checkout-message');
    var submitBtn = document.getElementById('checkout-submit');
    if (submitBtn) submitBtn.disabled = true;

    var payload = {
      customer: (state.firstName + ' ' + state.lastName).trim(),
      phone: state.phone,
      email: state.email,
      note: state.note,
      address: state.address,
      paymentMethod: state.paymentMethod,
      deliveryMethod: state.deliveryMethod,
      pickupLat: state.pickupLat,
      pickupLng: state.pickupLng,
      slotId: state.slotId,
      items: state.items
    };

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Chyba odeslání');
          return data;
        });
      })
      .then(function (data) {
        window.ITSCart.clear();
        state.items = [];
        state.step = 'done';
        var root = document.getElementById('booking-root');
        if (root) root.innerHTML = renderSuccess(data);
      })
      .catch(function (err) {
        if (msgEl) {
          msgEl.hidden = false;
          msgEl.className = 'its-checkout__message its-checkout__message--error';
          msgEl.textContent = err.message || 'Rezervaci se nepodařilo odeslat.';
        }
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.ITSCart) return;
    state.items = window.ITSCart.getItems();
    bindSlotModal();

    Promise.all([
      loadAvailableSlots(),
      fetch('/api/delivery-fees').then(function (r) { return r.json(); })
    ])
      .then(function (results) {
        state.deliveryConfig = results[1] || null;
        render();
      })
      .catch(function () {
        state.deliveryConfig = null;
        render();
      });
  });
})();
