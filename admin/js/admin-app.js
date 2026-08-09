(function () {
  var state = {
    orders: [],
    accounting: { entries: [] },
    priceCatalog: { sections: [] },
    priceData: { vatRate: 21, pricesIncludeVat: true, models: {}, costs: {} },
    selectedPriceModel: '',
    selectedMarginModel: '',
    marginFilter: 'all',
    repairContent: { groups: {}, items: {}, comparison: { intro: {}, tiers: [] } },
    selectedRepairId: '',
    slots: [],
    checklist: { categories: [] },
    inventory: { leadDaysWhenOutOfStock: 2, defaultMinQty: 1, stock: {}, minQty: {}, partSuppliers: {} },
    selectedInventoryModel: '',
    selectedAccountingMonth: '',
    statsPeriod: 'all',
    suppliers: [],
    diagnostics: { mobile: null, pc: null },
    mailConfigured: false
  };

  var STATUS_LABELS = {
    prijato: 'Přijato',
    diagnostika: 'Diagnostika',
    oprava: 'V opravě',
    hotovo: 'Hotovo',
    vyzvednuto: 'Vyzvednuto',
    storno: 'Storno'
  };

  var PAYMENT_LABELS = {
    hotovost: 'Hotově',
    qr: 'QR kód',
    prevod: 'Převod',
    karta: 'Karta'
  };

  function formatMoney(n) {
    return Number(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function showAlert(msg, type) {
    var el = document.getElementById('global-alert');
    if (!el) return;
    el.innerHTML = '<div class="its-admin-alert its-admin-alert--' + (type || 'info') + '">' + msg + '</div>';
    setTimeout(function () { el.innerHTML = ''; }, 4000);
  }

  function api(url, options) {
    return window.adminApi(url, options);
  }

  function requireAuth() {
    return api('/api/admin/me').then(function (data) {
      if (!data.authenticated) {
        window.adminGoLogin();
        throw new Error('redirect');
      }
    });
  }

  function switchPanel(name) {
    document.querySelectorAll('.its-admin-panel').forEach(function (p) {
      p.classList.toggle('its-admin-panel--active', p.id === 'panel-' + name);
    });
    document.querySelectorAll('.its-admin-nav__link').forEach(function (a) {
      a.classList.toggle('its-admin-nav__link--active', a.getAttribute('data-panel') === name);
    });
    if (location.hash !== '#' + name) location.hash = name;
    if (name === 'marze') renderMarginOverview();
    if (name === 'cenik') renderPricesEditor();
    if (name === 'sklad') renderInventoryEditor();
    if (name === 'dodavatele') renderSuppliers();
    if (name === 'ucetnictvi') renderAccounting();
    if (name === 'statistiky') renderStats();
  }

  function loadAll() {
    return Promise.all([
      api('/api/admin/orders').then(function (d) { state.orders = d.orders || []; }),
      api('/api/admin/accounting').then(function (d) { state.accounting = d; }),
      api('/api/admin/prices/iphone').then(function (d) {
        state.priceCatalog = d.catalog || { sections: [] };
        state.priceData = {
          vatRate: d.vatRate || 21,
          pricesIncludeVat: d.pricesIncludeVat !== false,
          models: d.models || {},
          costs: d.costs || {}
        };
        if (!state.selectedPriceModel) {
          var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
          state.selectedPriceModel = devices && devices[0] ? devices[0].id : Object.keys(state.priceData.models)[0];
        }
      }),
      api('/api/admin/checklist').then(function (d) { state.checklist = d; }),
      api('/api/admin/diagnostics').then(function (d) { state.diagnostics = d || {}; }),
      api('/api/admin/mail-status').then(function (d) {
        state.mailConfigured = !!d.configured;
        updateMailStatusHint(state.mailConfigured);
      }).catch(function () {
        state.mailConfigured = false;
        updateMailStatusHint(false);
      }),
      api('/api/admin/repair-content').then(function (d) {
        if (d.catalog) state.priceCatalog = d.catalog;
        state.repairContent = d.content || { groups: {}, items: {}, comparison: { intro: {}, tiers: [] } };
        if (!state.selectedRepairId) {
          var first = getAllCatalogItems()[0];
          state.selectedRepairId = first ? first.id : '';
        }
      }),
      api('/api/admin/slots').then(function (d) { state.slots = d.slots || []; }),
      api('/api/admin/inventory').then(function (d) {
        state.inventory = normalizeInventoryState(d);
        if (!state.selectedInventoryModel) {
          var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
          state.selectedInventoryModel = devices && devices[0] ? devices[0].id : '';
        }
      }),
      api('/api/admin/suppliers').then(function (d) {
        state.suppliers = d.suppliers || [];
      })
    ]);
  }

  function normalizeInventoryState(d) {
    d = d || {};
    return {
      leadDaysWhenOutOfStock: d.leadDaysWhenOutOfStock != null ? d.leadDaysWhenOutOfStock : 2,
      defaultMinQty: d.defaultMinQty != null ? d.defaultMinQty : 1,
      stock: d.stock || {},
      minQty: d.minQty || {},
      partSuppliers: d.partSuppliers || {}
    };
  }

  // --- Stats ---

  function repairCategoryById() {
    var map = {};
    (state.priceCatalog.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        map[item.id] = section.title;
      });
    });
    return map;
  }

  function orderLineItems(order) {
    if (Array.isArray(order.items) && order.items.length) {
      return order.items.map(function (item) {
        return {
          repairId: item.repairId || '',
          title: item.repairTitle || item.title || order.repair || 'Oprava',
          price: Number(item.price) || 0,
          modelId: item.modelId || ''
        };
      });
    }
    return [{
      repairId: '',
      title: order.repair || 'Oprava',
      price: Number(order.price) || 0,
      modelId: ''
    }];
  }

  function ordersInStatsPeriod() {
    var period = state.statsPeriod || 'all';
    var now = Date.now();
    return (state.orders || []).filter(function (o) {
      if (o.status === 'storno') return false;
      var created = new Date(o.createdAt || o.updatedAt || 0).getTime();
      if (!created || isNaN(created)) return period === 'all';
      if (period === 'all') return true;
      if (period === '30') return now - created <= 30 * 86400000;
      if (period === '90') return now - created <= 90 * 86400000;
      if (period === 'month') {
        return String(o.createdAt || '').slice(0, 7) === new Date().toISOString().slice(0, 7);
      }
      if (period === 'year') {
        return String(o.createdAt || '').slice(0, 4) === String(new Date().getFullYear());
      }
      return true;
    });
  }

  function formatDurationDays(ms) {
    if (!isFinite(ms) || ms < 0) return '—';
    var days = ms / 86400000;
    if (days < 1) {
      var hours = Math.round(ms / 3600000);
      return hours <= 1 ? 'do 1 hod' : hours + ' hod';
    }
    var rounded = Math.round(days * 10) / 10;
    return rounded + ' dne';
  }

  function normalizeCustomerKey(order) {
    var phone = String(order.phone || '').replace(/\D+/g, '');
    if (phone.length >= 9) return 'p:' + phone.slice(-9);
    var email = String(order.email || '').trim().toLowerCase();
    if (email && email.indexOf('@') !== -1) return 'e:' + email;
    var name = String(order.customer || '').trim().toLowerCase();
    if (name) return 'n:' + name;
    return '';
  }

  function renderStats() {
    var periodEl = document.getElementById('stats-period');
    if (periodEl) periodEl.value = state.statsPeriod || 'all';

    var orders = ordersInStatsPeriod();
    var catMap = repairCategoryById();
    var repairCounts = {};
    var categoryRevenue = {};
    var turnaroundSamples = [];
    var customers = {};

    orders.forEach(function (order) {
      var lines = orderLineItems(order);
      var revenueBase = Number(order.paid) > 0 ? Number(order.paid) : Number(order.price) || 0;

      lines.forEach(function (line) {
        var title = line.title || 'Oprava';
        if (!repairCounts[title]) repairCounts[title] = { count: 0, revenue: 0 };
        repairCounts[title].count += 1;

        var share = lines.length === 1
          ? revenueBase
          : (Number(order.price) > 0
            ? revenueBase * ((Number(line.price) || 0) / Number(order.price))
            : revenueBase / lines.length);
        repairCounts[title].revenue += share;

        var category = (line.repairId && catMap[line.repairId])
          || (line.modelId === 'software' || line.modelId === 'pc' ? 'Software / PC' : null)
          || 'Ostatní / ruční zakázky';
        if (!categoryRevenue[category]) categoryRevenue[category] = { count: 0, revenue: 0 };
        categoryRevenue[category].count += 1;
        categoryRevenue[category].revenue += share;
      });

      if (order.status === 'hotovo' || order.status === 'vyzvednuto') {
        var start = new Date(order.createdAt || 0).getTime();
        var end = new Date(order.completedAt || order.updatedAt || 0).getTime();
        if (start && end && end >= start) {
          turnaroundSamples.push(end - start);
        }
      }

      var key = normalizeCustomerKey(order);
      if (!key) return;
      if (!customers[key]) {
        customers[key] = {
          key: key,
          name: order.customer || '—',
          phone: order.phone || '',
          email: order.email || '',
          count: 0,
          spent: 0,
          lastAt: order.createdAt || ''
        };
      }
      customers[key].count += 1;
      customers[key].spent += Number(order.paid) > 0 ? Number(order.paid) : Number(order.price) || 0;
      if ((order.createdAt || '') > (customers[key].lastAt || '')) {
        customers[key].lastAt = order.createdAt;
        customers[key].name = order.customer || customers[key].name;
        customers[key].phone = order.phone || customers[key].phone;
        customers[key].email = order.email || customers[key].email;
      }
    });

    var repairRows = Object.keys(repairCounts).map(function (title) {
      return {
        title: title,
        count: repairCounts[title].count,
        revenue: repairCounts[title].revenue
      };
    }).sort(function (a, b) { return b.count - a.count || b.revenue - a.revenue; });

    var revenueRows = Object.keys(categoryRevenue).map(function (cat) {
      return {
        category: cat,
        count: categoryRevenue[cat].count,
        revenue: categoryRevenue[cat].revenue
      };
    }).sort(function (a, b) { return b.revenue - a.revenue; });

    var avgTurnaround = 0;
    if (turnaroundSamples.length) {
      avgTurnaround = turnaroundSamples.reduce(function (s, n) { return s + n; }, 0) / turnaroundSamples.length;
    }
    var medianTurnaround = 0;
    if (turnaroundSamples.length) {
      var sorted = turnaroundSamples.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(sorted.length / 2);
      medianTurnaround = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    var repeatCustomers = Object.keys(customers).map(function (k) {
      return customers[k];
    }).filter(function (c) {
      return c.count >= 2;
    }).sort(function (a, b) {
      return b.count - a.count || b.spent - a.spent;
    });

    var totalRevenue = revenueRows.reduce(function (s, r) { return s + r.revenue; }, 0);
    var summary = document.getElementById('stats-summary');
    if (summary) {
      summary.innerHTML =
        statCard('Zakázek', orders.length, 'blue') +
        statCard('Tržby (odhad)', formatMoney(Math.round(totalRevenue)), 'green') +
        statCard('Prům. doba', turnaroundSamples.length ? formatDurationDays(avgTurnaround) : '—', '') +
        statCard('Vracející se', repeatCustomers.length, repeatCustomers.length ? 'green' : '');
    }

    var repairsEl = document.getElementById('stats-repairs-table');
    if (repairsEl) {
      if (!repairRows.length) {
        repairsEl.innerHTML = '<div class="its-admin-empty">Zatím žádná data.</div>';
      } else {
        repairsEl.innerHTML =
          '<table class="its-admin-table"><thead><tr><th>#</th><th>Oprava</th><th>Počet</th><th>Podíl</th><th>Tržby</th></tr></thead><tbody>' +
          repairRows.slice(0, 20).map(function (r, i) {
            var pct = orders.length ? Math.round((r.count / Math.max(1, repairRows.reduce(function (s, x) { return s + x.count; }, 0))) * 1000) / 10 : 0;
            return (
              '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + escapeHtml(r.title) + '</td>' +
                '<td>' + r.count + '</td>' +
                '<td>' + pct + ' %</td>' +
                '<td>' + formatMoney(Math.round(r.revenue)) + '</td>' +
              '</tr>'
            );
          }).join('') +
          '</tbody></table>';
      }
    }

    var revenueEl = document.getElementById('stats-revenue-table');
    if (revenueEl) {
      if (!revenueRows.length) {
        revenueEl.innerHTML = '<div class="its-admin-empty">Zatím žádná data.</div>';
      } else {
        revenueEl.innerHTML =
          '<table class="its-admin-table"><thead><tr><th>Kategorie</th><th>Položek</th><th>Tržby</th><th>Podíl</th></tr></thead><tbody>' +
          revenueRows.map(function (r) {
            var pct = totalRevenue > 0 ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0;
            return (
              '<tr>' +
                '<td>' + escapeHtml(r.category) + '</td>' +
                '<td>' + r.count + '</td>' +
                '<td>' + formatMoney(Math.round(r.revenue)) + '</td>' +
                '<td>' + pct + ' %</td>' +
              '</tr>'
            );
          }).join('') +
          '</tbody></table>';
      }
    }

    var turnEl = document.getElementById('stats-turnaround');
    if (turnEl) {
      if (!turnaroundSamples.length) {
        turnEl.innerHTML = '<div class="its-admin-empty">Zatím žádné dokončené zakázky (Hotovo / Vyzvednuto).</div>';
      } else {
        turnEl.innerHTML =
          '<div class="its-admin-stats" style="margin:0">' +
            statCard('Průměr', formatDurationDays(avgTurnaround), 'blue') +
            statCard('Medián', formatDurationDays(medianTurnaround), 'green') +
            statCard('Dokončených', turnaroundSamples.length, '') +
            statCard('Nejrychlejší', formatDurationDays(Math.min.apply(null, turnaroundSamples)), '') +
          '</div>' +
          '<p class="its-admin-photos__hint" style="margin-top:0.75rem;margin-bottom:0">' +
            'Počítá se od vytvoření zakázky do prvního přepnutí na Hotovo/Vyzvednuto (completedAt).' +
          '</p>';
      }
    }

    var custEl = document.getElementById('stats-customers-table');
    if (custEl) {
      if (!repeatCustomers.length) {
        custEl.innerHTML = '<div class="its-admin-empty">Zatím žádní zákazníci s více než jednou zakázkou.</div>';
      } else {
        custEl.innerHTML =
          '<table class="its-admin-table"><thead><tr><th>Zákazník</th><th>Kontakt</th><th>Zakázek</th><th>Útrata</th><th>Poslední</th></tr></thead><tbody>' +
          repeatCustomers.slice(0, 30).map(function (c) {
            return (
              '<tr>' +
                '<td>' + escapeHtml(c.name) + '</td>' +
                '<td>' + escapeHtml(c.phone || '—') +
                  (c.email ? '<br><small>' + escapeHtml(c.email) + '</small>' : '') +
                '</td>' +
                '<td>' + c.count + '</td>' +
                '<td>' + formatMoney(Math.round(c.spent)) + '</td>' +
                '<td>' + escapeHtml((c.lastAt || '').slice(0, 10)) + '</td>' +
              '</tr>'
            );
          }).join('') +
          '</tbody></table>';
      }
    }
  }

  // --- Dashboard ---

  function renderDashboard() {
    var openOrders = state.orders.filter(function (o) {
      return o.status !== 'vyzvednuto' && o.status !== 'storno';
    }).length;

    var monthPrefix = new Date().toISOString().slice(0, 7);
    var monthIncome = 0;
    var monthExpense = 0;
    state.accounting.entries.forEach(function (e) {
      if (e.date && e.date.slice(0, 7) === monthPrefix) {
        if (e.type === 'income') monthIncome += e.amount;
        else monthExpense += e.amount;
      }
    });

    var doneItems = 0;
    var totalItems = 0;
    state.checklist.categories.forEach(function (cat) {
      cat.items.forEach(function (item) {
        totalItems++;
        if (item.done) doneItems++;
      });
    });

    var lowStock = collectLowStockAlerts();
    document.getElementById('dashboard-stats').innerHTML =
      statCard('Otevřené zakázky', openOrders, 'blue') +
      statCard('Příjmy tento měsíc', formatMoney(monthIncome), 'green') +
      statCard('Nízký sklad', lowStock.length, lowStock.length ? '' : 'green') +
      statCard('Checklist', doneItems + ' / ' + totalItems, 'blue');

    var alertsEl = document.getElementById('dashboard-orders');
    var recent = state.orders.slice(0, 5);
    var html = '';
    if (lowStock.length) {
      html +=
        '<div class="its-admin-alert its-admin-alert--error" style="margin-bottom:1rem">' +
          '<strong>Sklad:</strong> ' + lowStock.length + ' díl(ů) na nebo pod minimem. ' +
          '<button type="button" class="its-admin-link-btn" data-goto="sklad">Otevřít sklad</button>' +
        '</div>';
    }
    if (!recent.length) {
      html += '<div class="its-admin-empty">Zatím žádné zakázky.</div>';
    } else {
      html += renderOrdersTable(recent, true);
    }
    alertsEl.innerHTML = html;
  }

  function statCard(label, value, color) {
    return (
      '<div class="its-admin-stat">' +
        '<div class="its-admin-stat__label">' + label + '</div>' +
        '<div class="its-admin-stat__value' + (color ? ' its-admin-stat__value--' + color : '') + '">' + value + '</div>' +
      '</div>'
    );
  }

  // --- Prices ---

  function getModelLabel(modelId) {
    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    if (devices) {
      var found = devices.find(function (d) { return d.id === modelId; });
      if (found) return found.name;
    }
    return modelId;
  }

  function priceNetLabel(priceIncVat) {
    var rate = state.priceData.vatRate || 21;
    var net = Math.round(priceIncVat / (1 + rate / 100));
    return 'bez DPH: ' + net.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function sellPriceValue(raw) {
    if (raw && typeof raw === 'object') {
      return Number(raw.sell != null ? raw.sell : raw.price) || 0;
    }
    return Number(raw) || 0;
  }

  function getCostEntry(modelId, itemId) {
    var costs = state.priceData.costs || {};
    var modelCosts = costs[modelId] || {};
    var entry = modelCosts[itemId] || {};
    return {
      cost: Number(entry.cost) || 0,
      labor: Number(entry.labor) || 0
    };
  }

  function calcMargin(sell, cost, labor) {
    var s = Number(sell) || 0;
    var c = Number(cost) || 0;
    var l = Number(labor) || 0;
    var margin = s - c - l;
    var pct = s > 0 ? Math.round((margin / s) * 1000) / 10 : 0;
    return { margin: margin, pct: pct };
  }

  function marginClass(pct, sell, cost) {
    if (!(Number(cost) > 0) && !(Number(sell) > 0)) return '';
    if (!(Number(cost) > 0)) return 'its-admin-margin--missing';
    if (pct < 0) return 'its-admin-margin--neg';
    if (pct < 20) return 'its-admin-margin--low';
    return 'its-admin-margin--ok';
  }

  function collectPricesFromDom() {
    var modelId = state.selectedPriceModel;
    if (!modelId) return;
    if (!state.priceData.models[modelId]) state.priceData.models[modelId] = {};
    if (!state.priceData.costs) state.priceData.costs = {};
    if (!state.priceData.costs[modelId]) state.priceData.costs[modelId] = {};

    document.querySelectorAll('#prices-editor .its-admin-price-row[data-item-id]').forEach(function (row) {
      var si = Number(row.getAttribute('data-section'));
      var ii = Number(row.getAttribute('data-item'));
      var itemId = row.getAttribute('data-item-id');
      var catalogItem = state.priceCatalog.sections[si] && state.priceCatalog.sections[si].items[ii];
      var sellInput = row.querySelector('.price-amount');
      var costInput = row.querySelector('.price-cost');
      var laborInput = row.querySelector('.price-labor');
      var titleInput = row.querySelector('.price-title');
      var timeInput = row.querySelector('.price-time');

      state.priceData.models[modelId][itemId] = Number(sellInput && sellInput.value) || 0;
      state.priceData.costs[modelId][itemId] = {
        cost: Number(costInput && costInput.value) || 0,
        labor: Number(laborInput && laborInput.value) || 0
      };
      if (catalogItem) {
        if (titleInput) catalogItem.title = titleInput.value;
        if (timeInput) catalogItem.time = timeInput.value;
      }
    });

    var vatInput = document.getElementById('price-vat-rate');
    if (vatInput) state.priceData.vatRate = Number(vatInput.value) || 21;
  }

  function updatePriceRowMargin(row) {
    if (!row) return;
    var sell = Number(row.querySelector('.price-amount').value) || 0;
    var cost = Number(row.querySelector('.price-cost').value) || 0;
    var labor = Number(row.querySelector('.price-labor').value) || 0;
    var m = calcMargin(sell, cost, labor);
    var marginEl = row.querySelector('.price-margin');
    var pctEl = row.querySelector('.price-margin-pct');
    if (marginEl) {
      marginEl.textContent = formatMoney(m.margin);
      marginEl.className = 'price-margin ' + marginClass(m.pct, sell, cost);
    }
    if (pctEl) {
      pctEl.textContent = (cost > 0 || labor > 0 ? m.pct + ' %' : '—');
      pctEl.className = 'price-margin-pct ' + marginClass(m.pct, sell, cost);
    }
    var net = row.querySelector('.price-net-label');
    if (net) net.textContent = priceNetLabel(sell);
  }

  function renderModelMarginStats(modelId) {
    var el = document.getElementById('prices-margin-stats');
    if (!el) return;
    var rows = buildMarginRows(modelId ? [modelId] : null);
    var withCost = rows.filter(function (r) { return r.cost > 0; });
    var sumMargin = 0;
    var sumSell = 0;
    withCost.forEach(function (r) {
      sumMargin += r.margin;
      sumSell += r.sell;
    });
    var avgPct = sumSell > 0 ? Math.round((sumMargin / sumSell) * 1000) / 10 : 0;
    var missing = rows.length - withCost.length;
    el.innerHTML =
      statCard('Položky s nákupem', withCost.length + ' / ' + rows.length, 'blue') +
      statCard('Průměrná marže', (withCost.length ? avgPct + ' %' : '—'), avgPct >= 20 ? 'green' : '') +
      statCard('Součet marží', formatMoney(sumMargin), sumMargin >= 0 ? 'green' : '') +
      statCard('Bez nákupní ceny', missing, missing ? '' : 'green');
  }

  function buildMarginRows(modelIds) {
    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    var ids = modelIds && modelIds.length
      ? modelIds
      : (devices ? devices.map(function (d) { return d.id; }) : Object.keys(state.priceData.models || {}));
    var rows = [];
    ids.forEach(function (modelId) {
      var modelPrices = state.priceData.models[modelId] || {};
      (state.priceCatalog.sections || []).forEach(function (section) {
        (section.items || []).forEach(function (item) {
          var sell = sellPriceValue(modelPrices[item.id]);
          var entry = getCostEntry(modelId, item.id);
          var m = calcMargin(sell, entry.cost, entry.labor);
          rows.push({
            modelId: modelId,
            modelName: getModelLabel(modelId),
            itemId: item.id,
            title: item.title,
            section: section.title,
            sell: sell,
            cost: entry.cost,
            labor: entry.labor,
            margin: m.margin,
            pct: m.pct
          });
        });
      });
    });
    return rows;
  }

  function renderMarginOverview() {
    var select = document.getElementById('margin-model-select');
    var filterEl = document.getElementById('margin-filter');
    var tableEl = document.getElementById('margin-table');
    var statsEl = document.getElementById('margin-stats');
    if (!tableEl) return;

    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    var modelIds = devices
      ? devices.map(function (d) { return d.id; })
      : Object.keys(state.priceData.models || {});

    if (select) {
      var current = state.selectedMarginModel || '';
      select.innerHTML = '<option value="">Všechny modely</option>' + modelIds.map(function (id) {
        return '<option value="' + id + '"' + (id === current ? ' selected' : '') + '>' +
          escapeHtml(getModelLabel(id)) + '</option>';
      }).join('');
    }
    if (filterEl) filterEl.value = state.marginFilter || 'all';

    var scope = state.selectedMarginModel ? [state.selectedMarginModel] : null;
    var rows = buildMarginRows(scope);
    var filter = state.marginFilter || 'all';
    var filtered = rows.filter(function (r) {
      if (filter === 'with-cost') return r.cost > 0;
      if (filter === 'missing-cost') return !(r.cost > 0);
      if (filter === 'low') return r.cost > 0 && r.pct < 20;
      if (filter === 'negative') return r.cost > 0 && r.margin < 0;
      return true;
    });

    filtered.sort(function (a, b) {
      if (a.cost > 0 && !(b.cost > 0)) return -1;
      if (b.cost > 0 && !(a.cost > 0)) return 1;
      return a.pct - b.pct;
    });

    var withCost = rows.filter(function (r) { return r.cost > 0; });
    var sumMargin = 0;
    var sumSell = 0;
    var low = 0;
    var neg = 0;
    withCost.forEach(function (r) {
      sumMargin += r.margin;
      sumSell += r.sell;
      if (r.pct < 20) low++;
      if (r.margin < 0) neg++;
    });
    var avgPct = sumSell > 0 ? Math.round((sumMargin / sumSell) * 1000) / 10 : 0;

    if (statsEl) {
      statsEl.innerHTML =
        statCard('S nákupní cenou', withCost.length + ' / ' + rows.length, 'blue') +
        statCard('Průměrná marže', withCost.length ? avgPct + ' %' : '—', avgPct >= 20 ? 'green' : '') +
        statCard('Pod 20 %', low, low ? '' : 'green') +
        statCard('Záporné', neg, neg ? '' : 'green');
    }

    if (!filtered.length) {
      tableEl.innerHTML = '<div class="its-admin-empty">Žádné položky pro zvolený filtr. Doplňte nákupní ceny v Ceníku.</div>';
      return;
    }

    tableEl.innerHTML =
      '<table class="its-admin-table">' +
        '<thead><tr>' +
          '<th>Model</th><th>Oprava</th><th>Prodej</th><th>Nákup</th><th>Práce</th><th>Marže</th><th>%</th>' +
        '</tr></thead><tbody>' +
        filtered.map(function (r) {
          var cls = marginClass(r.pct, r.sell, r.cost);
          return (
            '<tr>' +
              '<td>' + escapeHtml(r.modelName) + '</td>' +
              '<td>' + escapeHtml(r.title) +
                '<br><small style="color:var(--its-muted)">' + escapeHtml(r.section) + '</small></td>' +
              '<td>' + formatMoney(r.sell) + '</td>' +
              '<td>' + (r.cost > 0 ? formatMoney(r.cost) : '—') + '</td>' +
              '<td>' + (r.labor > 0 ? formatMoney(r.labor) : '—') + '</td>' +
              '<td class="' + cls + '">' + (r.cost > 0 || r.labor > 0 ? formatMoney(r.margin) : '—') + '</td>' +
              '<td class="' + cls + '">' + (r.cost > 0 || r.labor > 0 ? r.pct + ' %' : '—') + '</td>' +
            '</tr>'
          );
        }).join('') +
      '</tbody></table>';
  }

  function renderPriceModelSelect() {
    var select = document.getElementById('price-model-select');
    var vatInput = document.getElementById('price-vat-rate');
    if (!select) return;

    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    var modelIds = devices
      ? devices.map(function (d) { return d.id; })
      : Object.keys(state.priceData.models);

    select.innerHTML = modelIds.map(function (id) {
      var selected = id === state.selectedPriceModel ? ' selected' : '';
      return '<option value="' + id + '"' + selected + '>' + escapeHtml(getModelLabel(id)) + '</option>';
    }).join('');

    if (vatInput) vatInput.value = state.priceData.vatRate || 21;
  }

  function renderPricesEditor() {
    renderPriceModelSelect();
    var el = document.getElementById('prices-editor');
    if (!el) return;

    var modelId = state.selectedPriceModel;
    var modelPrices = state.priceData.models[modelId] || {};
    renderModelMarginStats(modelId);

    el.innerHTML =
      '<p class="its-admin-prices-model-title">Ceník a náklady: <strong>' + escapeHtml(getModelLabel(modelId)) + '</strong></p>' +
      state.priceCatalog.sections.map(function (section, si) {
        return (
          '<div class="its-admin-price-section" data-section="' + si + '">' +
            '<div class="its-admin-price-section__title">' + section.title + '</div>' +
            '<div class="its-admin-price-row its-admin-price-row--costs its-admin-price-row--head">' +
              '<span>Oprava</span><span>Prodej</span><span>Nákup</span><span>Práce</span><span>Marže</span><span>%</span><span>Čas</span>' +
            '</div>' +
            section.items.map(function (item, ii) {
              var price = sellPriceValue(modelPrices[item.id]);
              var entry = getCostEntry(modelId, item.id);
              var m = calcMargin(price, entry.cost, entry.labor);
              var cls = marginClass(m.pct, price, entry.cost);
              return (
                '<div class="its-admin-price-row its-admin-price-row--costs" data-section="' + si + '" data-item="' + ii + '" data-item-id="' + item.id + '">' +
                  '<input type="text" class="price-title" value="' + escapeAttr(item.title) + '" aria-label="Název">' +
                  '<input type="number" class="price-amount" value="' + price + '" min="0" step="10" aria-label="Prodej">' +
                  '<input type="number" class="price-cost" value="' + entry.cost + '" min="0" step="10" aria-label="Nákup dílu">' +
                  '<input type="number" class="price-labor" value="' + entry.labor + '" min="0" step="10" aria-label="Práce">' +
                  '<span class="price-margin ' + cls + '">' + formatMoney(m.margin) + '</span>' +
                  '<span class="price-margin-pct ' + cls + '">' +
                    (entry.cost > 0 || entry.labor > 0 ? m.pct + ' %' : '—') +
                  '</span>' +
                  '<input type="text" class="price-time" value="' + escapeAttr(item.time) + '" aria-label="Čas">' +
                '</div>'
              );
            }).join('') +
          '</div>'
        );
      }).join('');

    el.querySelectorAll('.price-amount, .price-cost, .price-labor').forEach(function (input) {
      input.addEventListener('input', function () {
        updatePriceRowMargin(input.closest('.its-admin-price-row'));
        renderModelMarginStats(modelId);
      });
    });
  }

  function savePrices() {
    var modelId = state.selectedPriceModel;
    if (!modelId) return;

    collectPricesFromDom();

    api('/api/admin/prices/iphone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vatRate: state.priceData.vatRate,
        pricesIncludeVat: true,
        models: state.priceData.models,
        costs: state.priceData.costs || {},
        catalog: state.priceCatalog
      })
    }).then(function () {
      renderModelMarginStats(modelId);
      renderMarginOverview();
      showAlert('Ceník a náklady pro ' + getModelLabel(modelId) + ' uloženy.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Repair content ---

  function getAllCatalogItems() {
    var list = [];
    (state.priceCatalog.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        list.push(Object.assign({ sectionTitle: section.title }, item));
      });
    });
    return list;
  }

  function findCatalogItem(repairId) {
    var found = null;
    (state.priceCatalog.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        if (item.id === repairId) found = item;
      });
    });
    return found;
  }

  function findItemGroupKey(repairId) {
    var groups = state.repairContent.groups || {};
    var key;
    for (key in groups) {
      if ((groups[key].ids || []).indexOf(repairId) !== -1) return key;
    }
    return null;
  }

  function ensureItemContent(repairId) {
    if (!state.repairContent.items) state.repairContent.items = {};
    if (!state.repairContent.items[repairId]) {
      var catalogItem = findCatalogItem(repairId);
      state.repairContent.items[repairId] = {
        sidebarTitle: catalogItem ? catalogItem.title : repairId,
        shortTitle: '',
        description: '',
        image: catalogItem ? catalogItem.icon : ''
      };
    }
    return state.repairContent.items[repairId];
  }

  function renderContentSelect() {
    var select = document.getElementById('content-repair-select');
    if (!select) return;
    var items = getAllCatalogItems();
    select.innerHTML = items.map(function (item) {
      var selected = item.id === state.selectedRepairId ? ' selected' : '';
      return (
        '<option value="' + escapeAttr(item.id) + '"' + selected + '>' +
          escapeHtml(item.sectionTitle + ' — ' + item.title) +
        '</option>'
      );
    }).join('');
  }

  function renderFeatureRows(tierIndex, features) {
    return (features || []).map(function (f, fi) {
      return (
        '<div class="its-admin-feature-row" data-tier="' + tierIndex + '" data-feature="' + fi + '">' +
          '<input type="text" class="content-feature-label" value="' + escapeAttr(f.label || '') + '" placeholder="Název">' +
          '<textarea class="content-feature-text" rows="2" placeholder="Popis">' + escapeHtml(f.text || '') + '</textarea>' +
          '<button type="button" class="its-admin-btn its-admin-btn--ghost" data-del-feature="' + tierIndex + ':' + fi + '">Smazat</button>' +
        '</div>'
      );
    }).join('');
  }

  function collectContentFromDom() {
    var repairId = state.selectedRepairId;
    if (!repairId) return;

    var catalogItem = findCatalogItem(repairId);
    var item = ensureItemContent(repairId);

    var titleEl = document.getElementById('content-catalog-title');
    var timeEl = document.getElementById('content-catalog-time');
    var iconEl = document.getElementById('content-catalog-icon');
    if (catalogItem) {
      if (titleEl) catalogItem.title = titleEl.value;
      if (timeEl) catalogItem.time = timeEl.value;
      if (iconEl) catalogItem.icon = iconEl.value;
    }

    item.sidebarTitle = (document.getElementById('content-sidebar-title') || {}).value || '';
    item.shortTitle = (document.getElementById('content-short-title') || {}).value || '';
    item.description = (document.getElementById('content-description') || {}).value || '';
    item.image = (document.getElementById('content-image') || {}).value || '';

    var groupKey = findItemGroupKey(repairId);
    if (groupKey && state.repairContent.groups[groupKey]) {
      var group = state.repairContent.groups[groupKey];
      var gLabel = document.getElementById('content-group-label');
      var gImage = document.getElementById('content-group-image');
      var gDesc = document.getElementById('content-group-description');
      var gCompare = document.getElementById('content-group-compare');
      if (gLabel) group.label = gLabel.value;
      if (gImage) group.image = gImage.value;
      if (gDesc) group.description = gDesc.value;
      if (gCompare) group.showComparison = gCompare.checked;
    }

    var introTitle = document.getElementById('content-intro-title');
    if (introTitle && state.repairContent.comparison) {
      state.repairContent.comparison.intro = state.repairContent.comparison.intro || {};
      state.repairContent.comparison.intro.title = introTitle.value;
      state.repairContent.comparison.intro.text = (document.getElementById('content-intro-text') || {}).value || '';
      state.repairContent.comparison.intro.image = (document.getElementById('content-intro-image') || {}).value || '';
    }

    document.querySelectorAll('.its-admin-tier[data-tier]').forEach(function (tierEl) {
      var ti = Number(tierEl.getAttribute('data-tier'));
      var tier = state.repairContent.comparison.tiers[ti];
      if (!tier) return;
      tier.title = (tierEl.querySelector('.content-tier-title') || {}).value || '';
      tier.score = (tierEl.querySelector('.content-tier-score') || {}).value || '';
      tier.features = [];
      tierEl.querySelectorAll('.its-admin-feature-row').forEach(function (row) {
        tier.features.push({
          label: (row.querySelector('.content-feature-label') || {}).value || '',
          text: (row.querySelector('.content-feature-text') || {}).value || ''
        });
      });
    });
  }

  function renderContentEditor() {
    renderContentSelect();
    var el = document.getElementById('content-editor');
    if (!el) return;

    var repairId = state.selectedRepairId;
    var catalogItem = findCatalogItem(repairId);
    if (!catalogItem) {
      el.innerHTML = '<div class="its-admin-empty">Žádná oprava k úpravě.</div>';
      return;
    }

    var item = ensureItemContent(repairId);
    var groupKey = findItemGroupKey(repairId);
    var group = groupKey ? state.repairContent.groups[groupKey] : null;
    var showCompare = group && group.showComparison;

    var html =
      '<div class="its-admin-card">' +
        '<h2 class="its-admin-card__title">Základní informace</h2>' +
        '<div class="its-admin-form-grid">' +
          '<div class="its-admin-field its-admin-field--full">' +
            '<label for="content-catalog-title">Název v ceníku</label>' +
            '<input type="text" id="content-catalog-title" value="' + escapeAttr(catalogItem.title) + '">' +
          '</div>' +
          '<div class="its-admin-field its-admin-field--full">' +
            '<label for="content-sidebar-title">Název na detailu</label>' +
            '<input type="text" id="content-sidebar-title" value="' + escapeAttr(item.sidebarTitle || '') + '">' +
          '</div>' +
          '<div class="its-admin-field">' +
            '<label for="content-short-title">Krátký název (varianty)</label>' +
            '<input type="text" id="content-short-title" value="' + escapeAttr(item.shortTitle || '') + '">' +
          '</div>' +
          '<div class="its-admin-field">' +
            '<label for="content-catalog-time">Čas opravy</label>' +
            '<input type="text" id="content-catalog-time" value="' + escapeAttr(catalogItem.time || '') + '">' +
          '</div>' +
          '<div class="its-admin-field its-admin-field--full">' +
            '<label for="content-description">Popis</label>' +
            '<textarea id="content-description" rows="4">' + escapeHtml(item.description || '') + '</textarea>' +
          '</div>' +
          '<div class="its-admin-field its-admin-field--full">' +
            '<label for="content-catalog-icon">Ikona v ceníku (cesta)</label>' +
            '<input type="text" id="content-catalog-icon" value="' + escapeAttr(catalogItem.icon || '') + '">' +
          '</div>' +
          '<div class="its-admin-field its-admin-field--full">' +
            '<label for="content-image">Obrázek na detailu (cesta)</label>' +
            '<input type="text" id="content-image" value="' + escapeAttr(item.image || catalogItem.icon || '') + '">' +
          '</div>' +
        '</div>' +
      '</div>';

    if (group) {
      html +=
        '<div class="its-admin-card">' +
          '<h2 class="its-admin-card__title">Skupina variant (' + escapeHtml(groupKey) + ')</h2>' +
          '<div class="its-admin-form-grid">' +
            '<div class="its-admin-field">' +
              '<label for="content-group-label">Název skupiny</label>' +
              '<input type="text" id="content-group-label" value="' + escapeAttr(group.label || '') + '">' +
            '</div>' +
            '<div class="its-admin-field">' +
              '<label class="its-admin-check">' +
                '<input type="checkbox" id="content-group-compare"' + (group.showComparison ? ' checked' : '') + '>' +
                ' Zobrazit porovnání kvality' +
              '</label>' +
            '</div>' +
            '<div class="its-admin-field its-admin-field--full">' +
              '<label for="content-group-image">Společný obrázek skupiny</label>' +
              '<input type="text" id="content-group-image" value="' + escapeAttr(group.image || '') + '">' +
            '</div>' +
            '<div class="its-admin-field its-admin-field--full">' +
              '<label for="content-group-description">Popis skupiny</label>' +
              '<textarea id="content-group-description" rows="3">' + escapeHtml(group.description || '') + '</textarea>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    if (showCompare && state.repairContent.comparison) {
      var cmp = state.repairContent.comparison;
      var intro = cmp.intro || {};
      html +=
        '<div class="its-admin-card">' +
          '<h2 class="its-admin-card__title">Úvod porovnání</h2>' +
          '<div class="its-admin-form-grid">' +
            '<div class="its-admin-field its-admin-field--full">' +
              '<label for="content-intro-title">Nadpis</label>' +
              '<input type="text" id="content-intro-title" value="' + escapeAttr(intro.title || '') + '">' +
            '</div>' +
            '<div class="its-admin-field its-admin-field--full">' +
              '<label for="content-intro-text">Text</label>' +
              '<textarea id="content-intro-text" rows="3">' + escapeHtml(intro.text || '') + '</textarea>' +
            '</div>' +
            '<div class="its-admin-field its-admin-field--full">' +
              '<label for="content-intro-image">Obrázek</label>' +
              '<input type="text" id="content-intro-image" value="' + escapeAttr(intro.image || '') + '">' +
            '</div>' +
          '</div>' +
        '</div>';

      (cmp.tiers || []).forEach(function (tier, ti) {
        html +=
          '<div class="its-admin-card its-admin-tier" data-tier="' + ti + '">' +
            '<h2 class="its-admin-card__title">Varianta: ' + escapeHtml(tier.id) + '</h2>' +
            '<div class="its-admin-form-grid">' +
              '<div class="its-admin-field">' +
                '<label>Název kvality</label>' +
                '<input type="text" class="content-tier-title" value="' + escapeAttr(tier.title || '') + '">' +
              '</div>' +
              '<div class="its-admin-field">' +
                '<label>Skóre</label>' +
                '<input type="text" class="content-tier-score" value="' + escapeAttr(tier.score || '') + '">' +
              '</div>' +
            '</div>' +
            '<h3 class="its-admin-subtitle">Vlastnosti</h3>' +
            '<div class="its-admin-feature-list">' +
              renderFeatureRows(ti, tier.features) +
            '</div>' +
            '<button type="button" class="its-admin-btn its-admin-btn--ghost" data-add-feature="' + ti + '">+ Přidat vlastnost</button>' +
          '</div>';
      });
    }

    el.innerHTML = html;
  }

  function saveContent() {
    collectContentFromDom();
    api('/api/admin/repair-content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: state.repairContent,
        catalog: state.priceCatalog
      })
    }).then(function () {
      showAlert('Obsah oprav uložen.', 'success');
      renderContentEditor();
      renderPricesEditor();
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Orders ---

  function orderPhotos(order) {
    var p = (order && order.photos) || {};
    return {
      intake: Array.isArray(p.intake) ? p.intake : [],
      done: Array.isArray(p.done) ? p.done : []
    };
  }

  function photoUrl(orderId, kind, file) {
    return '/api/admin/orders/' + encodeURIComponent(orderId) +
      '/photos/' + encodeURIComponent(kind) + '/' + encodeURIComponent(file);
  }

  function photoCountLabel(n) {
    if (n === 1) return '1 fotka';
    if (n >= 2 && n <= 4) return n + ' fotky';
    return n + ' fotek';
  }

  function renderPhotoGrid(orderId, kind, list) {
    var grid = document.getElementById('order-photos-' + kind + '-grid');
    var countEl = document.getElementById('order-photos-' + kind + '-count');
    if (!grid) return;
    if (countEl) countEl.textContent = photoCountLabel(list.length);
    if (!list.length) {
      grid.innerHTML = '<div class="its-admin-photos__empty">Zatím žádné fotky.</div>';
      return;
    }
    grid.innerHTML = list.map(function (ph) {
      return (
        '<div class="its-admin-photo">' +
          '<a href="' + photoUrl(orderId, kind, ph.file) + '" target="_blank" rel="noopener">' +
            '<img src="' + photoUrl(orderId, kind, ph.file) + '" alt="Fotka zakázky" loading="lazy">' +
          '</a>' +
          '<button type="button" class="its-admin-photo__del" title="Smazat" ' +
            'data-del-photo="' + escapeHtml(ph.id) + '" data-photo-kind="' + kind + '">×</button>' +
        '</div>'
      );
    }).join('');
  }

  function renderOrderPhotos(order) {
    var box = document.getElementById('order-photos');
    if (!box) return;
    if (!order || !order.id) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var photos = orderPhotos(order);
    renderPhotoGrid(order.id, 'intake', photos.intake);
    renderPhotoGrid(order.id, 'done', photos.done);
  }

  function formatDocDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('cs-CZ');
    } catch (e) {
      return iso;
    }
  }

  function docPdfUrl(orderId, kind) {
    return '/api/admin/orders/' + encodeURIComponent(orderId) + '/documents/' + kind + '/pdf';
  }

  function renderOrderDocuments(order) {
    var box = document.getElementById('order-documents');
    if (!box) return;
    if (!order || !order.id) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    var docs = (order.documents && typeof order.documents === 'object') ? order.documents : {};
    ['intake', 'done'].forEach(function (kind) {
      var meta = docs[kind];
      var statusEl = document.getElementById('order-doc-' + kind + '-status');
      var viewEl = document.getElementById('order-doc-' + kind + '-view');
      var emailEl = document.getElementById('order-doc-' + kind + '-email');
      if (meta && meta.file) {
        if (statusEl) {
          statusEl.textContent = 'Podepsáno ' + formatDocDate(meta.signedAt) +
            (meta.emailedAt ? ' · odesláno ' + formatDocDate(meta.emailedAt) : '');
        }
        if (viewEl) {
          viewEl.hidden = false;
          viewEl.href = docPdfUrl(order.id, kind);
        }
        if (emailEl) emailEl.hidden = false;
      } else {
        if (statusEl) statusEl.textContent = 'Nepodepsáno';
        if (viewEl) {
          viewEl.hidden = true;
          viewEl.removeAttribute('href');
        }
        if (emailEl) emailEl.hidden = true;
      }
    });
  }

  var signPad = {
    kind: '',
    drawing: false,
    dirty: false,
    ctx: null,
    canvas: null
  };

  function resizeSignCanvas() {
    var canvas = signPad.canvas;
    if (!canvas) return;
    var wrap = canvas.parentElement;
    var cssW = wrap ? wrap.clientWidth : 700;
    var cssH = Math.min(280, Math.round(cssW * 0.4));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    signPad.ctx = ctx;
    signPad.dirty = false;
  }

  function canvasPos(e) {
    var rect = signPad.canvas.getBoundingClientRect();
    var touch = e.touches && e.touches[0];
    var clientX = touch ? touch.clientX : e.clientX;
    var clientY = touch ? touch.clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function openSignModal(kind) {
    var id = document.getElementById('order-id').value;
    if (!id) return showAlert('Nejdřív otevřete zakázku.', 'error');
    var order = state.orders.find(function (o) { return o.id === id; });
    var modal = document.getElementById('sign-modal');
    var title = document.getElementById('sign-modal-title');
    var desc = document.getElementById('sign-modal-desc');
    var nameInput = document.getElementById('sign-modal-name');
    signPad.kind = kind;
    if (title) {
      title.textContent = kind === 'intake'
        ? 'Podpis — převzetí do servisu'
        : 'Podpis — doklad po opravě';
    }
    if (desc) {
      desc.textContent = kind === 'intake'
        ? 'Zákazník potvrdí předání zařízení do servisu.'
        : 'Zákazník potvrdí převzetí opraveného zařízení a cenu.';
    }
    if (nameInput) nameInput.value = (order && order.customer) || '';
    if (modal) modal.hidden = false;
    signPad.canvas = document.getElementById('sign-canvas');
    resizeSignCanvas();
  }

  function closeSignModal() {
    var modal = document.getElementById('sign-modal');
    if (modal) modal.hidden = true;
    signPad.kind = '';
    signPad.drawing = false;
  }

  function clearSignPad() {
    resizeSignCanvas();
  }

  function saveSignedDocument() {
    var id = document.getElementById('order-id').value;
    if (!id || !signPad.kind) return;
    if (!signPad.dirty) {
      showAlert('Nejdřív nechte zákazníka podepsat na ploše.', 'error');
      return;
    }
    var nameInput = document.getElementById('sign-modal-name');
    var signerName = nameInput ? nameInput.value.trim() : '';
    var dataUrl = signPad.canvas.toDataURL('image/png');
    var saveBtn = document.getElementById('sign-modal-save');
    if (saveBtn) saveBtn.disabled = true;

    api('/api/admin/orders/' + encodeURIComponent(id) + '/documents/' + signPad.kind + '/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signatureDataUrl: dataUrl,
        signerName: signerName
      })
    }).then(function (res) {
      var order = state.orders.find(function (o) { return o.id === id; });
      if (order) {
        order.documents = res.documents;
        renderOrderDocuments(order);
      }
      closeSignModal();
      showAlert('PDF s podpisem uloženo.', 'success');
      updateMailStatusHint(res.mailConfigured);
    }).catch(function (err) {
      showAlert(err.message, 'error');
    }).then(function () {
      if (saveBtn) saveBtn.disabled = false;
    });
  }

  function emailDocument(kind) {
    var id = document.getElementById('order-id').value;
    if (!id) return;
    var order = state.orders.find(function (o) { return o.id === id; });
    var email = order && order.email ? order.email : '';
    if (!email) {
      showAlert('U zakázky chybí e-mail zákazníka.', 'error');
      return;
    }
    if (!confirm('Odeslat PDF na ' + email + '?')) return;

    api('/api/admin/orders/' + encodeURIComponent(id) + '/documents/' + kind + '/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (res) {
      if (order) {
        order.documents = res.documents;
        renderOrderDocuments(order);
      }
      showAlert('PDF odesláno na ' + (res.to || email) + '.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  function updateMailStatusHint(configured) {
    var el = document.getElementById('order-mail-status');
    if (!el) return;
    if (configured) {
      el.textContent = 'Odesílání e-mailem je nastavené (SMTP).';
    } else {
      el.textContent = 'E-mail zatím nefunguje — do .env doplňte SMTP_HOST, SMTP_USER a SMTP_PASS.';
    }
  }

  function guessDiagCategory(order) {
    if (order && order.diagnosis && order.diagnosis.category) return order.diagnosis.category;
    var text = ((order && order.device) || '') + ' ' + ((order && order.repair) || '');
    if (/iphone|mobil|telefon|android|samsung/i.test(text)) return 'mobile';
    if (/pc|notebook|macbook|počítač|pocitac|imac/i.test(text)) return 'pc';
    return 'mobile';
  }

  function diagRule(category) {
    var cfg = state.diagnostics && state.diagnostics[category];
    return cfg || state.diagnostics.mobile || {};
  }

  function fillDiagTemplate() {
    var orderId = document.getElementById('order-id').value;
    var order = state.orders.find(function (o) { return o.id === orderId; }) || {
      id: orderId,
      device: document.getElementById('order-device').value,
      price: document.getElementById('order-price').value,
      customer: document.getElementById('order-customer').value
    };
    var category = document.getElementById('diag-category').value || 'mobile';
    var rule = diagRule(category);
    var findings = document.getElementById('diag-findings').value.trim() ||
      '…doplňte výsledek diagnostiky…';
    var fee = formatMoney(rule.feeIfDeclined || 0);
    var price = formatMoney(order.price || document.getElementById('order-price').value || 0);
    var tpl = rule.messageTemplate || '';
    var msg = tpl
      .replace(/\{\{device\}\}/g, order.device || 'zařízení')
      .replace(/\{\{orderId\}\}/g, order.id || '')
      .replace(/\{\{findings\}\}/g, findings)
      .replace(/\{\{price\}\}/g, price)
      .replace(/\{\{fee\}\}/g, fee)
      .replace(/\{\{customer\}\}/g, order.customer || '');
    document.getElementById('diag-message').value = msg;
  }

  function updateDiagContactLinks() {
    var phone = (document.getElementById('order-phone').value || '').replace(/\s+/g, '');
    var email = (document.getElementById('order-email').value || '').trim();
    var message = document.getElementById('diag-message').value || '';
    var callBtn = document.getElementById('diag-call-btn');
    var mailBtn = document.getElementById('diag-mailto-btn');
    if (callBtn) {
      if (phone) {
        callBtn.href = 'tel:' + phone;
        callBtn.removeAttribute('aria-disabled');
      } else {
        callBtn.href = '#';
        callBtn.setAttribute('aria-disabled', 'true');
      }
    }
    if (mailBtn) {
      if (email) {
        mailBtn.href = 'mailto:' + encodeURIComponent(email) +
          '?subject=' + encodeURIComponent('Diagnostika — IT Servis Třebíč') +
          '&body=' + encodeURIComponent(message);
      } else {
        mailBtn.href = '#';
      }
    }
  }

  function renderOrderDiagnosis(order) {
    var box = document.getElementById('order-diagnosis');
    if (!box) return;
    if (!order || !order.id) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    var category = guessDiagCategory(order);
    var rule = diagRule(category);
    var ruleEl = document.getElementById('order-diagnosis-rule');
    if (ruleEl) {
      var feeText = Number(rule.feeIfDeclined) > 0
        ? ' Poplatek při odmítnutí opravy: ' + formatMoney(rule.feeIfDeclined) + '.'
        : '';
      ruleEl.textContent = (rule.ruleSummary || '') + feeText;
    }

    var catEl = document.getElementById('diag-category');
    var outEl = document.getElementById('diag-outcome');
    var findEl = document.getElementById('diag-findings');
    var msgEl = document.getElementById('diag-message');
    var statusEl = document.getElementById('diag-status');
    var d = order.diagnosis || {};

    if (catEl) catEl.value = d.category || category;
    if (outEl) outEl.value = d.outcome || 'pending';
    if (findEl) findEl.value = d.findings || '';
    if (msgEl) {
      msgEl.value = d.message || '';
      if (!msgEl.value) {
        if (catEl) catEl.value = d.category || category;
        fillDiagTemplate();
      }
    }
    if (statusEl) {
      if (d.emailedAt) {
        statusEl.textContent = 'Poslední e-mail: ' + formatDocDate(d.emailedAt) +
          (d.emailedTo ? ' → ' + d.emailedTo : '');
      } else if (d.updatedAt) {
        statusEl.textContent = 'Zpráva uložena ' + formatDocDate(d.updatedAt) +
          ' — můžete zavolat nebo poslat e-mail.';
      } else {
        statusEl.textContent = 'Doplňte závadu, upravte zprávu a zákazníkovi odepíšte e-mailem nebo zavolejte.';
      }
    }
    updateDiagContactLinks();
  }

  function saveDiagnosis(sendEmail) {
    var id = document.getElementById('order-id').value;
    if (!id) return showAlert('Nejdřív otevřete zakázku.', 'error');

    var payload = {
      category: document.getElementById('diag-category').value,
      outcome: document.getElementById('diag-outcome').value,
      findings: document.getElementById('diag-findings').value,
      message: document.getElementById('diag-message').value,
      sendEmail: !!sendEmail,
      setStatus: true
    };

    if (sendEmail && !confirm('Odeslat zprávu o diagnostice na e-mail zákazníka?')) return;

    api('/api/admin/orders/' + encodeURIComponent(id) + '/diagnosis/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.order) syncOrderInState(res.order);
      var order = state.orders.find(function (o) { return o.id === id; }) || res.order;
      if (order) {
        document.getElementById('order-status').value = order.status || 'diagnostika';
        renderOrderDiagnosis(order);
      }
      renderOrders();
      renderDashboard();
      showAlert(
        sendEmail
          ? ('Zpráva odeslána' + (res.to ? ' na ' + res.to : '') + '.')
          : 'Diagnostická zpráva uložena.',
        'success'
      );
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  function bindDiagnosisControls() {
    var fillBtn = document.getElementById('diag-fill-template');
    var saveBtn = document.getElementById('diag-save-only');
    var sendBtn = document.getElementById('diag-send-email');
    var catEl = document.getElementById('diag-category');
    var findEl = document.getElementById('diag-findings');
    var msgEl = document.getElementById('diag-message');

    if (fillBtn) fillBtn.addEventListener('click', fillDiagTemplate);
    if (saveBtn) saveBtn.addEventListener('click', function () { saveDiagnosis(false); });
    if (sendBtn) sendBtn.addEventListener('click', function () { saveDiagnosis(true); });
    if (catEl) {
      catEl.addEventListener('change', function () {
        var rule = diagRule(catEl.value);
        var ruleEl = document.getElementById('order-diagnosis-rule');
        if (ruleEl) {
          var feeText = Number(rule.feeIfDeclined) > 0
            ? ' Poplatek při odmítnutí opravy: ' + formatMoney(rule.feeIfDeclined) + '.'
            : '';
          ruleEl.textContent = (rule.ruleSummary || '') + feeText;
        }
        fillDiagTemplate();
        updateDiagContactLinks();
      });
    }
    if (findEl) {
      findEl.addEventListener('change', function () {
        fillDiagTemplate();
        updateDiagContactLinks();
      });
    }
    if (msgEl) msgEl.addEventListener('input', updateDiagContactLinks);

    var callBtn = document.getElementById('diag-call-btn');
    var mailBtn = document.getElementById('diag-mailto-btn');
    if (callBtn) {
      callBtn.addEventListener('click', function (e) {
        if (!document.getElementById('order-phone').value) {
          e.preventDefault();
          showAlert('U zakázky chybí telefon.', 'error');
        }
      });
    }
    if (mailBtn) {
      mailBtn.addEventListener('click', function (e) {
        if (!document.getElementById('order-email').value) {
          e.preventDefault();
          showAlert('U zakázky chybí e-mail.', 'error');
        }
      });
    }
  }

  function bindSignPad() {
    var canvas = document.getElementById('sign-canvas');
    if (!canvas) return;
    signPad.canvas = canvas;

    function start(e) {
      e.preventDefault();
      signPad.drawing = true;
      var p = canvasPos(e);
      if (!signPad.ctx) resizeSignCanvas();
      signPad.ctx.beginPath();
      signPad.ctx.moveTo(p.x, p.y);
    }
    function move(e) {
      if (!signPad.drawing) return;
      e.preventDefault();
      var p = canvasPos(e);
      signPad.ctx.lineTo(p.x, p.y);
      signPad.ctx.stroke();
      signPad.dirty = true;
    }
    function end(e) {
      if (!signPad.drawing) return;
      e.preventDefault();
      signPad.drawing = false;
    }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    var closeBtn = document.getElementById('sign-modal-close');
    var clearBtn = document.getElementById('sign-modal-clear');
    var saveBtn = document.getElementById('sign-modal-save');
    if (closeBtn) closeBtn.addEventListener('click', closeSignModal);
    if (clearBtn) clearBtn.addEventListener('click', clearSignPad);
    if (saveBtn) saveBtn.addEventListener('click', saveSignedDocument);
    window.addEventListener('resize', function () {
      var modal = document.getElementById('sign-modal');
      if (modal && !modal.hidden) resizeSignCanvas();
    });
  }

  function syncOrderInState(updated) {
    if (!updated || !updated.id) return;
    var idx = state.orders.findIndex(function (o) { return o.id === updated.id; });
    if (idx !== -1) state.orders[idx] = updated;
    else state.orders.unshift(updated);
  }

  function uploadOrderPhotos(orderId, kind, fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve();
    var fd = new FormData();
    files.forEach(function (f) { fd.append('photos', f); });
    return api('/api/admin/orders/' + encodeURIComponent(orderId) + '/photos/' + kind, {
      method: 'POST',
      body: fd
    }).then(function (res) {
      var order = state.orders.find(function (o) { return o.id === orderId; });
      if (order) {
        order.photos = res.photos;
        order.updatedAt = new Date().toISOString();
        renderOrderPhotos(order);
      }
      renderOrders();
      renderDashboard();
      showAlert('Fotky uloženy k zakázce.', 'success');
    });
  }

  function bindPhotoInputs() {
    var intakeInput = document.getElementById('order-photo-intake-input');
    var doneInput = document.getElementById('order-photo-done-input');
    var intakeBtn = document.getElementById('order-photo-intake-btn');
    var doneBtn = document.getElementById('order-photo-done-btn');
    var markDoneBtn = document.getElementById('order-mark-done-btn');

    if (intakeBtn && intakeInput) {
      intakeBtn.addEventListener('click', function () {
        var id = document.getElementById('order-id').value;
        if (!id) return showAlert('Nejdřív uložte zakázku, pak foťte.', 'error');
        intakeInput.click();
      });
      intakeInput.addEventListener('change', function () {
        var id = document.getElementById('order-id').value;
        if (!id || !intakeInput.files || !intakeInput.files.length) return;
        uploadOrderPhotos(id, 'intake', intakeInput.files).catch(function (err) {
          showAlert(err.message, 'error');
        }).then(function () {
          intakeInput.value = '';
        });
      });
    }

    if (doneBtn && doneInput) {
      doneBtn.addEventListener('click', function () {
        var id = document.getElementById('order-id').value;
        if (!id) return showAlert('Nejdřív uložte zakázku, pak foťte.', 'error');
        doneInput.click();
      });
      doneInput.addEventListener('change', function () {
        var id = document.getElementById('order-id').value;
        if (!id || !doneInput.files || !doneInput.files.length) return;
        uploadOrderPhotos(id, 'done', doneInput.files).catch(function (err) {
          showAlert(err.message, 'error');
        }).then(function () {
          doneInput.value = '';
        });
      });
    }

    if (markDoneBtn && doneInput) {
      markDoneBtn.addEventListener('click', function () {
        var id = document.getElementById('order-id').value;
        if (!id) return showAlert('Nejdřív otevřete existující zakázku.', 'error');
        if (!confirm('Označit opravu jako hotovou a nafotit zařízení?')) return;

        document.getElementById('order-status').value = 'hotovo';
        api('/api/admin/orders/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'hotovo' })
        }).then(function (updated) {
          syncOrderInState(updated);
          renderOrderPhotos(updated);
          renderOrders();
          renderDashboard();
          showAlert('Stav: Hotovo. Teď nafoťte zařízení po opravě.', 'success');
          doneInput.click();
        }).catch(function (err) {
          showAlert(err.message, 'error');
        });
      });
    }
  }

  function renderOrdersTable(orders, compact) {
    if (!orders.length) return '<div class="its-admin-empty">Žádné zakázky.</div>';
    return (
      '<table class="its-admin-table">' +
        '<thead><tr>' +
          '<th>Zákazník</th><th>Zařízení</th><th>Oprava</th><th>Stav</th><th>Cena</th>' +
          (compact ? '' : '<th>Akce</th>') +
        '</tr></thead><tbody>' +
        orders.map(function (o) {
          var photos = orderPhotos(o);
          var photoHint = (photos.intake.length || photos.done.length)
            ? '<br><small style="color:var(--its-muted)">Fotky: ' +
              photos.intake.length + ' převzetí / ' + photos.done.length + ' po opravě</small>'
            : '';
          return (
            '<tr>' +
              '<td>' + escapeHtml(o.customer) + '<br><small style="color:var(--its-muted)">' + escapeHtml(o.phone) + '</small></td>' +
              '<td>' + escapeHtml(o.device) + photoHint + '</td>' +
              '<td>' + escapeHtml(o.repair) + '</td>' +
              '<td><span class="its-admin-badge its-admin-badge--blue">' + (STATUS_LABELS[o.status] || o.status) + '</span></td>' +
              '<td>' + formatMoney(o.price) +
                '<br><small style="color:var(--its-muted)">' + escapeHtml(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || '') +
                (o.paid > 0 ? ' · zaplaceno ' + formatMoney(o.paid) : ' · nezaplaceno') +
                (o.slotDate ? '<br>' + escapeHtml(o.slotDate) + ' ' + escapeHtml(o.slotTime || '') : '') +
                (o.deliveryMethod ? ' · ' + escapeHtml(o.deliveryMethod) : '') +
                '</small></td>' +
              (compact ? '' :
                '<td>' +
                  '<button type="button" class="its-admin-link-btn" data-edit-order="' + o.id + '">Otevřít</button> · ' +
                  '<button type="button" class="its-admin-link-btn its-admin-link-btn--danger" data-del-order="' + o.id + '">Smazat</button>' +
                '</td>') +
            '</tr>'
          );
        }).join('') +
        '</tbody></table>'
    );
  }

  function renderOrders() {
    document.getElementById('orders-table').innerHTML = renderOrdersTable(state.orders, false);
  }

  function resetOrderForm() {
    document.getElementById('order-form').reset();
    document.getElementById('order-id').value = '';
    document.getElementById('order-form-title').textContent = 'Nová zakázka';
    document.getElementById('order-cancel-btn').hidden = true;
    renderOrderPhotos(null);
    renderOrderDocuments(null);
    renderOrderDiagnosis(null);
    renderOrderParts(null);
  }

  function fillOrderForm(order) {
    document.getElementById('order-id').value = order.id;
    document.getElementById('order-customer').value = order.customer;
    document.getElementById('order-phone').value = order.phone;
    document.getElementById('order-email').value = order.email;
    document.getElementById('order-device').value = order.device;
    document.getElementById('order-repair').value = order.repair;
    document.getElementById('order-status').value = order.status;
    document.getElementById('order-price').value = order.price;
    document.getElementById('order-paid').value = order.paid;
    document.getElementById('order-payment').value =
      order.paymentMethod === 'qr' ? 'qr' : 'hotovost';
    document.getElementById('order-note').value = order.note;
    document.getElementById('order-form-title').textContent = 'Zakázka';
    document.getElementById('order-cancel-btn').hidden = false;
    renderOrderPhotos(order);
    renderOrderDocuments(order);
    renderOrderDiagnosis(order);
    renderOrderParts(order);
    switchPanel('zakazky');
    var photosBox = document.getElementById('order-photos');
    if (photosBox) {
      setTimeout(function () {
        photosBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  function saveOrder(e) {
    e.preventDefault();
    var id = document.getElementById('order-id').value;
    var payload = {
      customer: document.getElementById('order-customer').value,
      phone: document.getElementById('order-phone').value,
      email: document.getElementById('order-email').value,
      device: document.getElementById('order-device').value,
      repair: document.getElementById('order-repair').value,
      status: document.getElementById('order-status').value,
      price: Number(document.getElementById('order-price').value),
      paid: Number(document.getElementById('order-paid').value),
      paymentMethod: document.getElementById('order-payment').value,
      note: document.getElementById('order-note').value
    };

    var req = id
      ? api('/api/admin/orders/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : api('/api/admin/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    req.then(function (saved) {
      return api('/api/admin/orders').then(function (d) {
        state.orders = d.orders || [];
        if (saved && saved.id) {
          fillOrderForm(state.orders.find(function (o) { return o.id === saved.id; }) || saved);
          showAlert('Zakázka uložena. Můžete nafotit zařízení.', 'success');
        } else {
          resetOrderForm();
          showAlert('Zakázka uložena.', 'success');
        }
        renderOrders();
        renderDashboard();
      });
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Accounting ---

  function currentMonthValue() {
    return new Date().toISOString().slice(0, 7);
  }

  function getSelectedAccountingMonth() {
    if (!state.selectedAccountingMonth) {
      state.selectedAccountingMonth = currentMonthValue();
    }
    return state.selectedAccountingMonth;
  }

  function entriesForMonth(month) {
    return (state.accounting.entries || []).filter(function (e) {
      return String(e.date || '').slice(0, 7) === month;
    });
  }

  function ordersForMonth(month) {
    return (state.orders || []).filter(function (o) {
      return String(o.createdAt || o.updatedAt || '').slice(0, 7) === month;
    });
  }

  function downloadCsvExport(url, fallbackName) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) {
        window.adminGoLogin();
        throw new Error('redirect');
      }
      if (!r.ok) throw new Error('Export se nepodařil.');
      var disposition = r.headers.get('Content-Disposition') || '';
      var match = disposition.match(/filename="([^"]+)"/);
      var filename = (match && match[1]) || fallbackName || 'export.csv';
      return r.blob().then(function (blob) {
        return { blob: blob, filename: filename };
      });
    }).then(function (file) {
      var a = document.createElement('a');
      var href = URL.createObjectURL(file.blob);
      a.href = href;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
      showAlert('CSV staženo: ' + file.filename, 'success');
    }).catch(function (err) {
      if (err.message !== 'redirect') showAlert(err.message || 'Export selhal.', 'error');
    });
  }

  function renderAccounting() {
    var incomeAll = 0;
    var expenseAll = 0;
    state.accounting.entries.forEach(function (e) {
      if (e.type === 'income') incomeAll += e.amount;
      else expenseAll += e.amount;
    });

    document.getElementById('accounting-stats').innerHTML =
      statCard('Celkové příjmy', formatMoney(incomeAll), 'green') +
      statCard('Celkové výdaje', formatMoney(expenseAll), '') +
      statCard('Bilance celkem', formatMoney(incomeAll - expenseAll), incomeAll >= expenseAll ? 'green' : '') +
      statCard('Počet záznamů', state.accounting.entries.length, 'blue');

    var monthInput = document.getElementById('acc-month-select');
    var month = getSelectedAccountingMonth();
    if (monthInput && monthInput.value !== month) monthInput.value = month;

    var monthEntries = entriesForMonth(month);
    var monthOrders = ordersForMonth(month);
    var income = 0;
    var expense = 0;
    var byCat = {};
    monthEntries.forEach(function (e) {
      var amount = Number(e.amount) || 0;
      if (e.type === 'expense') expense += amount;
      else income += amount;
      var key = (e.type === 'expense' ? 'Výdaj' : 'Příjem') + ' · ' + (e.category || 'Ostatní');
      byCat[key] = (byCat[key] || 0) + amount;
    });

    var orderPrice = 0;
    var orderPaid = 0;
    monthOrders.forEach(function (o) {
      orderPrice += Number(o.price) || 0;
      orderPaid += Number(o.paid) || 0;
    });

    var monthStats = document.getElementById('accounting-month-stats');
    if (monthStats) {
      monthStats.innerHTML =
        statCard('Tržby (záznamy)', formatMoney(income), 'green') +
        statCard('Náklady (záznamy)', formatMoney(expense), '') +
        statCard('Bilance měsíce', formatMoney(income - expense), income >= expense ? 'green' : '') +
        statCard('Zakázky zaplaceno', formatMoney(orderPaid), 'blue');
    }

    var breakdown = document.getElementById('accounting-month-breakdown');
    if (breakdown) {
      var catKeys = Object.keys(byCat).sort();
      var parts = [];
      parts.push(
        '<p class="its-admin-photos__hint" style="margin-top:0">Měsíc <strong>' + escapeHtml(month) +
          '</strong> · zakázek: ' + monthOrders.length +
          ' · cena zakázek: ' + formatMoney(orderPrice) +
          ' · zaplaceno: ' + formatMoney(orderPaid) + '</p>'
      );
      if (!catKeys.length && !monthOrders.length) {
        parts.push('<div class="its-admin-empty">Za tento měsíc zatím nic není.</div>');
      } else if (catKeys.length) {
        parts.push(
          '<table class="its-admin-table"><thead><tr><th>Kategorie</th><th>Částka</th></tr></thead><tbody>' +
          catKeys.map(function (k) {
            return '<tr><td>' + escapeHtml(k) + '</td><td>' + formatMoney(byCat[k]) + '</td></tr>';
          }).join('') +
          '</tbody></table>'
        );
      }
      breakdown.innerHTML = parts.join('');
    }

    var tableEl = document.getElementById('accounting-table');
    if (!tableEl) return;
    if (!monthEntries.length) {
      tableEl.innerHTML = '<div class="its-admin-empty">Žádné účetní záznamy v tomto měsíci.</div>';
      return;
    }

    tableEl.innerHTML =
      '<table class="its-admin-table"><thead><tr><th>Datum</th><th>Typ</th><th>Kategorie</th><th>Popis</th><th>Částka</th><th></th></tr></thead><tbody>' +
      monthEntries.map(function (e) {
        return (
          '<tr>' +
            '<td>' + escapeHtml(e.date) + '</td>' +
            '<td><span class="its-admin-badge ' + (e.type === 'income' ? 'its-admin-badge--green' : 'its-admin-badge--gray') + '">' +
              (e.type === 'income' ? 'Příjem' : 'Výdaj') + '</span></td>' +
            '<td>' + escapeHtml(e.category) + '</td>' +
            '<td>' + escapeHtml(e.description) + '</td>' +
            '<td>' + formatMoney(e.amount) + '</td>' +
            '<td><button type="button" class="its-admin-link-btn its-admin-link-btn--danger" data-del-acc="' + e.id + '">Smazat</button></td>' +
          '</tr>'
        );
      }).join('') +
      '</tbody></table>';
  }

  function saveAccountingEntry(e) {
    e.preventDefault();
    var payload = {
      type: document.getElementById('acc-type').value,
      amount: Number(document.getElementById('acc-amount').value),
      date: document.getElementById('acc-date').value,
      category: document.getElementById('acc-category').value,
      description: document.getElementById('acc-desc').value
    };

    api('/api/admin/accounting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function () {
      return api('/api/admin/accounting');
    }).then(function (d) {
      state.accounting = d;
      document.getElementById('accounting-form').reset();
      document.getElementById('acc-date').value = new Date().toISOString().slice(0, 10);
      if (payload.date) {
        state.selectedAccountingMonth = String(payload.date).slice(0, 7);
      }
      renderAccounting();
      renderDashboard();
      showAlert('Záznam přidán.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Slots ---

  function formatSlotDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return p[2] + '. ' + p[1] + '. ' + p[0];
  }

  function renderSlots() {
    var el = document.getElementById('slots-table');
    if (!el) return;
    var slots = (state.slots || []).slice().sort(function (a, b) {
      return (a.date + a.time).localeCompare(b.date + b.time);
    });
    if (!slots.length) {
      el.innerHTML = '<div class="its-admin-empty">Zatím žádné termíny. Přidejte první výše.</div>';
      return;
    }
    el.innerHTML =
      '<table class="its-admin-table">' +
        '<thead><tr><th>Datum</th><th>Čas</th><th>Stav</th><th>Akce</th></tr></thead><tbody>' +
        slots.map(function (s) {
          return (
            '<tr>' +
              '<td>' + escapeHtml(formatSlotDate(s.date)) + '</td>' +
              '<td>' + escapeHtml(s.time) + '</td>' +
              '<td>' + (s.booked
                ? '<span class="its-admin-badge">Obsazeno' + (s.orderId ? ' (' + escapeHtml(s.orderId) + ')' : '') + '</span>'
                : '<span class="its-admin-badge its-admin-badge--blue">Volný</span>') +
              '</td>' +
              '<td>' +
                '<button type="button" class="its-admin-link-btn its-admin-link-btn--danger" data-del-slot="' +
                  escapeAttr(s.id) + '">Smazat</button>' +
              '</td>' +
            '</tr>'
          );
        }).join('') +
      '</tbody></table>';
  }

  function addSlot(e) {
    e.preventDefault();
    var date = document.getElementById('slot-date-input').value;
    var time = document.getElementById('slot-time-input').value;
    api('/api/admin/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: date, time: time })
    }).then(function () {
      return api('/api/admin/slots');
    }).then(function (d) {
      state.slots = d.slots || [];
      renderSlots();
      document.getElementById('slot-form').reset();
      showAlert('Termín přidán.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Inventory ---

  function getInventoryQty(modelId, repairId) {
    var byModel = (state.inventory.stock && state.inventory.stock[modelId]) || {};
    return byModel[repairId] != null ? Number(byModel[repairId]) || 0 : 0;
  }

  function getInventoryMin(modelId, repairId) {
    var byModel = (state.inventory.minQty && state.inventory.minQty[modelId]) || {};
    if (byModel[repairId] != null && byModel[repairId] !== '') {
      return Math.max(0, Math.floor(Number(byModel[repairId]) || 0));
    }
    return Math.max(0, Math.floor(Number(state.inventory.defaultMinQty) || 0));
  }

  function getPartSupplierId(modelId, repairId) {
    var byModel = (state.inventory.partSuppliers && state.inventory.partSuppliers[modelId]) || {};
    return byModel[repairId] || '';
  }

  function supplierOptionsHtml(selectedId) {
    return '<option value="">—</option>' + (state.suppliers || []).map(function (s) {
      return '<option value="' + escapeAttr(s.id) + '"' +
        (s.id === selectedId ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
    }).join('');
  }

  function collectLowStockAlerts() {
    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    var modelIds = devices ? devices.map(function (d) { return d.id; }) : Object.keys(state.inventory.stock || {});
    var alerts = [];
    modelIds.forEach(function (modelId) {
      getAllCatalogItems().forEach(function (item) {
        var qty = getInventoryQty(modelId, item.id);
        var min = getInventoryMin(modelId, item.id);
        if (qty <= min) {
          alerts.push({
            modelId: modelId,
            modelName: getModelLabel(modelId),
            repairId: item.id,
            title: item.title,
            qty: qty,
            min: min,
            supplierId: getPartSupplierId(modelId, item.id)
          });
        }
      });
    });
    alerts.sort(function (a, b) { return a.qty - b.qty; });
    return alerts;
  }

  function collectInventoryFromDom() {
    var modelId = state.selectedInventoryModel;
    if (!modelId) return;
    if (!state.inventory.stock) state.inventory.stock = {};
    if (!state.inventory.minQty) state.inventory.minQty = {};
    if (!state.inventory.partSuppliers) state.inventory.partSuppliers = {};
    if (!state.inventory.stock[modelId]) state.inventory.stock[modelId] = {};
    if (!state.inventory.minQty[modelId]) state.inventory.minQty[modelId] = {};
    if (!state.inventory.partSuppliers[modelId]) state.inventory.partSuppliers[modelId] = {};

    document.querySelectorAll('#inventory-editor [data-repair-id]').forEach(function (row) {
      var repairId = row.getAttribute('data-repair-id');
      if (!repairId) return;
      var qtyInput = row.querySelector('.inv-qty');
      var minInput = row.querySelector('.inv-min');
      var supSelect = row.querySelector('.inv-supplier');
      state.inventory.stock[modelId][repairId] = Math.max(0, Math.floor(Number(qtyInput && qtyInput.value) || 0));
      state.inventory.minQty[modelId][repairId] = Math.max(0, Math.floor(Number(minInput && minInput.value) || 0));
      var sid = supSelect ? String(supSelect.value || '') : '';
      if (sid) state.inventory.partSuppliers[modelId][repairId] = sid;
      else delete state.inventory.partSuppliers[modelId][repairId];
    });

    var leadInput = document.getElementById('inventory-lead-days');
    if (leadInput) {
      state.inventory.leadDaysWhenOutOfStock = Math.max(0, Math.floor(Number(leadInput.value) || 0));
    }
    var defMin = document.getElementById('inventory-default-min');
    if (defMin) {
      state.inventory.defaultMinQty = Math.max(0, Math.floor(Number(defMin.value) || 0));
    }
  }

  function renderInventoryAlerts() {
    var statsEl = document.getElementById('inventory-alerts-stats');
    var card = document.getElementById('inventory-alerts-card');
    var table = document.getElementById('inventory-alerts-table');
    var alerts = collectLowStockAlerts();
    if (statsEl) {
      statsEl.innerHTML =
        statCard('Pod minimem', alerts.length, alerts.length ? '' : 'green') +
        statCard('Výchozí minimum', state.inventory.defaultMinQty != null ? state.inventory.defaultMinQty : 1, 'blue') +
        statCard('Dodavatelé', (state.suppliers || []).length, 'blue');
    }
    if (!card || !table) return;
    if (!alerts.length) {
      card.hidden = true;
      table.innerHTML = '';
      return;
    }
    card.hidden = false;
    table.innerHTML =
      '<table class="its-admin-table"><thead><tr>' +
        '<th>Model</th><th>Díl</th><th>Skladem</th><th>Min</th><th>Dodavatel</th>' +
      '</tr></thead><tbody>' +
      alerts.slice(0, 40).map(function (a) {
        var sup = state.suppliers.find(function (s) { return s.id === a.supplierId; });
        return (
          '<tr>' +
            '<td>' + escapeHtml(a.modelName) + '</td>' +
            '<td>' + escapeHtml(a.title) + '</td>' +
            '<td class="its-admin-margin--neg">' + a.qty + '</td>' +
            '<td>' + a.min + '</td>' +
            '<td>' + escapeHtml(sup ? sup.name : '—') + '</td>' +
          '</tr>'
        );
      }).join('') +
      '</tbody></table>';
  }

  function renderInventoryModelSelect() {
    var select = document.getElementById('inventory-model-select');
    if (!select) return;
    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    var modelIds = devices ? devices.map(function (d) { return d.id; }) : [];
    if (!state.selectedInventoryModel && modelIds[0]) {
      state.selectedInventoryModel = modelIds[0];
    }
    select.innerHTML = modelIds.map(function (id) {
      var selected = id === state.selectedInventoryModel ? ' selected' : '';
      return '<option value="' + id + '"' + selected + '>' + escapeHtml(getModelLabel(id)) + '</option>';
    }).join('');
  }

  function renderInventoryEditor() {
    renderInventoryModelSelect();
    renderInventoryAlerts();
    var el = document.getElementById('inventory-editor');
    var leadInput = document.getElementById('inventory-lead-days');
    var leadLabel = document.getElementById('inventory-lead-label');
    var defMin = document.getElementById('inventory-default-min');
    if (leadInput) leadInput.value = state.inventory.leadDaysWhenOutOfStock != null
      ? state.inventory.leadDaysWhenOutOfStock
      : 2;
    if (leadLabel) leadLabel.textContent = String(leadInput ? leadInput.value : 2);
    if (defMin) defMin.value = state.inventory.defaultMinQty != null ? state.inventory.defaultMinQty : 1;
    if (!el) return;

    var modelId = state.selectedInventoryModel;
    var inStock = 0;
    var low = 0;
    var total = 0;

    el.innerHTML =
      '<p class="its-admin-prices-model-title">Sklad: <strong>' + escapeHtml(getModelLabel(modelId)) + '</strong></p>' +
      (state.priceCatalog.sections || []).map(function (section) {
        return (
          '<div class="its-admin-price-section">' +
            '<div class="its-admin-price-section__title">' + escapeHtml(section.title) + '</div>' +
            '<div class="its-admin-price-row its-admin-inventory-row its-admin-inventory-row--full its-admin-price-row--head">' +
              '<span>Díl</span><span>Skladem</span><span>Min</span><span>Dodavatel</span><span>Stav</span>' +
            '</div>' +
            section.items.map(function (item) {
              var qty = getInventoryQty(modelId, item.id);
              var min = getInventoryMin(modelId, item.id);
              var supplierId = getPartSupplierId(modelId, item.id);
              var isLow = qty <= min;
              total++;
              if (qty > 0) inStock++;
              if (isLow) low++;
              return (
                '<div class="its-admin-price-row its-admin-inventory-row its-admin-inventory-row--full" data-repair-id="' +
                  escapeAttr(item.id) + '">' +
                  '<span>' + escapeHtml(item.title) + '</span>' +
                  '<input type="number" class="inv-qty" min="0" step="1" value="' + qty + '" aria-label="Skladem">' +
                  '<input type="number" class="inv-min" min="0" step="1" value="' + min + '" aria-label="Minimum">' +
                  '<select class="inv-supplier" aria-label="Dodavatel">' + supplierOptionsHtml(supplierId) + '</select>' +
                  '<span class="its-admin-badge' +
                    (isLow ? ' its-admin-badge--red' : (qty > 0 ? ' its-admin-badge--blue' : '')) + '">' +
                    (isLow ? (qty === 0 ? 'Objednat' : 'Nízko') : 'OK') +
                  '</span>' +
                '</div>'
              );
            }).join('') +
          '</div>'
        );
      }).join('') +
      '<p class="its-admin-inventory-summary">Skladem: <strong>' + inStock + '</strong> / ' +
        total + ' · pod minimem u tohoto modelu: <strong>' + low + '</strong></p>';

    el.querySelectorAll('.inv-qty, .inv-min').forEach(function (input) {
      input.addEventListener('input', function () {
        var row = input.closest('[data-repair-id]');
        if (!row) return;
        var qty = Math.max(0, Math.floor(Number(row.querySelector('.inv-qty').value) || 0));
        var min = Math.max(0, Math.floor(Number(row.querySelector('.inv-min').value) || 0));
        var badge = row.querySelector('.its-admin-badge');
        var isLow = qty <= min;
        if (badge) {
          badge.textContent = isLow ? (qty === 0 ? 'Objednat' : 'Nízko') : 'OK';
          badge.className = 'its-admin-badge' +
            (isLow ? ' its-admin-badge--red' : (qty > 0 ? ' its-admin-badge--blue' : ''));
        }
      });
    });
  }

  function saveInventory() {
    collectInventoryFromDom();
    api('/api/admin/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.inventory)
    }).then(function (d) {
      state.inventory = normalizeInventoryState(d);
      renderInventoryEditor();
      renderDashboard();
      showAlert('Sklad uložen.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  function setAllInventoryQty(qty) {
    var modelId = state.selectedInventoryModel;
    if (!modelId) return;
    collectInventoryFromDom();
    if (!state.inventory.stock) state.inventory.stock = {};
    state.inventory.stock[modelId] = {};
    getAllCatalogItems().forEach(function (item) {
      state.inventory.stock[modelId][item.id] = qty;
    });
    renderInventoryEditor();
  }

  // --- Suppliers ---

  function renderSuppliers() {
    var el = document.getElementById('suppliers-table');
    if (!el) return;
    if (!state.suppliers.length) {
      el.innerHTML = '<div class="its-admin-empty">Zatím žádní dodavatelé.</div>';
      return;
    }
    el.innerHTML =
      '<table class="its-admin-table"><thead><tr>' +
        '<th>Název</th><th>Kontakt</th><th>Poznámka</th><th></th>' +
      '</tr></thead><tbody>' +
      state.suppliers.map(function (s) {
        return (
          '<tr>' +
            '<td><strong>' + escapeHtml(s.name) + '</strong>' +
              (s.website ? '<br><small><a href="' + escapeAttr(s.website) + '" target="_blank" rel="noopener">' +
                escapeHtml(s.website) + '</a></small>' : '') +
            '</td>' +
            '<td>' + escapeHtml(s.phone || '—') +
              (s.email ? '<br><small>' + escapeHtml(s.email) + '</small>' : '') +
            '</td>' +
            '<td>' + escapeHtml(s.note || '') + '</td>' +
            '<td>' +
              '<button type="button" class="its-admin-link-btn" data-edit-supplier="' + escapeAttr(s.id) + '">Upravit</button> · ' +
              '<button type="button" class="its-admin-link-btn its-admin-link-btn--danger" data-del-supplier="' + escapeAttr(s.id) + '">Smazat</button>' +
            '</td>' +
          '</tr>'
        );
      }).join('') +
      '</tbody></table>';
  }

  function resetSupplierForm() {
    document.getElementById('supplier-form').reset();
    document.getElementById('supplier-id').value = '';
    document.getElementById('supplier-form-title').textContent = 'Nový dodavatel';
    document.getElementById('supplier-cancel-btn').hidden = true;
  }

  function fillSupplierForm(supplier) {
    document.getElementById('supplier-id').value = supplier.id;
    document.getElementById('supplier-name').value = supplier.name || '';
    document.getElementById('supplier-phone').value = supplier.phone || '';
    document.getElementById('supplier-email').value = supplier.email || '';
    document.getElementById('supplier-website').value = supplier.website || '';
    document.getElementById('supplier-note').value = supplier.note || '';
    document.getElementById('supplier-form-title').textContent = 'Upravit dodavatele';
    document.getElementById('supplier-cancel-btn').hidden = false;
  }

  function saveSupplier(e) {
    e.preventDefault();
    var id = document.getElementById('supplier-id').value;
    var payload = {
      name: document.getElementById('supplier-name').value,
      phone: document.getElementById('supplier-phone').value,
      email: document.getElementById('supplier-email').value,
      website: document.getElementById('supplier-website').value,
      note: document.getElementById('supplier-note').value
    };
    var req = id
      ? api('/api/admin/suppliers/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : api('/api/admin/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
    req.then(function () {
      return api('/api/admin/suppliers');
    }).then(function (d) {
      state.suppliers = d.suppliers || [];
      resetSupplierForm();
      renderSuppliers();
      renderInventoryEditor();
      showAlert('Dodavatel uložen.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Order used parts ---

  function fillOrderPartSelects(order) {
    var modelSelect = document.getElementById('order-part-model');
    var repairSelect = document.getElementById('order-part-repair');
    var supplierSelect = document.getElementById('order-part-supplier');
    if (!modelSelect || !repairSelect) return;

    var devices = window.ITS_DEVICES && window.ITS_DEVICES.IPHONES;
    var modelIds = devices ? devices.map(function (d) { return d.id; }) : [];
    var preferred = state.selectedInventoryModel || (modelIds[0] || '');
    if (order && order.items && order.items[0] && order.items[0].modelId) {
      preferred = order.items[0].modelId;
    }

    modelSelect.innerHTML = modelIds.map(function (id) {
      return '<option value="' + id + '"' + (id === preferred ? ' selected' : '') + '>' +
        escapeHtml(getModelLabel(id)) + '</option>';
    }).join('');

    function fillRepairs() {
      var modelId = modelSelect.value;
      var preferredRepair = '';
      if (order && order.items && order.items[0] && order.items[0].modelId === modelId) {
        preferredRepair = order.items[0].repairId || '';
      }
      repairSelect.innerHTML = getAllCatalogItems().map(function (item) {
        return '<option value="' + escapeAttr(item.id) + '"' +
          (item.id === preferredRepair ? ' selected' : '') + '>' +
          escapeHtml(item.title) + '</option>';
      }).join('');
      syncOrderPartDefaults();
    }

    function syncOrderPartDefaults() {
      var modelId = modelSelect.value;
      var repairId = repairSelect.value;
      var costEl = document.getElementById('order-part-cost');
      var costs = ((state.priceData.costs || {})[modelId] || {})[repairId] || {};
      if (costEl && !(costEl.value && document.activeElement === costEl)) {
        costEl.value = costs.cost > 0 ? costs.cost : '';
      }
      if (supplierSelect) {
        var sid = getPartSupplierId(modelId, repairId);
        supplierSelect.innerHTML = supplierOptionsHtml(sid);
      }
    }

    modelSelect.onchange = fillRepairs;
    repairSelect.onchange = syncOrderPartDefaults;
    fillRepairs();
  }

  function renderOrderParts(order) {
    var box = document.getElementById('order-parts');
    var list = document.getElementById('order-parts-list');
    if (!box || !list) return;
    if (!order || !order.id) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    fillOrderPartSelects(order);

    var parts = Array.isArray(order.usedParts) ? order.usedParts : [];
    if (!parts.length) {
      list.innerHTML = '<div class="its-admin-photos__empty">Zatím žádné použité díly.</div>';
      return;
    }
    list.innerHTML =
      '<table class="its-admin-table"><thead><tr>' +
        '<th>Díl</th><th>ks</th><th>Nákup</th><th>Dodavatel</th><th></th>' +
      '</tr></thead><tbody>' +
      parts.map(function (p) {
        return (
          '<tr>' +
            '<td>' + escapeHtml(p.title || p.repairId) +
              '<br><small style="color:var(--its-muted)">' + escapeHtml(getModelLabel(p.modelId)) +
              (p.serial ? ' · SN ' + escapeHtml(p.serial) : '') +
              (p.decrementedStock ? ' · −sklad' : '') +
              '</small></td>' +
            '<td>' + (p.qty || 1) + '</td>' +
            '<td>' + formatMoney(p.cost || 0) + '</td>' +
            '<td>' + escapeHtml(p.supplierName || '—') + '</td>' +
            '<td><button type="button" class="its-admin-link-btn its-admin-link-btn--danger" data-del-part="' +
              escapeAttr(p.id) + '">Odebrat</button></td>' +
          '</tr>'
        );
      }).join('') +
      '</tbody></table>';
  }

  function addOrderPart() {
    var id = document.getElementById('order-id').value;
    if (!id) return showAlert('Nejdřív otevřete zakázku.', 'error');
    var payload = {
      modelId: document.getElementById('order-part-model').value,
      repairId: document.getElementById('order-part-repair').value,
      qty: Number(document.getElementById('order-part-qty').value) || 1,
      supplierId: document.getElementById('order-part-supplier').value,
      cost: document.getElementById('order-part-cost').value,
      serial: document.getElementById('order-part-serial').value,
      decrementStock: document.getElementById('order-part-decrement').checked
    };
    api('/api/admin/orders/' + encodeURIComponent(id) + '/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.order) syncOrderInState(res.order);
      return api('/api/admin/inventory');
    }).then(function (inv) {
      state.inventory = normalizeInventoryState(inv);
      var order = state.orders.find(function (o) { return o.id === id; });
      renderOrderParts(order);
      renderInventoryEditor();
      renderDashboard();
      document.getElementById('order-part-serial').value = '';
      showAlert('Díl přiřazen k zakázce.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  // --- Checklist ---

  function renderChecklist() {
    var el = document.getElementById('checklist-editor');
    el.innerHTML = state.checklist.categories.map(function (cat, ci) {
      var done = cat.items.filter(function (i) { return i.done; }).length;
      return (
        '<div class="its-admin-card its-admin-checklist-cat" data-cat="' + ci + '">' +
          '<div class="its-admin-checklist-cat__head">' +
            '<h3 class="its-admin-checklist-cat__title">' + escapeHtml(cat.title) + '</h3>' +
            '<span class="its-admin-badge its-admin-badge--blue">' + done + ' / ' + cat.items.length + '</span>' +
          '</div>' +
          cat.items.map(function (item, ii) {
            return (
              '<div class="its-admin-checklist-item">' +
                '<input type="checkbox" data-cat="' + ci + '" data-item="' + ii + '"' + (item.done ? ' checked' : '') + '>' +
                '<label class="its-admin-checklist-item__label' + (item.done ? ' its-admin-checklist-item__label--done' : '') + '">' +
                  escapeHtml(item.label) +
                  (item.note ? '<span class="its-admin-checklist-item__note">' + escapeHtml(item.note) + '</span>' : '') +
                '</label>' +
              '</div>'
            );
          }).join('') +
        '</div>'
      );
    }).join('');

    el.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var ci = Number(cb.getAttribute('data-cat'));
        var ii = Number(cb.getAttribute('data-item'));
        state.checklist.categories[ci].items[ii].done = cb.checked;
        cb.nextElementSibling.classList.toggle('its-admin-checklist-item__label--done', cb.checked);
      });
    });
  }

  function saveChecklist() {
    api('/api/admin/checklist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.checklist)
    }).then(function () {
      renderChecklist();
      renderDashboard();
      showAlert('Checklist uložen.', 'success');
    }).catch(function (err) {
      showAlert(err.message, 'error');
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  // --- Init ---

  document.addEventListener('DOMContentLoaded', function () {
    var loadingEl = document.getElementById('admin-loading');
    var appEl = document.getElementById('admin-app');

    var loadingTimeout = setTimeout(function () {
      if (loadingEl && !loadingEl.hidden) {
        loadingEl.innerHTML =
          '<div class="its-admin-alert its-admin-alert--error" style="max-width:28rem;margin:1rem">' +
          'Načítání trvá příliš dlouho. ' +
          '<a href="/admin/login.html">Přejít na přihlášení</a> nebo obnovte stránku (Cmd+Shift+R).' +
          '</div>';
      }
    }, 8000);

    function finishLoading() {
      clearTimeout(loadingTimeout);
      if (loadingEl) {
        loadingEl.hidden = true;
        loadingEl.style.display = 'none';
      }
      if (appEl) {
        appEl.hidden = false;
        appEl.style.display = '';
      }
    }

    function failLoading(msg) {
      clearTimeout(loadingTimeout);
      if (loadingEl) {
        loadingEl.innerHTML =
          '<div class="its-admin-alert its-admin-alert--error" style="max-width:28rem;margin:1rem">' +
          msg + ' <a href="/admin/login.html">Přihlásit se</a>' +
          '</div>';
      }
    }

    if (typeof window.adminApi !== 'function') {
      failLoading('Chybí admin skript. Obnovte stránku (Cmd+Shift+R).');
      return;
    }

    requireAuth().then(function () {
      return loadAll();
    }).then(function () {
      var accDate = document.getElementById('acc-date');
      if (accDate) accDate.value = new Date().toISOString().slice(0, 10);

      renderDashboard();
      renderPricesEditor();
      renderMarginOverview();
      renderContentEditor();
      renderOrders();
      renderSlots();
      renderInventoryEditor();
      renderSuppliers();
      renderAccounting();
      renderStats();
      renderChecklist();

      finishLoading();

      var hash = (location.hash || '#prehled').slice(1);
      if (['prehled', 'cenik', 'marze', 'obsah', 'zakazky', 'terminy', 'sklad', 'dodavatele', 'ucetnictvi', 'statistiky', 'checklist'].indexOf(hash) !== -1) {
        switchPanel(hash);
      }

      document.querySelectorAll('.its-admin-nav__link').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          switchPanel(a.getAttribute('data-panel'));
        });
      });

      document.querySelectorAll('[data-goto]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          switchPanel(btn.getAttribute('data-goto'));
        });
      });

      document.getElementById('save-prices-btn').addEventListener('click', savePrices);
      document.getElementById('save-content-btn').addEventListener('click', saveContent);

      var priceModelSelect = document.getElementById('price-model-select');
      if (priceModelSelect) {
        priceModelSelect.addEventListener('change', function () {
          collectPricesFromDom();
          state.selectedPriceModel = priceModelSelect.value;
          renderPricesEditor();
        });
      }

      var marginModelSelect = document.getElementById('margin-model-select');
      if (marginModelSelect) {
        marginModelSelect.addEventListener('change', function () {
          state.selectedMarginModel = marginModelSelect.value;
          renderMarginOverview();
        });
      }
      var marginFilter = document.getElementById('margin-filter');
      if (marginFilter) {
        marginFilter.addEventListener('change', function () {
          state.marginFilter = marginFilter.value;
          renderMarginOverview();
        });
      }

      var contentSelect = document.getElementById('content-repair-select');
      if (contentSelect) {
        contentSelect.addEventListener('change', function () {
          collectContentFromDom();
          state.selectedRepairId = contentSelect.value;
          renderContentEditor();
        });
      }

      var vatInput = document.getElementById('price-vat-rate');
      if (vatInput) {
        vatInput.addEventListener('input', function () {
          state.priceData.vatRate = Number(vatInput.value) || 21;
          document.querySelectorAll('#prices-editor .its-admin-price-row[data-item-id]').forEach(function (row) {
            updatePriceRowMargin(row);
          });
          renderModelMarginStats(state.selectedPriceModel);
        });
      }

      document.getElementById('save-checklist-btn').addEventListener('click', saveChecklist);
      document.getElementById('save-inventory-btn').addEventListener('click', saveInventory);
      document.getElementById('order-form').addEventListener('submit', saveOrder);
      document.getElementById('order-cancel-btn').addEventListener('click', resetOrderForm);
      bindPhotoInputs();
      bindSignPad();
      bindDiagnosisControls();
      document.getElementById('accounting-form').addEventListener('submit', saveAccountingEntry);
      document.getElementById('slot-form').addEventListener('submit', addSlot);
      document.getElementById('supplier-form').addEventListener('submit', saveSupplier);
      document.getElementById('supplier-cancel-btn').addEventListener('click', resetSupplierForm);

      var monthSelect = document.getElementById('acc-month-select');
      if (monthSelect) {
        if (!monthSelect.value) monthSelect.value = getSelectedAccountingMonth();
        monthSelect.addEventListener('change', function () {
          state.selectedAccountingMonth = monthSelect.value || currentMonthValue();
          renderAccounting();
        });
      }

      var statsPeriod = document.getElementById('stats-period');
      if (statsPeriod) {
        statsPeriod.addEventListener('change', function () {
          state.statsPeriod = statsPeriod.value || 'all';
          renderStats();
        });
      }

      var exportAcc = document.getElementById('export-acc-csv-btn');
      if (exportAcc) {
        exportAcc.addEventListener('click', function () {
          var month = getSelectedAccountingMonth();
          downloadCsvExport('/api/admin/export/accounting.csv?month=' + encodeURIComponent(month), 'ucetni-zaznamy.csv');
        });
      }
      var exportOrders = document.getElementById('export-orders-csv-btn');
      if (exportOrders) {
        exportOrders.addEventListener('click', function () {
          var month = getSelectedAccountingMonth();
          downloadCsvExport('/api/admin/export/orders.csv?month=' + encodeURIComponent(month), 'zakazky.csv');
        });
      }
      var exportMonth = document.getElementById('export-month-csv-btn');
      if (exportMonth) {
        exportMonth.addEventListener('click', function () {
          var month = getSelectedAccountingMonth();
          downloadCsvExport('/api/admin/export/monthly.csv?month=' + encodeURIComponent(month), 'mesicni-prehled.csv');
        });
      }

      var addPartBtn = document.getElementById('order-part-add-btn');
      if (addPartBtn) addPartBtn.addEventListener('click', addOrderPart);

      var inventoryModelSelect = document.getElementById('inventory-model-select');
      if (inventoryModelSelect) {
        inventoryModelSelect.addEventListener('change', function () {
          collectInventoryFromDom();
          state.selectedInventoryModel = inventoryModelSelect.value;
          renderInventoryEditor();
        });
      }

      var inventoryLead = document.getElementById('inventory-lead-days');
      if (inventoryLead) {
        inventoryLead.addEventListener('input', function () {
          var leadLabel = document.getElementById('inventory-lead-label');
          if (leadLabel) leadLabel.textContent = String(inventoryLead.value || 0);
        });
      }

      var invZero = document.getElementById('inventory-all-zero');
      if (invZero) {
        invZero.addEventListener('click', function () {
          collectInventoryFromDom();
          setAllInventoryQty(0);
        });
      }
      var invOne = document.getElementById('inventory-all-one');
      if (invOne) {
        invOne.addEventListener('click', function () {
          collectInventoryFromDom();
          setAllInventoryQty(1);
        });
      }

      document.getElementById('logout-btn').addEventListener('click', function () {
        api('/api/admin/logout', { method: 'POST' }).then(function () {
          window.location.replace('/admin/login.html');
        });
      });

      document.body.addEventListener('click', function (e) {
        var editId = e.target.getAttribute('data-edit-order');
        if (editId) {
          var order = state.orders.find(function (o) { return o.id === editId; });
          if (order) fillOrderForm(order);
        }

        var delOrder = e.target.getAttribute('data-del-order');
        if (delOrder && confirm('Smazat zakázku?')) {
          api('/api/admin/orders/' + delOrder, { method: 'DELETE' }).then(function () {
            return api('/api/admin/orders');
          }).then(function (d) {
            state.orders = d.orders || [];
            if (document.getElementById('order-id').value === delOrder) resetOrderForm();
            renderOrders();
            renderDashboard();
            showAlert('Zakázka smazána.', 'success');
          });
        }

        var delPhoto = e.target.getAttribute('data-del-photo');
        var photoKind = e.target.getAttribute('data-photo-kind');
        if (delPhoto && photoKind) {
          e.preventDefault();
          var orderId = document.getElementById('order-id').value;
          if (!orderId || !confirm('Smazat tuto fotku?')) return;
          api(
            '/api/admin/orders/' + encodeURIComponent(orderId) +
            '/photos/' + encodeURIComponent(photoKind) + '/' + encodeURIComponent(delPhoto),
            { method: 'DELETE' }
          ).then(function (res) {
            var order = state.orders.find(function (o) { return o.id === orderId; });
            if (order) {
              order.photos = res.photos;
              renderOrderPhotos(order);
            }
            renderOrders();
            showAlert('Fotka smazána.', 'success');
          }).catch(function (err) {
            showAlert(err.message, 'error');
          });
        }

        var signKind = e.target.getAttribute('data-sign-doc');
        if (signKind) {
          e.preventDefault();
          openSignModal(signKind);
        }

        var emailKind = e.target.getAttribute('data-email-doc');
        if (emailKind) {
          e.preventDefault();
          emailDocument(emailKind);
        }

        var editSup = e.target.getAttribute('data-edit-supplier');
        if (editSup) {
          var supplier = state.suppliers.find(function (s) { return s.id === editSup; });
          if (supplier) {
            fillSupplierForm(supplier);
            switchPanel('dodavatele');
          }
        }

        var delSup = e.target.getAttribute('data-del-supplier');
        if (delSup && confirm('Smazat dodavatele?')) {
          api('/api/admin/suppliers/' + encodeURIComponent(delSup), { method: 'DELETE' }).then(function () {
            return api('/api/admin/suppliers');
          }).then(function (d) {
            state.suppliers = d.suppliers || [];
            if (document.getElementById('supplier-id').value === delSup) resetSupplierForm();
            renderSuppliers();
            renderInventoryEditor();
            showAlert('Dodavatel smazán.', 'success');
          }).catch(function (err) {
            showAlert(err.message, 'error');
          });
        }

        var delPart = e.target.getAttribute('data-del-part');
        if (delPart) {
          var orderIdForPart = document.getElementById('order-id').value;
          if (!orderIdForPart || !confirm('Odebrat díl ze zakázky? (vrátí se na sklad, pokud byl odečten)')) return;
          api(
            '/api/admin/orders/' + encodeURIComponent(orderIdForPart) +
            '/parts/' + encodeURIComponent(delPart),
            { method: 'DELETE' }
          ).then(function (res) {
            if (res.order) syncOrderInState(res.order);
            return api('/api/admin/inventory');
          }).then(function (inv) {
            state.inventory = normalizeInventoryState(inv);
            var order = state.orders.find(function (o) { return o.id === orderIdForPart; });
            renderOrderParts(order);
            renderInventoryEditor();
            renderDashboard();
            showAlert('Díl odebrán.', 'success');
          }).catch(function (err) {
            showAlert(err.message, 'error');
          });
        }

        var delAcc = e.target.getAttribute('data-del-acc');
        if (delAcc && confirm('Smazat záznam?')) {
          api('/api/admin/accounting/' + delAcc, { method: 'DELETE' }).then(function () {
            return api('/api/admin/accounting');
          }).then(function (d) {
            state.accounting = d;
            renderAccounting();
            renderDashboard();
            showAlert('Záznam smazán.', 'success');
          });
        }

        var delSlot = e.target.getAttribute('data-del-slot');
        if (delSlot && confirm('Smazat termín?')) {
          api('/api/admin/slots/' + delSlot, { method: 'DELETE' }).then(function () {
            return api('/api/admin/slots');
          }).then(function (d) {
            state.slots = d.slots || [];
            renderSlots();
            showAlert('Termín smazán.', 'success');
          });
        }

        var addFeature = e.target.getAttribute('data-add-feature');
        if (addFeature != null) {
          collectContentFromDom();
          var ati = Number(addFeature);
          var atier = state.repairContent.comparison.tiers[ati];
          if (atier) {
            if (!atier.features) atier.features = [];
            atier.features.push({ label: '', text: '' });
            renderContentEditor();
          }
        }

        var delFeature = e.target.getAttribute('data-del-feature');
        if (delFeature) {
          collectContentFromDom();
          var parts = delFeature.split(':');
          var dti = Number(parts[0]);
          var dfi = Number(parts[1]);
          var dtier = state.repairContent.comparison.tiers[dti];
          if (dtier && dtier.features) {
            dtier.features.splice(dfi, 1);
            renderContentEditor();
          }
        }
      });
    }).catch(function (err) {
      if (err.message === 'redirect') {
        if (loadingEl) loadingEl.innerHTML = '<p>Přesměrování na přihlášení…</p>';
        return;
      }
      failLoading(err.message || 'Nepodařilo se načíst admin.');
    });
  });
})();
