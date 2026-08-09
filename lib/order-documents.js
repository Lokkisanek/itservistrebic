'use strict';

var fs = require('fs');
var path = require('path');
var PDFDocument = require('pdfkit');
var nodemailer = require('nodemailer');

var ROOT = path.join(__dirname, '..');
var FONT_REG = path.join(ROOT, 'assets', 'fonts', 'DejaVuSans.ttf');
var FONT_BOLD = path.join(ROOT, 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

var BUSINESS = {
  brand: 'IT Servis Třebíč',
  operator: 'Matyáš Odehnal',
  ico: '29800480',
  address: 'Novodvorská 1077/15, Nové Dvory, 674 01 Třebíč',
  phone: '+420 736 238 787',
  email: 'matyod@seznam.cz',
  vatNote: 'Neplátce DPH'
};

var DOC_LABELS = {
  intake: {
    title: 'Potvrzení o převzetí zařízení',
    subtitle: 'Doklad při předání zařízení do servisu',
    statement:
      'Potvrzuji předání výše uvedeného zařízení do servisu IT Servis Třebíč. ' +
      'Beru na vědomí, že doporučuji mít data zálohována. Popis zakázky a stav ' +
      'při převzetí odpovídají skutečnosti.',
    signerRole: 'Podpis zákazníka (převzetí)'
  },
  done: {
    title: 'Doklad o opravě / faktura',
    subtitle: 'Potvrzení o dokončení opravy a předání zařízení',
    statement:
      'Potvrzuji převzetí opraveného zařízení a souhlasím s uvedeným rozsahem ' +
      'prací a cenou. Doklad slouží jako potvrzení o provedené opravě.',
    signerRole: 'Podpis zákazníka (převzetí po opravě)'
  }
};

function isDocKind(kind) {
  return kind === 'intake' || kind === 'done';
}

function emptyOrderDocuments() {
  return { intake: null, done: null };
}

function normalizeOrderDocuments(docs) {
  var d = docs && typeof docs === 'object' ? docs : {};
  return {
    intake: d.intake && typeof d.intake === 'object' ? d.intake : null,
    done: d.done && typeof d.done === 'object' ? d.done : null
  };
}

function formatMoney(n) {
  return Number(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
}

function formatDateCs(iso) {
  try {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(iso || '');
  }
}

function paymentLabel(method) {
  if (method === 'qr') return 'QR kód na místě';
  if (method === 'prevod') return 'Převod';
  if (method === 'karta') return 'Karta';
  return 'Hotově na místě';
}

function parseDataUrl(dataUrl) {
  var m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return null;
  return Buffer.from(m[2], 'base64');
}

function buildOrderDocumentPdf(order, kind, options) {
  options = options || {};
  var meta = DOC_LABELS[kind];
  if (!meta) return Promise.reject(new Error('Neplatný typ dokladu.'));

  var signatureBuf = options.signatureBuffer || null;
  var signerName = String(options.signerName || order.customer || '').trim().slice(0, 120);
  var signedAt = options.signedAt || new Date().toISOString();

  return new Promise(function (resolve, reject) {
    var doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: meta.title + ' — ' + order.id,
        Author: BUSINESS.brand,
        Subject: order.id
      }
    });

    var chunks = [];
    doc.on('data', function (c) { chunks.push(c); });
    doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    if (fs.existsSync(FONT_REG)) doc.registerFont('Body', FONT_REG);
    if (fs.existsSync(FONT_BOLD)) doc.registerFont('Bold', FONT_BOLD);
    var body = fs.existsSync(FONT_REG) ? 'Body' : 'Helvetica';
    var bold = fs.existsSync(FONT_BOLD) ? 'Bold' : 'Helvetica-Bold';

    doc.font(bold).fontSize(18).fillColor('#0f172a').text(BUSINESS.brand);
    doc.font(body).fontSize(9).fillColor('#64748b')
      .text(BUSINESS.operator + ' · IČO ' + BUSINESS.ico + ' · ' + BUSINESS.vatNote)
      .text(BUSINESS.address)
      .text(BUSINESS.phone + ' · ' + BUSINESS.email);

    doc.moveDown(1);
    doc.strokeColor('#e2e8f0').lineWidth(1)
      .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.font(bold).fontSize(16).fillColor('#0f172a').text(meta.title);
    doc.font(body).fontSize(10).fillColor('#64748b').text(meta.subtitle);
    doc.moveDown(0.8);

    doc.font(body).fontSize(10).fillColor('#0f172a');
    row(doc, bold, body, 'Číslo zakázky', order.id || '—');
    row(doc, bold, body, 'Datum podpisu', formatDateCs(signedAt));
    row(doc, bold, body, 'Zákazník', order.customer || '—');
    row(doc, bold, body, 'Telefon', order.phone || '—');
    row(doc, bold, body, 'E-mail', order.email || '—');
    row(doc, bold, body, 'Zařízení', order.device || '—');
    row(doc, bold, body, 'Oprava', order.repair || '—');

    if (kind === 'done') {
      row(doc, bold, body, 'Cena celkem', formatMoney(order.price));
      row(doc, bold, body, 'Zaplaceno', formatMoney(order.paid));
      row(doc, bold, body, 'Platba', paymentLabel(order.paymentMethod));
      var due = Math.max(0, Number(order.price || 0) - Number(order.paid || 0));
      row(doc, bold, body, 'K úhradě', formatMoney(due));
    }

    if (order.note) {
      doc.moveDown(0.4);
      doc.font(bold).fontSize(10).text('Poznámka');
      doc.font(body).fontSize(9).fillColor('#334155').text(String(order.note).slice(0, 800), {
        width: 495
      });
      doc.fillColor('#0f172a');
    }

    doc.moveDown(1);
    doc.font(body).fontSize(9).fillColor('#334155').text(meta.statement, {
      width: 495,
      align: 'justify'
    });

    doc.moveDown(1.2);
    doc.font(bold).fontSize(10).fillColor('#0f172a').text(meta.signerRole);
    doc.font(body).fontSize(9).fillColor('#64748b').text(signerName || '—');

    if (signatureBuf) {
      doc.moveDown(0.4);
      try {
        doc.image(signatureBuf, {
          fit: [280, 100],
          align: 'left'
        });
      } catch (e) {
        doc.font(body).fontSize(9).fillColor('#ef4444')
          .text('(Podpis se nepodařilo vložit do PDF.)');
      }
    } else {
      doc.moveDown(0.5);
      doc.strokeColor('#94a3b8').rect(50, doc.y, 280, 80).stroke();
      doc.font(body).fontSize(8).fillColor('#94a3b8')
        .text('Prostor pro podpis', 55, doc.y + 35);
    }

    doc.moveDown(2);
    var footerY = Math.max(doc.y + 20, 760);
    doc.font(body).fontSize(8).fillColor('#94a3b8')
      .text(
        BUSINESS.brand + ' · ' + meta.title + ' · ' + (order.id || ''),
        50,
        footerY,
        { width: 495, align: 'center' }
      );

    doc.end();
  });
}

