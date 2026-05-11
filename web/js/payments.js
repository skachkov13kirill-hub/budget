// ═══════════════════════════════════════════════════════════════
// PAYMENTS.JS — Вкладка «Оплаты» DressCode Дашборд (FIX-031)
// Входящие (приём субаренды налом) + Исходящие (нал / карта / р/с).
// Источник: state_api на VPS, эндпоинты:
//   GET  /api/atelie/snapshot
//   POST /api/atelie/mark   {section, id, marked}
// ═══════════════════════════════════════════════════════════════

var PAYMENTS_API_BASE = 'http://176.124.208.212:8765';
var PAYMENTS_API_SNAPSHOT = PAYMENTS_API_BASE + '/api/atelie/snapshot';
var PAYMENTS_API_MARK = PAYMENTS_API_BASE + '/api/atelie/mark';
var PAYMENTS_TOKEN = (typeof NEDVIGA_TOKEN !== 'undefined') ? NEDVIGA_TOKEN : '';
var PAYMENTS_CACHE_KEY = 'dresscode_payments_v2';
var PAYMENTS_CACHE_TTL = 5 * 60 * 1000;

var paymentsData = null;
var paymentsLoading = false;

var CHANNEL_LABELS = {
  cash:     { icon: '💵', label: 'Налом'        },
  transfer: { icon: '📲', label: 'Карта (перевод)' },
  rs:       { icon: '💳', label: 'Р/с (Сбер)'   }
};
var CHANNEL_ORDER = ['cash', 'transfer', 'rs'];

var PAYMENTS_MONTH_NAMES = ['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

function loadPayments(force) {
  if (paymentsLoading) return;

  if (!force) {
    try {
      var raw = localStorage.getItem(PAYMENTS_CACHE_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (Date.now() - c.ts < PAYMENTS_CACHE_TTL && c.data) {
          paymentsData = c.data;
          renderPayments();
        }
      }
    } catch (e) {}
  }

  paymentsLoading = true;
  if (!paymentsData) renderPaymentsLoading();

  var url = PAYMENTS_API_SNAPSHOT + '?token=' + encodeURIComponent(PAYMENTS_TOKEN) + '&_t=' + Date.now();
  fetch(url, { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + PAYMENTS_TOKEN } })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      paymentsLoading = false;
      paymentsData = data;
      try { localStorage.setItem(PAYMENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
      renderPayments();
    })
    .catch(function (err) {
      paymentsLoading = false;
      console.warn('payments API failed:', err);
      if (!paymentsData) renderPaymentsError(err);
    });
}

function renderPaymentsLoading() {
  var el = document.getElementById('paymentsContent');
  if (!el) return;
  el.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>Загрузка оплат...</p></div>';
}

function renderPaymentsError(err) {
  var el = document.getElementById('paymentsContent');
  if (!el) return;
  el.innerHTML = '<div class="pay-error">Не удалось загрузить оплаты.<br>' +
    '<button class="ndv-refresh" onclick="loadPayments(true)">Повторить</button></div>';
}

