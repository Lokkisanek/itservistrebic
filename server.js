'use strict';

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var express = require('express');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var helmet = require('helmet');
var rateLimit = require('express-rate-limit');
var bcrypt = require('bcrypt');
var multer = require('multer');
var orderDocs = require('./lib/order-documents');

require('dotenv').config();

var ROOT = __dirname;
var DATA_DIR = path.join(ROOT, 'data');
var SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
var ORDER_UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'orders');
var PORT = Number(process.env.PORT) || 8080;
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
var ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
var SESSION_SECRET = process.env.SESSION_SECRET || '';
var IS_PROD = process.env.NODE_ENV === 'production';
var COOKIE_SECURE = process.env.COOKIE_SECURE === '1' || IS_PROD;
var TRUST_PROXY = process.env.TRUST_PROXY !== '0';

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  if (IS_PROD) {
    console.error('\n❌ SESSION_SECRET musí mít alespoň 32 znaků v produkci.\n');
    process.exit(1);
  }
  SESSION_SECRET = SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  console.warn('\n⚠️  SESSION_SECRET chybí nebo je krátký — vygenerován dočasný (dev).\n');
}

if (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH) {
  console.warn('\n⚠️  Nastavte ADMIN_PASSWORD nebo ADMIN_PASSWORD_HASH v .env\n');
}

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}
if (!fs.existsSync(ORDER_UPLOADS_DIR)) {
  fs.mkdirSync(ORDER_UPLOADS_DIR, { recursive: true });
}

/** bcrypt hash hesla — buď z ADMIN_PASSWORD_HASH, nebo spočítaný z ADMIN_PASSWORD. */
var adminPasswordHashPromise = (function () {
  if (ADMIN_PASSWORD_HASH && ADMIN_PASSWORD_HASH.indexOf('$2') === 0) {
    return Promise.resolve(ADMIN_PASSWORD_HASH);
  }
  if (ADMIN_PASSWORD) {
    return bcrypt.hash(ADMIN_PASSWORD, 12);
  }
  return Promise.resolve('');
})();

var app = express();

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://unpkg.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "upgrade-insecure-requests": null
    }
  },
  hsts: IS_PROD ? undefined : false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '8mb' }));

app.use(function (req, res, next) {
  var start = Date.now();
  res.on('finish', function () {
    if (req.path.indexOf('/api/') !== 0) return;
    var ms = Date.now() - start;
    console.log(
      '[' + new Date().toISOString() + '] ' +
      req.method + ' ' + req.path + ' ' + res.statusCode + ' ' + ms + 'ms'
    );
  });
  next();
});

app.use(session({
  name: 'its_admin_sid',
  store: new FileStore({
    path: SESSIONS_DIR,
    ttl: 12 * 60 * 60,
    retries: 1,
    logFn: function () {}
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: 12 * 60 * 60 * 1000
  }
}));

var loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho pokusů o přihlášení. Zkuste to za 15 minut.' }
});

function readJson(fileName) {
  var filePath = path.join(DATA_DIR, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(fileName, data) {
  var filePath = path.join(DATA_DIR, fileName);
  var tmpPath = filePath + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/** Serializace zápisů do JSON (objednávky / sloty), aby nešlo dvojitě zarezervovat. */
var dataWriteChain = Promise.resolve();

function withDataLock(fn) {
  var run = dataWriteChain.then(function () {
    return Promise.resolve().then(fn);
  });
  dataWriteChain = run.then(function () {}, function () {});
  return run;
}

function httpError(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Nejste přihlášeni.' });
}

function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
}

function emptyOrderPhotos() {
  return { intake: [], done: [] };
}

function normalizeOrderPhotos(photos) {
  var p = photos && typeof photos === 'object' ? photos : {};
  return {
    intake: Array.isArray(p.intake) ? p.intake : [],
    done: Array.isArray(p.done) ? p.done : []
  };
}

function sanitizeOrderId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function isPhotoKind(kind) {
  return kind === 'intake' || kind === 'done';
}

function orderPhotoDir(orderId, kind) {
  return path.join(ORDER_UPLOADS_DIR, sanitizeOrderId(orderId), kind);
}

function removeOrderUploads(orderId) {
  var dir = path.join(ORDER_UPLOADS_DIR, sanitizeOrderId(orderId));
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function orderDocsDir(orderId) {
  return path.join(ORDER_UPLOADS_DIR, sanitizeOrderId(orderId), 'docs');
}

function orderDocPath(orderId, kind) {
  return path.join(orderDocsDir(orderId), kind + '.pdf');
}

var orderPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      var kind = isPhotoKind(req.params.kind) ? req.params.kind : 'intake';
      var dir = orderPhotoDir(req.params.id, kind);
      try {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: function (req, file, cb) {
      var ext = path.extname(file.originalname || '').toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].indexOf(ext) === -1) {
        ext = '.jpg';
      }
      cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 8 },
  fileFilter: function (req, file, cb) {
    var ok = /^image\//i.test(file.mimetype || '') ||
      file.mimetype === 'application/octet-stream';
    if (ok) return cb(null, true);
    cb(new Error('Nahrát lze jen fotky (JPEG, PNG, WEBP, HEIC).'));
  }
});

