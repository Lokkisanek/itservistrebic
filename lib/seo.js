'use strict';

var fs = require('fs');
var path = require('path');

var SEO_MARKER = '<!-- its-seo -->';
var DEFAULT_OG_IMAGE = '/images/photos/main-page-photo.jpg';

var BUSINESS = {
  name: 'IT Servis Třebíč',
  legalName: 'Matyáš Odehnal',
  ico: '29800480',
  phone: '+420736238787',
  phoneDisplay: '+420 736 238 787',
  email: 'matyod@seznam.cz',
  street: 'Novodvorská 1077/15',
  locality: 'Třebíč',
  neighborhood: 'Nové Dvory',
  region: 'Vysočina',
  postalCode: '674 01',
  country: 'CZ',
  lat: 49.2178325,
  lng: 15.8984422,
  hours: 'Po–Pá 09:00–17:00',
  priceRange: '$$'
};

var STATIC_PAGES = {
  '/index.html': {
    title: 'IT Servis Třebíč | Opravy iPhonů, PC a notebooků',
    description:
      'Servis iPhonů, počítačů a notebooků v Třebíči a okolí. Rychlá diagnostika, férový ceník, opravy na počkání. Novodvorská 1077/15, Nové Dvory.',
    path: '/',
    type: 'website',
    robots: 'index,follow',
    priority: 1.0,
    changefreq: 'weekly',
    schemas: ['localBusiness', 'website', 'faq']
  },
  '/kontakt.html': {
    title: 'Kontakt | IT Servis Třebíč',
    description:
      'Kontaktujte IT Servis Třebíč — telefon +420 736 238 787, e-mail matyod@seznam.cz. Novodvorská 1077/15, Nové Dvory, 674 01 Třebíč. Po–Pá 9–17.',
    path: '/kontakt.html',
    type: 'website',
    robots: 'index,follow',
    priority: 0.8,
    changefreq: 'monthly',
    schemas: ['localBusiness', 'breadcrumb'],
    breadcrumbs: [
      { name: 'Domů', path: '/' },
      { name: 'Kontakt', path: '/kontakt.html' }
    ]
  },
  '/sluzby.html': {
    title: 'IT služby pro domácnosti | IT Servis Třebíč',
    description:
      'Kompletní IT služby v Třebíči — opravy PC a notebooků, domácí sítě, zabezpečení, instalace softwaru, zálohování a obnova dat.',
    path: '/sluzby.html',
    type: 'website',
    robots: 'index,follow',
    priority: 0.85,
    changefreq: 'monthly',
    schemas: ['services', 'breadcrumb'],
    breadcrumbs: [
      { name: 'Domů', path: '/' },
      { name: 'Služby', path: '/sluzby.html' }
    ]
  },
  '/iphone.html': {
    title: 'Opravy iPhonů v Třebíči | Ceník servisu',
    description:
      'Profesionální servis iPhonů v Třebíči — výměna displeje, baterie, nabíjecího konektoru, kamer a další opravy. Transparentní ceník včetně DPH.',
    path: '/iphone.html',
    type: 'website',
    robots: 'index,follow',
    priority: 0.9,
    changefreq: 'weekly',
    schemas: ['breadcrumb'],
    breadcrumbs: [
      { name: 'Domů', path: '/' },
      { name: 'iPhone', path: '/iphone.html' }
    ]
  },
  '/oprava.html': {
    title: 'Detail opravy iPhone | IT Servis Třebíč',
    description:
      'Detail opravy iPhonu v Třebíči — popis servisu, varianty kvality dílů, cena včetně DPH a online rezervace termínu.',
    path: '/oprava.html',
    type: 'product',
    robots: 'index,follow',
    priority: 0.6,
    changefreq: 'weekly',
    schemas: ['breadcrumb']
  },
  '/pokladna.html': {
    title: 'Rezervace servisu | IT Servis Třebíč',
    description: 'Rezervace termínu servisu — výběr dopravy, termínu a kontaktních údajů. Platba hotově nebo QR kód na místě.',
    path: '/pokladna.html',
    type: 'website',
    robots: 'noindex,follow',
    priority: 0.2,
    changefreq: 'monthly',
    schemas: []
  },
  '/obchodni-podminky.html': {
    title: 'Obchodní podmínky | IT Servis Třebíč',
    description: 'Obchodní podmínky servisu IT Servis Třebíč — Matyáš Odehnal, IČO 29800480.',
    path: '/obchodni-podminky.html',
    type: 'website',
    robots: 'index,follow',
    priority: 0.3,
    changefreq: 'yearly',
    schemas: ['breadcrumb'],
    breadcrumbs: [
      { name: 'Domů', path: '/' },
      { name: 'Obchodní podmínky', path: '/obchodni-podminky.html' }
    ]
  },
  '/ochrana-udaju.html': {
    title: 'Ochrana osobních údajů | IT Servis Třebíč',
    description: 'Informace o zpracování osobních údajů — Matyáš Odehnal, IČO 29800480, IT Servis Třebíč.',
    path: '/ochrana-udaju.html',
    type: 'website',
    robots: 'index,follow',
    priority: 0.3,
    changefreq: 'yearly',
    schemas: ['breadcrumb'],
    breadcrumbs: [
      { name: 'Domů', path: '/' },
      { name: 'Ochrana údajů', path: '/ochrana-udaju.html' }
    ]
  }
};

