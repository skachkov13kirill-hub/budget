// ═══════════════════════════════════════════════════════════════
// APP.JS — Ядро DressCode Финансы v4.0
// State, API, Cache, Cloud Sync, Navigation, Utilities
// ═══════════════════════════════════════════════════════════════

// ── CONSTANTS ──
var API_ATELIE = 'https://script.google.com/macros/s/AKfycbwYYk5LU9uTxaPhJkt8X89mXpTlfZaR8dSQcw3SNZtIws1nYRlxy_MAGErMPmO4dY_b1g/exec';
var API_FAMILY = 'https://script.google.com/macros/s/AKfycbzg1ELGJnnS7rKKFchd5y5CieOOPFZ0-KsUtCN5FcRiu_gZUoZSI6k2-kBt2Ur7d6UR/exec';
var CACHE_KEY = 'dresscode_v4_state';
var CACHE_TTL = 5 * 60 * 1000;       // 5 мин для текущего месяца
var CACHE_TTL_OLD = 60 * 60 * 1000;  // 1 час для прошлых месяцев
var FAM_STORAGE_KEY = 'dresscode_family_v4';
var FAM_RULES_KEY = 'dresscode_rules_v4';
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

// Family data — хранится отдельно
var familyData = {
  transactions: [],
  excludedTransactions: [],
  norms: {},
  lastUpdate: null
};

// Rules — три уровня правил
var userCategoryRules = {};
var businessRules = {};
var bucketRules = {};

// ═══════════════════════════════════════════════════════════════
// CACHE — localStorage с TTL
// ═══════════════════════════════════════════════════════════════
function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    if (Date.now() - c.updatedAt > CACHE_TTL) return null;
    return c;
  } catch(e) { return null; }
}

function saveCache(s) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch(e) {}
}

function loadFamilyLocal() {
  try {
    var raw = localStorage.getItem(FAM_STORAGE_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d.transactions) familyData.transactions = d.transactions;
      if (d.excludedTransactions) familyData.excludedTransactions = d.excludedTransactions;
      if (d.norms) familyData.norms = d.norms;
      if (d.lastUpdate) familyData.lastUpdate = d.lastUpdate;
    }
  } catch(e) {}
  try {
    var rules = localStorage.getItem(FAM_RULES_KEY);
    if (rules) {
      var r = JSON.parse(rules);
      if (r.userCategoryRules) userCategoryRules = r.userCategoryRules;
      if (r.businessRules) businessRules = r.businessRules;
      if (r.bucketRules) bucketRules = r.bucketRules;
    }
  } catch(e) {}
}

function saveFamilyLocal() {
  try {
    localStorage.setItem(FAM_STORAGE_KEY, JSON.stringify(familyData));
    localStorage.setItem(FAM_RULES_KEY, JSON.stringify({
      userCategoryRules: userCategoryRules,
      businessRules: businessRules,
      bucketRules: bucketRules
    }));
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// FETCH HELPERS
// ═══════════════════════════════════════════════════════════════
function fetchWithTimeout(url, timeout) {
  timeout = timeout || 15000;
  var controller = new AbortController();
  var id = setTimeout(function() { controller.abort(); }, timeout);
  return fetch(url, { signal: controller.signal }).then(function(r) {
    clearTimeout(id); return r;
  });
}

function fetchJSONP(url, timeout) {
  timeout = timeout || 20000;
  return new Promise(function(resolve, reject) {
    var cbName = 'cb_' + Math.random().toString(36).substr(2, 8) + '_' + Date.now();
    var timer = setTimeout(function() { delete window[cbName]; reject(new Error('JSONP timeout')); }, timeout);
    window[cbName] = function(response) {
      clearTimeout(timer); delete window[cbName];
      resolve(response);
    };
    var script = document.createElement('script');
    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName;
    script.onerror = function() { clearTimeout(timer); delete window[cbName]; reject(new Error('JSONP error')); };
    document.head.appendChild(script);
    script.onload = function() { script.remove(); };
  });
}

// ═══════════════════════════════════════════════════════════════
// CLOUD SYNC — загрузка из Sheets + выгрузка в Sheets
// ═══════════════════════════════════════════════════════════════
function uploadToSheets(type, data) {
  return fetch(API_FAMILY + '?type=' + type, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); })
    .catch(function(e) { console.log('Upload ' + type + ' error:', e); return null; });
}

