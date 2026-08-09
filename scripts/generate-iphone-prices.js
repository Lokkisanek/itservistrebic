'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/iphone-repairs-catalog.json'), 'utf8'));

var MODELS = [
  'iphone-16-pro-max', 'iphone-16-pro', 'iphone-16-plus', 'iphone-16',
  'iphone-15-pro-max', 'iphone-15-pro', 'iphone-15-plus', 'iphone-15',
  'iphone-14-pro-max', 'iphone-14-pro', 'iphone-14-plus', 'iphone-14',
  'iphone-13-pro-max', 'iphone-13-pro', 'iphone-13-mini', 'iphone-13',
  'iphone-12-pro-max', 'iphone-12-pro', 'iphone-12-mini', 'iphone-12',
  'iphone-11-pro-max', 'iphone-11-pro', 'iphone-11',
  'iphone-xs-max', 'iphone-xs', 'iphone-xr', 'iphone-x',
  'iphone-8-plus', 'iphone-8', 'iphone-7-plus', 'iphone-7',
  'iphone-se-2022', 'iphone-se-2020', 'iphone-se-2016',
  'iphone-6s-plus', 'iphone-6s', 'iphone-6-plus', 'iphone-6'
];

var BASE = {};
catalog.sections.forEach(function (section) {
  section.items.forEach(function (item) {
    var old = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/iphone-repairs.json'), 'utf8'));
    old.sections.forEach(function (s) {
      s.items.forEach(function (i) {
        if (i.id === item.id) BASE[item.id] = i.price;
      });
    });
  });
});

function round10(n) {
  return Math.round(n / 10) * 10;
}

function multiplier(index, total) {
  var max = 1.28;
  var min = 0.58;
  if (total <= 1) return 1;
  return min + (max - min) * (1 - index / (total - 1));
}

var models = {};
MODELS.forEach(function (modelId, index) {
  var m = multiplier(index, MODELS.length);
  var prices = {};
  Object.keys(BASE).forEach(function (itemId) {
    prices[itemId] = round10(BASE[itemId] * m);
  });
  models[modelId] = prices;
});

var output = {
  vatRate: 21,
  pricesIncludeVat: true,
  models: models
};

fs.writeFileSync(
  path.join(ROOT, 'data/iphone-prices.json'),
  JSON.stringify(output, null, 2) + '\n',
  'utf8'
);

console.log('Generated iphone-prices.json for', MODELS.length, 'models');
