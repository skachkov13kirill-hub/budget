// ═══════════════════════════════════════════════════════════════
// NEDVIGA.JS — Вкладка «Недвига» DressCode Дашборд (FIX-030)
// Read-only снапшот портфеля 9 объектов: оплаты + коммуналка.
// Источник: nedviga_api на VPS (микросервис рядом с tg-watcher).
// ═══════════════════════════════════════════════════════════════

// ── SHIMS для совместимости с business.js после удаления payments.js ──
// EXTRA_INCOME (доход +100К) и isExtraIncomeReceived() остались зашиты в business.js.
// Сохраняем прежнее поведение: значение из старого localStorage-ключа.
var EXTRA_INCOME = 100000;
window.EXTRA_INCOME = EXTRA_INCOME;
function isExtraIncomeReceived() {
  try {
    var now = new Date();
    var key = 'dresscode_extra_income_' + now.getFullYear() + '-' + (now.getMonth() + 1);
    var v = localStorage.getItem(key);
    return v === '1' || v === 'true';
  } catch (e) { return false; }
}
window.isExtraIncomeReceived = isExtraIncomeReceived;


var NEDVIGA_API_BASE = 'https://kirill-bogatyrev.duckdns.org/dresscode-api';
var NEDVIGA_API = NEDVIGA_API_BASE + '/api/nedviga/snapshot';
var NEDVIGA_API_MARK = NEDVIGA_API_BASE + '/api/nedviga/mark';
var NEDVIGA_TOKEN = 'Uob08yTpSBKLhAVAl-KHYaUtWU4mFIlFGyLKZL5b0RY';
var NEDVIGA_CACHE_KEY = 'dresscode_nedviga_v1';
var NEDVIGA_CACHE_TTL = 5 * 60 * 1000;

var nedvigaData = null;
var nedvigaView = 'home';        // 'home' | 'payments' | 'utility'
var nedvigaIsDemo = false;
var nedvigaLoading = false;

