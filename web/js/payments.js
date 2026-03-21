// ═══════════════════════════════════════════════════════════════
// PAYMENTS.JS — Вкладка "Платежи" DressCode Dashboard
// Чек-лист кредитов с выбором способа оплаты (нал/безнал/карта)
// ═══════════════════════════════════════════════════════════════

var EXTRA_INCOME = 100000;

// ── STORAGE ──
function getPaymentsKey() {
  var now = new Date();
  return 'dresscode_payments_' + now.getFullYear() + '-' + (now.getMonth() + 1);
}

function getPaymentsData() {
  try { return JSON.parse(localStorage.getItem(getPaymentsKey()) || '{}'); } catch(e) { return {}; }
}

function savePaymentsData(data) {
  localStorage.setItem(getPaymentsKey(), JSON.stringify(data));
}

// ── TOGGLE PAYMENT ──
function togglePayment(idx, method) {
  var data = getPaymentsData();
  // If already paid with this method — unpay
  if (data[idx] === method) {
    delete data[idx];
  } else {
    data[idx] = method;
  }
  savePaymentsData(data);
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

  if (!state.credits || !state.credits.length) {
    summaryEl.innerHTML = '';
    el.innerHTML = '<div class="pay-empty"><div style="font-size:40px;margin-bottom:12px;">&#x1F4B3;</div>' +
      '<div style="font-size:14px;font-weight:600;">Нет данных о платежах</div>' +
      '<div style="font-size:12px;color:var(--text-3);margin-top:4px;">Нажмите &#x21bb; для загрузки</div></div>';
    return;
  }

  var paymentsData = getPaymentsData();

  // Build payments list
  var payments = [];
  state.credits.forEach(function(cr, i) {
    if (cr.status === 'Заморожен') return;
    var day = parseInt(cr.paymentDay) || parseInt(cr.paymentDate) || 0;
    if (day === 0) {
      var dm = String(cr.paymentDate || '').match(/(\d{1,2})/);
      if (dm) day = parseInt(dm[1]);
    }
    payments.push({
      idx: i,
      name: cr.name || cr.Кредитор || 'Кредит',
      amount: parseFloat(cr.payment) || 0,
      day: day,
      paidMethod: paymentsData[i] || null,
      isToday: day === today,
      isPast: day > 0 && day < today
    });
  });

  payments.sort(function(a, b) { return a.day - b.day; });

  // Totals
  var totalAll = 0, totalPaid = 0, totalUnpaid = 0;
  var paidCount = 0;
  payments.forEach(function(p) {
    totalAll += p.amount;
    if (p.paidMethod) { totalPaid += p.amount; paidCount++; }
    else { totalUnpaid += p.amount; }
  });

  var extraReceived = isExtraIncomeReceived();
  var pctDone = payments.length > 0 ? Math.round((paidCount / payments.length) * 100) : 0;

  // Summary card
  summaryEl.innerHTML =
    '<div class="pay-summary-card">' +
      '<div class="pay-summary-top">' +
        '<div class="pay-summary-left">' +
          '<div class="pay-summary-label">Всего платежей</div>' +
          '<div class="pay-summary-total">' + fmtShort(totalAll) + '</div>' +
        '</div>' +
        '<div class="pay-summary-right">' +
          '<div class="pay-summary-done">' + paidCount + '/' + payments.length + '</div>' +
          '<div class="pay-summary-pct">' + pctDone + '%</div>' +
        '</div>' +
      '</div>' +
      '<div class="pay-progress-bg"><div class="pay-progress-fg" style="width:' + pctDone + '%"></div></div>' +
      '<div class="pay-summary-row">' +
        '<span style="color:var(--green);">&#x2705; ' + fmtShort(totalPaid) + '</span>' +
        '<span style="color:var(--text-3);">&#x23F3; ' + fmtShort(totalUnpaid) + '</span>' +
      '</div>' +
    '</div>';

  // Payment items
  var html = '';

  // Next upcoming payment alert
  var nextPay = payments.find(function(p) { return !p.paidMethod && !p.isPast; });
  var todayPay = payments.find(function(p) { return p.isToday && !p.paidMethod; });

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

  // Payment cards
  payments.forEach(function(p) {
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
        payMethodBtn(p.idx, 'cash', '&#x1F4B5;', 'Нал', p.paidMethod) +
        payMethodBtn(p.idx, 'transfer', '&#x1F3E6;', 'Безнал', p.paidMethod) +
        payMethodBtn(p.idx, 'card', '&#x1F4B3;', 'Карта', p.paidMethod) +
      '</div>' +
    '</div>';
  });

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
  var netBalance = totalPaid - totalUnpaid + (extraReceived ? EXTRA_INCOME : 0);
  html += '<div class="pay-net">' +
    '<span>Баланс платежей:</span>' +
    '<span class="' + (netBalance >= 0 ? 'pay-net-pos' : 'pay-net-neg') + '">' +
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

function payMethodBtn(idx, method, icon, label, current) {
  var isActive = current === method;
  return '<button class="pay-method-btn' + (isActive ? ' pay-method-active' : '') + '" ' +
    'onclick="event.stopPropagation();togglePayment(' + idx + ',\'' + method + '\')">' +
    '<span class="pay-method-icon">' + icon + '</span>' +
    '<span class="pay-method-label">' + label + '</span>' +
  '</button>';
}

// ── BACKWARD COMPAT: migrate old credits_paid format ──
function migrateOldPayments() {
  var now = new Date();
  var oldKey = 'dresscode_credits_paid_' + now.getFullYear() + '-' + (now.getMonth() + 1);
  var newKey = getPaymentsKey();
  try {
    var oldData = JSON.parse(localStorage.getItem(oldKey) || '{}');
    var newData = getPaymentsData();
    var hasNew = Object.keys(newData).length > 0;
    if (!hasNew && Object.keys(oldData).length > 0) {
      var migrated = {};
      Object.keys(oldData).forEach(function(k) {
        if (oldData[k]) migrated[k] = 'transfer'; // default to bank transfer
      });
      savePaymentsData(migrated);
    }
  } catch(e) {}
}

// ── GET CREDITS PAID TOTAL (used by business.js planner) ──
function getCreditsPaidTotal() {
  if (!state.credits || !state.credits.length) return 0;
  var data = getPaymentsData();
  var paid = 0;
  state.credits.forEach(function(cr, i) {
    if (cr.status === 'Заморожен') return;
    if (data[i]) paid += (parseFloat(cr.payment) || 0);
  });
  return paid;
}

// Run migration on load
migrateOldPayments();
