// ═══════════════════════════════════════════════════════════════
// PARSER.JS — PDF/CSV парсер DressCode v4.0
// 5 режимов Сбербанк + 2 Тинькофф + CSV + дедупликация
// ═══════════════════════════════════════════════════════════════

// ── TX HASH — детерминистичный хеш для дедупликации ──
function txHash(bank, date, time, amount, desc) {
  var str = (bank + '_' + date + '_' + time + '_' + amount + '_' +
    String(desc || '').toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 40));
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ── CLEAN DESCRIPTION ──
function cleanDescription(desc) {
  if (!desc) return '';
  var s = String(desc);
  s = s.replace(/^MAPP_/i, '');
  s = s.replace(/^SBERBANK_/i, '');
  s = s.replace(/\s*\d{6}\*{4,}\d{4}\s*/g, ' ');
  s = s.replace(/\s*MCC\d+\s*/gi, '');
  s = s.replace(/\s*\d{6}(?:\*+\d+)?\s*/g, ' ');
  s = s.replace(/_/g, ' ');
  return s.trim();
}

// ── DETECT BANK TYPE ──
function detectBank(text) {
  if (/тинькофф|tinkoff|т-банк|t-bank/i.test(text)) return 'tinkoff';
  if (/сбербанк|sberbank|сбер/i.test(text)) return 'sber';
  return 'unknown';
}

// ── DETECT OWNER ──
function detectOwner(text) {
  if (/СКАЧКОВА|АЛЁНА|АЛЕНА|ALYONA|SKACHKOVA/i.test(text)) return 'Алёна';
  return 'Кирилл';
}

// ═══════════════════════════════════════════════════════════════
// PARSE PDF FILE — main entry point
// ═══════════════════════════════════════════════════════════════
function parsePDFFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var typedArray = new Uint8Array(e.target.result);

      if (file.name.toLowerCase().endsWith('.csv')) {
        var text = new TextDecoder('utf-8').decode(typedArray);
        resolve(parseCSV(text));
        return;
      }

      pdfjsLib.getDocument(typedArray).promise.then(function(pdf) {
        var pages = [];
        var numPages = pdf.numPages;
        var promises = [];
        for (var i = 1; i <= numPages; i++) {
          promises.push(pdf.getPage(i).then(function(page) {
            return page.getTextContent().then(function(tc) {
              return tc.items.map(function(item) { return item.str; }).join(' ');
            });
          }));
        }
        Promise.all(promises).then(function(texts) {
          var fullText = texts.join('\n');
          var bank = detectBank(fullText);
          var owner = detectOwner(fullText);
          var txs;
          if (bank === 'tinkoff') {
            txs = parseTinkoff(fullText, owner);
          } else {
            txs = parseSber(fullText, owner);
          }
          resolve(txs);
        });
      }).catch(function(err) {
        reject(new Error('PDF parse error: ' + err.message));
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

// ═══════════════════════════════════════════════════════════════
// SBERBANK — 5 режимов
// ═══════════════════════════════════════════════════════════════
function parseSber(text, owner) {
  owner = owner || 'Кирилл';
  var txs = [];

  // MODE A: "25.01.2026 10:06" — дата+время слитно
  var modeA = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d{6})\s+(.+?)\s+([\d\s]+[.,]\d{2})\s+([\d\s]+[.,]\d{2})/g);
  if (modeA && modeA.length > 3) {
    var re = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d{6})\s+(.+?)\s+([\d\s]+[.,]\d{2})\s+([\d\s]+[.,]\d{2})/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      txs.push(buildSberTx(m[1], m[2], m[4], m[5], m[6], owner));
    }
    if (txs.length > 0) return txs;
  }

  // MODE B: дата и время разделены
  var modeB = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(.+?)\s+([\d\s]+[.,]\d{2})\s+([\d\s]+[.,]\d{2})/g;
  var mb;
  while ((mb = modeB.exec(text)) !== null) {
    txs.push(buildSberTx(mb[1], mb[2], mb[3], mb[4], mb[5], owner));
  }
  if (txs.length > 3) return txs;

  // MODE C: с кодом авторизации встроенным
  txs = [];
  var modeC = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d{6})\s+([\s\S]*?)\s+([\d\s]+[.,]\d{2})/g;
  var mc;
  while ((mc = modeC.exec(text)) !== null) {
    var desc = mc[4].replace(/\s+/g, ' ').trim();
    if (desc.length > 3) {
      txs.push(buildSberTx(mc[1], mc[2], desc, mc[5], null, owner));
    }
  }
  if (txs.length > 3) return txs;

  // MODE D: Построчный разбор — дата|время|описание|сумма
  txs = [];
  var lines = text.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var dm = line.match(/^(\d{2}\.\d{2}\.\d{4})/);
    if (!dm) continue;
    var tm = line.match(/(\d{2}:\d{2})/);
    var am = line.match(/([\d\s]+[.,]\d{2})/g);
    if (am && am.length > 0) {
      var dateStr = dm[1];
      var timeStr = tm ? tm[1] : '00:00';
      var descPart = line.replace(dateStr, '').replace(timeStr, '');
      am.forEach(function(a) { descPart = descPart.replace(a, ''); });
      descPart = descPart.replace(/\d{6}/g, '').replace(/\s+/g, ' ').trim();
      if (descPart.length > 2 && am.length > 0) {
        txs.push(buildSberTx(dateStr, timeStr, descPart, am[0], am[1] || null, owner));
      }
    }
  }
  if (txs.length > 0) return txs;

  // MODE E: Full-line fallback — ищем суммы в строке
  txs = [];
  var modeE = /(\d{2}\.\d{2}\.\d{4})[\s\S]*?([\d\s]+[.,]\d{2})/g;
  var me;
  while ((me = modeE.exec(text)) !== null) {
    var between = text.substring(me.index, me.index + me[0].length);
    var descE = between.replace(/\d{2}\.\d{2}\.\d{4}/, '').replace(me[2], '').replace(/\d{2}:\d{2}/g, '').replace(/\d{6}/g, '').replace(/\s+/g, ' ').trim();
    if (descE.length > 3) {
      txs.push(buildSberTx(me[1], '00:00', descE, me[2], null, owner));
    }
  }
  return txs;
}