function renderPayments() {
  var el = document.getElementById('paymentsContent');
  if (!el || !paymentsData) return;

  var ym = paymentsData.ym || '';
  var monthLabel = paymentsMonthLabel(ym);

  var incoming = paymentsData.incoming_cash || [];
  var rentals = paymentsData.rentals_outgoing || [];
  var credits = paymentsData.credits || [];
  var outgoing = rentals.concat(credits);

  var html = '';

  // Header
  html += '<div class="pay-header">';
  html += '<div class="pay-title">💳 Оплаты · ' + monthLabel + '</div>';
  var ts = paymentsData.generated_at ? new Date(paymentsData.generated_at) : null;
  var tsLabel = ts ? ('обновлено ' + String(ts.getHours()).padStart(2,'0') + ':' + String(ts.getMinutes()).padStart(2,'0')) : '';
  html += '<button class="ndv-refresh" onclick="loadPayments(true)">' + (tsLabel || 'обновить') + '</button>';
  html += '</div>';

  // ── ВХОДЯЩИЕ ──
  if (incoming.length > 0) {
    var inDone = incoming.filter(function (x) { return x.marked; });
    var inTotal = incoming.reduce(function (s, x) { return s + (x.amount || 0); }, 0);
    var inPaid = inDone.reduce(function (s, x) { return s + (x.amount || 0); }, 0);

    html += '<div class="pay-block pay-block-in">';
    html += '<div class="pay-block-head"><span>🟢 Принять налом (1-го)</span>';
    html += '<span class="pay-block-counter">' + inDone.length + '/' + incoming.length + ' · ' + paymentsFmt(inPaid) + ' / ' + paymentsFmt(inTotal) + '</span>';
    html += '</div>';
    html += '<div class="pay-list">';
    incoming.forEach(function (it) {
      html += renderPaymentRow(it, 'incoming_cash');
    });
    html += '</div></div>';
  }

  // ── ИСХОДЯЩИЕ ──
  if (outgoing.length > 0) {
    var outDone = outgoing.filter(function (x) { return x.marked; });
    var outTotal = outgoing.reduce(function (s, x) { return s + (x.amount || 0); }, 0);
    var outPaid = outDone.reduce(function (s, x) { return s + (x.amount || 0); }, 0);

    html += '<div class="pay-block pay-block-out">';
    html += '<div class="pay-block-head"><span>🔴 Заплатить</span>';
    html += '<span class="pay-block-counter">' + outDone.length + '/' + outgoing.length + ' · ' + paymentsFmt(outPaid) + ' / ' + paymentsFmt(outTotal) + '</span>';
    html += '</div>';

    CHANNEL_ORDER.forEach(function (ch) {
      var rentItems = rentals.filter(function (x) { return x.channel === ch; });
      var credItems = credits.filter(function (x) { return x.channel === ch; });
      var items = rentItems.concat(credItems);
      if (items.length === 0) return;
      var meta = CHANNEL_LABELS[ch] || { icon: '?', label: ch };
      var chDone = items.filter(function (x) { return x.marked; }).length;
      var chTotal = items.reduce(function (s, x) { return s + (x.amount || 0); }, 0);
      var chPaid = items.filter(function (x) { return x.marked; }).reduce(function (s, x) { return s + (x.amount || 0); }, 0);

      html += '<div class="pay-channel">';
      html += '<div class="pay-channel-head">' + meta.icon + ' <b>' + meta.label + '</b>';
      html += ' <span class="pay-channel-counter">' + chDone + '/' + items.length + ' · ' + paymentsFmt(chPaid) + ' / ' + paymentsFmt(chTotal) + '</span>';
      html += '</div>';
      html += '<div class="pay-list">';
      // rentals first, then credits
      rentItems.forEach(function (it) { html += renderPaymentRow(it, 'rentals_outgoing'); });
      credItems.forEach(function (it) { html += renderPaymentRow(it, 'credits'); });
      html += '</div></div>';
    });

    html += '</div>';
  }

  if (incoming.length === 0 && outgoing.length === 0) {
    html += '<div class="pay-empty">Нет активных платежей в atelier.json.</div>';
  }

  el.innerHTML = html;
}

function renderPaymentRow(it, section) {
  var marked = !!it.marked;
  var icon = marked ? '✅' : '⏳';
  var dayLabel = it.day ? (it.day + '-го') : '';
  var safeId = String(it.id).replace(/'/g, "\\'");
  var onclick = 'onclick="paymentsMark(\'' + section + '\',\'' + safeId + '\',' + (marked ? 'false' : 'true') + ')"';
  var html = '<div class="pay-row ' + (marked ? 'pay-row-done' : 'pay-row-wait') + '" ' + onclick + '>';
  html += '<div class="pay-row-icon">' + icon + '</div>';
  html += '<div class="pay-row-main">';
  html += '<div class="pay-row-name">' + escapeHtml(it.name) + '</div>';
  if (dayLabel) html += '<div class="pay-row-meta">' + dayLabel + '</div>';
  html += '</div>';
  html += '<div class="pay-row-amount">' + paymentsFmt(it.amount) + '</div>';
  html += '</div>';
  return html;
}

function paymentsMark(section, id, marked) {
  paymentsApplyMark(section, id, marked);

  fetch(PAYMENTS_API_MARK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + PAYMENTS_TOKEN
    },
    body: JSON.stringify({ section: section, id: id, marked: marked })
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (res) {
      if (!res.ok) throw new Error(res.error || 'mark_failed');
    })
    .catch(function (err) {
      console.warn('payments mark failed:', err);
      paymentsApplyMark(section, id, !marked);
      if (typeof showToast === 'function') showToast('Не удалось сохранить отметку');
    });
}

function paymentsApplyMark(section, id, marked) {
  if (!paymentsData) return;
  var list = paymentsData[section];
  if (!list) return;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i].marked = !!marked;
      list[i].at = marked ? new Date().toISOString() : null;
      try { localStorage.setItem(PAYMENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: paymentsData })); } catch (e) {}
      renderPayments();
      return;
    }
  }
}

function paymentsFmt(num) {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(num) + ' ₽';
}

function paymentsMonthLabel(ym) {
  if (!ym) return '';
  var parts = ym.split('-');
  var m = parseInt(parts[1], 10);
  return PAYMENTS_MONTH_NAMES[m] + ' ' + parts[0];
}