function haversineKm(lat1, lng1, lat2, lng2) {
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcDeliveryFee(distanceKm, pricing) {
  var p = pricing || {};
  var base = Number(p.baseFee) || 39;
  var included = Number(p.includedKm) != null ? Number(p.includedKm) : 5;
  var perKm = Number(p.perKm) || 12;
  var dist = Math.max(0, Number(distanceKm) || 0);
  if (dist <= included) return base;
  return base + Math.ceil(dist - included) * perKm;
}

function deliveryQuoteFromCoords(lat, lng) {
  var fees = readJson('delivery-fees.json');
  var origin = fees.origin || {};
  var oLat = Number(origin.lat);
  var oLng = Number(origin.lng);
  var latN = Number(lat);
  var lngN = Number(lng);
  if (!isFinite(oLat) || !isFinite(oLng) || !isFinite(latN) || !isFinite(lngN)) {
    return { error: 'Neplatné souřadnice.' };
  }
  var maxKm = Number((fees.pricing && fees.pricing.maxKm) || 60);
  var distanceKm = Math.round(haversineKm(oLat, oLng, latN, lngN) * 10) / 10;
  if (distanceKm > maxKm) {
    return {
      error: 'Adresa je mimo dosah výjezdu (max. ' + maxKm + ' km). Kontaktujte nás telefonicky.',
      distanceKm: distanceKm,
      maxKm: maxKm
    };
  }
  var fee = calcDeliveryFee(distanceKm, fees.pricing);
  return {
    distanceKm: distanceKm,
    fee: fee,
    label: distanceKm.toFixed(1).replace('.', ',') + ' km',
    origin: fees.baseFrom || 'Třebíč',
    pricing: fees.pricing
  };
}

function addDaysIso(isoDate, days) {
  var parts = String(isoDate).split('-').map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + days);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function todayLocalIso() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function repairNeedsInventory(modelId) {
  var id = String(modelId || '');
  if (!id || id === 'software' || id === 'pc') return false;
  return id.indexOf('iphone') === 0;
}

function getStockQty(inventory, modelId, repairId) {
  var stock = (inventory && inventory.stock) || {};
  var byModel = stock[modelId] || {};
  var qty = byModel[repairId];
  return qty == null ? 0 : Number(qty) || 0;
}

function getMinQty(inventory, modelId, repairId) {
  var mins = (inventory && inventory.minQty) || {};
  var byModel = mins[modelId] || {};
  if (byModel[repairId] != null && byModel[repairId] !== '') {
    var n = Math.max(0, Math.floor(Number(byModel[repairId]) || 0));
    return n;
  }
  var def = Number(inventory && inventory.defaultMinQty);
  if (!isFinite(def) || def < 0) def = 1;
  return Math.floor(def);
}

function isLowStock(inventory, modelId, repairId) {
  var qty = getStockQty(inventory, modelId, repairId);
  var min = getMinQty(inventory, modelId, repairId);
  return qty <= min;
}

function cleanQtyMap(src) {
  var out = {};
  if (!src || typeof src !== 'object') return out;
  Object.keys(src).forEach(function (modelId) {
    var row = src[modelId];
    if (!row || typeof row !== 'object') return;
    out[modelId] = {};
    Object.keys(row).forEach(function (repairId) {
      out[modelId][repairId] = Math.max(0, Math.floor(Number(row[repairId]) || 0));
    });
  });
  return out;
}

function cleanIdMap(src) {
  var out = {};
  if (!src || typeof src !== 'object') return out;
  Object.keys(src).forEach(function (modelId) {
    var row = src[modelId];
    if (!row || typeof row !== 'object') return;
    out[modelId] = {};
    Object.keys(row).forEach(function (repairId) {
      var id = String(row[repairId] || '').trim();
      if (id) out[modelId][repairId] = id.slice(0, 80);
    });
  });
  return out;
}

function normalizeInventoryPayload(body) {
  var lead = Number(body && body.leadDaysWhenOutOfStock);
  if (!isFinite(lead) || lead < 0) lead = 2;
  var defaultMin = Number(body && body.defaultMinQty);
  if (!isFinite(defaultMin) || defaultMin < 0) defaultMin = 1;
  return {
    leadDaysWhenOutOfStock: Math.floor(lead),
    defaultMinQty: Math.floor(defaultMin),
    stock: cleanQtyMap(body && body.stock),
    minQty: cleanQtyMap(body && body.minQty),
    partSuppliers: cleanIdMap(body && body.partSuppliers)
  };
}

function findSupplier(suppliers, id) {
  var list = (suppliers && suppliers.suppliers) || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function getPartCost(modelId, repairId) {
  var prices = readJson('iphone-prices.json');
  var costs = (prices && prices.costs) || {};
  var entry = (costs[modelId] && costs[modelId][repairId]) || {};
  return Number(entry.cost) || 0;
}

/** Odečet skladu po úspěšné rezervaci (jen iPhone díly). */
function decrementInventoryForItems(items) {
  var inventory = readJson('inventory.json');
  if (!inventory.stock) inventory.stock = {};
  var changed = false;

  (items || []).forEach(function (item) {
    if (!repairNeedsInventory(item.modelId) || !item.repairId) return;
    if (!inventory.stock[item.modelId]) inventory.stock[item.modelId] = {};
    var cur = Number(inventory.stock[item.modelId][item.repairId]);
    if (!isFinite(cur)) cur = 0;
    if (cur > 0) {
      inventory.stock[item.modelId][item.repairId] = cur - 1;
      changed = true;
    }
  });

  if (changed) writeJson('inventory.json', inventory);
}

function adjustStock(modelId, repairId, delta) {
  var inventory = readJson('inventory.json');
  if (!inventory.stock) inventory.stock = {};
  if (!inventory.stock[modelId]) inventory.stock[modelId] = {};
  var cur = Number(inventory.stock[modelId][repairId]);
  if (!isFinite(cur)) cur = 0;
  var next = Math.max(0, cur + delta);
  inventory.stock[modelId][repairId] = next;
  writeJson('inventory.json', inventory);
  return next;
}

/** Neříká klientovi proč — jen nejdřívější datum rezervace. */
function earliestBookingDateForItems(items) {
  var inventory = readJson('inventory.json');
  var lead = Number(inventory.leadDaysWhenOutOfStock);
  if (!isFinite(lead) || lead < 0) lead = 2;
  var today = todayLocalIso();
  var needsLead = false;
  (items || []).forEach(function (item) {
    if (!repairNeedsInventory(item.modelId)) return;
    if (!item.repairId) return;
    if (getStockQty(inventory, item.modelId, item.repairId) < 1) {
      needsLead = true;
    }
  });
  return needsLead ? addDaysIso(today, lead) : today;
}

function availableSlotsForItems(items) {
  var data = readJson('slots.json');
  var earliest = earliestBookingDateForItems(items);
  var slots = (data.slots || []).filter(function (s) {
    return !s.booked && s.date >= earliest;
  }).sort(function (a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  });
  return { slots: slots, earliestDate: earliest };
}

async function nominatimFetch(urlPath) {
  var url = 'https://nominatim.openstreetmap.org' + urlPath;
  var response = await fetch(url, {
    headers: {
      'User-Agent': 'ITServisTrebic/1.0 (local booking)',
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error('Geocoding selhal');
  return response.json();
}

app.get('/api/health', function (req, res) {
  res.json({
    ok: true,
    service: 'itservistrebic',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    env: IS_PROD ? 'production' : 'development'
  });
});

// --- Auth API ---

app.post('/api/admin/login', loginLimiter, function (req, res) {
  var password = String((req.body && req.body.password) || '');
  adminPasswordHashPromise
    .then(function (hash) {
      if (!hash) {
        return res.status(503).json({
          error: 'Admin není nakonfigurován. Nastavte ADMIN_PASSWORD nebo ADMIN_PASSWORD_HASH v .env'
        });
      }
      return bcrypt.compare(password, hash).then(function (ok) {
        if (!ok) {
          return res.status(401).json({ error: 'Neplatné heslo.' });
        }
        req.session.admin = true;
        req.session.save(function (err) {
          if (err) {
            return res.status(500).json({ error: 'Přihlášení se nepodařilo uložit.' });
          }
          res.json({ ok: true });
        });
      });
    })
    .catch(function () {
      res.status(500).json({ error: 'Chyba přihlášení.' });
    });
});

app.post('/api/admin/logout', function (req, res) {
  req.session.destroy(function () {
    res.json({ ok: true });
  });
});

app.get('/api/admin/me', function (req, res) {
  res.json({ authenticated: !!(req.session && req.session.admin) });
});

function mergeModelPriceList(modelId) {
  var catalog = readJson('iphone-repairs-catalog.json');
  var prices = readJson('iphone-prices.json');
  var modelPrices = prices.models[modelId];
  if (!modelPrices) return null;

  return {
    vatRate: prices.vatRate,
    pricesIncludeVat: prices.pricesIncludeVat,
    modelId: modelId,
    sections: catalog.sections.map(function (section) {
      return {
        title: section.title,
        items: section.items.map(function (item) {
          var raw = modelPrices[item.id];
          var price = (raw && typeof raw === 'object')
            ? (Number(raw.sell != null ? raw.sell : raw.price) || 0)
            : (Number(raw) || 0);
          return Object.assign({}, item, { price: price });
        })
      };
    })
  };
}

function slugifyCs(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Fixní ceník software / PC — stejné ID jako js/repairs.js (slug). */
var SERVICE_CATALOG = {
  software: [
    { title: 'Instalace Windows', price: 590 },
    { title: 'Instalace ovladačů a softwaru', price: 390 },
    { title: 'Odvirování a čištění systému', price: 490 },
    { title: 'Záloha a obnova dat', price: 590 },
    { title: 'Přenos dat na nové zařízení', price: 490 },
    { title: 'Konfigurace e-mailu a tiskárny', price: 390 }
  ],
  pc: [
    { title: 'Diagnostika PC / notebooku', price: 0 },
    { title: 'Čištění zařízení (1 hod)', price: 590 },
    { title: 'Výměna SSD / HDD', price: 490 },
    { title: 'Rozšíření RAM', price: 390 },
    { title: 'Oprava základní desky / napájení', price: 990 },
    { title: 'Sestavení PC na míru', price: 1490 }
  ]
};

function findCatalogRepair(repairId) {
  var catalog = readJson('iphone-repairs-catalog.json');
  var found = null;
  (catalog.sections || []).forEach(function (section) {
    (section.items || []).forEach(function (item) {
      if (item.id === repairId) found = item;
    });
  });
  return found;
}

function findServiceItem(modelId, repairId) {
  var list = SERVICE_CATALOG[modelId] || [];
  for (var i = 0; i < list.length; i++) {
    var id = slugifyCs(modelId + '-' + list[i].title);
    if (id === repairId) return list[i];
  }
  return null;
}

/** Ceny a názvy oprav vždy ze serveru — klientské price se ignoruje. */
function resolveOrderItem(raw) {
  var modelId = String((raw && raw.modelId) || '').trim();
  var repairId = String((raw && raw.repairId) || '').trim();
  if (!modelId || !repairId) {
    return { error: 'Neplatná položka v košíku.' };
  }

  if (modelId === 'software' || modelId === 'pc') {
    var service = findServiceItem(modelId, repairId);
    if (!service) return { error: 'Neznámá služba v košíku.' };
    return {
      modelId: modelId,
      modelName: modelId === 'software' ? 'Instalace softwaru' : 'PC / Notebook',
      repairId: repairId,
      repairTitle: service.title,
      price: Number(service.price) || 0,
      time: '',
      icon: 'images/devices/iphone-parts/iphone-broken-display-logo.svg',
      category: modelId
    };
  }

  if (modelId.indexOf('iphone') !== 0) {
    return { error: 'Neplatný model zařízení.' };
  }

  var prices = readJson('iphone-prices.json');
  var modelPrices = prices.models && prices.models[modelId];
  if (!modelPrices || modelPrices[repairId] == null) {
    return { error: 'Ceník pro vybranou opravu nenalezen.' };
  }

  var rawPrice = modelPrices[repairId];
  var price = (rawPrice && typeof rawPrice === 'object')
    ? (Number(rawPrice.sell != null ? rawPrice.sell : rawPrice.price) || 0)
    : Number(rawPrice);
  if (!isFinite(price) || price <= 0) {
    return { error: 'Tato oprava není momentálně v nabídce.' };
  }

  var catalogItem = findCatalogRepair(repairId);
  if (!catalogItem) {
    return { error: 'Neznámá oprava v košíku.' };
  }

  var modelName = String((raw && raw.modelName) || '').trim() || modelId;

  return {
    modelId: modelId,
    modelName: modelName,
    repairId: repairId,
    repairTitle: catalogItem.title,
    price: price,
    time: catalogItem.time || '',
    icon: catalogItem.icon || '',
    category: 'mobile'
  };
}

function resolveOrderItems(items) {
  var normalized = [];
  for (var i = 0; i < items.length; i++) {
    var resolved = resolveOrderItem(items[i]);
    if (resolved.error) return resolved;
    normalized.push(resolved);
  }
  return { items: normalized };
}

// --- Prices ---

app.get('/data/iphone-cenik/:modelId.json', function (req, res) {
  var data = mergeModelPriceList(req.params.modelId);
  if (!data) {
    return res.status(404).json({ error: 'Ceník pro tento model nenalezen.' });
  }
  res.json(data);
});

app.get('/data/iphone-repairs.json', function (req, res) {
  var modelId = req.query.model;
  if (modelId) {
    var data = mergeModelPriceList(modelId);
    if (!data) return res.status(404).json({ error: 'Model nenalezen.' });
    return res.json(data);
  }
  res.status(400).json({ error: 'Použijte /data/iphone-cenik/{model-id}.json' });
});

app.get('/api/admin/prices/iphone', requireAuth, function (req, res) {
  var prices = readJson('iphone-prices.json');
  res.json({
    catalog: readJson('iphone-repairs-catalog.json'),
    vatRate: prices.vatRate,
    pricesIncludeVat: prices.pricesIncludeVat,
    models: prices.models,
    costs: prices.costs && typeof prices.costs === 'object' ? prices.costs : {}
  });
});

app.put('/api/admin/prices/iphone', requireAuth, function (req, res) {
  if (!req.body || !req.body.models || typeof req.body.models !== 'object') {
    return res.status(400).json({ error: 'Neplatná data ceníku.' });
  }
  var costs = req.body.costs && typeof req.body.costs === 'object' ? req.body.costs : {};
  writeJson('iphone-prices.json', {
    vatRate: Number(req.body.vatRate) || 21,
    pricesIncludeVat: req.body.pricesIncludeVat !== false,
    models: req.body.models,
    costs: costs
  });
  if (req.body.catalog && Array.isArray(req.body.catalog.sections)) {
    writeJson('iphone-repairs-catalog.json', req.body.catalog);
  }
  res.json({ ok: true });
});

// --- Repair content (detail pages) ---

app.get('/data/iphone-repair-content.json', function (req, res) {
  res.json(readJson('iphone-repair-content.json'));
});

app.get('/api/admin/repair-content', requireAuth, function (req, res) {
  res.json({
    catalog: readJson('iphone-repairs-catalog.json'),
    content: readJson('iphone-repair-content.json')
  });
});

app.put('/api/admin/repair-content', requireAuth, function (req, res) {
  if (!req.body || !req.body.content || typeof req.body.content !== 'object') {
    return res.status(400).json({ error: 'Neplatná data obsahu oprav.' });
  }
  writeJson('iphone-repair-content.json', req.body.content);
  if (req.body.catalog && Array.isArray(req.body.catalog.sections)) {
    writeJson('iphone-repairs-catalog.json', req.body.catalog);
  }
  res.json({ ok: true });
});

// --- Reservation slots ---

app.get('/api/slots', function (req, res) {
  var result = availableSlotsForItems([]);
  res.json({ slots: result.slots, earliestDate: result.earliestDate });
});

app.post('/api/slots/available', function (req, res) {
  var items = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];
  var result = availableSlotsForItems(items);
  res.json({
    slots: result.slots,
    earliestDate: result.earliestDate
  });
});

app.get('/api/admin/inventory', requireAuth, function (req, res) {
  var data = normalizeInventoryPayload(readJson('inventory.json'));
  res.json(data);
});

app.put('/api/admin/inventory', requireAuth, function (req, res) {
  var data = normalizeInventoryPayload(req.body || {});
  writeJson('inventory.json', data);
  res.json(data);
});

app.get('/api/admin/suppliers', requireAuth, function (req, res) {
  var data = readJson('suppliers.json');
  res.json({ suppliers: data.suppliers || [] });
});

app.post('/api/admin/suppliers', requireAuth, function (req, res) {
  var data = readJson('suppliers.json');
  if (!Array.isArray(data.suppliers)) data.suppliers = [];
  var body = req.body || {};
  var name = String(body.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'Zadejte název dodavatele.' });
  var item = {
    id: newId('sup'),
    name: name,
    phone: String(body.phone || '').trim().slice(0, 40),
    email: String(body.email || '').trim().slice(0, 200),
    website: String(body.website || '').trim().slice(0, 300),
    note: String(body.note || '').trim().slice(0, 1000),
    createdAt: new Date().toISOString()
  };
  data.suppliers.unshift(item);
  writeJson('suppliers.json', data);
  res.json(item);
});

app.put('/api/admin/suppliers/:id', requireAuth, function (req, res) {
  var data = readJson('suppliers.json');
  if (!Array.isArray(data.suppliers)) data.suppliers = [];
  var idx = data.suppliers.findIndex(function (s) { return s.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Dodavatel nenalezen.' });
  var body = req.body || {};
  var name = String(body.name != null ? body.name : data.suppliers[idx].name).trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'Zadejte název dodavatele.' });
  data.suppliers[idx] = Object.assign({}, data.suppliers[idx], {
    name: name,
    phone: String(body.phone != null ? body.phone : data.suppliers[idx].phone || '').trim().slice(0, 40),
    email: String(body.email != null ? body.email : data.suppliers[idx].email || '').trim().slice(0, 200),
    website: String(body.website != null ? body.website : data.suppliers[idx].website || '').trim().slice(0, 300),
    note: String(body.note != null ? body.note : data.suppliers[idx].note || '').trim().slice(0, 1000),
    updatedAt: new Date().toISOString()
  });
  writeJson('suppliers.json', data);
  res.json(data.suppliers[idx]);
});

app.delete('/api/admin/suppliers/:id', requireAuth, function (req, res) {
  var data = readJson('suppliers.json');
  data.suppliers = (data.suppliers || []).filter(function (s) { return s.id !== req.params.id; });
  writeJson('suppliers.json', data);
  res.json({ ok: true });
});

app.get('/api/delivery-fees', function (req, res) {
  res.json(readJson('delivery-fees.json'));
});

app.post('/api/delivery-quote', function (req, res) {
  var body = req.body || {};
  var quote = deliveryQuoteFromCoords(body.lat, body.lng);
  if (quote.error) {
    return res.status(400).json(quote);
  }
  res.json(quote);
});

app.get('/api/geocode', function (req, res) {
  var q = String(req.query.q || '').trim();
  if (q.length < 3) {
    return res.status(400).json({ error: 'Zadejte alespoň 3 znaky adresy.' });
  }
  var params = new URLSearchParams({
    q: q,
    format: 'json',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'cz'
  });
  nominatimFetch('/search?' + params.toString())
    .then(function (data) {
      res.json({
        results: (data || []).map(function (r) {
          return {
            lat: Number(r.lat),
            lng: Number(r.lon),
            label: r.display_name
          };
        })
      });
    })
    .catch(function () {
      res.status(502).json({ error: 'Vyhledání adresy se nezdařilo.' });
    });
});

app.get('/api/reverse-geocode', function (req, res) {
  var lat = Number(req.query.lat);
  var lng = Number(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) {
    return res.status(400).json({ error: 'Neplatné souřadnice.' });
  }
  var params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1'
  });
  nominatimFetch('/reverse?' + params.toString())
    .then(function (data) {
      res.json({
        lat: lat,
        lng: lng,
        label: (data && data.display_name) || (lat.toFixed(5) + ', ' + lng.toFixed(5))
      });
    })
    .catch(function () {
      res.status(502).json({ error: 'Adresu se nepodařilo načíst.' });
    });
});

app.get('/api/admin/slots', requireAuth, function (req, res) {
  res.json(readJson('slots.json'));
});

app.put('/api/admin/slots', requireAuth, function (req, res) {
  if (!req.body || !Array.isArray(req.body.slots)) {
    return res.status(400).json({ error: 'Neplatná data termínů.' });
  }
  writeJson('slots.json', { slots: req.body.slots });
  res.json({ ok: true });
});

app.post('/api/admin/slots', requireAuth, function (req, res) {
  var body = req.body || {};
  if (!body.date || !body.time) {
    return res.status(400).json({ error: 'Zadejte datum a čas.' });
  }
  var data = readJson('slots.json');
  var slot = {
    id: newId('slot'),
    date: String(body.date).slice(0, 10),
    time: String(body.time).slice(0, 5),
    booked: false
  };
  data.slots = data.slots || [];
  data.slots.push(slot);
  data.slots.sort(function (a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  });
  writeJson('slots.json', data);
  res.json(slot);
});

app.delete('/api/admin/slots/:id', requireAuth, function (req, res) {
  var data = readJson('slots.json');
  data.slots = (data.slots || []).filter(function (s) { return s.id !== req.params.id; });
  writeJson('slots.json', data);
  res.json({ ok: true });
});

// --- Orders ---

function itemCategory(modelId) {
  if (!modelId) return 'mobile';
  if (modelId === 'software') return 'software';
  if (modelId === 'pc') return 'pc';
  return 'mobile';
}

app.post('/api/orders', function (req, res) {
  var body = req.body || {};
  var items = Array.isArray(body.items) ? body.items : [];

  withDataLock(function () {
    if (!items.length) throw httpError(400, 'Košík je prázdný.');
    if (!body.customer || !body.phone || !body.email) {
      throw httpError(400, 'Vyplňte jméno, telefon a e-mail.');
    }

    var deliveryMethod = body.deliveryMethod;
    if (['pobocka', 'odvoz', 'na-miste', 'dovoz-instalace'].indexOf(deliveryMethod) === -1) {
      throw httpError(400, 'Vyberte způsob dopravy / předání.');
    }
    if (!body.slotId) throw httpError(400, 'Vyberte termín.');

    var priced = resolveOrderItems(items);
    if (priced.error) throw httpError(400, priced.error);
    var normalizedItems = priced.items;

    // Znovu načíst sloty uvnitř zámku — prevence dvojité rezervace
    var slotsData = readJson('slots.json');
    var slot = (slotsData.slots || []).find(function (s) { return s.id === body.slotId; });
    if (!slot || slot.booked) {
      throw httpError(400, 'Vybraný termín už není dostupný. Zvolte jiný.');
    }

    var earliest = earliestBookingDateForItems(normalizedItems);
    if (slot.date < earliest) {
      throw httpError(400, 'Tento termín už není dostupný. Zvolte pozdější datum.');
    }

    var paymentMethod = body.paymentMethod === 'qr' ? 'qr' : 'hotovost';
    var travelMethods = ['odvoz', 'dovoz-instalace', 'na-miste'];
    var needsFee = travelMethods.indexOf(deliveryMethod) !== -1;
    var deliveryFee = 0;
    var deliveryDistanceKm = null;
    var deliveryZoneLabel = '';
    var pickupLat = null;
    var pickupLng = null;

    if (needsFee) {
      var quote = deliveryQuoteFromCoords(body.pickupLat, body.pickupLng);
      if (quote.error) throw httpError(400, quote.error);
      deliveryFee = quote.fee;
      deliveryDistanceKm = quote.distanceKm;
      deliveryZoneLabel = quote.label;
      pickupLat = Number(body.pickupLat);
      pickupLng = Number(body.pickupLng);
      if (!body.address || !String(body.address).trim()) {
        throw httpError(400, 'Vyberte adresu na mapě.');
      }
    }

    var itemsTotal = normalizedItems.reduce(function (sum, item) {
      return sum + item.price;
    }, 0);
    var total = itemsTotal + deliveryFee;
    var deviceNames = normalizedItems.map(function (i) { return i.modelName; }).filter(function (v, idx, arr) {
      return v && arr.indexOf(v) === idx;
    });
    var repairList = normalizedItems.map(function (i) {
      return i.repairTitle + (i.modelName ? ' (' + i.modelName + ')' : '');
    }).join('; ');
    var now = new Date().toISOString();

    var deliveryLabels = {
      pobocka: 'Osobní předání na pobočce',
      odvoz: 'Odvoz z adresy',
      'dovoz-instalace': 'Dovoz a instalace',
      'na-miste': 'Práce na místě'
    };

    var noteParts = [];
    if (body.note) noteParts.push(String(body.note).slice(0, 2000));
    if (body.address) noteParts.push('Adresa: ' + String(body.address).slice(0, 500));
    noteParts.push('Doprava: ' + (deliveryLabels[deliveryMethod] || deliveryMethod));
    if (deliveryDistanceKm != null) {
      noteParts.push('Vzdálenost: ' + deliveryZoneLabel + ' (' + deliveryFee + ' Kč)');
    }
    noteParts.push('Termín: ' + slot.date + ' ' + slot.time);
    noteParts.push('Platba: ' + (paymentMethod === 'qr' ? 'QR kód na místě' : 'hotově na místě'));

    var orderId = newId('ord');
    var item = {
      id: orderId,
      customer: String(body.customer).trim().slice(0, 200),
      phone: String(body.phone).trim().slice(0, 40),
      email: String(body.email).trim().slice(0, 200),
      device: deviceNames.length === 1
        ? deviceNames[0]
        : (deviceNames[0] || 'Zařízení') + (deviceNames.length > 1 ? ' +' + (deviceNames.length - 1) + ' další' : ''),
      repair: repairList,
      items: normalizedItems,
      status: 'prijato',
      price: total,
      itemsTotal: itemsTotal,
      deliveryFee: deliveryFee,
      deliveryDistanceKm: deliveryDistanceKm,
      deliveryZoneLabel: deliveryZoneLabel,
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      paid: 0,
      paymentMethod: paymentMethod,
      deliveryMethod: deliveryMethod,
      address: body.address ? String(body.address).trim().slice(0, 500) : '',
      slotId: slot.id,
      slotDate: slot.date,
      slotTime: slot.time,
      preferredAt: slot.date + 'T' + slot.time,
      note: noteParts.join('\n'),
      source: 'web',
      photos: emptyOrderPhotos(),
      documents: orderDocs.emptyOrderDocuments(),
      usedParts: [],
      createdAt: now,
      updatedAt: now
    };

    slot.booked = true;
    slot.orderId = orderId;
    writeJson('slots.json', slotsData);

    var data = readJson('orders.json');
    data.orders = data.orders || [];
    data.orders.unshift(item);
    writeJson('orders.json', data);

    decrementInventoryForItems(normalizedItems);

    return {
      ok: true,
      id: item.id,
      price: item.price,
      paymentMethod: item.paymentMethod,
      deliveryMethod: item.deliveryMethod,
      deliveryFee: item.deliveryFee,
      deliveryZoneLabel: item.deliveryZoneLabel,
      slotDate: item.slotDate,
      slotTime: item.slotTime
    };
  })
    .then(function (payload) {
      res.json(payload);
    })
    .catch(function (err) {
      var status = err && err.status ? err.status : 500;
      res.status(status).json({
        error: status === 500
          ? 'Rezervaci se nepodařilo uložit.'
          : (err.message || 'Chyba')
      });
    });
});

app.get('/api/admin/orders', requireAuth, function (req, res) {
  res.json(readJson('orders.json'));
});

app.post('/api/admin/orders', requireAuth, function (req, res) {
  var data = readJson('orders.json');
  var order = req.body || {};
  var now = new Date().toISOString();
  var item = {
    id: newId('ord'),
    customer: order.customer || '',
    phone: order.phone || '',
    email: order.email || '',
    device: order.device || '',
    repair: order.repair || '',
    status: order.status || 'prijato',
    price: Number(order.price) || 0,
    paid: Number(order.paid) || 0,
    paymentMethod: order.paymentMethod === 'qr' ? 'qr' : 'hotovost',
    note: order.note || '',
    photos: emptyOrderPhotos(),
    documents: orderDocs.emptyOrderDocuments(),
    usedParts: [],
    createdAt: now,
    updatedAt: now
  };
  data.orders.unshift(item);
  writeJson('orders.json', data);
  res.json(item);
});

app.put('/api/admin/orders/:id', requireAuth, function (req, res) {
  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });
  var existing = data.orders[idx];
  var patch = Object.assign({}, req.body || {});
  delete patch.photos;
  delete patch.documents;
  delete patch.diagnosis;
  delete patch.usedParts;
  delete patch.id;
  delete patch.createdAt;
  delete patch.completedAt;
  var now = new Date().toISOString();
  var nextStatus = patch.status != null ? patch.status : existing.status;
  var completedAt = existing.completedAt || null;
  if ((nextStatus === 'hotovo' || nextStatus === 'vyzvednuto') && !completedAt) {
    completedAt = now;
  }
  if (nextStatus !== 'hotovo' && nextStatus !== 'vyzvednuto') {
    /* keep completedAt if already set historically */
  }
  data.orders[idx] = Object.assign({}, existing, patch, {
    id: existing.id,
    createdAt: existing.createdAt,
    photos: normalizeOrderPhotos(existing.photos),
    documents: orderDocs.normalizeOrderDocuments(existing.documents),
    diagnosis: existing.diagnosis || null,
    usedParts: Array.isArray(existing.usedParts) ? existing.usedParts : [],
    completedAt: completedAt,
    updatedAt: now
  });
  writeJson('orders.json', data);
  res.json(data.orders[idx]);
});