// ── MOCK (для preview до деплоя API) ──
var NEDVIGA_MOCK = {
  ym: '2026-05',
  today: 11,
  generated_at: '2026-05-11T12:00:00',
  objects: [
    { address:'Янино',         rent_active:true, rent_day:5,  rent_day_default:5,  rent_day_overridden:false, rent_amount:16000, ku_by_tenant:true,  readings_active:true,  via_uk:false, note:'Имомова сама платит КУ.', payment:{marked:true,  at:'2026-05-05T11:20:00'}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Новогорелово',  rent_active:true, rent_day:10, rent_day_default:10, rent_day_overridden:false, rent_amount:29500, ku_by_tenant:false, readings_active:true,  via_uk:false, note:'', payment:{marked:true,  at:'2026-05-10T09:14:00'}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Пионерский',    rent_active:true, rent_day:12, rent_day_default:5,  rent_day_overridden:true,  rent_amount:33000, ku_by_tenant:false, readings_active:true,  via_uk:false, note:'', payment:{marked:false, at:null},                  reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Энгельса 176',  rent_active:true, rent_day:30, rent_day_default:30, rent_day_overridden:false, rent_amount:52000, ku_by_tenant:false, readings_active:true,  via_uk:false, note:'', payment:{marked:false, at:null},                  reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Энгельса 168',  rent_active:false,rent_day:null,rent_day_default:null,rent_day_overridden:false,rent_amount:null,  ku_by_tenant:false, readings_active:true,  via_uk:false, note:'Заглушка: не сдан.', payment:{marked:false,at:null}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Фридленд',      rent_active:false,rent_day:null,rent_day_default:null,rent_day_overridden:false,rent_amount:null,  ku_by_tenant:false, readings_active:true,  via_uk:true,  note:'', payment:{marked:false,at:null}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Ермака',        rent_active:false,rent_day:null,rent_day_default:null,rent_day_overridden:false,rent_amount:null,  ku_by_tenant:false, readings_active:true,  via_uk:true,  note:'', payment:{marked:false,at:null}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Паркинг 103',   rent_active:false,rent_day:null,rent_day_default:null,rent_day_overridden:false,rent_amount:3000,  ku_by_tenant:false, readings_active:false, via_uk:false, note:'Заглушка: договор не заключён.', payment:{marked:false,at:null}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} },
    { address:'Паркинг 133',   rent_active:false,rent_day:null,rent_day_default:null,rent_day_overridden:false,rent_amount:3000,  ku_by_tenant:false, readings_active:false, via_uk:false, note:'Заглушка: договор не заключён.', payment:{marked:false,at:null}, reading_collected:{marked:false,at:null}, reading_submitted:{marked:false,at:null} }
  ]
};

var NEDVIGA_MONTH_DAYS = {
  '01':31,'02':28,'03':31,'04':30,'05':31,'06':30,
  '07':31,'08':31,'09':30,'10':31,'11':30,'12':31
};
var NEDVIGA_MONTH_NAMES = ['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

// ═══════════════════════════════════════════════════════════════
// LOAD
// ═══════════════════════════════════════════════════════════════
function loadNedviga(force) {
  if (nedvigaLoading) return;
  // Кэш
  if (!force) {
    try {
      var raw = localStorage.getItem(NEDVIGA_CACHE_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (Date.now() - c.ts < NEDVIGA_CACHE_TTL && c.data) {
          nedvigaData = c.data;
          nedvigaIsDemo = !!c.demo;
          renderNedviga();
        }
      }
    } catch(e) {}
  }

  nedvigaLoading = true;
  if (!nedvigaData) renderNedvigaLoading();

  var url = NEDVIGA_API + '?token=' + encodeURIComponent(NEDVIGA_TOKEN) + '&_t=' + Date.now();
  fetch(url, { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + NEDVIGA_TOKEN } })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      nedvigaLoading = false;
      nedvigaData = data;
      nedvigaIsDemo = false;
      try { localStorage.setItem(NEDVIGA_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data, demo: false })); } catch(e) {}
      renderNedviga();
    })
    .catch(function(err) {
      nedvigaLoading = false;
      console.warn('nedviga API failed, using demo:', err);
      if (!nedvigaData) {
        nedvigaData = NEDVIGA_MOCK;
        nedvigaIsDemo = true;
      }
      renderNedviga();
    });
}

function renderNedvigaIfLoaded() {
  if (nedvigaData) renderNedviga();
}

// ═══════════════════════════════════════════════════════════════
// WRITE — POST /api/nedviga/mark (FIX-031)
// ═══════════════════════════════════════════════════════════════
function nedvigaMark(address, kind, marked) {
  if (nedvigaIsDemo) {
    // В demo-режиме API ещё не задеплоен — просто обновляем UI локально
    nedvigaApplyMark(address, kind, marked);
    return;
  }
  // Optimistic update
  nedvigaApplyMark(address, kind, marked);

  fetch(NEDVIGA_API_MARK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + NEDVIGA_TOKEN
    },
    body: JSON.stringify({ address: address, kind: kind, marked: marked })
  })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(res) {
      if (!res.ok) throw new Error(res.error || 'mark_failed');
      // Успех — кэш уже обновлён через nedvigaApplyMark.
    })
    .catch(function(err) {
      console.warn('nedviga mark failed:', err);
      // Откат: возвращаем как было
      nedvigaApplyMark(address, kind, !marked);
      if (typeof toast === 'function') toast('Не удалось сохранить отметку');
    });
}