var FAQ_ITEMS = [
  {
    question: 'Jak dlouho obvykle trvá oprava?',
    answer:
      'U běžných závad nabízíme opravy na počkání. U iPhonů je průměrná doba uvedena u každé opravy v ceníku (často do 1–2 hodin). U složitějších oprav nebo při čekání na díl vás informujeme o termínu.'
  },
  {
    question: 'Provádíte opravy i u zákazníka?',
    answer:
      'Ano, po domluvě nabízíme výjezd v Třebíči a okolí. Softwarové problémy často vyřešíme i na dálku.'
  },
  {
    question: 'Jak to je se zárukou na opravu?',
    answer:
      'Na provedený servisní úkon poskytujeme záruku 12 měsíců. Na díly platí záruka podle typu použitého dílu.'
  },
  {
    question: 'Jak probíhá platba?',
    answer:
      'Platíte vždy až na místě při vyzvednutí nebo po opravě — hotově, nebo naskenováním QR kódu. Online platba při objednávce není potřeba.'
  },
  {
    question: 'Kde vás najdu a jak se objednat?',
    answer:
      'Servis provozuje Matyáš Odehnal (IČO 29800480) na adrese Novodvorská 1077/15, Nové Dvory, 674 01 Třebíč. Objednat se můžete přes ceník na webu, telefonicky na +420 736 238 787 (po–pá 09–17) nebo e-mailem na matyod@seznam.cz.'
  }
];

var SERVICE_ITEMS = [
  {
    name: 'Diagnostika a oprava PC / notebooku',
    description: 'Diagnostika závad, opravy hardwaru, čištění, výměna komponent.'
  },
  {
    name: 'Upgrade a optimalizace',
    description: 'Výměna SSD/HDD, rozšíření RAM, sestavení PC na míru.'
  },
  {
    name: 'Domácí sítě',
    description: 'Nastavení Wi-Fi, routerů, mesh sítí a síťové konektivity.'
  },
  {
    name: 'Zabezpečení a monitoring',
    description: 'Antivirová ochrana, firewall, bezpečnostní audit domácí sítě.'
  },
  {
    name: 'Instalace a konfigurace softwaru',
    description: 'Instalace Windows, ovladačů, kancelářských aplikací a e-mailu.'
  },
  {
    name: 'Zálohování a obnova dat',
    description: 'Nastavení záloh, obnova dat, migrace na nové zařízení.'
  }
];

var iphoneModelsCache = null;
var catalogCache = null;
var contentCache = null;
var pricesCache = null;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function getSiteUrl(req) {
  var configured = String(process.env.SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  var proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return proto + '://' + req.get('host');
}

function absoluteUrl(siteUrl, pathname) {
  var base = String(siteUrl || '').replace(/\/$/, '');
  if (!pathname || pathname === '/') return base + '/';
  if (pathname.charAt(0) !== '/') pathname = '/' + pathname;
  return base + pathname;
}

function readJson(root, fileName) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data', fileName), 'utf8'));
}

