// ═══════════════════════════════════════════════════════════════
// FAMILY-FEATURES.JS — Этап 3: Бюджеты, Ручной ввод, Сплит, Корзина
// DressCode v4.0
// ═══════════════════════════════════════════════════════════════

var BUDGET_KEY = 'dresscode_budgets_v4';
var TRASH_KEY = 'dresscode_trash_v4';

// ═══════════════════════════════════════════════════════════════
// 1. БЮДЖЕТЫ ПО КАТЕГОРИЯМ
// ═══════════════════════════════════════════════════════════════
function loadBudgets() {
  try { var r = localStorage.getItem(BUDGET_KEY); return r ? JSON.parse(r) : {}; }
  catch(e) { return {}; }
}
function saveBudgets(b) {
  try { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)); } catch(e) {}
}

function getBudgetMonthKey() {
  return familyMonthFilter || currentMonthKey();
}

function getCategoryBudget(cat) {
  var budgets = loadBudgets();
  var mk = getBudgetMonthKey();
  if (budgets[mk] && budgets[mk][cat] !== undefined) return budgets[mk][cat];
  return DEFAULT_NORMS[cat] ? DEFAULT_NORMS[cat].monthly_avg : 0;
}

function openBudgetEditor() {
  var overlay = getOverlay('budgetEditorOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  var budgets = loadBudgets();
  var mk = getBudgetMonthKey();
  var mb = budgets[mk] || {};
  var cats = Object.keys(CATEGORY_ICONS).filter(function(c) { return c !== 'Прочее'; });
  var parts = mk.split('-');
  var monthLabel = MONTH_NAMES_CAP[parseInt(parts[1])] + ' ' + parts[0];

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">\uD83C\uDFAF Бюджеты по категориям</div>';
  html += '<div style="font-size:12px;color:var(--text-3);margin-bottom:16px;">Лимиты на ' + monthLabel + '</div>';
  cats.forEach(function(cat) {
    var icon = CATEGORY_ICONS[cat] || '\uD83D\uDCCB';
    var val = mb[cat] !== undefined ? mb[cat] : (DEFAULT_NORMS[cat] ? DEFAULT_NORMS[cat].monthly_avg : 0);
    html += '<div class="budget-edit-row">';
    html += '<span class="budget-edit-label">' + icon + ' ' + cat + '</span>';
    html += '<input type="number" class="budget-edit-input" data-cat="' + cat + '" value="' + Math.round(val) + '" placeholder="0" inputmode="numeric">';
    html += '</div>';
  });
  html += '<button onclick="saveBudgetEditor()" class="fam-btn-upload" style="margin-top:16px;">Сохранить</button>';
  html += '</div><div class="overlay-close" onclick="closeOverlay(\'budgetEditorOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
  showOverlay('budgetEditorOverlay');
}

function saveBudgetEditor() {
  var budgets = loadBudgets();
  var mk = getBudgetMonthKey();
  budgets[mk] = {};
  document.querySelectorAll('.budget-edit-input').forEach(function(inp) {
    var cat = inp.getAttribute('data-cat');
    var val = parseInt(inp.value) || 0;
    if (val > 0) budgets[mk][cat] = val;
  });
  saveBudgets(budgets);
  closeOverlay('budgetEditorOverlay');
  renderFamilyTab();
  showToast('Бюджеты сохранены');
  uploadToSheets('budgets', budgets);
}

// ═══════════════════════════════════════════════════════════════
// 2. РУЧНОЕ ДОБАВЛЕНИЕ ТРАНЗАКЦИЙ (7 типов)
// ═══════════════════════════════════════════════════════════════
var MANUAL_TYPES = [
  { id: 'expense', icon: '\uD83D\uDCB8', name: 'Расход', bucket: 'family' },
  { id: 'income', icon: '\uD83D\uDCB0', name: 'Доход', bucket: 'family' },
  { id: 'transfer', icon: '\uD83D\uDD04', name: 'Перевод', bucket: 'transit' },
  { id: 'debt_out', icon: '\uD83E\uDD1D', name: 'Долг выдан', bucket: 'unassigned' },
  { id: 'debt_return', icon: '\uD83D\uDCB5', name: 'Долг возврат', bucket: 'family' },
  { id: 'cash_expense', icon: '\uD83E\uDE99', name: 'Нал расход', bucket: 'family' },
  { id: 'biz_expense', icon: '\uD83C\uDFE2', name: 'Бизнес расход', bucket: 'business' }
];

function openManualAdd() {
  var overlay = getOverlay('manualAddOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:16px;">\u270F\uFE0F Добавить операцию</div>';
  html += '<div class="manual-type-grid">';
  MANUAL_TYPES.forEach(function(t) {
    html += '<button class="manual-type-btn" onclick="openManualForm(\'' + t.id + '\')">';
    html += '<span style="font-size:22px;">' + t.icon + '</span>';
    html += '<span style="font-size:11px;font-weight:600;">' + t.name + '</span></button>';
  });
  html += '</div></div>';
  html += '<div class="overlay-close" onclick="closeOverlay(\'manualAddOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
  showOverlay('manualAddOverlay');
}

function openManualForm(typeId) {
  var type = MANUAL_TYPES.find(function(t) { return t.id === typeId; });
  if (!type) return;
  var overlay = getOverlay('manualAddOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  var today = new Date().toISOString().split('T')[0];
  var showCat = (typeId === 'expense' || typeId === 'cash_expense');
  var isBiz = (typeId === 'biz_expense');
  var cats = showCat ? Object.keys(CATEGORY_ICONS) :
    (isBiz ? ['Расходные','Подрядчики','Налоги','Реклама','Эквайринг','Коммуналка','Оборудование','Прочее'] : []);

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + type.icon + ' ' + type.name + '</div>';
  html += '<div style="font-size:12px;color:var(--text-3);margin-bottom:16px;">Ручная операция</div>';
  html += '<label class="manual-label">Сумма, \u20BD</label>';
  html += '<input type="number" id="manualAmount" class="manual-input" placeholder="0" inputmode="numeric">';
  html += '<label class="manual-label">Описание</label>';
  html += '<input type="text" id="manualDesc" class="manual-input" placeholder="Описание операции">';
  html += '<label class="manual-label">Дата</label>';
  html += '<input type="date" id="manualDate" class="manual-input" value="' + today + '">';
  html += '<label class="manual-label">Кто</label>';
  html += '<select id="manualOwner" class="manual-input"><option value="Кирилл">Кирилл</option><option value="Алёна">Алёна</option></select>';
  if (showCat || isBiz) {
    html += '<label class="manual-label">Категория</label><select id="manualCategory" class="manual-input">';
    cats.forEach(function(c) {
      html += '<option value="' + c + '">' + (CATEGORY_ICONS[c] || '') + ' ' + c + '</option>';
    });
    html += '</select>';
  }
  html += '<input type="hidden" id="manualTypeId" value="' + typeId + '">';
  html += '<button onclick="submitManualAdd()" class="fam-btn-upload" style="margin-top:16px;">Добавить</button>';
  html += '</div><div class="overlay-close" onclick="closeOverlay(\'manualAddOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
}

function submitManualAdd() {
  var typeId = document.getElementById('manualTypeId').value;
  var type = MANUAL_TYPES.find(function(t) { return t.id === typeId; });
  var amount = parseFloat(document.getElementById('manualAmount').value);
  var desc = document.getElementById('manualDesc').value.trim();
  var date = document.getElementById('manualDate').value;
  var owner = document.getElementById('manualOwner').value;
  var catEl = document.getElementById('manualCategory');
  var category = catEl ? catEl.value : '';

  if (!amount || amount <= 0) { showToast('Введите сумму'); return; }
  if (!desc) { showToast('Введите описание'); return; }

  var tx = {
    date: date, description: desc, merchant: desc.substring(0, 40),
    amount: amount, monthKey: famGetMonthKey(date),
    owner: owner, source: 'manual', manualType: typeId
  };

  if (type.bucket === 'family') {
    tx.category = category || categorize(desc);
    familyData.transactions = familyData.transactions || [];
    familyData.transactions.push(tx);
  } else {
    tx.bucket = type.bucket;
    tx.reason = 'manual_' + typeId;
    if (category) tx.category = category;
    familyData.excludedTransactions = familyData.excludedTransactions || [];
    familyData.excludedTransactions.push(tx);
  }

  saveFamilyLocal();
  closeOverlay('manualAddOverlay');
  renderFamilyTab();
  if (typeof renderOverview === 'function') renderOverview();
  showToast('Операция добавлена');
  uploadAllDataDebounced();
}

// ═══════════════════════════════════════════════════════════════
// 3. SPLIT-ТРАНЗАКЦИИ
// ═══════════════════════════════════════════════════════════════
var _splitOrigTx = null;
var _splitParts = [];

function openSplitOverlay(txIdx) {
  var txs = getFilteredFamilyTx();
  if (txIdx < 0 || txIdx >= txs.length) return;
  _splitOrigTx = txs[txIdx];
  _splitParts = [{ amount: Math.abs(parseFloat(_splitOrigTx.amount) || 0), category: _splitOrigTx.category || 'Прочее' }];
  renderSplitOverlay();
}

function renderSplitOverlay() {
  var overlay = getOverlay('splitOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  var origAmt = Math.abs(parseFloat(_splitOrigTx.amount) || 0);
  var usedAmt = _splitParts.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  var rem = origAmt - usedAmt;
  var cats = Object.keys(CATEGORY_ICONS);

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">\u2702\uFE0F Разделить операцию</div>';
  html += '<div style="font-size:13px;color:var(--text-2);margin-bottom:4px;">' + (_splitOrigTx.merchant || _splitOrigTx.description) + '</div>';
  html += '<div style="font-size:15px;font-weight:800;margin-bottom:16px;">' + fmt(origAmt) + '</div>';

  _splitParts.forEach(function(part, i) {
    html += '<div class="split-part"><div class="split-part-header">Часть ' + (i + 1) + '</div>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += '<input type="number" class="manual-input split-amount" data-idx="' + i + '" value="' + Math.round(part.amount) + '" style="flex:1;" oninput="updateSplitPart(' + i + ')" inputmode="numeric">';
    html += '<select class="manual-input split-cat" data-idx="' + i + '" style="flex:1;" onchange="updateSplitPart(' + i + ')">';
    html += '<option value="__business__"' + (part.category === '__business__' ? ' selected' : '') + '>\uD83C\uDFE2 Бизнес</option>';
    cats.forEach(function(c) {
      html += '<option value="' + c + '"' + (c === part.category ? ' selected' : '') + '>' + (CATEGORY_ICONS[c] || '') + ' ' + c + '</option>';
    });
    html += '</select>';
    if (i > 0) html += '<button onclick="removeSplitPart(' + i + ')" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--red);">\u2715</button>';
    html += '</div></div>';
  });

  html += '<div class="split-remaining" style="color:' + (Math.abs(rem) < 1 ? 'var(--green)' : 'var(--orange)') + ';">';
  html += 'Остаток: ' + fmt(rem) + '</div>';
  html += '<button onclick="addSplitPart()" class="fam-btn" style="width:100%;margin-top:8px;">+ Добавить часть</button>';
  var ok = Math.abs(rem) < 1 && _splitParts.length >= 2;
  html += '<button onclick="submitSplit()" class="fam-btn-upload" style="margin-top:12px;opacity:' + (ok ? '1' : '0.4') + ';"' + (ok ? '' : ' disabled') + '>Разделить</button>';
  html += '</div><div class="overlay-close" onclick="closeOverlay(\'splitOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
  showOverlay('splitOverlay');
}

function updateSplitPart(idx) {
  var a = document.querySelector('.split-amount[data-idx="' + idx + '"]');
  var c = document.querySelector('.split-cat[data-idx="' + idx + '"]');
  if (a) _splitParts[idx].amount = parseFloat(a.value) || 0;
  if (c) _splitParts[idx].category = c.value;
  renderSplitOverlay();
}

function addSplitPart() {
  var origAmt = Math.abs(parseFloat(_splitOrigTx.amount) || 0);
  var used = _splitParts.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  _splitParts.push({ amount: Math.max(0, origAmt - used), category: 'Прочее' });
  renderSplitOverlay();
}

function removeSplitPart(idx) {
  if (_splitParts.length <= 1) return;
  _splitParts.splice(idx, 1);
  renderSplitOverlay();
}

function submitSplit() {
  var origAmt = Math.abs(parseFloat(_splitOrigTx.amount) || 0);
  var used = _splitParts.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  if (Math.abs(origAmt - used) >= 1) { showToast('Сумма частей \u2260 оригиналу'); return; }
  if (_splitParts.length < 2) { showToast('Нужно минимум 2 части'); return; }

  var splitId = 'split_' + Date.now();
  var origKey = famTxKey(_splitOrigTx);
  familyData.transactions = (familyData.transactions || []).filter(function(tx) {
    return famTxKey(tx) !== origKey;
  });

  _splitParts.forEach(function(part) {
    var newTx = {
      date: _splitOrigTx.date, description: _splitOrigTx.description,
      merchant: _splitOrigTx.merchant, amount: part.amount,
      monthKey: _splitOrigTx.monthKey, owner: _splitOrigTx.owner,
      source: _splitOrigTx.source, splitFrom: splitId
    };
    if (part.category === '__business__') {
      newTx.bucket = 'business';
      newTx.reason = 'split_business';
      familyData.excludedTransactions = familyData.excludedTransactions || [];
      familyData.excludedTransactions.push(newTx);
    } else {
      newTx.category = part.category;
      familyData.transactions.push(newTx);
    }
  });

  saveFamilyLocal();
  closeOverlay('splitOverlay');
  renderFamilyTab();
  if (typeof renderOverview === 'function') renderOverview();
  showToast('Разделено на ' + _splitParts.length + ' части');
  uploadAllDataDebounced();
}

// ═══════════════════════════════════════════════════════════════
// 4. КОРЗИНА (мягкое удаление, 30 дней)
// ═══════════════════════════════════════════════════════════════
function loadTrash() {
  try { var r = localStorage.getItem(TRASH_KEY); return r ? JSON.parse(r) : []; }
  catch(e) { return []; }
}
function saveTrash(t) {
  try { localStorage.setItem(TRASH_KEY, JSON.stringify(t)); } catch(e) {}
}

function moveToTrash(txIdx, source) {
  var txs = source === 'excluded' ? getAllFamilyExcluded() : getFilteredFamilyTx();
  if (txIdx < 0 || txIdx >= txs.length) return;
  var tx = txs[txIdx];
  var key = famTxKey(tx);

  if (source === 'excluded') {
    familyData.excludedTransactions = (familyData.excludedTransactions || []).filter(function(t) { return famTxKey(t) !== key; });
  } else {
    familyData.transactions = (familyData.transactions || []).filter(function(t) { return famTxKey(t) !== key; });
  }

  var trash = loadTrash();
  tx.deletedAt = new Date().toISOString();
  tx._source = source || 'transactions';
  trash.push(tx);
  saveTrash(trash);
  saveFamilyLocal();
  renderFamilyTab();
  showToast('В корзину');
  uploadAllDataDebounced();
}

function restoreFromTrash(idx) {
  var trash = loadTrash();
  if (idx < 0 || idx >= trash.length) return;
  var tx = trash[idx];
  var source = tx._source || 'transactions';
  delete tx.deletedAt;
  delete tx._source;

  if (source === 'excluded') {
    familyData.excludedTransactions = familyData.excludedTransactions || [];
    familyData.excludedTransactions.push(tx);
  } else {
    familyData.transactions = familyData.transactions || [];
    familyData.transactions.push(tx);
  }

  trash.splice(idx, 1);
  saveTrash(trash);
  saveFamilyLocal();
  renderTrashOverlay();
  renderFamilyTab();
  showToast('Восстановлено');
  uploadAllDataDebounced();
}

function autoCleanTrash() {
  var trash = loadTrash();
  var now = Date.now();
  var TTL = 30 * 86400000;
  var cleaned = trash.filter(function(tx) { return (now - new Date(tx.deletedAt).getTime()) < TTL; });
  if (cleaned.length !== trash.length) {
    saveTrash(cleaned);
    console.log('Trash: cleaned ' + (trash.length - cleaned.length));
  }
}

function openTrashOverlay() {
  autoCleanTrash();
  renderTrashOverlay();
}

function renderTrashOverlay() {
  var overlay = getOverlay('trashOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  var trash = loadTrash();

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">\uD83D\uDDD1\uFE0F Корзина</div>';
  html += '<div style="font-size:12px;color:var(--text-3);margin-bottom:16px;">' + trash.length + ' операций \u00b7 хранятся 30 дней</div>';

  if (trash.length === 0) {
    html += '<div class="fam-empty">Корзина пуста</div>';
  } else {
    trash.forEach(function(tx, i) {
      var days = Math.floor((Date.now() - new Date(tx.deletedAt).getTime()) / 86400000);
      html += '<div class="fam-tx-row" style="margin-bottom:4px;">';
      html += '<div class="fam-tx-info"><div class="fam-tx-desc">' + (tx.merchant || tx.description || '') + '</div>';
      html += '<div class="fam-tx-meta">' + formatDate(famNormalizeDate(tx.date)) + ' \u00b7 ' + fmtShort(Math.abs(parseFloat(tx.amount)||0)) + ' \u00b7 ' + days + ' дн. назад</div></div>';
      html += '<button onclick="restoreFromTrash(' + i + ')" class="trash-restore-btn">\u21A9\uFE0F</button>';
      html += '</div>';
    });
  }
  html += '</div><div class="overlay-close" onclick="closeOverlay(\'trashOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
  showOverlay('trashOverlay');
}

function updateTrashCount() {
  var el = document.getElementById('trashCount');
  if (!el) return;
  var trash = loadTrash();
  el.textContent = trash.length > 0 ? trash.length : '';
}

// Init: auto-clean trash
try { autoCleanTrash(); } catch(e) {}