function nedvigaApplyMark(address, kind, marked) {
  if (!nedvigaData || !nedvigaData.objects) return;
  for (var i = 0; i < nedvigaData.objects.length; i++) {
    var o = nedvigaData.objects[i];
    if (o.address === address && o[kind]) {
      o[kind].marked = !!marked;
      o[kind].at = marked ? new Date().toISOString() : null;
      try {
        localStorage.setItem(NEDVIGA_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: nedvigaData, demo: nedvigaIsDemo }));
      } catch(e) {}
      renderNedviga();
      return;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function nedvigaGo(view) {
  nedvigaView = view;
  renderNedviga();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ═══════════════════════════════════════════════════════════════
// RENDER — диспетчер
// ═══════════════════════════════════════════════════════════════
function renderNedviga() {
  var el = document.getElementById('nedvigaContent');
  if (!el) return;
  if (!nedvigaData) { renderNedvigaLoading(); return; }
  if (nedvigaView === 'payments') el.innerHTML = renderNedvigaPayments();
  else if (nedvigaView === 'utility') el.innerHTML = renderNedvigaUtility();
  else el.innerHTML = renderNedvigaHome();
}

function renderNedvigaLoading() {
  var el = document.getElementById('nedvigaContent');
  if (!el) return;
  el.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>Загрузка портфеля...</p></div>';
}

// ═══════════════════════════════════════════════════════════════
// HOME — сводка + 2 карты
// ═══════════════════════════════════════════════════════════════
function renderNedvigaHome() {
  // «Активный в этом месяце» = rent_active И есть rent_day (null = пропуск месяца через override).
  var active = nedvigaData.objects.filter(function(o) { return o.rent_active && o.rent_day != null; });
  var todayD = nedvigaData.today;

  var total = 0, paid = 0, paidCount = 0;
  active.forEach(function(o) {
    if (o.rent_amount) total += o.rent_amount;
    if (o.payment.marked) { paid += (o.rent_amount || 0); paidCount++; }
  });
  var remain = total - paid;

  // Ближайший платёж: те, что не оплачены и rent_day >= сегодня (или раньше = просрочка)
  var nextPay = null;
  var sortedByDay = active.slice().sort(function(a,b){ return (a.rent_day||0) - (b.rent_day||0); });
  for (var i = 0; i < sortedByDay.length; i++) {
    var o = sortedByDay[i];
    if (!o.payment.marked) { nextPay = o; break; }
  }

  // КУ объекты: только те где readings_active и не ku_by_tenant
  var kuObjects = nedvigaData.objects.filter(function(o) {
    return o.readings_active && !o.ku_by_tenant && (o.rent_active || o.via_uk);
  });
  var kuSubmitted = kuObjects.filter(function(o) { return o.reading_submitted.marked; }).length;
  var kuTotal = kuObjects.length;

  // День показаний: 15-е. Подача 20-25.
  var kuHint = '';
  if (todayD < 15) kuHint = 'День сбора — 15-го';
  else if (todayD < 20) kuHint = 'Сбор показаний';
  else if (todayD <= 25) kuHint = 'Подача в Госуслуги Дом';
  else kuHint = 'Окно подачи закрыто';

  var monthName = nedvigaMonthLabel(nedvigaData.ym);
  var pct = total > 0 ? Math.round((paid / total) * 100) : 0;

  var html = '';
  html += '<div class="ndv-hero">';
  html +=   '<div class="ndv-hero-month">' + monthName + '</div>';
  html +=   '<div class="ndv-hero-row">';
  html +=     '<div class="ndv-hero-stat"><div class="ndv-hero-stat-label">Получено</div><div class="ndv-hero-stat-value">' + nedvigaFmt(paid) + '</div></div>';
  html +=     '<div class="ndv-hero-stat ndv-hero-stat-mid"><div class="ndv-hero-stat-label">План</div><div class="ndv-hero-stat-value">' + nedvigaFmt(total) + '</div></div>';
  html +=     '<div class="ndv-hero-stat"><div class="ndv-hero-stat-label">Остаток</div><div class="ndv-hero-stat-value ndv-hero-remain">' + nedvigaFmt(remain) + '</div></div>';
  html +=   '</div>';
  html +=   '<div class="ndv-hero-progress-bg"><div class="ndv-hero-progress-fg" style="width:' + pct + '%"></div></div>';
  if (nextPay) {
    var dayLabel = nextPay.rent_day;
    var rel = nedvigaRelDay(nextPay.rent_day, todayD, nedvigaData.ym);
    html += '<div class="ndv-hero-next">Ближайший: <b>' + escapeHtml(nextPay.address) + '</b> · ' + dayLabel + ' · ' + nedvigaFmt(nextPay.rent_amount) + ' <span class="ndv-rel">' + rel + '</span></div>';
  } else {
    html += '<div class="ndv-hero-next ndv-hero-done">Все оплаты месяца отмечены ✅</div>';
  }
  html += '</div>';

  // 2 тайла
  html += '<div class="ndv-tiles">';
  html +=   '<button class="ndv-tile ndv-tile-pay" onclick="nedvigaGo(\'payments\')">';
  html +=     '<div class="ndv-tile-icon">💸</div>';
  html +=     '<div class="ndv-tile-title">Оплаты</div>';
  html +=     '<div class="ndv-tile-sub">' + paidCount + ' из ' + active.length + ' в этом месяце</div>';
  html +=     '<div class="ndv-tile-arrow">→</div>';
  html +=   '</button>';
  html +=   '<button class="ndv-tile ndv-tile-ku" onclick="nedvigaGo(\'utility\')">';
  html +=     '<div class="ndv-tile-icon">💧</div>';
  html +=     '<div class="ndv-tile-title">Коммуналка</div>';
  html +=     '<div class="ndv-tile-sub">Подано ' + kuSubmitted + ' из ' + kuTotal + '<br><span class="ndv-tile-hint">' + kuHint + '</span></div>';
  html +=     '<div class="ndv-tile-arrow">→</div>';
  html +=   '</button>';
  html += '</div>';

  // Подпись
  html += nedvigaFooter();
  return html;
}

// ═══════════════════════════════════════════════════════════════
// ОПЛАТЫ — лента + список
// ═══════════════════════════════════════════════════════════════
function renderNedvigaPayments() {
  var active = nedvigaData.objects.filter(function(o) { return o.rent_active && o.rent_day != null; });
  var skippedThisMonth = nedvigaData.objects.filter(function(o) { return o.rent_active && o.rent_day == null; });
  var inactive = nedvigaData.objects.filter(function(o) { return !o.rent_active; });
  var todayD = nedvigaData.today;
  var ym = nedvigaData.ym;
  var monthKey = ym.split('-')[1];
  var daysInMonth = nedvigaDaysInMonth(ym);

  var html = nedvigaHeader('💸 Оплаты · ' + nedvigaMonthLabel(ym));

  // ── Таймлайн ──
  html += '<div class="ndv-timeline-wrap"><div class="ndv-timeline">';
  for (var d = 1; d <= daysInMonth; d++) {
    var marker = '';
    var isToday = (d === todayD);
    active.forEach(function(o) {
      if (o.rent_day === d) {
        marker = o.payment.marked ? 'paid' : (d < todayD ? 'overdue' : (d === todayD ? 'today' : 'wait'));
      }
    });
    var cls = 'ndv-timeline-day';
    if (isToday) cls += ' ndv-timeline-today';
    if (marker) cls += ' ndv-timeline-' + marker;
    html += '<div class="' + cls + '"><div class="ndv-timeline-num">' + d + '</div>';
    html += '<div class="ndv-timeline-dot">' + (marker ? '●' : '') + '</div></div>';
  }
  html += '</div></div>';
  html += '<div class="ndv-legend"><span class="ndv-leg ndv-leg-paid">●</span> оплачено · <span class="ndv-leg ndv-leg-today">●</span> сегодня · <span class="ndv-leg ndv-leg-overdue">●</span> просрочка · <span class="ndv-leg ndv-leg-wait">●</span> ждёт</div>';

  // ── Список активных ──
  // Сортировка: сначала просроченные, потом сегодня, потом ждущие, потом оплаченные
  var sorted = active.slice().sort(function(a,b) {
    var pa = nedvigaPayPriority(a, todayD);
    var pb = nedvigaPayPriority(b, todayD);
    if (pa !== pb) return pa - pb;
    return (a.rent_day || 0) - (b.rent_day || 0);
  });
  html += '<div class="ndv-section-title">Активные (' + active.length + ')</div>';
  html += '<div class="ndv-list">';
  sorted.forEach(function(o) {
    html += renderNedvigaPayRow(o, todayD);
  });
  html += '</div>';

  // ── Пропуск месяца (rent_active, но rent_day=null через override) ──
  if (skippedThisMonth.length > 0) {
    html += '<details class="ndv-collapse">';
    html +=   '<summary>Пропуск месяца (' + skippedThisMonth.length + ')</summary>';
    html +=   '<div class="ndv-list ndv-list-muted">';
    skippedThisMonth.forEach(function(o) {
      html += '<div class="ndv-row ndv-row-muted">';
      html +=   '<div class="ndv-row-status">⏭️</div>';
      html +=   '<div class="ndv-row-main"><div class="ndv-row-addr">' + escapeHtml(o.address) + '</div>';
      html +=   '<div class="ndv-row-meta">оплата на этот месяц снята</div></div>';
      html += '</div>';
    });
    html +=   '</div>';
    html += '</details>';
  }

  // ── Неактивные (свёрнуто) ──
  if (inactive.length > 0) {
    html += '<details class="ndv-collapse">';
    html +=   '<summary>Неактивные (' + inactive.length + ')</summary>';
    html +=   '<div class="ndv-list ndv-list-muted">';
    inactive.forEach(function(o) {
      html += '<div class="ndv-row ndv-row-muted">';
      html +=   '<div class="ndv-row-status">⚪</div>';
      html +=   '<div class="ndv-row-main"><div class="ndv-row-addr">' + escapeHtml(o.address) + '</div>';
      html +=   '<div class="ndv-row-meta">' + escapeHtml(o.note || (o.via_uk ? 'через УК' : 'не сдан')) + '</div></div>';
      html += '</div>';
    });
    html +=   '</div>';
    html += '</details>';
  }

  html += nedvigaFooter();
  return html;
}

function renderNedvigaPayRow(o, todayD) {
  var paid = o.payment.marked;
  var day = o.rent_day;
  var icon, statusCls, statusText;
  if (paid) {
    icon = '✅'; statusCls = 'paid'; statusText = 'оплачено';
  } else if (day && day < todayD) {
    icon = '🔴'; statusCls = 'overdue'; statusText = 'просрочка';
  } else if (day === todayD) {
    icon = '🟡'; statusCls = 'today'; statusText = 'сегодня';
  } else {
    icon = '⏳'; statusCls = 'wait';
    var daysTo = day - todayD;
    statusText = 'через ' + daysTo + ' ' + nedvigaDayWord(daysTo);
  }
  var overrideBadge = o.rent_day_overridden
    ? '<span class="ndv-badge ndv-badge-shift">перенос с ' + o.rent_day_default + '-го</span>'
    : '';
  var ukBadge = o.via_uk ? '<span class="ndv-badge ndv-badge-uk">через УК</span>' : '';

  var safeAddr = escapeHtml(o.address).replace(/'/g, "\\'");
  var onclick = 'onclick="nedvigaMark(\'' + safeAddr + '\',\'payment\',' + (paid ? 'false' : 'true') + ')"';
  var html = '<div class="ndv-row ndv-row-' + statusCls + ' ndv-row-clickable" ' + onclick + '>';
  html +=   '<div class="ndv-row-status">' + icon + '</div>';
  html +=   '<div class="ndv-row-main">';
  html +=     '<div class="ndv-row-addr">' + escapeHtml(o.address) + ' ' + overrideBadge + ukBadge + '</div>';
  html +=     '<div class="ndv-row-meta">' + day + ' ' + nedvigaMonthShort(nedvigaData.ym) + ' · ' + statusText + '</div>';
  html +=   '</div>';
  html +=   '<div class="ndv-row-amount">' + nedvigaFmt(o.rent_amount) + '</div>';
  html += '</div>';
  return html;
}

function nedvigaPayPriority(o, todayD) {
  if (o.payment.marked) return 3;
  if (o.rent_day && o.rent_day < todayD) return 0; // просрочка
  if (o.rent_day === todayD) return 1;             // сегодня
  return 2;                                        // ждёт
}

// ═══════════════════════════════════════════════════════════════
// КОММУНАЛКА — список с галочками
// ═══════════════════════════════════════════════════════════════
function renderNedvigaUtility() {
  var todayD = nedvigaData.today;
  var ym = nedvigaData.ym;

  // Активные — где readings_active и не ku_by_tenant и сдан в аренду (или через УК)
  var ku = nedvigaData.objects.filter(function(o) {
    return o.readings_active && !o.ku_by_tenant && (o.rent_active || o.via_uk);
  });
  // Отдельно: ku_by_tenant (надо только напомнить жильцу)
  var byTenant = nedvigaData.objects.filter(function(o) {
    return o.readings_active && o.ku_by_tenant;
  });
  // И не активные/без показаний
  var skipped = nedvigaData.objects.filter(function(o) {
    return !o.readings_active;
  });

  var html = nedvigaHeader('💧 Коммуналка · ' + nedvigaMonthLabel(ym));

  // Фаза месяца
  var phaseText = '';
  if (todayD < 15) phaseText = 'До 15-го — ждём день сбора';
  else if (todayD < 20) phaseText = 'Сбор показаний с жильцов (после 15-го)';
  else if (todayD <= 25) phaseText = 'Окно подачи в Госуслуги Дом — день ' + (todayD - 19) + '/7';
  else phaseText = 'Окно подачи закрыто';
  html += '<div class="ndv-phase">' + phaseText + '</div>';

  // Шапка таблицы
  html += '<div class="ndv-ku-head"><div></div><div>Адрес</div><div class="ndv-ku-h-cell">Собрал</div><div class="ndv-ku-h-cell">Подал</div></div>';

  html += '<div class="ndv-list">';
  ku.forEach(function(o) {
    var col = o.reading_collected.marked;
    var sub = o.reading_submitted.marked;
    // Цвет строки по фазе
    var rowCls = '';
    if (sub) rowCls = 'ndv-ku-done';
    else if (todayD >= 15 && !col) rowCls = 'ndv-ku-warn';
    else if (todayD > 25 && !sub) rowCls = 'ndv-ku-overdue';

    var ukBadge = o.via_uk ? '<span class="ndv-badge ndv-badge-uk">через УК</span>' : '';
    var safeAddr = escapeHtml(o.address).replace(/'/g, "\\'");
    var colClick = 'onclick="nedvigaMark(\'' + safeAddr + '\',\'reading_collected\',' + (col ? 'false' : 'true') + ')"';
    var subClick = 'onclick="nedvigaMark(\'' + safeAddr + '\',\'reading_submitted\',' + (sub ? 'false' : 'true') + ')"';
    html += '<div class="ndv-ku-row ' + rowCls + '">';
    html +=   '<div class="ndv-ku-num">' + (sub ? '✅' : (col ? '📋' : '○')) + '</div>';
    html +=   '<div class="ndv-row-main"><div class="ndv-row-addr">' + escapeHtml(o.address) + ' ' + ukBadge + '</div></div>';
    html +=   '<div class="ndv-ku-cell ndv-ku-cell-clickable" ' + colClick + '>' + (col ? '☑' : '☐') + '</div>';
    html +=   '<div class="ndv-ku-cell ndv-ku-cell-clickable" ' + subClick + '>' + (sub ? '☑' : '☐') + '</div>';
    html += '</div>';
  });
  html += '</div>';

  if (byTenant.length > 0) {
    html += '<div class="ndv-section-title">Жилец платит сам</div>';
    html += '<div class="ndv-list ndv-list-muted">';
    byTenant.forEach(function(o) {
      html += '<div class="ndv-row ndv-row-muted">';
      html +=   '<div class="ndv-row-status">🤝</div>';
      html +=   '<div class="ndv-row-main"><div class="ndv-row-addr">' + escapeHtml(o.address) + '</div>';
      html +=   '<div class="ndv-row-meta">' + escapeHtml(o.note || 'жилец сам подаёт показания') + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (skipped.length > 0) {
    html += '<details class="ndv-collapse">';
    html +=   '<summary>Без показаний (' + skipped.length + ')</summary>';
    html +=   '<div class="ndv-list ndv-list-muted">';
    skipped.forEach(function(o) {
      html += '<div class="ndv-row ndv-row-muted">';
      html +=   '<div class="ndv-row-status">—</div>';
      html +=   '<div class="ndv-row-main"><div class="ndv-row-addr">' + escapeHtml(o.address) + '</div>';
      html +=   '<div class="ndv-row-meta">' + escapeHtml(o.note || 'паркинг') + '</div></div>';
      html += '</div>';
    });
    html +=   '</div>';
    html += '</details>';
  }

  html += nedvigaFooter();
  return html;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function nedvigaHeader(title) {
  return '<div class="ndv-subheader">' +
    '<button class="ndv-back" onclick="nedvigaGo(\'home\')">‹ Назад</button>' +
    '<div class="ndv-subheader-title">' + escapeHtml(title) + '</div>' +
  '</div>';
}

function nedvigaFooter() {
  var demo = nedvigaIsDemo ? '<span class="ndv-demo-badge">demo-данные · API ещё не задеплоен</span>' : '';
  var ts = nedvigaData && nedvigaData.generated_at ? new Date(nedvigaData.generated_at) : null;
  var tsLabel = ts ? ('обновлено ' + String(ts.getHours()).padStart(2,'0') + ':' + String(ts.getMinutes()).padStart(2,'0')) : '';
  return '<div class="ndv-footer">' + demo + (tsLabel ? '<span>' + tsLabel + '</span>' : '') +
    ' <button class="ndv-refresh" onclick="loadNedviga(true)">обновить</button></div>';
}

function nedvigaFmt(num) {
  if (num === null || num === undefined) return '—';
  if (num === 0) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(num) + ' ₽';
}

function nedvigaMonthLabel(ym) {
  var m = parseInt(ym.split('-')[1], 10);
  var y = ym.split('-')[0];
  return NEDVIGA_MONTH_NAMES[m] + ' ' + y;
}

function nedvigaMonthShort(ym) {
  var m = parseInt(ym.split('-')[1], 10);
  var short = ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return short[m];
}

function nedvigaDaysInMonth(ym) {
  var parts = ym.split('-');
  var y = parseInt(parts[0], 10);
  var m = parts[1];
  if (m === '02') {
    return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
  }
  return NEDVIGA_MONTH_DAYS[m] || 30;
}

function nedvigaRelDay(day, todayD, ym) {
  if (day === todayD) return '· сегодня';
  if (day < todayD) return '· просрочка ' + (todayD - day) + ' ' + nedvigaDayWord(todayD - day);
  var diff = day - todayD;
  return '· через ' + diff + ' ' + nedvigaDayWord(diff);
}

function nedvigaDayWord(n) {
  var n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'день';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'дня';
  return 'дней';
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
  });
}