function buildSberTx(dateStr, time, desc, amountStr, balanceStr, owner) {
  var parts = dateStr.split('.');
  var isoDate = parts[2] + '-' + parts[1] + '-' + parts[0];
  var amount = parseAmount(amountStr);
  var balance = balanceStr ? parseAmount(balanceStr) : null;
  var cleaned = cleanDescription(desc);
  var type = amount < 0 ? 'expense' : 'income';
  return {
    id: 'sber_' + dateStr + '_' + time + '_' + txHash('sber', dateStr, time, amount, cleaned),
    date: isoDate,
    dateRaw: dateStr,
    time: time,
    monthKey: parts[2] + '-' + parts[1],
    amount: Math.abs(amount),
    amountSigned: amount,
    type: type,
    description: cleaned,
    merchant: cleaned.substring(0, 50),
    balance: balance,
    bank: 'Сбербанк',
    owner: owner,
    source: 'pdf'
  };
}

// ═══════════════════════════════════════════════════════════════
// TINKOFF — 2 режима
// ═══════════════════════════════════════════════════════════════
function parseTinkoff(text, owner) {
  owner = owner || 'Кирилл';
  var txs = [];

  // MODE A: Две даты слитно "31.12.2025 31.12.2025"
  var modeA = /(\d{2}\.\d{2}\.\d{4})\s+\d{2}\.\d{2}\.\d{4}\s+(.*?)\s+([\d\s]+[.,]\d{2})\s+([\d\s]+[.,]\d{2})/g;
  var ma;
  while ((ma = modeA.exec(text)) !== null) {
    txs.push(buildTinkoffTx(ma[1], ma[2], ma[3], ma[4], owner));
  }
  if (txs.length > 3) return txs;

  // MODE B: Разделённые даты/время
  txs = [];
  var modeB = /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})[\s\S]*?(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(.*?)\s+([\d\s]+[.,]\d{2})\s*₽?\s+([\d\s]+[.,]\d{2})/g;
  var mb;
  while ((mb = modeB.exec(text)) !== null) {
    txs.push(buildTinkoffTx(mb[1], mb[5], mb[6], mb[7], owner));
  }
  if (txs.length > 0) return txs;

  // Fallback: простой поиск
  var lines = text.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var dm = line.match(/(\d{2}\.\d{2}\.\d{4})/);
    var am = line.match(/([\d\s]+[.,]\d{2})/g);
    if (dm && am && am.length > 0) {
      var descT = line;
      descT = descT.replace(/\d{2}\.\d{2}\.\d{4}/g, '').replace(/\d{2}:\d{2}/g, '');
      am.forEach(function(a) { descT = descT.replace(a, ''); });
      descT = descT.replace(/₽/g, '').replace(/\s+/g, ' ').trim();
      if (descT.length > 2) {
        txs.push(buildTinkoffTx(dm[1], descT, am[0], am[1] || null, owner));
      }
    }
  }
  return txs;
}

