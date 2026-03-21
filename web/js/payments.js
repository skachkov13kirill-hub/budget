// ═══════════════════════════════════════════════════════════════
// PAYMENTS.JS — Вкладка "Платежи" DressCode Dashboard
// Два блока: Кредиты + Аренда, чек-лист с выбором способа оплаты
// ═══════════════════════════════════════════════════════════════

var EXTRA_INCOME = 100000;

// ── RENT DATA (аренда по филиалам) ──
var RENT_ITEMS = [
  { name: 'М16 (Менделеева 16)', amount: 42000, day: 28 },
  { name: 'В8 (Воронцовский 8)', amount: 50000, day: 28 },
  { name: 'П14 (Петровский 14)', amount: 67800, day: 28 },
  { name: 'А6 (Арсенальная 6)', amount: 27500, day: 28 },
  { name: 'Г4 (Графская 4)', amount: 68000, day: 28 },
  { name: 'В22 (Воронцовский 22)', amount: 135000, day: 28 },
  { name: 'Е8 (Екатерининская 8)', amount: 45000, day: 28 },
  { name: 'В20 (Воронцовский 20)', amount: 30000, day: 28 },
  { name: 'Е17 (Екатерининская 17)', amount: 41500, day: 28 },
  { name: 'Г11 (Графская 11)', amount: 25000, day: 28 }
];

// ── STORAGE ──
function getPaymentsKey(prefix) {
  var now = new Date();
  return (prefix || 'dresscode_payments') + '_' + now.getFullYear() + '-' + (now.getMonth() + 1);
}

function getPaymentsData(prefix) {
  try { return JSON.parse(localStorage.getItem(getPaymentsKey(prefix)) || '{}'); } catch(e) { return {}; }
}

function savePaymentsData(data, prefix) {
  localStorage.setItem(getPaymentsKey(prefix), JSON.stringify(data));
}

// ── TOGGLE PAYMENT ──
function togglePayment(idx, method) {
  var data = getPaymentsData('dresscode_payments');
  if (data[idx] === method) { delete data[idx]; }
  else { data[idx] = method; }
  savePaymentsData(data, 'dresscode_payments');
  renderPaymentsTab();
}

function toggleRentPayment(idx, method) {
  var data = getPaymentsData('dresscode_rent');
  if (data[idx] === method) { delete data[idx]; }
  else { data[idx] = method; }
  savePaymentsData(data, 'dresscode_rent');
  renderPaymentsTab();
}

// ── EXTRA INCOME TOGGLE ──
function getExtraIncomeKey() {
  var now = new Date();
  return 'dresscode_extra_income_' + now.getFullYear() + '-' + (now.getMonth() + 1);
}

function isExtraIncomeReceived() {
  var v = localStorage.getItem(getExtraIncomeKey());
  return v === '1' || v === 'true';
}

function toggleExtraIncome() {
  var key = getExtraIncomeKey();
  var current = isExtraIncomeReceived();
  localStorage.setItem(key, current ? '0' : '1');
  renderPaymentsTab();
  if (typeof renderPlanner === 'function' && state.branches) renderPlanner(state.branches);
}

// ── BUILD ITEMS LIST ──
function buildCreditItems(paymentsData, today) {
  var items = [];
  if (!state.credits || !state.credits.length) return items;
  state.credits.forEach(function(cr, i) {
    if (cr.status === 'Заморожен') return;
    var day = parseInt(cr.paymentDay) || parseInt(cr.paymentDate) || 0;
    if (day === 0) {
      var dm = String(cr.paymentDate || '').match(/(\d{1,2})/);
      if (dm) day = parseInt(dm[1]);
    }
    items.push({
      idx: i,
      name: cr.name || cr.Кредитор || 'Кредит',
      amount: parseFloat(cr.payment) || 0,
      day: day,
      paidMethod: paymentsData[i] || null,
      isToday: day === today,
      isPast: day > 0 && day < today
    });
  });
  items.sort(function(a, b) { return a.day - b.day; });
  return items;
}

function buildRentItems(rentData, today) {
  var items = [];
  RENT_ITEMS.forEach(function(r, i) {
    items.push({
      idx: i,
      name: r.name,
      amount: r.amount,
      day: r.day,
      paidMethod: rentData[i] || null,
      isToday: r.day === today,
      isPast: r.day > 0 && r.day < today
    });
  });
  items.sort(function(a, b) { return a.day - b.day; });
  return items;
}