var _uploadTimer = null;
function uploadAllDataDebounced() {
  if (_uploadTimer) clearTimeout(_uploadTimer);
  _uploadTimer = setTimeout(function() {
    _uploadTimer = null;
    Promise.all([
      uploadToSheets('transactions', familyData.transactions),
      uploadToSheets('excluded', familyData.excludedTransactions),
      uploadToSheets('rules', userCategoryRules),
      uploadToSheets('bizrules', businessRules),
      uploadToSheets('bucketrules', bucketRules)
    ]).then(function() {
      console.log('Cloud sync done');
    });
  }, 2000);
}

function syncFamily() {
  showToast('Синхронизация...');
  Promise.all([
    fetchJSONP(API_FAMILY + '?type=transactions').catch(function() { return { success: false }; }),
    fetchJSONP(API_FAMILY + '?type=excluded').catch(function() { return { success: false }; }),
    fetchJSONP(API_FAMILY + '?type=rules').catch(function() { return { success: false }; }),
    fetchJSONP(API_FAMILY + '?type=bizrules').catch(function() { return { success: false }; }),
    fetchJSONP(API_FAMILY + '?type=bucketrules').catch(function() { return { success: false }; })
  ]).then(function(results) {
    var txResp = results[0];
    var exResp = results[1];
    var rulesResp = results[2];
    var bizResp = results[3];
    var bucketResp = results[4];

    if (txResp && txResp.success && txResp.data) {
      familyData.transactions = mergeTransactions(familyData.transactions, txResp.data);
    }
    if (exResp && exResp.success && exResp.data) {
      familyData.excludedTransactions = mergeTransactions(familyData.excludedTransactions, exResp.data);
    }
    if (rulesResp && rulesResp.success && rulesResp.data) {
      Object.assign(userCategoryRules, rulesResp.data);
    }
    if (bizResp && bizResp.success && bizResp.data) {
      Object.assign(businessRules, bizResp.data);
    }
    if (bucketResp && bucketResp.success && bucketResp.data) {
      Object.assign(bucketRules, bucketResp.data);
    }

    familyData.lastUpdate = new Date().toISOString();
    saveFamilyLocal();
    if (typeof renderFamilyTab === 'function') renderFamilyTab();
    showToast('Синхронизировано');
    uploadAllDataDebounced();
  }).catch(function(err) {
    showToast('Ошибка синхронизации');
    console.error('Sync error:', err);
  });
}

// ═══════════════════════════════════════════════════════════════
// MERGE — облако + локальные данные (облако = приоритет)
// ═══════════════════════════════════════════════════════════════
function getTxKey(tx) {
  var d = String(tx.date || '').substring(0, 10);
  var a = String(tx.amount || 0);
  var desc = String(tx.description || tx.merchant || '').substring(0, 25).toUpperCase();
  return d + '|' + a + '|' + desc;
}

function mergeTransactions(localArr, cloudArr) {
  var map = {};
  (cloudArr || []).forEach(function(tx) { map[getTxKey(tx)] = tx; });
  (localArr || []).forEach(function(tx) {
    var key = getTxKey(tx);
    if (!map[key]) map[key] = tx;
  });
  return Object.values(map);
}