function buildTinkoffTx(dateStr, desc, amountStr, balanceStr, owner) {
  var parts = dateStr.split('.');
  var isoDate = parts[2] + '-' + parts[1] + '-' + parts[0];
  var amount = parseAmount(amountStr);
  var balance = balanceStr ? parseAmount(balanceStr) : null;
  var cleaned = cleanDescription(desc);
  var type = amount < 0 ? 'expense' : 'income';
  return {
    id: 'tink_' + dateStr + '_' + txHash('tink', dateStr, '00:00', amount, cleaned),
    date: isoDate,
    dateRaw: dateStr,
    time: '00:00',
    monthKey: parts[2] + '-' + parts[1],
    amount: Math.abs(amount),
    amountSigned: amount,
    type: type,
    description: cleaned,
    merchant: cleaned.substring(0, 50),
    balance: balance,
    bank: 'Тинькофф',
    owner: owner,
    source: 'pdf'
  };
}

// ═══════════════════════════════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════════════════════════════
function parseCSV(text) {
  var txs = [];
  var lines = text.split(/\r?\n/);
  if (lines.length < 2) return txs;

  // Detect separator
  var sep = lines[0].indexOf(';') >= 0 ? ';' : ',';
  var headers = lines[0].split(sep).map(function(h) { return h.replace(/"/g, '').trim().toLowerCase(); });

  // Find columns
  var dateCol = headers.findIndex(function(h) { return /дата|date/.test(h); });
  var amountCol = headers.findIndex(function(h) { return /сумма|amount|операци/.test(h); });
  var descCol = headers.findIndex(function(h) { return /описание|desc|наименование|назначение/.test(h); });
  var catCol = headers.findIndex(function(h) { return /категория|category/.test(h); });

  if (dateCol < 0 || amountCol < 0) return txs;
  if (descCol < 0) descCol = amountCol + 1;

  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var cols = lines[i].split(sep).map(function(c) { return c.replace(/"/g, '').trim(); });
    if (!cols[dateCol] || !cols[amountCol]) continue;

    var dateStr = cols[dateCol];
    var dm = dateStr.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (!dm) continue;

    var isoDate = dm[3] + '-' + dm[2] + '-' + dm[1];
    var amount = parseAmount(cols[amountCol]);
    var desc = cols[descCol] || '';
    var cleaned = cleanDescription(desc);

    txs.push({
      id: 'csv_' + dm[1] + '.' + dm[2] + '.' + dm[3] + '_' + txHash('csv', dateStr, '00:00', amount, cleaned),
      date: isoDate,
      dateRaw: dm[1] + '.' + dm[2] + '.' + dm[3],
      time: '00:00',
      monthKey: dm[3] + '-' + dm[2],
      amount: Math.abs(amount),
      amountSigned: amount,
      type: amount < 0 ? 'expense' : 'income',
      description: cleaned,
      merchant: cleaned.substring(0, 50),
      bankCategory: catCol >= 0 ? cols[catCol] : '',
      balance: null,
      bank: 'CSV',
      owner: 'Кирилл',
      source: 'csv'
    });
  }
  return txs;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function parseAmount(str) {
  if (!str) return 0;
  var s = String(str).replace(/\s/g, '').replace(',', '.').replace(/₽/g, '');
  return parseFloat(s) || 0;
}