function row(doc, bold, body, label, value) {
  var y = doc.y;
  doc.font(bold).fontSize(9).fillColor('#64748b').text(label, 50, y, { width: 130, continued: false });
  doc.font(body).fontSize(10).fillColor('#0f172a').text(String(value || '—'), 180, y, { width: 365 });
  doc.moveDown(0.15);
}

function createMailTransport() {
  var host = process.env.SMTP_HOST || '';
  var user = process.env.SMTP_USER || '';
  var pass = process.env.SMTP_PASS || '';
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host: host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === '1',
    auth: { user: user, pass: pass }
  });
}

function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function sendDocumentEmail(order, kind, pdfBuffer, meta) {
  var transport = createMailTransport();
  if (!transport) {
    return Promise.reject(Object.assign(new Error(
      'E-mail není nastavený. Doplňte SMTP_HOST, SMTP_USER a SMTP_PASS v .env.'
    ), { status: 503 }));
  }

  var to = String(order.email || '').trim();
  if (!to || to.indexOf('@') === -1) {
    return Promise.reject(Object.assign(new Error('Zakázka nemá platný e-mail zákazníka.'), { status: 400 }));
  }

  var labels = DOC_LABELS[kind];
  var from = process.env.SMTP_FROM || (BUSINESS.brand + ' <' + (process.env.SMTP_USER || BUSINESS.email) + '>');
  var fileName = (kind === 'intake' ? 'prevzeti' : 'doklad-opravy') + '-' + order.id + '.pdf';

  return transport.sendMail({
    from: from,
    to: to,
    subject: labels.title + ' — ' + BUSINESS.brand + ' (' + order.id + ')',
    text:
      'Dobrý den,\n\n' +
      'v příloze zasíláme ' + labels.title.toLowerCase() + ' k zakázce ' + order.id + '.\n\n' +
      'Zařízení: ' + (order.device || '—') + '\n' +
      'Oprava: ' + (order.repair || '—') + '\n' +
      (kind === 'done' ? 'Cena: ' + formatMoney(order.price) + '\n' : '') +
      '\nS pozdravem\n' + BUSINESS.brand + '\n' + BUSINESS.phone,
    attachments: [
      {
        filename: fileName,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  }).then(function (info) {
    return { ok: true, messageId: info.messageId || '', to: to };
  });
}

function sendPlainEmail(options) {
  options = options || {};
  var transport = createMailTransport();
  if (!transport) {
    return Promise.reject(Object.assign(new Error(
      'E-mail není nastavený. Doplňte SMTP_HOST, SMTP_USER a SMTP_PASS v .env.'
    ), { status: 503 }));
  }

  var to = String(options.to || '').trim();
  if (!to || to.indexOf('@') === -1) {
    return Promise.reject(Object.assign(new Error('Chybí platný e-mail příjemce.'), { status: 400 }));
  }

  var from = process.env.SMTP_FROM || (BUSINESS.brand + ' <' + (process.env.SMTP_USER || BUSINESS.email) + '>');
  var subject = String(options.subject || BUSINESS.brand).slice(0, 200);
  var text = String(options.text || '').slice(0, 20000);
  if (!text.trim()) {
    return Promise.reject(Object.assign(new Error('Zpráva je prázdná.'), { status: 400 }));
  }

  return transport.sendMail({
    from: from,
    to: to,
    subject: subject,
    text: text
  }).then(function (info) {
    return { ok: true, messageId: info.messageId || '', to: to };
  });
}

module.exports = {
  BUSINESS: BUSINESS,
  DOC_LABELS: DOC_LABELS,
  isDocKind: isDocKind,
  emptyOrderDocuments: emptyOrderDocuments,
  normalizeOrderDocuments: normalizeOrderDocuments,
  parseDataUrl: parseDataUrl,
  buildOrderDocumentPdf: buildOrderDocumentPdf,
  mailConfigured: mailConfigured,
  sendDocumentEmail: sendDocumentEmail,
  sendPlainEmail: sendPlainEmail
};
