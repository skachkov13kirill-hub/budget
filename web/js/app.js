// ═══════════════════════════════════════════════════════════════
// APP.JS — Ядро DressCode Дашборд v5.0
// State, API, Cache, Navigation, Utilities
// ═══════════════════════════════════════════════════════════════

// ── CONSTANTS ──
var API_ATELIE = 'https://script.google.com/macros/s/AKfycbyxgOM1EvajY_4hjomSykrcVbvaKQm5Odun4uj6vT5aEHYF91sju3Zg-AyOzdSb-sWT/exec';
var CACHE_KEY = 'dresscode_v5_state';
var CACHE_TTL = 5 * 60 * 1000;       // 5 мин для текущего месяца
var CACHE_TTL_OLD = 60 * 60 * 1000;  // 1 час для прошлых месяцев
var MONTH_NAMES = ['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
var MONTH_NAMES_CAP = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var MONTH_NAMES_SHORT = ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

// ── STATE ──
var state = {
  branches: null,
  credits: [],
  balances: [],
  settings: {},
  forecast: [],
  updatedAt: 0
};

// Family data stub (business.js references familyData.excludedTransactions for RSC analysis)
var familyData = {
  transactions: [],
  excludedTransactions: []
};

// ═══════════════════════════════════════════════════════════════
// CACHE — localStorage с TTL
// ═══════════════════════════════════════════════════════════════
function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    // Проверяем что кэш для текущего месяца
    var now = new Date();
    if (c.cacheMonth && (c.cacheMonth !== now.getMonth() + 1 || c.cacheYear !== now.getFullYear())) return null;
    if (Date.now() - c.updatedAt > CACHE_TTL) return null;
    return c;
  } catch(e) { return null; }
}

function saveCache(s) {
  try {
    var now = new Date();
    s.cacheMonth = now.getMonth() + 1;
    s.cacheYear = now.getFullYear();
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// FETCH HELPERS
// ═══════════════════════════════════════════════════════════════
function fetchWithTimeout(url, timeout, options) {
  timeout = timeout || 15000;
  options = options || {};
  var controller = new AbortController();
  options.signal = controller.signal;
  var id = setTimeout(function() { controller.abort(); }, timeout);
  return fetch(url, options).then(function(r) {
    clearTimeout(id); return r;
  });
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════
function refreshAll() {
  var btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  showToast('Обновление...');

  var sel = document.getElementById('bizMonthSelect');
  var month = sel ? parseInt(sel.value) : new Date().getMonth() + 1;
  var ySel = document.getElementById('bizYearSelect');
  var year = ySel ? parseInt(ySel.value) : new Date().getFullYear();
  // Сброс dailyChart при обновлении
  if (typeof dailyChartLoaded !== 'undefined') dailyChartLoaded = false;
  // Обновить погоду при refresh
  if (typeof fetchWeather === 'function') fetchWeather();

  Promise.all([
    fetchWithTimeout(API_ATELIE + '?action=getBranches&month=' + month + '&year=' + year, 20000).then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetchWithTimeout(API_ATELIE + '?action=getAll', 15000).then(function(r) { return r.json(); }).catch(function() { return null; })
  ]).then(function(results) {
    var branchResp = results[0];
    var allResp = results[1];

    if (branchResp && branchResp.success !== false) state.branches = branchResp;
    if (allResp && allResp.success) {
      if (allResp.credits) state.credits = allResp.credits;
      if (allResp.balances) state.balances = allResp.balances;
      if (allResp.settings) state.settings = allResp.settings;
      if (allResp.forecast) state.forecast = allResp.forecast;
    }

    state.updatedAt = Date.now();
    saveCache(state);
    renderAll();
    showLastUpdate();
    // Save daily snapshot
    if (state.branches && !bizIsHistorical) {
      saveSnapshot(state.branches, month, year);
    }
    if (typeof bizUpdateDayNav === 'function') bizUpdateDayNav();
    btn.classList.remove('spinning');
    showToast('Данные обновлены');
  }).catch(function(err) {
    btn.classList.remove('spinning');
    showToast('Ошибка: ' + err.message);
  });
}

function renderAll() {
  if (state.branches) {
    if (typeof renderBizOverview === 'function') renderBizOverview(state.branches);
    if (typeof renderFilials === 'function') renderFilials(state.branches);
  }
  if (typeof renderPaymentsTab === 'function') renderPaymentsTab();
  if (typeof renderAgentsTab === 'function') renderAgentsTab();

  // Disable future months in biz selector
  if (typeof bizEnforceDateLimits === 'function') bizEnforceDateLimits();
}

function showLastUpdate() {
  if (!state.updatedAt) return;
  var d = new Date(state.updatedAt);
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('updateBadge').textContent = hh + ':' + mm;
  document.getElementById('headerSubtitle').textContent = 'Обновлено ' + hh + ':' + mm;
}

// Branch loading for specific month + year
function loadBranches(forceRefresh) {
  // Сброс dailyChart при смене месяца
  if (typeof dailyChartLoaded !== 'undefined') dailyChartLoaded = false;
  var sel = document.getElementById('bizMonthSelect');
  var ySel = document.getElementById('bizYearSelect');
  var month = parseInt(sel.value);
  var year = ySel ? parseInt(ySel.value) : new Date().getFullYear();
  var now = new Date();
  var cm = now.getMonth() + 1;
  var cy = now.getFullYear();

  // Disable future months for current year
  if (typeof bizEnforceDateLimits === 'function') bizEnforceDateLimits();

  // Check cache
  var cacheKey = 'branches_' + year + '_' + month;
  var isCurrentMonth = (year === cy && month === cm);
  if (!forceRefresh) {
    try {
      var raw = localStorage.getItem(cacheKey);
      if (raw) {
        var c = JSON.parse(raw);
        var ttl = isCurrentMonth ? CACHE_TTL : CACHE_TTL_OLD;
        if (Date.now() - c.ts < ttl) {
          applyBranchData(c.data, month);
          return;
        }
      }
    } catch(e) {}
  }

  document.getElementById('bizLoading').style.display = '';
  document.getElementById('bizOverviewContent').style.display = 'none';
  document.getElementById('bizError').style.display = 'none';
  document.getElementById('filialsGrid').innerHTML = '';

  fetchWithTimeout(API_ATELIE + '?action=getBranches&month=' + month + '&year=' + year, 20000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: data })); } catch(e) {}
      applyBranchData(data, month);
    })
    .catch(function(err) {
      document.getElementById('bizLoading').style.display = 'none';
      document.getElementById('bizError').style.display = '';
      document.getElementById('bizError').innerHTML = '<div class="error-box">Ошибка загрузки: ' + err.message + '</div>';
    });
}