function loadIphoneModels(root) {
  if (iphoneModelsCache) return iphoneModelsCache;
  var raw = fs.readFileSync(path.join(root, 'js', 'devices-data.js'), 'utf8');
  var models = [];
  var re = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'/g;
  var match;
  while ((match = re.exec(raw))) {
    models.push({ id: match[1], name: match[2] });
  }
  iphoneModelsCache = models;
  return models;
}

function getCatalog(root) {
  if (!catalogCache) catalogCache = readJson(root, 'iphone-repairs-catalog.json');
  return catalogCache;
}

function getRepairContent(root) {
  if (!contentCache) contentCache = readJson(root, 'iphone-repair-content.json');
  return contentCache;
}

function getPrices(root) {
  if (!pricesCache) pricesCache = readJson(root, 'iphone-prices.json');
  return pricesCache;
}

function findCatalogItem(root, repairId) {
  var catalog = getCatalog(root);
  var found = null;
  (catalog.sections || []).forEach(function (section) {
    (section.items || []).forEach(function (item) {
      if (item.id === repairId) found = item;
    });
  });
  return found;
}

function findModel(root, modelId) {
  return loadIphoneModels(root).find(function (m) { return m.id === modelId; }) || null;
}

function getRepairPrice(root, modelId, repairId) {
  var prices = getPrices(root);
  var modelPrices = prices.models && prices.models[modelId];
  if (!modelPrices || modelPrices[repairId] == null) return null;
  var raw = modelPrices[repairId];
  var amount = (raw && typeof raw === 'object')
    ? Number(raw.sell != null ? raw.sell : raw.price)
    : Number(raw);
  return isFinite(amount) && amount > 0 ? amount : null;
}

function listRepairUrls(root) {
  var prices = getPrices(root);
  var models = loadIphoneModels(root);
  var urls = [];

  models.forEach(function (model) {
    var modelPrices = prices.models && prices.models[model.id];
    if (!modelPrices) return;

    urls.push({
      path: '/iphone.html?model=' + encodeURIComponent(model.id),
      priority: 0.75,
      changefreq: 'weekly'
    });

    Object.keys(modelPrices).forEach(function (repairId) {
      if (getRepairPrice(root, model.id, repairId) == null) return;
      urls.push({
        path:
          '/oprava.html?model=' + encodeURIComponent(model.id) +
          '&oprava=' + encodeURIComponent(repairId),
        priority: 0.55,
        changefreq: 'weekly'
      });
    });
  });

  return urls;
}