function deduplicateTransactions(arr) {
  var seen = {};
  return (arr || []).filter(function(tx) {
    var key = getTxKey(tx);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════
function refreshAll() {
  var btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  showToast('Обновление...');

  var month = new Date().getMonth() + 1;
  Promise.all([
    fetchWithTimeout(API_ATELIE + '?action=getBranches&month=' + month, 20000).then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetchWithTimeout(API_ATELIE + '?action=getAll', 15000).then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetchJSONP(API_FAMILY + '?type=transactions').catch(function() { return { success: false }; }),
    fetchJSONP(API_FAMILY + '?type=excluded').catch(function() { return { success: false }; })
  ]).then(function(results) {
    var branchResp = results[0];
    var allResp = results[1];
    var txResp = results[2];
    var exResp = results[3];

    if (branchResp && branchResp.success !== false) state.branches = branchResp;
    if (allResp && allResp.success) {
      if (allResp.credits) state.credits = allResp.credits;
      if (allResp.balances) state.balances = allResp.balances;
      if (allResp.settings) state.settings = allResp.settings;
      if (allResp.forecast) state.forecast = allResp.forecast;
    }
    if (txResp && txResp.success && txResp.data) {
      familyData.transactions = mergeTransactions(familyData.transactions, txResp.data);
    }
    if (exResp && exResp.success && exResp.data) {
      familyData.excludedTransactions = mergeTransactions(familyData.excludedTransactions, exResp.data);
    }

    state.updatedAt = Date.now();
    saveCache(state);
    saveFamilyLocal();
    renderAll();
    showLastUpdate();
    btn.classList.remove('spinning');
    showToast('Данные обновлены');
  }).catch(function(err) {
    btn.classList.remove('spinning');
    showToast('Ошибка: ' + err.message);
  });
}

function renderAll() {
  if (typeof renderOverview === 'function') renderOverview();
  if (state.branches) {
    if (typeof renderBizOverview === 'function') renderBizOverview(state.branches);
    if (typeof renderFilials === 'function') renderFilials(state.branches);
  }
  if (typeof renderFamilyTab === 'function') renderFamilyTab();
  // Disable future months in biz selector
  var bizSel = document.getElementById('bizMonthSelect');
  if (bizSel) {
    var cm = new Date().getMonth() + 1;
    bizSel.querySelectorAll('option').forEach(function(o) {
      o.disabled = parseInt(o.value) > cm;
    });
  }
}

function showLastUpdate() {
  if (!state.updatedAt) return;
  var d = new Date(state.updatedAt);
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('updateBadge').textContent = hh + ':' + mm;
  document.getElementById('headerSubtitle').textContent = 'Обновлено ' + hh + ':' + mm;
}

// Branch loading for specific month
function loadBranches(forceRefresh) {
  var sel = document.getElementById('bizMonthSelect');
  var month = parseInt(sel.value);
  var now = new Date();
  var cm = now.getMonth() + 1;

  // Disable future months
  var opts = sel.querySelectorAll('option');
  opts.forEach(function(o) {
    o.disabled = parseInt(o.value) > cm;
  });

  // Check cache
  var cacheKey = 'branches_month_' + month;
  if (!forceRefresh) {
    try {
      var raw = localStorage.getItem(cacheKey);
      if (raw) {
        var c = JSON.parse(raw);
        var ttl = month === cm ? CACHE_TTL : CACHE_TTL_OLD;
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

  fetchWithTimeout(API_ATELIE + '?action=getBranches&month=' + month, 20000)
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
  document.getElementById(id).style.display = 'block';
  document.body.style.overflow = 'hidden';
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
function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
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
// INIT
// ═══════════════════════════════════════════════════════════════
window.onload = function() {
  var now = new Date();
  var sel = document.getElementById('bizMonthSelect');
  if (sel) sel.value = now.getMonth() + 1;

  // 1. Load family local data
  loadFamilyLocal();

  // 2. Show cached state if fresh
  var cached = loadCache();
  if (cached) {
    state = cached;
    renderAll();
    showLastUpdate();
    document.getElementById('headerSubtitle').textContent = 'Из кеша \u00b7 обновление...';
  }

  // 3. Load fresh data from APIs
  refreshAll();

  // 4. Auto-refresh every 5 minutes
  setInterval(function() {
    var cm = new Date().getMonth() + 1;
    var sel = document.getElementById('bizMonthSelect');
    if (sel && parseInt(sel.value) === cm) {
      refreshAll();
    }
  }, CACHE_TTL);

  // 5. Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(e) { console.log('SW:', e); });
  }

  // 6. Family month filter
  if (typeof initFamilyFilters === 'function') initFamilyFilters();
};