function applyBranchData(data, month) {
  document.getElementById('bizLoading').style.display = 'none';
  document.getElementById('bizOverviewContent').style.display = '';
  document.getElementById('bizError').style.display = 'none';
  if (typeof renderBizOverview === 'function') renderBizOverview(data);
  if (typeof renderFilials === 'function') renderFilials(data);
  if (typeof renderPaymentsTab === 'function') renderPaymentsTab();
  // Save daily snapshot
  if (!bizIsHistorical) {
    var ySel = document.getElementById('bizYearSelect');
    var year = ySel ? parseInt(ySel.value) : new Date().getFullYear();
    saveSnapshot(data, month, year);
  }
  if (typeof bizUpdateDayNav === 'function') bizUpdateDayNav();
}

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT SYSTEM — daily data saves for history browsing
// ═══════════════════════════════════════════════════════════════
var bizIsHistorical = false;

function saveSnapshot(data, month, year) {
  var now = new Date();
  var key = 'snap_' + year + '_' + month + '_' + now.getDate();
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // Keep max 60 snapshots
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('snap_') === 0) keys.push(k);
    }
    keys.sort();
    while (keys.length > 60) localStorage.removeItem(keys.shift());
  } catch(e) {}
}

function loadSnapshot(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function getSnapshots(month, year) {
  var prefix = 'snap_' + year + '_' + month + '_';
  var snaps = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf(prefix) === 0) {
      var day = parseInt(k.replace(prefix, ''));
      if (!isNaN(day)) snaps.push({ key: k, day: day });
    }
  }
  snaps.sort(function(a, b) { return a.day - b.day; });
  return snaps;
}