function resolveMeta(req, root) {
  var pathname = req.path === '/' ? '/index.html' : req.path;
  var base = Object.assign({}, STATIC_PAGES[pathname] || {
    title: BUSINESS.name,
    description: 'Servis iPhonů, počítačů a notebooků v Třebíči.',
    path: pathname,
    type: 'website',
    robots: 'index,follow',
    priority: 0.5,
    changefreq: 'monthly',
    schemas: []
  });

  var query = req.query || {};
  var modelId = String(query.model || '').trim();
  var repairId = String(query.oprava || '').trim();

  if (pathname === '/iphone.html' && modelId) {
    var device = findModel(root, modelId);
    if (device) {
      base.title = 'Oprava ' + device.name + ' — ceník | IT Servis Třebíč';
      base.description =
        'Ceník oprav ' + device.name + ' v Třebíči. Výměna displeje, baterie, nabíjecího konektoru, kamer a Face ID. Ceny vč. DPH, rezervace online.';
      base.path = '/iphone.html?model=' + encodeURIComponent(modelId);
      base.schemas = ['breadcrumb', 'modelOffers'];
      base.breadcrumbs = [
        { name: 'Domů', path: '/' },
        { name: 'iPhone', path: '/index.html?kategorie=iphone#cenik' },
        { name: device.name, path: '/iphone.html?model=' + encodeURIComponent(modelId) }
      ];
      base.modelId = modelId;
      base.modelName = device.name;
    }
  }

  if (pathname === '/oprava.html' && modelId && repairId) {
    var repairDevice = findModel(root, modelId);
    var catalogItem = findCatalogItem(root, repairId);
    var repairContent = getRepairContent(root);
    var itemMeta = (repairContent.items && repairContent.items[repairId]) || {};
    var repairTitle = itemMeta.sidebarTitle || (catalogItem && catalogItem.title) || 'Oprava iPhone';
    var repairDesc = itemMeta.description ||
      'Profesionální servisní úkon v Třebíči včetně diagnostiky, montáže dílu a 12měsíční záruky.';
    var price = getRepairPrice(root, modelId, repairId);

    if (repairDevice && catalogItem) {
      base.title = repairTitle + ' — ' + repairDevice.name + ' | IT Servis Třebíč';
      base.description = repairDesc.slice(0, 155) +
        (price ? ' Cena od ' + price.toLocaleString('cs-CZ') + ' Kč vč. DPH.' : '') +
        ' Servis v Třebíči.';
      base.path =
        '/oprava.html?model=' + encodeURIComponent(modelId) +
        '&oprava=' + encodeURIComponent(repairId);
      base.type = 'product';
      base.schemas = ['breadcrumb', 'repairOffer'];
      base.breadcrumbs = [
        { name: 'Domů', path: '/' },
        { name: 'iPhone', path: '/index.html?kategorie=iphone#cenik' },
        {
          name: repairDevice.name,
          path: '/iphone.html?model=' + encodeURIComponent(modelId)
        },
        { name: repairTitle, path: base.path }
      ];
      base.modelId = modelId;
      base.modelName = repairDevice.name;
      base.repairId = repairId;
      base.repairTitle = repairTitle;
      base.repairDescription = repairDesc;
      base.repairPrice = price;
      base.image = itemMeta.image || (catalogItem && catalogItem.icon) || DEFAULT_OG_IMAGE;
    }
  }

  base.canonical = base.path;
  return base;
}

function buildLocalBusinessSchema(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'ComputerRepair'],
    '@id': absoluteUrl(siteUrl, '/') + '#business',
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    image: absoluteUrl(siteUrl, DEFAULT_OG_IMAGE),
    url: absoluteUrl(siteUrl, '/'),
    telephone: BUSINESS.phone,
    email: BUSINESS.email,
    priceRange: BUSINESS.priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.street,
      addressLocality: BUSINESS.locality,
      addressRegion: BUSINESS.region,
      postalCode: BUSINESS.postalCode,
      addressCountry: BUSINESS.country
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: BUSINESS.lat,
      longitude: BUSINESS.lng
    },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
      ],
      opens: '09:00',
      closes: '17:00'
    }],
    founder: {
      '@type': 'Person',
      name: BUSINESS.legalName
    },
    taxID: BUSINESS.ico,
    areaServed: [
      { '@type': 'City', name: 'Třebíč' },
      { '@type': 'AdministrativeArea', name: 'Vysočina' }
    ]
  };
}

function buildWebsiteSchema(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl(siteUrl, '/') + '#website',
    url: absoluteUrl(siteUrl, '/'),
    name: BUSINESS.name,
    description: 'Servis iPhonů, počítačů a notebooků v Třebíči a okolí.',
    inLanguage: 'cs-CZ',
    publisher: { '@id': absoluteUrl(siteUrl, '/') + '#business' }
  };
}

function buildFaqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(function (item) {
      return {
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer
        }
      };
    })
  };
}

function buildBreadcrumbSchema(siteUrl, breadcrumbs) {
  if (!breadcrumbs || !breadcrumbs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map(function (crumb, index) {
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: absoluteUrl(siteUrl, crumb.path)
      };
    })
  };
}

function buildServicesSchema(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'IT služby — IT Servis Třebíč',
    itemListElement: SERVICE_ITEMS.map(function (service, index) {
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Service',
          name: service.name,
          description: service.description,
          provider: { '@id': absoluteUrl(siteUrl, '/') + '#business' },
          areaServed: 'Třebíč',
          url: absoluteUrl(siteUrl, '/sluzby.html')
        }
      };
    })
  };
}