app.post('/api/admin/orders/:id/parts', requireAuth, function (req, res) {
  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var body = req.body || {};
  var modelId = String(body.modelId || '').trim();
  var repairId = String(body.repairId || '').trim();
  var qty = Math.max(1, Math.floor(Number(body.qty) || 1));
  if (qty > 20) qty = 20;
  if (!modelId || !repairId) {
    return res.status(400).json({ error: 'Vyberte model a díl.' });
  }
  if (!repairNeedsInventory(modelId)) {
    return res.status(400).json({ error: 'Vazba dílu je jen pro iPhone opravy.' });
  }

  var catalogItem = findCatalogRepair(repairId);
  if (!catalogItem) return res.status(400).json({ error: 'Neznámý díl / oprava.' });

  var inventory = readJson('inventory.json');
  var stockBefore = getStockQty(inventory, modelId, repairId);
  var decrement = body.decrementStock !== false;
  if (decrement && stockBefore < qty) {
    return res.status(400).json({
      error: 'Na skladě je jen ' + stockBefore + ' ks. Upravte množství nebo vypněte odečet skladu.'
    });
  }

  var suppliersData = readJson('suppliers.json');
  var supplierId = String(body.supplierId || '').trim();
  if (!supplierId) {
    supplierId = ((inventory.partSuppliers || {})[modelId] || {})[repairId] || '';
  }
  var supplier = supplierId ? findSupplier(suppliersData, supplierId) : null;
  var cost = body.cost != null && body.cost !== ''
    ? Math.max(0, Number(body.cost) || 0)
    : getPartCost(modelId, repairId);
  var now = new Date().toISOString();

  var part = {
    id: newId('part'),
    modelId: modelId,
    repairId: repairId,
    title: catalogItem.title,
    qty: qty,
    cost: cost,
    supplierId: supplier ? supplier.id : '',
    supplierName: supplier ? supplier.name : '',
    serial: String(body.serial || '').trim().slice(0, 120),
    note: String(body.note || '').trim().slice(0, 500),
    decrementedStock: !!decrement,
    usedAt: now
  };

  if (decrement) {
    adjustStock(modelId, repairId, -qty);
  }

  var order = data.orders[idx];
  if (!Array.isArray(order.usedParts)) order.usedParts = [];
  order.usedParts.unshift(part);
  order.updatedAt = now;
  data.orders[idx] = order;
  writeJson('orders.json', data);

  res.json({
    ok: true,
    part: part,
    order: order,
    stockQty: getStockQty(readJson('inventory.json'), modelId, repairId)
  });
});