// Number of completed days with finalized revenue (excludes today)
function getCompletedDays() {
  return Math.max(1, new Date().getDate() - 1);
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function switchTab(name, btn) {
  document.querySelectorAll('.main-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  else document.getElementById('nav-' + name).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// OVERLAY SYSTEM
// ═══════════════════════════════════════════════════════════════
function getOverlay(id) {
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'overlay-bg';
    el.innerHTML = '<div class="overlay-panel"></div>';
    el.addEventListener('click', function(e) { if (e.target === el) closeOverlay(id); });
    document.body.appendChild(el);
  }
  return el;
}
function showOverlay(id) {
  var el = document.getElementById(id);
  el.style.display = 'block';
  document.body.style.overflow = 'hidden';
  // Ensure X button after content is set
  var panel = el.querySelector('.overlay-panel');
  if (panel) {
    var existing = panel.querySelector('.overlay-close-x');
    if (existing) existing.remove();
    panel.style.position = 'relative';
    var btn = document.createElement('button');
    btn.className = 'overlay-close-x';
    btn.innerHTML = '&times;';
    btn.onclick = function() { closeOverlay(id); };
    panel.insertBefore(btn, panel.firstChild);
  }
}
function closeOverlay(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function fmt(num) {
  if (!num && num !== 0) return '\u2014';
  return new Intl.NumberFormat('ru-RU').format(Math.round(num)) + '\u20BD';
}
function fmtShort(num) {
  if (!num) return '0';
  if (num < 0) return '\u2212' + fmtShort(Math.abs(num));
  if (num >= 1000000) return (num / 1000000).toFixed(1) + '\u041C\u20BD';
  if (num >= 1000) return Math.round(num / 1000) + '\u041A\u20BD';
  return Math.round(num) + '\u20BD';
}
function showToast(msg, callback, btnLabel) {
  var toast = document.getElementById('toast');
  if (callback && btnLabel) {
    toast.innerHTML = '<span>' + msg + '</span> <button class="toast-action-btn" onclick="this.parentElement._cb()">' + btnLabel + '</button>';
    toast._cb = function() { callback(); toast.classList.remove('show'); };
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 5000);
  } else {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 2500);
  }
}
function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    var parts = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (parts) d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
    else return String(dateStr);
  }
  var day = d.getDate();
  var month = d.getMonth() + 1;
  var year = d.getFullYear();
  var thisYear = new Date().getFullYear();
  var result = day + ' ' + MONTH_NAMES_SHORT[month];
  if (year !== thisYear) result += ' ' + year;
  return result;
}
function daysLeftInMonth() {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate();
}
function currentMonthKey() {
  var now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}
function getMonthKey(dateStr) {
  if (!dateStr) return '';
  var parts = String(dateStr).match(/(\d{4})-(\d{2})/);
  if (parts) return parts[1] + '-' + parts[2];
  var ddmm = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (ddmm) return ddmm[3] + '-' + ddmm[2];
  var d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  return '';
}

// ═══════════════════════════════════════════════════════════════
// CACHE MIGRATION — сброс устаревших кешей без plan.clients
// ═══════════════════════════════════════════════════════════════
(function migrateCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      var c = JSON.parse(raw);
      if (c.branches && c.branches.totals && c.branches.totals.plan && !c.branches.totals.plan.clients) {
        localStorage.removeItem(CACHE_KEY);
      }
    }
    // Also clear old branch caches without clients
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf('branches_') === 0) {
        var bc = JSON.parse(localStorage.getItem(k));
        if (bc && bc.data && bc.data.totals && bc.data.totals.plan && !bc.data.totals.plan.clients) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch(e) {}
})();

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
window.onload = function() {
  var now = new Date();
  var sel = document.getElementById('bizMonthSelect');
  if (sel) sel.value = now.getMonth() + 1;
  var ySel = document.getElementById('bizYearSelect');
  if (ySel) ySel.value = now.getFullYear();

  // Show cached state if fresh
  var cached = loadCache();
  if (cached) {
    state = cached;
    renderAll();
    showLastUpdate();
    document.getElementById('headerSubtitle').textContent = 'Из кеша \u00b7 обновление...';
  }

  // Load weather data (non-blocking)
  if (typeof fetchWeather === 'function') fetchWeather();

  // Load fresh data from APIs
  refreshAll();

  // Auto-refresh every 5 minutes
  setInterval(function() {
    var cm = new Date().getMonth() + 1;
    var sel = document.getElementById('bizMonthSelect');
    if (sel && parseInt(sel.value) === cm) {
      refreshAll();
    }
  }, CACHE_TTL);

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(e) { console.log('SW:', e); });
  }
};