// ── RENDER BLOCK OF CARDS ──
function renderPaymentCards(items, toggleFn) {
  var html = '';
  items.forEach(function(p) {
    var isPaid = !!p.paidMethod;
    var statusIcon = isPaid ? '&#x2705;' : (p.isToday ? '&#x1F534;' : (p.isPast && !isPaid ? '&#x26A0;&#xFE0F;' : '&#x23F3;'));
    var overdue = p.isPast && !isPaid;

    html += '<div class="pay-card' + (isPaid ? ' pay-card-done' : '') + (overdue ? ' pay-card-overdue' : '') + '">' +
      '<div class="pay-card-top">' +
        '<div class="pay-card-status">' + statusIcon + '</div>' +
        '<div class="pay-card-info">' +
          '<div class="pay-card-name' + (isPaid ? ' pay-card-name-done' : '') + '">' + p.name + '</div>' +
          '<div class="pay-card-date">' + (p.day || '&mdash;') + ' число' +
            (isPaid ? ' &middot; <span class="pay-method-badge pay-method-' + p.paidMethod + '">' + getMethodLabel(p.paidMethod) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="pay-card-amount' + (isPaid ? ' pay-card-amount-done' : '') + '">' + fmtShort(p.amount) + '</div>' +
      '</div>' +
      '<div class="pay-methods">' +
        payMethodBtn2(p.idx, 'cash', '&#x1F4B5;', 'Нал', p.paidMethod, toggleFn) +
        payMethodBtn2(p.idx, 'transfer', '&#x1F3E6;', 'Безнал', p.paidMethod, toggleFn) +
        payMethodBtn2(p.idx, 'card', '&#x1F4B3;', 'Карта', p.paidMethod, toggleFn) +
      '</div>' +
    '</div>';
  });
  return html;
}

// ── RENDER ──
function renderPaymentsTab() {
  var el = document.getElementById('paymentsContent');
  var summaryEl = document.getElementById('paymentsSummary');
  var monthEl = document.getElementById('paymentsMonthName');
  if (!el) return;

  var now = new Date();
  var cm = now.getMonth() + 1;
  var today = now.getDate();
  if (monthEl) monthEl.textContent = MONTH_NAMES[cm];

  var creditPayData = getPaymentsData('dresscode_payments');
  var rentPayData = getPaymentsData('dresscode_rent');

  var creditItems = buildCreditItems(creditPayData, today);
  var rentItems = buildRentItems(rentPayData, today);
  var allItems = creditItems.concat(rentItems);

  if (creditItems.length === 0 && rentItems.length === 0) {
    summaryEl.innerHTML = '';
    el.innerHTML = '<div class="pay-empty"><div style="font-size:40px;margin-bottom:12px;">&#x1F4B3;</div>' +
      '<div style="font-size:14px;font-weight:600;">Нет данных о платежах</div>' +
      '<div style="font-size:12px;color:var(--text-3);margin-top:4px;">Нажмите &#x21bb; для загрузки</div></div>';
    return;
  }

  // Totals (credits + rent combined)
  var totalAll = 0, totalPaid = 0, totalUnpaid = 0, paidCount = 0;
  allItems.forEach(function(p) {
    totalAll += p.amount;
    if (p.paidMethod) { totalPaid += p.amount; paidCount++; }
    else { totalUnpaid += p.amount; }
  });

  var extraReceived = isExtraIncomeReceived();
  var pctDone = allItems.length > 0 ? Math.round((paidCount / allItems.length) * 100) : 0;

  // Summary card — общая сумма кредиты + аренда
  summaryEl.innerHTML =
    '<div class="pay-summary-card">' +
      '<div class="pay-summary-top">' +
        '<div class="pay-summary-left">' +
          '<div class="pay-summary-label">Всего платежей</div>' +
          '<div class="pay-summary-total">' + fmtShort(totalAll) + '</div>' +
        '</div>' +
        '<div class="pay-summary-right">' +
          '<div class="pay-summary-done">' + paidCount + '/' + allItems.length + '</div>' +
          '<div class="pay-summary-pct">' + pctDone + '%</div>' +
        '</div>' +
      '</div>' +
      '<div class="pay-progress-bg"><div class="pay-progress-fg" style="width:' + pctDone + '%"></div></div>' +
      '<div class="pay-summary-row">' +
        '<span style="color:var(--green);">&#x2705; ' + fmtShort(totalPaid) + '</span>' +
        '<span style="color:var(--text-3);">&#x23F3; ' + fmtShort(totalUnpaid) + '</span>' +
      '</div>' +
    '</div>';

  var html = '';

  // Next upcoming payment alert (from all items)
  var allSorted = allItems.slice().sort(function(a, b) { return a.day - b.day; });
  var todayPay = allSorted.find(function(p) { return p.isToday && !p.paidMethod; });
  var nextPay = allSorted.find(function(p) { return !p.paidMethod && !p.isPast; });

  if (todayPay) {
    html += '<div class="pay-alert pay-alert-today">' +
      '<div class="pay-alert-icon">&#x1F534;</div>' +
      '<div class="pay-alert-info">' +
        '<div class="pay-alert-label">СЕГОДНЯ</div>' +
        '<div class="pay-alert-text">' + todayPay.name + ' &mdash; ' + fmt(todayPay.amount) + '</div>' +
      '</div>' +
    '</div>';
  } else if (nextPay && !nextPay.isPast) {
    var daysTo = nextPay.day - today;
    if (daysTo >= 0 && daysTo <= 5) {
      html += '<div class="pay-alert' + (daysTo <= 2 ? ' pay-alert-urgent' : '') + '">' +
        '<div class="pay-alert-icon">' + (daysTo <= 2 ? '&#x26A0;&#xFE0F;' : '&#x23F3;') + '</div>' +
        '<div class="pay-alert-info">' +
          '<div class="pay-alert-label">' + (daysTo <= 2 ? 'СКОРО' : 'СЛЕДУЮЩИЙ') + '</div>' +
          '<div class="pay-alert-text">' + nextPay.name + ' &mdash; ' + fmt(nextPay.amount) + '</div>' +
          '<div class="pay-alert-date">' + nextPay.day + ' ' + MONTH_NAMES[cm] + ' &middot; через ' + daysTo + ' дн.</div>' +
        '</div>' +
      '</div>';
    }
  }

  // ── БЛОК 1: КРЕДИТЫ ──
  if (creditItems.length > 0) {
    var creditTotal = 0;
    creditItems.forEach(function(p) { creditTotal += p.amount; });
    html += '<div class="pay-section-header">' +
      '<span class="pay-section-title">Кредиты</span>' +
      '<span class="pay-section-sum">' + fmtShort(creditTotal) + '</span>' +
    '</div>';
    html += renderPaymentCards(creditItems, 'togglePayment');
  }

  // ── БЛОК 2: АРЕНДА ──
  if (rentItems.length > 0) {
    var rentTotal = 0;
    rentItems.forEach(function(p) { rentTotal += p.amount; });
    html += '<div class="pay-section-header">' +
      '<span class="pay-section-title">Аренда</span>' +
      '<span class="pay-section-sum">' + fmtShort(rentTotal) + '</span>' +
    '</div>';
    html += renderPaymentCards(rentItems, 'toggleRentPayment');
  }

  // Аренда по филиалам
  var RENTS = [
    {name: '\u041C\u0435\u043D\u0434\u0435\u043B\u0435\u0435\u0432\u0430 16', rent: 29500},
    {name: '\u0412\u043E\u0440\u043E\u043D\u0446\u043E\u0432\u0441\u043A\u0438\u0439 8', rent: 50000},
    {name: '\u041F\u0435\u0442\u0440\u043E\u0432\u0441\u043A\u0438\u0439 14', rent: 80000},
    {name: '\u0410\u0440\u0441\u0435\u043D\u0430\u043B\u044C\u043D\u0430\u044F 6', rent: 32562},
    {name: '\u0410\u0440\u0441\u0435\u043D\u0430\u043B\u044C\u043D\u0430\u044F 6 \u0412\u044B\u0432\u0435\u0441\u043A\u0430', rent: 1500},
    {name: '\u0413\u0440\u0430\u0444\u0441\u043A\u0430\u044F 11', rent: 25000},
    {name: '\u0413\u0440\u0430\u0444\u0441\u043A\u0430\u044F 4', rent: 34000},
    {name: '\u0412\u043E\u0440\u043E\u043D\u0446\u043E\u0432\u0441\u043A\u0438\u0439 22', rent: 50000},
    {name: '\u0415\u043A\u0430\u0442\u0435\u0440\u0438\u043D\u0438\u043D\u0441\u043A\u0430\u044F 8', rent: 45000},
    {name: '\u0412\u043E\u0440\u043E\u043D\u0446\u043E\u0432\u0441\u043A\u0438\u0439 20', rent: 30000},
    {name: '\u0415\u043A\u0430\u0442\u0435\u0440\u0438\u043D\u0438\u043D\u0441\u043A\u0430\u044F 17', rent: 41500}
  ];
  var rentTotal = RENTS.reduce(function(s, r) { return s + r.rent; }, 0);
  html += '<div style="margin-top:16px;padding:12px 0 6px;border-top:2px solid #eee;">' +
    '<div style="font-size:14px;font-weight:700;color:#333;margin-bottom:8px;">\uD83C\uDFE0 \u0410\u0440\u0435\u043D\u0434\u0430 \u2014 ' + fmtShort(rentTotal) + '</div>';
  RENTS.forEach(function(r) {
    html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:#FAFAFA;border-radius:8px;margin-bottom:4px;">' +
      '<span style="font-size:13px;color:#555;">' + r.name + '</span>' +
      '<span style="font-size:13px;font-weight:600;">' + fmtShort(r.rent) + '</span></div>';
  });
  html += '</div>';

  // Extra income card
  html += '<div class="pay-card pay-card-income' + (extraReceived ? ' pay-card-done' : '') + '" onclick="toggleExtraIncome()">' +
    '<div class="pay-card-top">' +
      '<div class="pay-card-status">' + (extraReceived ? '&#x2705;' : '&#x2B1C;') + '</div>' +
      '<div class="pay-card-info">' +
        '<div class="pay-card-name' + (extraReceived ? ' pay-card-name-done' : '') + '" style="color:var(--green);">Доход +100К</div>' +
        '<div class="pay-card-date">ежемесячный доход</div>' +
      '</div>' +
      '<div class="pay-card-amount" style="color:var(--green);' + (extraReceived ? 'opacity:0.4;' : '') + '">+' + fmtShort(EXTRA_INCOME) + '</div>' +
    '</div>' +
  '</div>';

  // Net balance
  html += '<div class="pay-net">' +
    '<span>Баланс платежей:</span>' +
    '<span class="' + ((extraReceived ? EXTRA_INCOME - totalUnpaid : -totalUnpaid) >= 0 ? 'pay-net-pos' : 'pay-net-neg') + '">' +
      (extraReceived ? fmtShort(EXTRA_INCOME) + ' &minus; ' + fmtShort(totalUnpaid) + ' = ' : '') +
      fmtShort(extraReceived ? EXTRA_INCOME - totalUnpaid : -totalUnpaid) +
    '</span>' +
  '</div>';

  el.innerHTML = html;
}

// ── HELPERS ──
function getMethodLabel(method) {
  if (method === 'cash') return 'Нал';
  if (method === 'transfer') return 'Безнал';
  if (method === 'card') return 'Карта';
  return '';
}

function payMethodBtn2(idx, method, icon, label, current, toggleFn) {
  var isActive = current === method;
  return '<button class="pay-method-btn' + (isActive ? ' pay-method-active' : '') + '" ' +
    'onclick="event.stopPropagation();' + toggleFn + '(' + idx + ',\'' + method + '\')">' +
    '<span class="pay-method-icon">' + icon + '</span>' +
    '<span class="pay-method-label">' + label + '</span>' +
  '</button>';
}

// Keep old function for backward compat
function payMethodBtn(idx, method, icon, label, current) {
  return payMethodBtn2(idx, method, icon, label, current, 'togglePayment');
}

// ── BACKWARD COMPAT: migrate old credits_paid format ──
function migrateOldPayments() {
  var now = new Date();
  var oldKey = 'dresscode_credits_paid_' + now.getFullYear() + '-' + (now.getMonth() + 1);
  var newKey = getPaymentsKey('dresscode_payments');
  try {
    var oldData = JSON.parse(localStorage.getItem(oldKey) || '{}');
    var newData = getPaymentsData('dresscode_payments');
    var hasNew = Object.keys(newData).length > 0;
    if (!hasNew && Object.keys(oldData).length > 0) {
      var migrated = {};
      Object.keys(oldData).forEach(function(k) {
        if (oldData[k]) migrated[k] = 'transfer';
      });
      savePaymentsData(migrated, 'dresscode_payments');
    }
  } catch(e) {}
}

// ── GET CREDITS PAID TOTAL (used by business.js planner) ──
function getCreditsPaidTotal() {
  if (!state.credits || !state.credits.length) return 0;
  var data = getPaymentsData('dresscode_payments');
  var paid = 0;
  state.credits.forEach(function(cr, i) {
    if (cr.status === 'Заморожен') return;
    if (data[i]) paid += (parseFloat(cr.payment) || 0);
  });
  return paid;
}

// Run migration on load
migrateOldPayments();