app.delete('/api/admin/orders/:id/parts/:partId', requireAuth, function (req, res) {
  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var order = data.orders[idx];
  var parts = Array.isArray(order.usedParts) ? order.usedParts : [];
  var part = parts.find(function (p) { return p.id === req.params.partId; });
  if (!part) return res.status(404).json({ error: 'Díl u zakázky nenalezen.' });

  if (part.decrementedStock && part.modelId && part.repairId) {
    adjustStock(part.modelId, part.repairId, Number(part.qty) || 1);
  }

  order.usedParts = parts.filter(function (p) { return p.id !== req.params.partId; });
  order.updatedAt = new Date().toISOString();
  data.orders[idx] = order;
  writeJson('orders.json', data);

  res.json({ ok: true, order: order });
});

app.delete('/api/admin/orders/:id', requireAuth, function (req, res) {
  var data = readJson('orders.json');
  data.orders = data.orders.filter(function (o) { return o.id !== req.params.id; });
  writeJson('orders.json', data);
  removeOrderUploads(req.params.id);
  res.json({ ok: true });
});

app.post(
  '/api/admin/orders/:id/photos/:kind',
  requireAuth,
  function (req, res, next) {
    if (!isPhotoKind(req.params.kind)) {
      return res.status(400).json({ error: 'Neplatný typ fotky (intake / done).' });
    }
    if (!sanitizeOrderId(req.params.id)) {
      return res.status(400).json({ error: 'Neplatné ID zakázky.' });
    }
    next();
  },
  function (req, res) {
    orderPhotoUpload.array('photos', 8)(req, res, function (err) {
      if (err) {
        return res.status(400).json({ error: err.message || 'Nahrání fotek selhalo.' });
      }
      var files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: 'Nebyla vybrána žádná fotka.' });
      }

      var data = readJson('orders.json');
      var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
      if (idx === -1) {
        files.forEach(function (f) {
          try { fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
        });
        return res.status(404).json({ error: 'Zakázka nenalezena.' });
      }

      var order = data.orders[idx];
      var photos = normalizeOrderPhotos(order.photos);
      var kind = req.params.kind;
      var now = new Date().toISOString();
      var added = files.map(function (f) {
        return {
          id: newId('ph'),
          file: path.basename(f.filename),
          originalName: f.originalname || '',
          mime: f.mimetype || '',
          size: f.size || 0,
          createdAt: now
        };
      });
      photos[kind] = photos[kind].concat(added);
      order.photos = photos;
      order.updatedAt = now;
      data.orders[idx] = order;
      writeJson('orders.json', data);
      res.json({ ok: true, photos: photos, added: added });
    });
  }
);

