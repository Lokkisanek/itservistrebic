(function (w) {
  function upsertMeta(selector, attrName, attrValue, content) {
    var el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function upsertLink(rel, href) {
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  function upsertJsonLd(id, data) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }

  function absoluteUrl(pathname) {
    var origin = w.location.origin;
    if (!pathname || pathname === '/') return origin + '/';
    if (pathname.charAt(0) !== '/') pathname = '/' + pathname;
    return origin + pathname;
  }

  w.ITSSeo = {
    apply: function (options) {
      if (!options) return;

      if (options.title) document.title = options.title;

      if (options.description) {
        upsertMeta('meta[name="description"]', 'name', 'description', options.description);
        upsertMeta('meta[property="og:description"]', 'property', 'og:description', options.description);
        upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', options.description);
      }

      if (options.title) {
        upsertMeta('meta[property="og:title"]', 'property', 'og:title', options.title);
        upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', options.title);
      }

      if (options.canonical) {
        var url = absoluteUrl(options.canonical);
        upsertLink('canonical', url);
        upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
      }

      if (options.image) {
        var imageUrl = options.image.indexOf('http') === 0 ? options.image : absoluteUrl(options.image);
        upsertMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl);
        upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
      }

      if (options.robots) {
        upsertMeta('meta[name="robots"]', 'name', 'robots', options.robots);
      }

      if (options.breadcrumbs && options.breadcrumbs.length) {
        upsertJsonLd('its-seo-breadcrumb', {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: options.breadcrumbs.map(function (crumb, index) {
            return {
              '@type': 'ListItem',
              position: index + 1,
              name: crumb.name,
              item: absoluteUrl(crumb.path)
            };
          })
        });
      }

      if (options.service && options.service.name) {
        var serviceSchema = {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: options.service.name,
          description: options.service.description || '',
          url: absoluteUrl(options.canonical || w.location.pathname + w.location.search),
          areaServed: 'Třebíč',
          serviceType: 'Oprava iPhone'
        };
        if (options.service.price) {
          serviceSchema.offers = {
            '@type': 'Offer',
            price: options.service.price,
            priceCurrency: 'CZK',
            availability: 'https://schema.org/InStock'
          };
        }
        upsertJsonLd('its-seo-service', serviceSchema);
      }
    }
  };
})(window);