function buildModelOffersSchema(siteUrl, meta, root) {
  if (!meta.modelId) return null;
  var prices = getPrices(root);
  var modelPrices = prices.models && prices.models[meta.modelId];
  if (!modelPrices) return null;

  var offers = [];
  Object.keys(modelPrices).forEach(function (repairId) {
    var price = getRepairPrice(root, meta.modelId, repairId);
    if (price == null) return;
    var catalogItem = findCatalogItem(root, repairId);
    if (!catalogItem) return;
    offers.push({
      '@type': 'Offer',
      name: catalogItem.title,
      price: price,
      priceCurrency: 'CZK',
      availability: 'https://schema.org/InStock',
      url: absoluteUrl(
        siteUrl,
        '/oprava.html?model=' + encodeURIComponent(meta.modelId) +
        '&oprava=' + encodeURIComponent(repairId)
      )
    });
  });

  if (!offers.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: meta.modelName,
    description: 'Servis a opravy ' + meta.modelName + ' v Třebíči.',
    brand: { '@type': 'Brand', name: 'Apple' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'CZK',
      offerCount: offers.length,
      lowPrice: Math.min.apply(null, offers.map(function (o) { return o.price; })),
      highPrice: Math.max.apply(null, offers.map(function (o) { return o.price; })),
      offers: offers.slice(0, 20)
    }
  };
}

function buildRepairOfferSchema(siteUrl, meta) {
  if (!meta.repairTitle) return null;
  var schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: meta.repairTitle,
    description: meta.repairDescription,
    provider: { '@id': absoluteUrl(siteUrl, '/') + '#business' },
    areaServed: 'Třebíč',
    serviceType: 'Oprava iPhone',
    url: absoluteUrl(siteUrl, meta.path)
  };

  if (meta.repairPrice) {
    schema.offers = {
      '@type': 'Offer',
      price: meta.repairPrice,
      priceCurrency: 'CZK',
      availability: 'https://schema.org/InStock',
      url: absoluteUrl(siteUrl, meta.path)
    };
  }

  return schema;
}

function buildJsonLd(meta, siteUrl, root) {
  var schemas = [];
  var wanted = meta.schemas || [];

  if (wanted.indexOf('localBusiness') !== -1) {
    schemas.push(buildLocalBusinessSchema(siteUrl));
  }
  if (wanted.indexOf('website') !== -1) {
    schemas.push(buildWebsiteSchema(siteUrl));
  }
  if (wanted.indexOf('faq') !== -1) {
    schemas.push(buildFaqSchema());
  }
  if (wanted.indexOf('services') !== -1) {
    schemas.push(buildServicesSchema(siteUrl));
  }
  if (wanted.indexOf('breadcrumb') !== -1) {
    var crumbs = buildBreadcrumbSchema(siteUrl, meta.breadcrumbs);
    if (crumbs) schemas.push(crumbs);
  }
  if (wanted.indexOf('modelOffers') !== -1) {
    var modelSchema = buildModelOffersSchema(siteUrl, meta, root);
    if (modelSchema) schemas.push(modelSchema);
  }
  if (wanted.indexOf('repairOffer') !== -1) {
    var repairSchema = buildRepairOfferSchema(siteUrl, meta);
    if (repairSchema) schemas.push(repairSchema);
  }

  return schemas.map(function (schema) {
    return '<script type="application/ld+json">' + escapeJson(schema) + '</script>';
  }).join('\n  ');
}