app.get('/api/admin/orders/:id/photos/:kind/:file', requireAuth, function (req, res) {
  if (!isPhotoKind(req.params.kind)) {
    return res.status(400).json({ error: 'Neplatný typ fotky.' });
  }
  var safeId = sanitizeOrderId(req.params.id);
  var safeFile = path.basename(String(req.params.file || ''));
  if (!safeId || !safeFile || safeFile !== req.params.file) {
    return res.status(400).json({ error: 'Neplatný soubor.' });
  }
  var data = readJson('orders.json');
  var order = (data.orders || []).find(function (o) { return o.id === req.params.id; });
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena.' });
  var photos = normalizeOrderPhotos(order.photos);
  var meta = (photos[req.params.kind] || []).find(function (p) { return p.file === safeFile; });
  if (!meta) return res.status(404).json({ error: 'Fotka nenalezena.' });

  var filePath = path.join(orderPhotoDir(req.params.id, req.params.kind), safeFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Soubor chybí.' });
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

app.delete('/api/admin/orders/:id/photos/:kind/:photoId', requireAuth, function (req, res) {
  if (!isPhotoKind(req.params.kind)) {
    return res.status(400).json({ error: 'Neplatný typ fotky.' });
  }
  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var order = data.orders[idx];
  var photos = normalizeOrderPhotos(order.photos);
  var kind = req.params.kind;
  var photo = (photos[kind] || []).find(function (p) { return p.id === req.params.photoId; });
  if (!photo) return res.status(404).json({ error: 'Fotka nenalezena.' });

  photos[kind] = photos[kind].filter(function (p) { return p.id !== req.params.photoId; });
  order.photos = photos;
  order.updatedAt = new Date().toISOString();
  data.orders[idx] = order;
  writeJson('orders.json', data);

  var filePath = path.join(orderPhotoDir(req.params.id, kind), path.basename(photo.file || ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) { /* ignore */ }

  res.json({ ok: true, photos: photos });
});

// --- Order documents (PDF + podpis + e-mail) ---

app.get('/api/admin/mail-status', requireAuth, function (req, res) {
  res.json({ configured: orderDocs.mailConfigured() });
});

app.post('/api/admin/orders/:id/documents/:kind/sign', requireAuth, function (req, res) {
  var kind = req.params.kind;
  if (!orderDocs.isDocKind(kind)) {
    return res.status(400).json({ error: 'Neplatný typ dokladu (intake / done).' });
  }

  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var order = data.orders[idx];
  var signatureBuf = orderDocs.parseDataUrl(req.body && req.body.signatureDataUrl);
  if (!signatureBuf) {
    return res.status(400).json({ error: 'Chybí podpis (nakreslete podpis na obrazovku).' });
  }

  var signerName = String((req.body && req.body.signerName) || order.customer || '').trim().slice(0, 120);
  var signedAt = new Date().toISOString();

  orderDocs.buildOrderDocumentPdf(order, kind, {
    signatureBuffer: signatureBuf,
    signerName: signerName,
    signedAt: signedAt
  }).then(function (pdfBuffer) {
    var dir = orderDocsDir(order.id);
    fs.mkdirSync(dir, { recursive: true });
    var fileName = kind + '.pdf';
    var filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    var documents = orderDocs.normalizeOrderDocuments(order.documents);
    documents[kind] = {
      file: fileName,
      signedAt: signedAt,
      signerName: signerName,
      emailedAt: documents[kind] && documents[kind].emailedAt ? documents[kind].emailedAt : null
    };
    order.documents = documents;
    order.updatedAt = signedAt;
    if (kind === 'intake' && (!order.status || order.status === 'prijato')) {
      /* leave status as-is */
    }
    if (kind === 'done' && order.status !== 'vyzvednuto' && order.status !== 'storno') {
      order.status = order.status === 'hotovo' ? 'hotovo' : order.status;
    }
    data.orders[idx] = order;
    writeJson('orders.json', data);

    res.json({
      ok: true,
      documents: documents,
      document: documents[kind],
      mailConfigured: orderDocs.mailConfigured()
    });
  }).catch(function (err) {
    console.error('PDF sign error:', err);
    res.status(500).json({ error: 'PDF se nepodařilo vytvořit.' });
  });
});

app.get('/api/admin/orders/:id/documents/:kind/pdf', requireAuth, function (req, res) {
  var kind = req.params.kind;
  if (!orderDocs.isDocKind(kind)) {
    return res.status(400).json({ error: 'Neplatný typ dokladu.' });
  }
  var data = readJson('orders.json');
  var order = (data.orders || []).find(function (o) { return o.id === req.params.id; });
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var documents = orderDocs.normalizeOrderDocuments(order.documents);
  if (!documents[kind] || !documents[kind].file) {
    return res.status(404).json({ error: 'Doklad ještě není podepsaný.' });
  }

  var filePath = orderDocPath(order.id, kind);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Soubor PDF chybí.' });
  }

  var downloadName = (kind === 'intake' ? 'prevzeti' : 'doklad-opravy') + '-' + order.id + '.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + downloadName + '"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
});

app.post('/api/admin/orders/:id/documents/:kind/email', requireAuth, function (req, res) {
  var kind = req.params.kind;
  if (!orderDocs.isDocKind(kind)) {
    return res.status(400).json({ error: 'Neplatný typ dokladu.' });
  }

  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var order = data.orders[idx];
  var documents = orderDocs.normalizeOrderDocuments(order.documents);
  if (!documents[kind] || !documents[kind].file) {
    return res.status(400).json({ error: 'Nejdřív nechte doklad podepsat a uložit PDF.' });
  }

  var filePath = orderDocPath(order.id, kind);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Soubor PDF chybí.' });
  }

  var pdfBuffer = fs.readFileSync(filePath);
  orderDocs.sendDocumentEmail(order, kind, pdfBuffer)
    .then(function (result) {
      documents[kind].emailedAt = new Date().toISOString();
      order.documents = documents;
      order.updatedAt = documents[kind].emailedAt;
      data.orders[idx] = order;
      writeJson('orders.json', data);
      res.json({
        ok: true,
        to: result.to,
        documents: documents,
        document: documents[kind]
      });
    })
    .catch(function (err) {
      var status = err && err.status ? err.status : 500;
      res.status(status).json({ error: err.message || 'Odeslání e-mailu selhalo.' });
    });
});

// --- Accounting ---

app.get('/api/admin/accounting', requireAuth, function (req, res) {
  res.json(readJson('accounting.json'));
});

app.post('/api/admin/accounting', requireAuth, function (req, res) {
  var data = readJson('accounting.json');
  var entry = req.body || {};
  var item = {
    id: newId('acc'),
    type: entry.type === 'expense' ? 'expense' : 'income',
    amount: Number(entry.amount) || 0,
    category: entry.category || 'Ostatní',
    description: entry.description || '',
    date: entry.date || new Date().toISOString().slice(0, 10),
    orderId: entry.orderId || '',
    createdAt: new Date().toISOString()
  };
  data.entries.unshift(item);
  writeJson('accounting.json', data);
  res.json(item);
});

app.delete('/api/admin/accounting/:id', requireAuth, function (req, res) {
  var data = readJson('accounting.json');
  data.entries = data.entries.filter(function (e) { return e.id !== req.params.id; });
  writeJson('accounting.json', data);
  res.json({ ok: true });
});

function csvEscape(value) {
  var s = String(value == null ? '' : value);
  if (/[;"\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows) {
  return '\uFEFF' + rows.map(function (row) {
    return row.map(csvEscape).join(';');
  }).join('\r\n') + '\r\n';
}

function monthPrefixFromQuery(req) {
  var m = String((req.query && req.query.month) || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  return new Date().toISOString().slice(0, 7);
}

function orderMonthKey(order) {
  var raw = order && (order.createdAt || order.updatedAt || '');
  return String(raw).slice(0, 7);
}

function buildAccountingCsvRows(entries) {
  var rows = [['Datum', 'Typ', 'Kategorie', 'Popis', 'Castka_Kc', 'ID_zakazky', 'ID_zaznamu']];
  (entries || []).forEach(function (e) {
    rows.push([
      e.date || '',
      e.type === 'expense' ? 'Vydaj' : 'Prijem',
      e.category || '',
      e.description || '',
      Number(e.amount) || 0,
      e.orderId || '',
      e.id || ''
    ]);
  });
  return rows;
}

function buildOrdersCsvRows(orders) {
  var rows = [[
    'Datum_vytvoreni', 'ID', 'Zakaznik', 'Telefon', 'Email', 'Zarizeni', 'Oprava',
    'Cena_Kc', 'Zaplaceno_Kc', 'Platba', 'Stav', 'Dodani', 'Termin'
  ]];
  (orders || []).forEach(function (o) {
    rows.push([
      (o.createdAt || '').slice(0, 10),
      o.id || '',
      o.customer || '',
      o.phone || '',
      o.email || '',
      o.device || '',
      o.repair || '',
      Number(o.price) || 0,
      Number(o.paid) || 0,
      o.paymentMethod || '',
      o.status || '',
      o.deliveryMethod || '',
      ((o.slotDate || '') + ' ' + (o.slotTime || '')).trim()
    ]);
  });
  return rows;
}

app.get('/api/admin/export/accounting.csv', requireAuth, function (req, res) {
  var month = monthPrefixFromQuery(req);
  var all = req.query.all === '1';
  var entries = (readJson('accounting.json').entries || []).filter(function (e) {
    return all || String(e.date || '').slice(0, 7) === month;
  });
  var csv = toCsv(buildAccountingCsvRows(entries));
  var name = all ? 'ucetni-zaznamy-vse.csv' : ('ucetni-zaznamy-' + month + '.csv');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
  res.send(csv);
});

app.get('/api/admin/export/orders.csv', requireAuth, function (req, res) {
  var month = monthPrefixFromQuery(req);
  var all = req.query.all === '1';
  var orders = (readJson('orders.json').orders || []).filter(function (o) {
    return all || orderMonthKey(o) === month;
  });
  var csv = toCsv(buildOrdersCsvRows(orders));
  var name = all ? 'zakazky-vse.csv' : ('zakazky-' + month + '.csv');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
  res.send(csv);
});

app.get('/api/admin/export/monthly.csv', requireAuth, function (req, res) {
  var month = monthPrefixFromQuery(req);
  var entries = (readJson('accounting.json').entries || []).filter(function (e) {
    return String(e.date || '').slice(0, 7) === month;
  });
  var orders = (readJson('orders.json').orders || []).filter(function (o) {
    return orderMonthKey(o) === month;
  });

  var income = 0;
  var expense = 0;
  var byCat = {};
  entries.forEach(function (e) {
    var amount = Number(e.amount) || 0;
    if (e.type === 'expense') expense += amount;
    else income += amount;
    var key = (e.type === 'expense' ? 'Vydaj' : 'Prijem') + ' / ' + (e.category || 'Ostatni');
    byCat[key] = (byCat[key] || 0) + amount;
  });

  var orderPrice = 0;
  var orderPaid = 0;
  orders.forEach(function (o) {
    orderPrice += Number(o.price) || 0;
    orderPaid += Number(o.paid) || 0;
  });

  var rows = [
    ['Sekce', 'Polozka', 'Hodnota'],
    ['Souhrn', 'Mesic', month],
    ['Souhrn', 'Prijmy_zaznamy_Kc', income],
    ['Souhrn', 'Vydaje_zaznamy_Kc', expense],
    ['Souhrn', 'Bilance_zaznamy_Kc', income - expense],
    ['Souhrn', 'Zakazky_pocet', orders.length],
    ['Souhrn', 'Zakazky_cena_Kc', orderPrice],
    ['Souhrn', 'Zakazky_zaplaceno_Kc', orderPaid],
    ['']
  ];

  Object.keys(byCat).sort().forEach(function (k) {
    rows.push(['Kategorie', k, byCat[k]]);
  });
  rows.push(['']);
  rows.push(['--- Ucetni zaznamy ---']);
  rows = rows.concat(buildAccountingCsvRows(entries));
  rows.push(['']);
  rows.push(['--- Zakazky ---']);
  rows = rows.concat(buildOrdersCsvRows(orders));

  var csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mesicni-prehled-' + month + '.csv"');
  res.send(csv);
});

// --- Checklist ---

app.get('/api/admin/checklist', requireAuth, function (req, res) {
  res.json(readJson('checklist.json'));
});

app.put('/api/admin/checklist', requireAuth, function (req, res) {
  if (!req.body || !Array.isArray(req.body.categories)) {
    return res.status(400).json({ error: 'Neplatná data checklistu.' });
  }
  writeJson('checklist.json', req.body);
  res.json({ ok: true });
});

app.get('/api/admin/diagnostics', requireAuth, function (req, res) {
  res.json(readJson('diagnostics.json'));
});

app.put('/api/admin/diagnostics', requireAuth, function (req, res) {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Neplatná data diagnostiky.' });
  }
  writeJson('diagnostics.json', req.body);
  res.json(req.body);
});

app.post('/api/admin/orders/:id/diagnosis/message', requireAuth, function (req, res) {
  var data = readJson('orders.json');
  var idx = data.orders.findIndex(function (o) { return o.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Zakázka nenalezena.' });

  var order = data.orders[idx];
  var body = req.body || {};
  var message = String(body.message || '').trim().slice(0, 20000);
  var findings = String(body.findings || '').trim().slice(0, 4000);
  var category = body.category === 'pc' ? 'pc' : 'mobile';
  var outcome = body.outcome || 'pending';
  var allowedOutcomes = ['pending', 'repair', 'declined', 'informed'];
  if (allowedOutcomes.indexOf(outcome) === -1) outcome = 'pending';

  if (!message) {
    return res.status(400).json({ error: 'Zpráva pro zákazníka je prázdná.' });
  }

  var sendEmail = !!body.sendEmail;
  var now = new Date().toISOString();

  function saveDiagnosis(extra) {
    order.diagnosis = Object.assign({}, order.diagnosis || {}, {
      category: category,
      findings: findings,
      message: message,
      outcome: outcome,
      updatedAt: now
    }, extra || {});
    if (body.setStatus === true) {
      order.status = 'diagnostika';
    }
    order.updatedAt = now;
    data.orders[idx] = order;
    writeJson('orders.json', data);
  }

  if (!sendEmail) {
    saveDiagnosis({});
    return res.json({ ok: true, order: order, mailed: false });
  }

  orderDocs.sendPlainEmail({
    to: order.email,
    subject: 'Diagnostika — IT Servis Třebíč (' + order.id + ')',
    text: message
  }).then(function (result) {
    saveDiagnosis({ emailedAt: now, emailedTo: result.to });
    res.json({ ok: true, order: order, mailed: true, to: result.to });
  }).catch(function (err) {
    var status = err && err.status ? err.status : 500;
    res.status(status).json({ error: err.message || 'Odeslání e-mailu selhalo.' });
  });
});

// --- Protected admin pages (before static files) ---

function noCache(_req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
}

app.get(['/admin', '/admin/', '/admin/index.html'], noCache, function (req, res) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/admin/login.html');
  }
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});

app.get('/admin/login.html', noCache, function (req, res) {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/');
  }
  res.sendFile(path.join(ROOT, 'admin', 'login.html'));
});

// --- Static files (veřejné HTML/CSS/JS/obrázky) ---

/** Blokuje přímý přístup k /data/*.json kromě explicitních veřejných rout výše. */
app.use('/data', function (req, res) {
  res.status(404).json({ error: 'Not found' });
});

/** Blokuje citlivé / interní soubory v kořeni projektu. */
app.use(function (req, res, next) {
  var p = String(req.path || '').toLowerCase();
  var blocked =
    p === '/server.js' ||
    p === '/package.json' ||
    p === '/package-lock.json' ||
    p === '/.env' ||
    p === '/.env.example' ||
    p === '/.gitignore' ||
    p.indexOf('/node_modules/') === 0 ||
    p.indexOf('/scripts/') === 0 ||
    p.indexOf('/lib/') === 0 ||
    p.indexOf('/.git/') === 0 ||
    p.indexOf('/canvases/') === 0 ||
    p.indexOf('/data/sessions') === 0;
  if (blocked) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(ROOT, {
  dotfiles: 'deny',
  index: ['index.html']
}));

app.listen(PORT, function () {
  console.log('IT Servis Třebíč běží na http://localhost:' + PORT);
  console.log('Admin sekce: http://localhost:' + PORT + '/admin/');
});