function buildHeadTags(meta, siteUrl) {
  var canonical = absoluteUrl(siteUrl, meta.canonical || meta.path || '/');
  var image = absoluteUrl(siteUrl, meta.image || DEFAULT_OG_IMAGE);
  var ogType = meta.type === 'product' ? 'product' : 'website';

  return [
    '<title>' + escapeHtml(meta.title) + '</title>',
    '<meta name="description" content="' + escapeHtml(meta.description) + '">',
    '<meta name="robots" content="' + escapeHtml(meta.robots || 'index,follow') + '">',
    '<meta name="author" content="' + escapeHtml(BUSINESS.legalName) + '">',
    '<meta name="geo.region" content="CZ-VY">',
    '<meta name="geo.placename" content="' + escapeHtml(BUSINESS.locality) + '">',
    '<meta name="geo.position" content="' + BUSINESS.lat + ';' + BUSINESS.lng + '">',
    '<meta name="ICBM" content="' + BUSINESS.lat + ', ' + BUSINESS.lng + '">',
    '<meta name="theme-color" content="#0f172a">',
    '<link rel="canonical" href="' + escapeHtml(canonical) + '">',
    '<link rel="alternate" hreflang="cs-CZ" href="' + escapeHtml(canonical) + '">',
    '<link rel="alternate" hreflang="x-default" href="' + escapeHtml(canonical) + '">',
    '<meta property="og:site_name" content="' + escapeHtml(BUSINESS.name) + '">',
    '<meta property="og:locale" content="cs_CZ">',
    '<meta property="og:type" content="' + escapeHtml(ogType) + '">',
    '<meta property="og:title" content="' + escapeHtml(meta.title) + '">',
    '<meta property="og:description" content="' + escapeHtml(meta.description) + '">',
    '<meta property="og:url" content="' + escapeHtml(canonical) + '">',
    '<meta property="og:image" content="' + escapeHtml(image) + '">',
    '<meta property="og:image:alt" content="' + escapeHtml(BUSINESS.name) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + escapeHtml(meta.title) + '">',
    '<meta name="twitter:description" content="' + escapeHtml(meta.description) + '">',
    '<meta name="twitter:image" content="' + escapeHtml(image) + '">'
  ].join('\n  ');
}

function injectHtml(html, meta, siteUrl, root) {
  if (html.indexOf(SEO_MARKER) === -1) return html;
  var block = buildHeadTags(meta, siteUrl) + '\n  ' + buildJsonLd(meta, siteUrl, root);
  return html.replace(SEO_MARKER, block);
}

function buildRobotsTxt(siteUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /data/',
    'Disallow: /pokladna.html',
    '',
    'Sitemap: ' + absoluteUrl(siteUrl, '/sitemap.xml')
  ].join('\n');
}

function buildSitemap(siteUrl, root) {
  var urls = [];

  Object.keys(STATIC_PAGES).forEach(function (key) {
    var page = STATIC_PAGES[key];
    if (page.robots && page.robots.indexOf('noindex') !== -1) return;
    urls.push({
      loc: absoluteUrl(siteUrl, page.path),
      changefreq: page.changefreq || 'monthly',
      priority: page.priority || 0.5
    });
  });

  listRepairUrls(root).forEach(function (entry) {
    urls.push({
      loc: absoluteUrl(siteUrl, entry.path),
      changefreq: entry.changefreq,
      priority: entry.priority
    });
  });

  var body = urls.map(function (entry) {
    return (
      '  <url>\n' +
      '    <loc>' + escapeHtml(entry.loc) + '</loc>\n' +
      '    <changefreq>' + escapeHtml(entry.changefreq) + '</changefreq>\n' +
      '    <priority>' + Number(entry.priority).toFixed(2) + '</priority>\n' +
      '  </url>'
    );
  }).join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body + '\n' +
    '</urlset>\n'
  );
}

function isPublicHtmlRequest(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  var p = req.path || '';
  if (p.indexOf('/admin/') === 0) return false;
  if (p === '/') return true;
  return /\.html$/i.test(p);
}

function resolveHtmlPath(root, reqPath) {
  var rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\//, '');
  var filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

module.exports = {
  SEO_MARKER: SEO_MARKER,
  BUSINESS: BUSINESS,
  getSiteUrl: getSiteUrl,
  absoluteUrl: absoluteUrl,
  resolveMeta: resolveMeta,
  injectHtml: injectHtml,
  buildRobotsTxt: buildRobotsTxt,
  buildSitemap: buildSitemap,
  isPublicHtmlRequest: isPublicHtmlRequest,
  resolveHtmlPath: resolveHtmlPath
};
