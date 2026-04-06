// ═══════════════════════════════════════════════════════════════
// ЕДИНЫЙ APPS SCRIPT v1.0 — ФИНАНСОВАЯ СИСТЕМА
// Работает с обеими таблицами: "АТЕЛЬЕ 2026" + "Семейный бюджет"
// Роутинг по ?action=
// ═══════════════════════════════════════════════════════════════

// ⚠️ ЗАМЕНИТЬ НА РЕАЛЬНЫЕ ID ТАБЛИЦ
const ATELIE_SPREADSHEET_ID = '1cRdejpUv8gRyNTQVJPw16pp44FqmX6CZUSdUkWcUa40';  // Таблица "АТЕЛЬЕ 2026"
const FAMILY_SPREADSHEET_ID = '13ZsaVLG_GJMWGvzOOyg17H8pss-eQGhu1X8yZ9nAVVg';  // Таблица семейного бюджета

// ═══════════════════════════════════════════════════════════════
// РОУТЕР — ТОЧКА ВХОДА
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const type = (e && e.parameter && e.parameter.type) || '';
  const callback = (e && e.parameter && e.parameter.callback) || '';
  
  try {
    let result;
    
    // ─── NEW FORMAT: ?action=... (unified index.html) ───
    if (action) {
      switch (action) {
        // ─── КОМБИНИРОВАННЫЕ ───
        case 'getAll':        result = handleGetAll(e); break;
        
        // ─── БИЗНЕС (АТЕЛЬЕ 2026) ───
        case 'getBranches':     result = handleGetBranches(e); break;
        case 'getHistory':      result = handleGetHistory(e); break;
        case 'getBranchDaily':  result = handleGetBranchDaily(e); break;
        
        // ─── СЕМЕЙНЫЙ БЮДЖЕТ ───
        case 'getTransactions': result = handleGetTransactions(e); break;
        case 'getExcluded':     result = handleGetExcluded(e); break;
        case 'getRules':        result = handleGetRules(e); break;
        
        // ─── НОВЫЕ ЛИСТЫ (АТЕЛЬЕ 2026) ───
        case 'getCredits':    result = handleGetCredits(); break;
        case 'getSettings':   result = handleGetSettings(); break;
        case 'getBalances':   result = handleGetBalances(); break;
        case 'getForecast':   result = handleGetForecast(); break;

        // ─── ДДС / ЗАДАЧИ (бот v9) ───
        case 'getDDS':        result = handleGetDDS(e); break;
        case 'getTasks':      result = handleGetTasks(e); break;

        default:
          result = { success: false, error: 'Unknown action: ' + action };
      }
    }
    // ─── OLD FORMAT: ?type=... (family_budget v19 JSONP) ───
    else if (type) {
      switch (type) {
        case 'transactions': result = handleGetTransactions(e); break;
        case 'excluded':     result = handleGetExcluded(e); break;
        case 'rules':        result = handleGetFamilyRules(); break;
        case 'bizrules':     result = handleGetBizRules(); break;
        case 'bucketrules':  result = handleGetBucketRules(); break;
        case 'settings':     result = handleGetFamilySettings(); break;
        default:
          result = { success: false, error: 'Unknown type: ' + type };
      }
    }
    // ─── NO PARAMS: return getAll ───
    else {
      result = handleGetAll(e);
    }
    
    // JSONP wrapper for v19 (script tag injection)
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return jsonResponse(result);
    
  } catch (error) {
    const errResult = { success: false, error: error.toString() };
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(errResult) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(errResult);
  }
}

function doPost(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const type = (e && e.parameter && e.parameter.type) || '';
  
  try {
    const data = JSON.parse(e.postData.contents);
    let result;
    
    // ─── NEW FORMAT: ?action=... (unified index.html) ───
    if (action) {
      switch (action) {
        case 'postTransactions': result = handlePostTransactions(data); break;
        case 'postExcluded':     result = handlePostExcluded(data); break;
        case 'postRules':        result = handlePostRules(data); break;
        case 'updateCredit':     result = handleUpdateCredit(data); break;
        case 'updateBalance':    result = handleUpdateBalance(data); break;
        case 'postDDS':          result = handlePostDDS(data); break;
        case 'addTask':          result = handleAddTask(data); break;
        case 'updateSetting':    result = handleUpdateSetting(data); break;
        case 'writeBranchDaily': result = writeBranchDaily(data); break;
        case 'uploadReportPhoto': result = handleUploadReportPhoto(data); break;
        default:
          result = { success: false, error: 'Unknown POST action: ' + action };
      }
    }
    // ─── OLD FORMAT: ?type=... (family_budget v19) ───
    else if (type) {
      switch (type) {
        case 'transactions': result = handlePostTransactions(data); break;
        case 'excluded':     result = handlePostExcluded(data); break;
        case 'rules':        result = handlePostFamilyRules(data); break;
        case 'bizrules':     result = handlePostBizRules(data); break;
        case 'bucketrules':  result = handlePostBucketRules(data); break;
        case 'settings':     result = handlePostFamilySettings(data); break;
        default:
          result = { success: false, error: 'Unknown POST type: ' + type };
      }
    }
    else {
      result = handlePostTransactions(data);
    }
    
    return jsonResponse(result);
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAtelieSheet(name) {
  return SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID).getSheetByName(name);
}

function getFamilySheet(name) {
  return SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

// ═══════════════════════════════════════════════════════════════
// getAll — ЗАГРУЖАЕМ ВСЁ ОДНИМ ЗАПРОСОМ
// ═══════════════════════════════════════════════════════════════

function handleGetAll(e) {
  const result = {
    success: true,
    timestamp: new Date().toISOString()
  };
  
  // Кредиты
  try { result.credits = readCreditsSheet(); } 
  catch(err) { result.credits = []; result.creditsError = err.toString(); }
  
  // Настройки
  try { result.settings = readSettingsSheet(); }
  catch(err) { result.settings = {}; result.settingsError = err.toString(); }
  
  // Балансы
  try { result.balances = readBalancesSheet(); }
  catch(err) { result.balances = []; result.balancesError = err.toString(); }
  
  // Прогноз
  try { result.forecast = readForecastSheet(); }
  catch(err) { result.forecast = []; result.forecastError = err.toString(); }
  
  return result;
}


// ═══════════════════════════════════════════════════════════════
// БИЗНЕС — ФИЛИАЛЫ
// Оптимизировано: читает из листа "Общ" (1 запрос вместо 9)
// Детализация по дням — из отдельного листа филиала по запросу
// ═══════════════════════════════════════════════════════════════

// Определяет код филиала по тексту в ячейке листа "Общ"
function matchBranchCode(text) {
  var t = String(text).toLowerCase().trim();
  if (t.length < 2 || t.length > 25) return null;
  // Порядок проверок важен: сначала более специфичные (Вор 22 до Вор 8)
  if (t.indexOf('менд') >= 0 && t.indexOf('16') >= 0) return 'М16';
  if (t.indexOf('пет') >= 0 && t.indexOf('14') >= 0) return 'П14';
  if (t.indexOf('арс') >= 0 && t.indexOf('6') >= 0) return 'А6';
  if (t.indexOf('граф') >= 0 && t.indexOf('11') >= 0) return 'Г11';
  if (t.indexOf('граф') >= 0 && t.indexOf('4') >= 0) return 'Г4';
  if (t.indexOf('вор') >= 0 && t.indexOf('22') >= 0) return 'В22';
  if (t.indexOf('вор') >= 0 && t.indexOf('20') >= 0) return 'В20';
  if (t.indexOf('вор') >= 0 && t.indexOf('8') >= 0) return 'В8';
  if (t.indexOf('ек') >= 0 && t.indexOf('17') >= 0) return 'Е17';
  if (t.indexOf('ек') >= 0 && t.indexOf('8') >= 0) return 'Е8';
  if (t === 'общ' || t === 'общий' || t === 'итого' || t === 'всего') return '_OVERALL';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Чтение планов из Google Sheets (если листы существуют)
// ═══════════════════════════════════════════════════════════════

/**
 * Читает лист "ПЛАН" — суммарные планы по месяцам (ателье + химчистка)
 * Формат листа:
 *   A1: Месяц | B1: Ателье | C1: Химчистка
 *   A2: 1     | B2: 1592613| C2: 174357
 *   A3: 2     | B3: 1608019| C3: 126123
 *   ...
 * @returns {Object|null} — { 1: {atelie, himchistka}, 2: ... } или null если листа нет
 */
function readPlansFromSheet(ss) {
  try {
    var sheet = ss.getSheetByName('ПЛАН');
    if (!sheet) return null;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    var plans = {};
    for (var i = 1; i < data.length; i++) { // пропускаем заголовок
      var m = parseInt(data[i][0]);
      if (m >= 1 && m <= 12) {
        var ate = parseFloat(String(data[i][1]).replace(/\s/g, '')) || 0;
        var hc = parseFloat(String(data[i][2]).replace(/\s/g, '')) || 0;
        plans[m] = { atelie: ate, himchistka: hc };
      }
    }

    // Проверяем что хотя бы 1 месяц заполнен
    var hasData = false;
    for (var k in plans) { if (plans[k].atelie > 0) { hasData = true; break; } }
    return hasData ? plans : null;
  } catch(e) {
    return null;
  }
}

/**
 * Читает лист "ПЛАН ПО ФИЛИАЛАМ" — индивидуальные планы по каждому филиалу
 * Формат листа:
 *   A1: Код  | B1: Месяц | C1: Ателье | D1: Химчистка
 *   A2: М16  | B2: 1     | C2: 180000 | D2: 20000
 *   A3: М16  | B3: 2     | C3: 185000 | D3: 18000
 *   A4: В8   | B4: 1     | C4: 150000 | D4: 15000
 *   ...
 * @returns {Object|null} — { 'М16': { 1: {atelie, himchistka}, 2: ... }, 'В8': ... } или null
 */
function readBranchPlansFromSheet(ss) {
  try {
    var sheet = ss.getSheetByName('ПЛАН ПО ФИЛИАЛАМ');
    if (!sheet) return null;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    var plans = {};
    for (var i = 1; i < data.length; i++) {
      var code = String(data[i][0]).trim();
      var m = parseInt(data[i][1]);
      if (!code || !m || m < 1 || m > 12) continue;

      var ate = parseFloat(String(data[i][2]).replace(/\s/g, '')) || 0;
      var hc = parseFloat(String(data[i][3]).replace(/\s/g, '')) || 0;

      if (!plans[code]) plans[code] = {};
      plans[code][m] = { atelie: ate, himchistka: hc };
    }

    var hasData = false;
    for (var k in plans) { hasData = true; break; }
    return hasData ? plans : null;
  } catch(e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Читает лист "Общ" и возвращает данные всех филиалов за нужный месяц
// Формат Общ: A=метки, B=Январь, C=Февраль, ... M=Декабрь
// Секции: ОБЩ (общие), затем филиалы (Менд 16, Вор 8, ...)
// Каждая секция: Общий 2023/2024/2025/2026, Ателье 2023-2026, Химч, Клиенты, Доход
function readBranchTotalsFromObsh(ss, month) {
  var sheet = ss.getSheetByName('Общ');
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 5) return null;
  
  // Столбец месяца: B(1)=Янв, C(2)=Фев, ..., M(12)=Дек
  var monthCol = month;
  
  var results = {};
  var currentSection = '_OVERALL';
  var emptyResult = function() {
    return { total: 0, atelie: 0, himchistka: 0, clients: 0, profit: 0,
             prevYear: { total: 0, atelie: 0, himchistka: 0 } };
  };
  results['_OVERALL'] = emptyResult();
  
  for (var r = 1; r < data.length; r++) {
    var cellA = String(data[r][0]).trim();
    var cellALower = cellA.toLowerCase();
    
    // Проверяем — это заголовок секции (название филиала)?
    var branchCode = matchBranchCode(cellA);
    if (branchCode && !cellALower.match(/20\d{2}/)) {
      // Это заголовок секции, не строка с данными (без года)
      currentSection = branchCode;
      if (!results[currentSection]) results[currentSection] = emptyResult();
      continue;
    }
    
    // Извлекаем данные за 2026
    if (currentSection && cellALower.indexOf('2026') >= 0) {
      var rawVal = data[r][monthCol];
      var value = 0;
      if (typeof rawVal === 'number') {
        value = rawVal;
      } else {
        value = parseFloat(String(rawVal).replace(/\s/g, '').replace(',', '.')) || 0;
      }
      
      if (cellALower.indexOf('общий') >= 0 || cellALower.indexOf('выручка') >= 0) {
        results[currentSection].total = value;
      } else if (cellALower.indexOf('ателье') >= 0 || cellALower.indexOf('ат ') >= 0) {
        results[currentSection].atelie = value;
      } else if (cellALower.indexOf('хим') >= 0) {
        results[currentSection].himchistka = value;
      } else if (cellALower.indexOf('клиент') >= 0) {
        results[currentSection].clients = value;
      } else if (cellALower.indexOf('доход') >= 0 || cellALower.indexOf('прибыль') >= 0) {
        results[currentSection].profit = value;
      }
    }
    
    // Данные за 2025 для сравнения год-к-году
    if (currentSection && cellALower.indexOf('2025') >= 0) {
      var rawVal25 = data[r][monthCol];
      var value25 = typeof rawVal25 === 'number' ? rawVal25 : 
                    (parseFloat(String(rawVal25).replace(/\s/g, '').replace(',', '.')) || 0);
      
      if (cellALower.indexOf('общий') >= 0) {
        results[currentSection].prevYear.total = value25;
      } else if (cellALower.indexOf('ателье') >= 0) {
        results[currentSection].prevYear.atelie = value25;
      } else if (cellALower.indexOf('хим') >= 0) {
        results[currentSection].prevYear.himchistka = value25;
      }
    }
  }
  
  return results;
}

function handleGetBranches(e) {
  var month = parseInt((e && e.parameter && e.parameter.month) || new Date().getMonth() + 1);
  var detailBranch = (e && e.parameter && e.parameter.branch) || '';
  var ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  var dataWarnings = []; // предупреждения об ошибках данных
  
  var monthNames = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                     'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var shortMonths = ['', 'Янв', 'Фев', 'Март', 'Апр', 'Май', 'Июнь',
                      'Июль', 'Авг', 'Сент', 'Окт', 'Нояб', 'Дек'];
  
  var filialNames = [
    'Менделеева 16', 'Воронцовский 8', 'Петровский 14',
    'Арсенальная 6', 'Графская 4', 'Воронцовский 22',
    'Екатерининский 8', 'Воронцовский 20', 'Екатерининская 17',
    'Графская 11'
  ];
  var shortCodes = ['М16', 'В8', 'П14', 'А6', 'Г4', 'В22', 'Е8', 'В20', 'Е17', 'Г11'];
  // Маппинг код → имя листа (с пробелами)
  var sheetNames = {
    'М16': 'М 16', 'В8': 'В 8', 'П14': 'П 14', 'А6': 'А 6', 'Г4': 'Г 4',
    'В22': 'В 22', 'Е8': 'Е 8', 'В20': 'В 20', 'Е17': 'Е 17', 'Г11': 'Г 11'
  };

  // ──── Читаем аренду из K9 каждого листа филиала ────
  var rentByBranch = {};
  for (var ri = 0; ri < shortCodes.length; ri++) {
    var sn = sheetNames[shortCodes[ri]] || shortCodes[ri];
    try {
      var rentSheet = ss.getSheetByName(sn);
      if (rentSheet) {
        var rentVal = rentSheet.getRange('K9').getValue();
        rentByBranch[shortCodes[ri]] = typeof rentVal === 'number' ? rentVal : (parseFloat(String(rentVal).replace(/\s/g, '')) || 0);
      }
    } catch(e) { rentByBranch[shortCodes[ri]] = 0; }
  }

  // Планы по месяцам — сначала пробуем из листа "ПЛАН", потом fallback на хардкод
  // ═══ Лист "ПЛАН" (создать вручную): ═══
  // Строка 1: заголовки (Месяц | Ателье | Химчистка)
  // Строки 2–13: месяцы 1–12, суммы по всем филиалам
  // Пример: | 1 | 1592613 | 174357 |
  //         | 2 | 1608019 | 126123 |
  //         ...
  // ═══ Лист "ПЛАН ПО ФИЛИАЛАМ" (опционально): ═══
  // Строка 1: заголовки (Код | Месяц | Ателье | Химчистка)
  // Строки: | М16 | 3 | 234370 | 22512 |
  var monthlyPlans = readPlansFromSheet(ss) || {
    1: { atelie: 1592613, himchistka: 174357 },
    2: { atelie: 1608019, himchistka: 126123 },
    3: { atelie: 2343701, himchistka: 225120 },
    4: { atelie: 2334722, himchistka: 253457 },
    5: { atelie: 2413353, himchistka: 197804 },
    6: { atelie: 2419683, himchistka: 147015 },
    7: { atelie: 1966955, himchistka: 116729 },
    8: { atelie: 2167210, himchistka: 152989 },
    9: { atelie: 2145655, himchistka: 176411 },
    10: { atelie: 2223305, himchistka: 269383 },
    11: { atelie: 2302015, himchistka: 246265 },
    12: { atelie: 2304341, himchistka: 217977 }
  };

  // Индивидуальные планы по филиалам (если есть лист "ПЛАН ПО ФИЛИАЛАМ")
  var branchPlans = readBranchPlansFromSheet(ss);
  
  // ──── 1. Быстрое чтение из "Общ" (1 лист вместо 9) ────
  var obshTotals = readBranchTotalsFromObsh(ss, month);
  
  // ──── 2. Собираем массив филиалов ────
  var filials = [];
  var totalFact = { atelie: 0, himchistka: 0, total: 0, clients: 0, profit: 0, rent: 0, revenue: 0 };
  
  for (var i = 0; i < shortCodes.length; i++) {
    var code = shortCodes[i];
    var name = filialNames[i];
    
    var d = obshTotals ? (obshTotals[code] || null) : null;
    
    var factAtelie = d ? d.atelie : 0;
    var factHimchistka = d ? d.himchistka : 0;
    var factClients = d ? d.clients : 0;
    var factTotal = d ? (d.total || (factAtelie + factHimchistka)) : 0;
    var rent = rentByBranch[code] || 0;
    var factProfit = factTotal - rent;
    var avgCheck = factClients > 0 ? Math.round(factAtelie / factClients) : 0;

    // Проверка качества данных (4.3 из роадмапа)
    if (!d && month <= new Date().getMonth() + 1) {
      dataWarnings.push({ code: code, msg: 'Нет данных в листе Общ' });
    } else if (d && factTotal === 0 && factClients === 0 && month <= new Date().getMonth()) {
      dataWarnings.push({ code: code, msg: 'Нулевые данные за прошлый месяц — возможно не заполнено' });
    }
    if (isNaN(factAtelie)) { factAtelie = 0; dataWarnings.push({ code: code, msg: 'Ателье=NaN, подставлен 0' }); }
    if (isNaN(factTotal)) { factTotal = 0; dataWarnings.push({ code: code, msg: 'Итого=NaN, подставлен 0' }); }

    // Индивидуальный план филиала (если есть) или равномерное распределение
    var bp = branchPlans && branchPlans[code] && branchPlans[code][month];
    var planAtelie = bp ? bp.atelie : (monthlyPlans[month] ? monthlyPlans[month].atelie : 0) / shortCodes.length;
    var planHimchistka = bp ? bp.himchistka : (monthlyPlans[month] ? monthlyPlans[month].himchistka : 0) / shortCodes.length;
    var planTotal = planAtelie + planHimchistka;

    var filialObj = {
      name: name,
      code: code,
      fact: {
        atelie: factAtelie,
        himchistka: factHimchistka,
        total: factTotal,
        clients: factClients,
        avgCheck: avgCheck,
        revenue: factTotal,
        rent: rent,
        profit: factProfit
      },
      plan: {
        atelie: Math.round(planAtelie),
        himchistka: Math.round(planHimchistka),
        total: Math.round(planTotal)
      },
      performance: {
        atelie: planAtelie > 0 ? Math.round(factAtelie / planAtelie * 100) : 0,
        himchistka: planHimchistka > 0 ? Math.round(factHimchistka / planHimchistka * 100) : 0,
        total: planTotal > 0 ? Math.round(factTotal / planTotal * 100) : 0
      },
      forecast: calculateForecast(factTotal, planTotal, month),
      prevYear: d ? d.prevYear : null
    };
    
    // ──── 3. Если запрошена детализация (?branch=М16) ────
    if (detailBranch === code) {
      var branchSheet = ss.getSheetByName(sheetNames[code] || code);
      if (branchSheet) {
        var detail = parseBranchSheet(branchSheet, month, monthNames, shortMonths);
        filialObj.dailyData = detail.daily;
        filialObj.fact.expenses = detail.expenses;
        filialObj.fact.salaryAT = detail.salaryAT;
        filialObj.fact.salaryHC = detail.salaryHC;
        filialObj.fact.commission = detail.commission;
        filialObj.fact.rent = detail.rent;
        filialObj.fact.ads = detail.ads;
      }
    }
    
    filials.push(filialObj);
    
    totalFact.atelie += factAtelie;
    totalFact.himchistka += factHimchistka;
    totalFact.total += factTotal;
    totalFact.clients += factClients;
    totalFact.rent += rent;
    totalFact.profit += factProfit;
  }
  
  var totalPlan = monthlyPlans[month] || { atelie: 0, himchistka: 0 };
  totalPlan.total = totalPlan.atelie + totalPlan.himchistka;
  totalFact.avgCheck = totalFact.clients > 0 ? Math.round(totalFact.atelie / totalFact.clients) : 0;
  
  var overallPrev = obshTotals && obshTotals['_OVERALL'] ? obshTotals['_OVERALL'].prevYear : null;
  
  var result = {
    success: true,
    currentMonth: month,
    monthName: monthNames[month],
    filials: filials,
    totals: {
      fact: totalFact,
      plan: totalPlan,
      performance: {
        atelie: totalPlan.atelie > 0 ? Math.round(totalFact.atelie / totalPlan.atelie * 100) : 0,
        himchistka: totalPlan.himchistka > 0 ? Math.round(totalFact.himchistka / totalPlan.himchistka * 100) : 0,
        total: totalPlan.total > 0 ? Math.round(totalFact.total / totalPlan.total * 100) : 0
      },
      prevYear: overallPrev
    },
    planSource: branchPlans ? 'sheets-per-branch' : (readPlansFromSheet(ss) ? 'sheets-total' : 'hardcoded')
  };

  if (dataWarnings.length > 0) {
    result.dataWarnings = dataWarnings;
  }

  return result;
}

// ───────────────────────────────────────────────────────────────
// Парсинг одного листа филиала (для ежедневной детализации)
// ───────────────────────────────────────────────────────────────
// Формат: B=Дата, C=АТ, D=Кл, E=ХЧ (левый блок)
//         Правый блок: Выручка/Ателье/Химчистка/Расходы/ЗП/.../Клиенты/Прибыль × 12 мес
function parseBranchSheet(sheet, month, monthNames, shortMonths) {
  var empty = { revenue: 0, atelie: 0, himchistka: 0, clients: 0, expenses: 0,
                salaryAT: 0, salaryHC: 0, commission: 0, rent: 0, ads: 0, profit: 0, daily: [] };
  if (!sheet) return empty;
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return empty;
  
  var headerRow = data[0];
  
  // ─── 1. Находим ключевые столбцы ───
  var dateCol = -1, monthCol = -1, labelCol = -1;
  
  for (var col = 0; col < headerRow.length; col++) {
    var h = String(headerRow[col]).trim();
    if (h === 'Дата') dateCol = col;
    if (h === shortMonths[month]) monthCol = col;
  }
  
  // Ищем столбец с метками сводной таблицы ("Выручка", "Ателье", ...)
  for (var row = 1; row < Math.min(data.length, 20); row++) {
    for (var col2 = 4; col2 < headerRow.length; col2++) {
      if (String(data[row][col2]).trim() === 'Выручка') {
        labelCol = col2;
        break;
      }
    }
    if (labelCol >= 0) break;
  }
  
  // ─── 2. Читаем сводную таблицу (правый блок) ───
  var summary = { revenue: 0, atelie: 0, himchistka: 0, clients: 0, expenses: 0,
                  salaryAT: 0, salaryHC: 0, commission: 0, rent: 0, ads: 0, profit: 0 };
  
  if (monthCol >= 0 && labelCol >= 0) {
    for (var r = 1; r < Math.min(data.length, 20); r++) {
      var label = String(data[r][labelCol]).trim().toLowerCase();
      var rawV = data[r][monthCol];
      var value = typeof rawV === 'number' ? rawV :
                  (parseFloat(String(rawV).replace(/\s/g, '')) || 0);
      
      if (label === 'выручка') summary.revenue = value;
      else if (label === 'ателье') summary.atelie = value;
      else if (label === 'химчистка') summary.himchistka = value;
      else if (label === 'расходы') summary.expenses = value;
      else if (label.indexOf('зп') >= 0 && label.indexOf('ател') >= 0) summary.salaryAT = value;
      else if (label.indexOf('зп') >= 0 && (label.indexOf('хч') >= 0 || label.indexOf('хим') >= 0)) summary.salaryHC = value;
      else if (label.indexOf('комисс') >= 0) summary.commission = value;
      else if (label === 'аренда') summary.rent = value;
      else if (label === 'реклама') summary.ads = value;
      else if (label === 'клиенты') summary.clients = value;
      else if (label === 'прибыль') summary.profit = value;
    }
  }
  
  // ─── 3. Читаем ежедневные данные (левый блок) ───
  var daily = [];
  var arrowTotals = null;
  
  if (dateCol >= 0) {
    var atCol = dateCol + 1;
    var klCol = dateCol + 2;
    var hcCol = dateCol + 3;
    var inMonth = false;
    
    for (var r2 = 1; r2 < data.length; r2++) {
      var cell = data[r2][dateCol];
      var isDate = cell instanceof Date;
      var cellStr = isDate ? '' : String(cell).trim();
      
      // Обнаружение заголовка месяца
      if (!isDate && cellStr === monthNames[month]) {
        inMonth = true;
        continue;
      }
      
      if (inMonth) {
        // Строка итогов "—>"
        if (!isDate && (cellStr.indexOf('>') >= 0 || cellStr === '→' || cellStr === '—>')) {
          arrowTotals = {
            atelie: parseFloat(data[r2][atCol]) || 0,
            clients: parseInt(data[r2][klCol]) || 0,
            himchistka: parseFloat(data[r2][hcCol]) || 0
          };
          break;
        }
        
        // Следующий месяц — стоп
        if (!isDate && monthNames.indexOf(cellStr) > 0) break;
        
        // Ежедневная запись
        var at = parseFloat(data[r2][atCol]) || 0;
        var kl = parseInt(data[r2][klCol]) || 0;
        var hc = parseFloat(data[r2][hcCol]) || 0;
        
        if (at > 0 || kl > 0 || hc > 0) {
          var dateLabel = '';
          if (isDate) {
            var dd = cell.getDate();
            var mm = cell.getMonth() + 1;
            dateLabel = (dd < 10 ? '0' : '') + dd + '.' + (mm < 10 ? '0' : '') + mm;
          } else {
            dateLabel = cellStr;
          }
          
          daily.push({
            date: dateLabel,
            atelie: at,
            clients: kl,
            himchistka: hc,
            total: at + hc
          });
        }
      }
    }
  }
  
  // ─── 4. Fallback: если сводная пустая ───
  if (summary.atelie === 0 && arrowTotals) {
    summary.atelie = arrowTotals.atelie;
    summary.himchistka = arrowTotals.himchistka;
    summary.clients = arrowTotals.clients;
    summary.revenue = arrowTotals.atelie + arrowTotals.himchistka;
  }
  
  if (summary.atelie === 0 && daily.length > 0) {
    summary.atelie = daily.reduce(function(s, d) { return s + d.atelie; }, 0);
    summary.himchistka = daily.reduce(function(s, d) { return s + d.himchistka; }, 0);
    summary.clients = daily.reduce(function(s, d) { return s + d.clients; }, 0);
    summary.revenue = summary.atelie + summary.himchistka;
  }
  
  summary.daily = daily;
  return summary;
}

// ───────────────────────────────────────────────────────────────
// Прогноз на конец месяца
// ───────────────────────────────────────────────────────────────
function calculateForecast(factTotal, planTotal, month) {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var daysPassed = now.getMonth() + 1 === month ? now.getDate() : (now.getMonth() + 1 > month ? daysInMonth : 0);
  var daysLeft = daysInMonth - daysPassed;
  
  if (daysPassed === 0) return null;
  
  var dailyAvg = factTotal / daysPassed;
  var forecastTotal = Math.round(factTotal + dailyAvg * daysLeft);
  var ratio = planTotal > 0 ? forecastTotal / planTotal : 0;
  
  return {
    total: forecastTotal,
    daysPassed: daysPassed,
    daysLeft: daysLeft,
    probability: ratio >= 0.95 ? 'high' : (ratio >= 0.85 ? 'medium' : 'low')
  };
}

// ═══════════════════════════════════════════════════════════════
// СЕМЕЙНЫЙ БЮДЖЕТ — ТРАНЗАКЦИИ
// ═══════════════════════════════════════════════════════════════

function handleGetTransactions(e) {
  // Поддерживаем оба варианта: лист "Sheet1" (исторический) или "ТРАНЗАКЦИИ"
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ТРАНЗАКЦИИ') || ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  
  const data = sheet.getDataRange().getValues();
  const transactions = data.slice(1).map(row => ({
    date: row[0],
    description: row[1],
    amount: row[2],
    category: row[3],
    merchant: row[4],
    monthKey: row[5],
    addedAt: row[6],
    owner: row[7] || ''
  })).filter(t => t.date && t.amount);
  
  // Возвращаем оба поля для совместимости: data (family.html ожидает) + transactions (legacy)
  return { success: true, data: transactions, transactions: transactions };
}

function handlePostTransactions(data) {
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ТРАНЗАКЦИИ') || ss.getSheetByName('Sheet1') || ss.getSheets()[0];

  // Принимаем и plain array [{},...] и wrapped { transactions: [{},...]  }
  const txArray = Array.isArray(data) ? data : (data.transactions || []);
  if (!txArray || !Array.isArray(txArray) || txArray.length === 0) {
    return { success: false, error: 'No transactions array' };
  }

  // Получаем существующие для проверки дублей
  const existing = sheet.getDataRange().getValues().slice(1);
  const existingKeys = new Set(existing.map(row =>
    `${row[0]}|${row[2]}|${String(row[1]).substring(0,25)}`
  ));

  let added = 0, skipped = 0;

  txArray.forEach(tx => {
    const key = `${tx.date}|${tx.amount}|${String(tx.description || '').substring(0,25)}`;
    
    if (existingKeys.has(key)) {
      skipped++;
      return;
    }
    
    sheet.appendRow([
      tx.date || '',
      tx.description || '',
      tx.amount || 0,
      tx.category || '',
      tx.merchant || '',
      tx.monthKey || '',
      new Date().toISOString(),
      tx.owner || ''  // Новое поле owner
    ]);
    
    existingKeys.add(key);
    added++;
  });
  
  return { success: true, added: added, skipped: skipped };
}

// ═══════════════════════════════════════════════════════════════
// EXCLUDED ТРАНЗАКЦИИ (Фаза 1 — подготовка)
// ═══════════════════════════════════════════════════════════════

function handleGetExcluded(e) {
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('EXCLUDED');
  if (!sheet) return { success: true, data: [], excluded: [] };

  const rawData = sheet.getDataRange().getValues();
  if (rawData.length <= 1) return { success: true, data: [], excluded: [] };

  // Определяем формат по заголовку: новый (10 колонок с bucket/source) или старый (8 колонок)
  const header = rawData[0].map(h => String(h).toLowerCase());
  const isNewFormat = header.includes('bucket');

  const excluded = rawData.slice(1).map(row => {
    if (isNewFormat) {
      // Новый формат: date, description, amount, reason, merchant, monthKey, addedAt, owner, bucket, source
      return {
        date: row[0],
        description: row[1],
        amount: row[2],
        reason: row[3],
        merchant: row[4],
        monthKey: row[5],
        addedAt: row[6],
        owner: row[7] || '',
        bucket: row[8] || 'unassigned',
        source: row[9] || ''
      };
    } else {
      // Старый формат (8 колонок): date, description, amount, reason, merchant, monthKey, addedAt, owner
      return {
        date: row[0],
        description: row[1],
        amount: row[2],
        reason: row[3],
        merchant: row[4],
        monthKey: row[5],
        addedAt: row[6],
        owner: row[7] || '',
        bucket: 'unassigned',
        source: ''
      };
    }
  }).filter(t => t.date && t.amount);

  // Возвращаем оба поля для совместимости: data (family.html ожидает) + excluded (legacy)
  return { success: true, data: excluded, excluded: excluded };
}

function handlePostExcluded(data) {
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('EXCLUDED');

  if (!sheet) {
    sheet = ss.insertSheet('EXCLUDED');
    // Новый формат с bucket и source
    sheet.appendRow(['date', 'description', 'amount', 'reason', 'merchant', 'monthKey', 'addedAt', 'owner', 'bucket', 'source']);
  } else {
    // Проверяем и мигрируем старый формат (добавляем колонки bucket/source если нет)
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase());
    if (!header.includes('bucket')) {
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue('bucket');
      sheet.getRange(1, lastCol + 2).setValue('source');
    }
  }

  // Принимаем и plain array [{},...] и wrapped { excluded: [{},...]  }
  const exArray = Array.isArray(data) ? data : (data.excluded || []);
  if (!exArray || !Array.isArray(exArray) || exArray.length === 0) {
    return { success: false, error: 'No excluded array' };
  }

  const existing = sheet.getDataRange().getValues().slice(1);
  const existingKeys = new Set(existing.map(row =>
    `${row[0]}|${row[2]}|${String(row[1]).substring(0,25)}`
  ));

  let added = 0, skipped = 0;

  exArray.forEach(tx => {
    const key = `${tx.date}|${tx.amount}|${String(tx.description || '').substring(0,25)}`;
    if (existingKeys.has(key)) { skipped++; return; }

    // Пишем все 10 колонок включая bucket и source
    sheet.appendRow([
      tx.date || '', tx.description || '', tx.amount || 0,
      tx.reason || '', tx.merchant || '', tx.monthKey || '',
      new Date().toISOString(), tx.owner || '',
      tx.bucket || 'unassigned', tx.source || ''
    ]);
    existingKeys.add(key);
    added++;
  });

  return { success: true, added: added, skipped: skipped };
}

// ═══════════════════════════════════════════════════════════════
// ПРАВИЛА КАТЕГОРИЗАЦИИ (подготовка к Фазе 2)
// ═══════════════════════════════════════════════════════════════

function handleGetRules(e) {
  const sheet = getAtelieSheet('ПРАВИЛА');
  if (!sheet) return { success: true, rules: [] };
  return { success: true, rules: sheetToObjects(sheet) };
}

function handlePostRules(data) {
  const ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ПРАВИЛА');
  
  if (!sheet) {
    sheet = ss.insertSheet('ПРАВИЛА');
    sheet.appendRow(['pattern', 'bucket', 'category', 'subcategory', 'permanent', 'source', 'addedAt']);
  }
  
  if (!data.rules || !Array.isArray(data.rules)) {
    return { success: false, error: 'No rules array' };
  }
  
  let added = 0;
  data.rules.forEach(rule => {
    sheet.appendRow([
      rule.pattern || '', rule.bucket || 'семья', rule.category || '',
      rule.subcategory || '', rule.permanent || 'Да',
      rule.source || 'Кирилл', new Date().toISOString()
    ]);
    added++;
  });
  
  return { success: true, added: added };
}

// ═══════════════════════════════════════════════════════════════
// СЕМЕЙНЫЙ БЮДЖЕТ — ПРАВИЛА (v19 формат: {merchant: category})
// ═══════════════════════════════════════════════════════════════

function handleGetFamilyRules() {
  const sheet = getFamilySheet('ПРАВИЛА');
  if (!sheet) return { success: true, data: {} };
  
  const data = sheet.getDataRange().getValues();
  const rules = {};
  for (let i = 1; i < data.length; i++) {
    const merchant = String(data[i][0] || '').trim();
    const category = String(data[i][1] || '').trim();
    if (merchant && category) {
      rules[merchant] = category;
    }
  }
  return { success: true, data: rules };
}

function handlePostFamilyRules(data) {
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ПРАВИЛА');
  
  if (!sheet) {
    sheet = ss.insertSheet('ПРАВИЛА');
    sheet.appendRow(['merchant', 'category', 'updatedAt']);
  }
  
  // v19 sends: { "YAKOB-ART": "Здоровье", "IKEA": "Дом", ... }
  // Clear and rewrite all rules
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  const now = new Date().toISOString();
  const entries = Object.entries(data);
  if (entries.length > 0) {
    const rows = entries.map(([merchant, category]) => [merchant, category, now]);
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  
  return { success: true, saved: entries.length };
}

// ═══════════════════════════════════════════════════════════════
// СЕМЕЙНЫЙ БЮДЖЕТ — БИЗНЕС-ПРАВИЛА (recipient → bizCategory)
// ═══════════════════════════════════════════════════════════════

function handleGetBizRules() {
  var sheet = getFamilySheet('БИЗ_ПРАВИЛА');
  if (!sheet) return { success: true, data: {} };
  
  var data = sheet.getDataRange().getValues();
  var rules = {};
  for (var i = 1; i < data.length; i++) {
    var recipient = String(data[i][0] || '').trim();
    var bizCat = String(data[i][1] || '').trim();
    if (recipient && bizCat) {
      rules[recipient] = bizCat;
    }
  }
  return { success: true, data: rules };
}

function handlePostBizRules(data) {
  var ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  var sheet = ss.getSheetByName('БИЗ_ПРАВИЛА');
  
  if (!sheet) {
    sheet = ss.insertSheet('БИЗ_ПРАВИЛА');
    sheet.appendRow(['recipient', 'bizCategory', 'updatedAt']);
  }
  
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  var now = new Date().toISOString();
  var entries = Object.entries(data);
  if (entries.length > 0) {
    var rows = entries.map(function(e) { return [e[0], e[1], now]; });
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  
  return { success: true, saved: entries.length };
}

// ═══════════════════════════════════════════════════════════════
// СЕМЕЙНЫЙ БЮДЖЕТ — ПРАВИЛА ВЁДЕР (Phase 2: bucket rules)
// ═══════════════════════════════════════════════════════════════

function handleGetBucketRules() {
  var sheet = getFamilySheet('ПРАВИЛА_ВЁДЕР');
  if (!sheet) return { success: true, data: {} };
  
  var data = sheet.getDataRange().getValues();
  var rules = {};
  for (var i = 1; i < data.length; i++) {
    var pattern = String(data[i][0] || '').trim();
    var bucket = String(data[i][1] || '').trim();
    if (pattern && bucket) {
      rules[pattern] = bucket;
    }
  }
  return { success: true, data: rules };
}

function handlePostBucketRules(data) {
  var ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  var sheet = ss.getSheetByName('ПРАВИЛА_ВЁДЕР');
  
  if (!sheet) {
    sheet = ss.insertSheet('ПРАВИЛА_ВЁДЕР');
    sheet.appendRow(['pattern', 'bucket', 'updatedAt']);
  }
  
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  var now = new Date().toISOString();
  var entries = Object.entries(data);
  if (entries.length > 0) {
    var rows = entries.map(function(e) { return [e[0], e[1], now]; });
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  
  return { success: true, saved: entries.length };
}

// ═══════════════════════════════════════════════════════════════
// СЕМЕЙНЫЙ БЮДЖЕТ — НАСТРОЙКИ UI (v19 формат: {theme, colorScheme, ...})
// ═══════════════════════════════════════════════════════════════

function handleGetFamilySettings() {
  const sheet = getFamilySheet('НАСТРОЙКИ');
  if (!sheet) return { success: true, data: {} };
  
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    const value = data[i][1];
    if (key) {
      // Try to parse JSON values
      try {
        settings[key] = JSON.parse(value);
      } catch {
        settings[key] = value;
      }
    }
  }
  return { success: true, data: settings };
}

function handlePostFamilySettings(data) {
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('НАСТРОЙКИ');
  
  if (!sheet) {
    sheet = ss.insertSheet('НАСТРОЙКИ');
    sheet.appendRow(['key', 'value', 'updatedAt']);
  }
  
  // v19 sends: { theme: "dark", colorScheme: "purple", updatedAt: "...", ... }
  // Clear and rewrite all settings
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  const now = new Date().toISOString();
  const entries = Object.entries(data);
  if (entries.length > 0) {
    const rows = entries.map(([key, value]) => {
      const v = (typeof value === 'object') ? JSON.stringify(value) : String(value);
      return [key, v, now];
    });
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  
  return { success: true, saved: entries.length };
}

// ═══════════════════════════════════════════════════════════════
// КРЕДИТЫ
// ═══════════════════════════════════════════════════════════════

function readCreditsSheet() {
  const sheet = getAtelieSheet('КРЕДИТЫ');
  if (!sheet) return getDefaultCredits();
  
  const data = sheet.getDataRange().getValues();
  const credits = [];
  
  // Реальный формат листа КРЕДИТЫ (7 столбцов):
  // A: Кредитор | B: Ставка | C: Остаток | D: Последний платёж | E: Дата платежа | F: Статус | G: План закрытия
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[0] || '').trim();
    if (!name || name === 'ИТОГО' || name.startsWith('📌') || name.startsWith('•') || name === '') continue;
    
    const rateRaw = parseFloat(String(row[1]).replace('%', '').replace(',', '.')) || 0;
    const rate = rateRaw > 1 ? rateRaw / 100 : rateRaw; // 27.3 → 0.273 or 0.273 → 0.273
    const balance = parseFloat(row[2]) || 0;
    const payment = parseFloat(row[3]) || 0;
    const paymentDate = String(row[4] || '');
    const status = String(row[5] || 'Активный').trim();
    const closeDate = String(row[6] || '');
    
    // Извлекаем день платежа из даты (DD.MM.YYYY → DD)
    let paymentDay = 0;
    const dateMatch = paymentDate.match(/^(\d{1,2})[./-]/);
    if (dateMatch) paymentDay = parseInt(dateMatch[1]);
    
    credits.push({
      name: name,
      rate: rate,
      balanceInit: balance,
      balanceCurrent: balance,
      payment: payment,
      paymentDay: paymentDay,
      paymentDate: paymentDate,
      closeDate: closeDate,
      status: status,
      priority: i  // порядок в таблице = приоритет
    });
  }
  
  return credits.length > 0 ? credits : getDefaultCredits();
}

function getDefaultCredits() {
  return [
    { name: 'Т-Банк 27.3%', rate: 0.273, balanceInit: 1784581, balanceCurrent: 1784581, payment: 98650, paymentDay: 5, closeDate: 'Авг 2026', priority: 1, status: 'Активный' },
    { name: 'Сбербанк 25.4%', rate: 0.254, balanceInit: 256000, balanceCurrent: 256000, payment: 2309, paymentDay: 10, closeDate: '', priority: 0, status: '⚠️ ЗАМОРОЖЕН' },
    { name: 'К4 Физлицо', rate: 0.25, balanceInit: 397000, balanceCurrent: 397000, payment: 25000, paymentDay: 15, closeDate: 'Сен 2026', priority: 3, status: 'Активный' },
    { name: 'К3 Физлицо', rate: 0.25, balanceInit: 225000, balanceCurrent: 225000, payment: 20000, paymentDay: 0, closeDate: 'Окт 2026', priority: 4, status: 'Активный' },
    { name: 'К2 Физлицо', rate: 0.25, balanceInit: 474000, balanceCurrent: 474000, payment: 20000, paymentDay: 0, closeDate: 'Окт 2026', priority: 5, status: 'Активный' },
    { name: 'К1 Физлицо', rate: 0.20, balanceInit: 681417, balanceCurrent: 681417, payment: 15000, paymentDay: 0, closeDate: 'Ноя 2026', priority: 6, status: 'Активный' },
    { name: 'Сбербанк 19.5%', rate: 0.195, balanceInit: 483375, balanceCurrent: 483375, payment: 32700, paymentDay: 0, closeDate: 'Дек 2026', priority: 7, status: 'Активный' },
    { name: 'Сбербанк папа', rate: 0.1705, balanceInit: 831000, balanceCurrent: 831000, payment: 30300, paymentDay: 0, closeDate: 'Дек 2026', priority: 8, status: 'Активный' },
    { name: 'Абсолют Банк', rate: 0.10, balanceInit: 3346902, balanceCurrent: 3346902, payment: 30250, paymentDay: 0, closeDate: 'Не в 2026', priority: 9, status: 'Активный' },
    { name: 'Драйв Клик', rate: 0.049, balanceInit: 1535172, balanceCurrent: 1535172, payment: 33000, paymentDay: 0, closeDate: 'Не в 2026', priority: 10, status: 'Активный' },
    { name: 'Ипотека', rate: 0.001, balanceInit: 8931119, balanceCurrent: 8931119, payment: 28200, paymentDay: 0, closeDate: 'Не в 2026', priority: 11, status: 'Активный' },
    { name: 'Рассрочка', rate: 0.0, balanceInit: 246800, balanceCurrent: 246800, payment: 61600, paymentDay: 0, closeDate: 'Апр 2026', priority: 12, status: 'Активный' }
  ];
}

function handleGetCredits() {
  return { success: true, credits: readCreditsSheet() };
}

function handleUpdateCredit(data) {
  const sheet = getAtelieSheet('КРЕДИТЫ');
  if (!sheet) return { success: false, error: 'Sheet КРЕДИТЫ not found' };
  
  // Формат: A:Кредитор B:Ставка C:Остаток D:Последний платёж E:Дата платежа F:Статус G:План закрытия
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.name) {
      if (data.balance !== undefined) sheet.getRange(i + 1, 3).setValue(data.balance);       // C: Остаток
      if (data.payment !== undefined) sheet.getRange(i + 1, 4).setValue(data.payment);       // D: Последний платёж
      if (data.paymentDate !== undefined) sheet.getRange(i + 1, 5).setValue(data.paymentDate); // E: Дата платежа
      if (data.status !== undefined) sheet.getRange(i + 1, 6).setValue(data.status);         // F: Статус
      if (data.closeDate !== undefined) sheet.getRange(i + 1, 7).setValue(data.closeDate);   // G: План закрытия
      return { success: true, updated: data.name };
    }
  }
  return { success: false, error: 'Credit not found: ' + data.name };
}

// ═══════════════════════════════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════════════════════════════

function readSettingsSheet() {
  const sheet = getAtelieSheet('НАСТРОЙКИ');
  if (!sheet) return getDefaultSettings();
  
  const data = sheet.getDataRange().getValues();
  const settings = {};
  
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    const value = data[i][1];
    if (key) settings[key] = value;
  }
  
  return Object.keys(settings).length > 0 ? settings : getDefaultSettings();
}

function getDefaultSettings() {
  return {
    'маржа_ателье': 0.5,
    'маржа_химчистка': 0.4,
    'аренда_всего': 396000,
    'кредитная_линия': 100000,
    'досрочка_процент': 0.9,
    'подушка_процент': 0.1,
    'расходы_семья': 300000,
    'порог_крупных': 40000,
    'коммуналка_филиал': 5000,
    'прочие_филиал': 3000,
    'расходники_ателье': 0.01,
    'расходники_химч': 0.5
  };
}

function handleGetSettings() {
  return { success: true, settings: readSettingsSheet() };
}

function handleUpdateSetting(data) {
  const sheet = getAtelieSheet('НАСТРОЙКИ');
  if (!sheet) return { success: false, error: 'Sheet НАСТРОЙКИ not found' };
  
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.key) {
      sheet.getRange(i + 1, 2).setValue(data.value);
      return { success: true, updated: data.key };
    }
  }
  return { success: false, error: 'Setting not found: ' + data.key };
}

// ═══════════════════════════════════════════════════════════════
// БАЛАНСЫ
// ═══════════════════════════════════════════════════════════════

function readBalancesSheet() {
  const sheet = getAtelieSheet('БАЛАНСЫ');
  if (!sheet) return getDefaultBalances();
  
  const data = sheet.getDataRange().getValues();
  const balances = [];
  
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] || '').trim();
    if (!name || name === 'ИТОГО' || name.startsWith('📌') || name.startsWith('•') || name === '') continue;
    
    balances.push({
      account: name,
      bank: String(data[i][1] || ''),
      type: String(data[i][2] || ''),
      balance: parseFloat(data[i][3]) || 0,
      updatedAt: String(data[i][4] || ''),
      comment: String(data[i][5] || '')
    });
  }
  
  return balances.length > 0 ? balances : getDefaultBalances();
}

function getDefaultBalances() {
  return [
    { account: 'Дебетовая Кирилл', bank: 'Сбербанк', type: 'Дебет', balance: 0, updatedAt: '', comment: 'Основная карта' },
    { account: 'Кредитная Кирилл', bank: 'Сбербанк', type: 'Кредит', balance: 0, updatedAt: '', comment: 'Кредитная карта (25.4%)' },
    { account: 'Дебетовая Кирилл', bank: 'Тинькофф', type: 'Дебет', balance: 0, updatedAt: '', comment: 'Для безнала' },
    { account: 'Кредитная Кирилл', bank: 'Тинькофф', type: 'Кредит', balance: 0, updatedAt: '', comment: 'Кредитная линия (27.3%)' },
    { account: 'Дебетовая Алёна', bank: 'Сбербанк', type: 'Дебет', balance: 0, updatedAt: '', comment: 'Карта жены' },
    { account: 'Расчётный счёт', bank: 'Сбербанк', type: 'РСч', balance: 0, updatedAt: '', comment: 'Бизнес-счёт' }
  ];
}

function handleGetBalances() {
  return { success: true, balances: readBalancesSheet() };
}

function handleUpdateBalance(data) {
  const sheet = getAtelieSheet('БАЛАНСЫ');
  if (!sheet) return { success: false, error: 'Sheet БАЛАНСЫ not found' };
  
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]).trim() === data.account) {
      sheet.getRange(i + 1, 4).setValue(data.balance);
      sheet.getRange(i + 1, 5).setValue(new Date().toISOString());
      return { success: true, updated: data.account };
    }
  }
  return { success: false, error: 'Account not found: ' + data.account };
}

// ═══════════════════════════════════════════════════════════════
// ПРОГНОЗ
// ═══════════════════════════════════════════════════════════════

function readForecastSheet() {
  const sheet = getAtelieSheet('ПРОГНОЗ');
  if (!sheet) return getDefaultForecast();
  
  const data = sheet.getDataRange().getValues();
  const forecast = [];
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  
  for (let i = 1; i < data.length; i++) {
    const monthName = String(data[i][0] || '').trim();
    const monthIndex = monthNames.indexOf(monthName);
    if (monthIndex === -1) continue;
    
    forecast.push({
      month: monthIndex + 1,
      monthName: monthName,
      turnoverAtelie: parseFloat(data[i][1]) || 0,
      turnoverHimchistka: parseFloat(data[i][2]) || 0,
      obligations: parseFloat(data[i][3]) || 0,
      earlyPayments: parseFloat(data[i][4]) || 0,
      income: parseFloat(data[i][5]) || 0,
      comment: String(data[i][6] || '')
    });
  }
  
  return forecast.length > 0 ? forecast : getDefaultForecast();
}

function getDefaultForecast() {
  return [
    { month: 1, monthName: 'Январь', turnoverAtelie: 1592613, turnoverHimchistka: 174357, obligations: 402327, earlyPayments: 0, income: 510263, comment: '' },
    { month: 2, monthName: 'Февраль', turnoverAtelie: 1608019, turnoverHimchistka: 126123, obligations: 402327, earlyPayments: 0, income: 488051, comment: '' },
    { month: 3, monthName: 'Март', turnoverAtelie: 2343701, turnoverHimchistka: 225120, obligations: 402327, earlyPayments: 0, income: 916641, comment: '' },
    { month: 4, monthName: 'Апрель', turnoverAtelie: 2334722, turnoverHimchistka: 253457, obligations: 402327, earlyPayments: 293230, income: 928138, comment: 'Рассрочка закрыта' },
    { month: 5, monthName: 'Май', turnoverAtelie: 2413353, turnoverHimchistka: 197804, obligations: 341127, earlyPayments: 359915, income: 941033, comment: 'Т-Банк ↓' },
    { month: 6, monthName: 'Июнь', turnoverAtelie: 2419683, turnoverHimchistka: 147015, obligations: 340727, earlyPayments: 339139, income: 917548, comment: '' },
    { month: 7, monthName: 'Июль', turnoverAtelie: 1966955, turnoverHimchistka: 116729, obligations: 340727, earlyPayments: 120018, income: 674080, comment: 'Низкий сезон' },
    { month: 8, monthName: 'Август', turnoverAtelie: 2167210, turnoverHimchistka: 152989, obligations: 340727, earlyPayments: 228641, income: 794772, comment: 'Т-Банк закрыт' },
    { month: 9, monthName: 'Сентябрь', turnoverAtelie: 2145655, turnoverHimchistka: 176411, obligations: 242065, earlyPayments: 320736, income: 798438, comment: 'К4 закрыт' },
    { month: 10, monthName: 'Октябрь', turnoverAtelie: 2223305, turnoverHimchistka: 269383, obligations: 222598, earlyPayments: 410161, income: 878332, comment: 'К3, К2 закрыты' },
    { month: 11, monthName: 'Ноябрь', turnoverAtelie: 2302015, turnoverHimchistka: 246265, obligations: 178820, earlyPayments: 476512, income: 908278, comment: 'К1 закрыт' },
    { month: 12, monthName: 'Декабрь', turnoverAtelie: 2304341, turnoverHimchistka: 217977, obligations: 169385, earlyPayments: 473950, income: 895996, comment: 'Сбер19.5%, папа закрыты' }
  ];
}

function handleGetForecast() {
  return { success: true, forecast: readForecastSheet() };
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ: СОЗДАНИЕ ЛИСТОВ (запуск вручную один раз)
// ═══════════════════════════════════════════════════════════════

function createNewSheets() {
  const ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  
  // КРЕДИТЫ
  if (!ss.getSheetByName('КРЕДИТЫ')) {
    const s = ss.insertSheet('КРЕДИТЫ');
    s.appendRow(['Кредитор', 'Ставка %', 'Остаток (янв 2026)', 'Остаток ТЕКУЩИЙ', 
                  'Платёж /мес', 'День платежа', 'Банк/счёт оплаты', 'ФИО получателя',
                  'Дата закрытия (план)', 'Приоритет досрочки', 'Паттерн в выписке', 'Статус']);
    
    // Начальные данные
    const credits = getDefaultCredits();
    credits.forEach(c => {
      s.appendRow([c.name, c.rate, c.balanceInit, '', c.payment, c.paymentDay, '', '', c.closeDate, c.priority, '', c.status]);
    });
    s.getRange(1, 1, 1, 12).setFontWeight('bold');
  }
  
  // НАСТРОЙКИ
  if (!ss.getSheetByName('НАСТРОЙКИ')) {
    const s = ss.insertSheet('НАСТРОЙКИ');
    s.appendRow(['Параметр', 'Значение', 'Описание', 'Откуда']);
    const defaults = getDefaultSettings();
    const descriptions = {
      'маржа_ателье': 'Доля мастера (50%)', 'маржа_химчистка': 'Расходники (40%)',
      'аренда_всего': 'Общая аренда /мес', 'кредитная_линия': '+100K в конце мес',
      'досрочка_процент': '90% свободных → досрочка', 'подушка_процент': '10% остаётся',
      'расходы_семья': 'Оценка расходов /мес', 'порог_крупных': 'Суммы > порога → спрашивать',
      'коммуналка_филиал': 'Коммуналка на 1 филиал', 'прочие_филиал': 'Прочие расходы филиала',
      'расходники_ателье': '1% от оборота', 'расходники_химч': '50% от оборота'
    };
    Object.entries(defaults).forEach(([key, val]) => {
      s.appendRow([key, val, descriptions[key] || '', '✅']);
    });
    s.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  
  // БАЛАНСЫ
  if (!ss.getSheetByName('БАЛАНСЫ')) {
    const s = ss.insertSheet('БАЛАНСЫ');
    s.appendRow(['Счёт', 'Банк', 'Тип', 'Остаток ₽', 'Дата обновления', 'Комментарий']);
    const defaults = getDefaultBalances();
    defaults.forEach(b => {
      s.appendRow([b.account, b.bank, b.type, 0, '', b.comment]);
    });
    s.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  
  // ПРОГНОЗ
  if (!ss.getSheetByName('ПРОГНОЗ')) {
    const s = ss.insertSheet('ПРОГНОЗ');
    s.appendRow(['Месяц', 'Оборот ателье план', 'Химчистка план', 'Обязательные платежи', 
                  'Досрочные платежи (план)', 'Доход маржа прогноз', 'Комментарий']);
    const defaults = getDefaultForecast();
    defaults.forEach(f => {
      s.appendRow([f.monthName, f.turnoverAtelie, f.turnoverHimchistka, f.obligations, f.earlyPayments, f.income, f.comment]);
    });
    s.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  
  Logger.log('✅ Все листы АТЕЛЬЕ созданы!');
  
  // ─── СЕМЕЙНЫЙ БЮДЖЕТ: доп. листы ───
  const fss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  
  // ПРАВИЛА (merchant → category для v19)
  if (!fss.getSheetByName('ПРАВИЛА')) {
    const s = fss.insertSheet('ПРАВИЛА');
    s.appendRow(['merchant', 'category', 'updatedAt']);
    s.getRange(1, 1, 1, 3).setFontWeight('bold');
    Logger.log('✅ Лист ПРАВИЛА создан в Семейном бюджете');
  }
  
  // НАСТРОЙКИ UI (тема, цвет, шрифт для v19)
  if (!fss.getSheetByName('НАСТРОЙКИ')) {
    const s = fss.insertSheet('НАСТРОЙКИ');
    s.appendRow(['key', 'value', 'updatedAt']);
    s.getRange(1, 1, 1, 3).setFontWeight('bold');
    Logger.log('✅ Лист НАСТРОЙКИ создан в Семейном бюджете');
  }
  
  Logger.log('✅ Все листы созданы!');
}

// ═══════════════════════════════════════════════════════════════
// ЗАПОЛНИТЬ КРЕДИТЫ (запустить один раз — добавит все 12 кредитов)
// Формат: A:Кредитор | B:Ставка | C:Остаток | D:Последний платёж | E:Дата платежа | F:Статус | G:План закрытия
// ═══════════════════════════════════════════════════════════════
function populateCredits() {
  const sheet = getAtelieSheet('КРЕДИТЫ');
  if (!sheet) {
    Logger.log('❌ Лист КРЕДИТЫ не найден!');
    return;
  }
  
  // Проверяем заголовки
  const headers = sheet.getRange(1, 1, 1, 7).getValues()[0];
  Logger.log('Текущие заголовки: ' + headers.join(' | '));
  
  // Если уже больше 5 строк — значит данные уже были заполнены
  if (sheet.getLastRow() > 5) {
    Logger.log('ℹ️ В листе уже ' + (sheet.getLastRow() - 1) + ' кредитов. Пропускаю.');
    return;
  }
  
  // Все 12 кредитов из Excel-планов
  const credits = [
    ['Т-Банк 27.3%',      '27.3%',  1784581, 98650,  5,  'Активный',       'Август 2026'],
    ['Сбербанк 25.4%',    '25.4%',  256000,  2309,   10, '⚠️ ЗАМОРОЖЕН',   ''],
    ['К4 Физлицо',         '25%',   397000,  25000,  15, 'Активный',       'Сентябрь 2026'],
    ['К3 Физлицо',         '25%',   225000,  20000,  0,  'Активный',       'Октябрь 2026'],
    ['К2 Физлицо',         '25%',   474000,  20000,  0,  'Активный',       'Октябрь 2026'],
    ['К1 Физлицо',         '20%',   681417,  15000,  0,  'Активный',       'Ноябрь 2026'],
    ['Сбербанк 19.5%',    '19.5%',  483375,  32700,  0,  'Активный',       'Декабрь 2026'],
    ['Сбербанк (папа)',    '17.05%', 831000,  30300,  0,  'Активный',       'Декабрь 2026'],
    ['Абсолют Банк 10%',  '10%',    3346902, 30250,  0,  'Активный',       'Не в 2026'],
    ['Драйв Клик 4.9%',   '4.9%',  1535172, 33000,  0,  'Активный',       'Не в 2026'],
    ['Ипотека 0.1%',       '0.1%',  8931119, 28200,  0,  'Активный',       'Не в 2026'],
    ['Рассрочка 0%',       '0%',    246800,  61600,  0,  'Активный',       'Апрель 2026']
  ];
  
  // Очищаем существующие данные (кроме заголовка)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).clearContent();
  }
  
  // Записываем все 12 кредитов
  credits.forEach((row, idx) => {
    sheet.getRange(idx + 2, 1, 1, 7).setValues([row]);
  });
  
  // Форматирование
  sheet.getRange(2, 3, 12, 1).setNumberFormat('#,##0');  // Остаток
  sheet.getRange(2, 4, 12, 1).setNumberFormat('#,##0');  // Платёж
  
  Logger.log('✅ Заполнено ' + credits.length + ' кредитов!');
  Logger.log('📊 Общий долг: ' + credits.reduce((s, c) => s + c[2], 0).toLocaleString() + ' ₽');
}

// Добавить owner в существующий лист транзакций
function migrateAddOwnerColumn() {
  const ss = SpreadsheetApp.openById(FAMILY_SPREADSHEET_ID);
  const sheet = ss.getSheetByName('ТРАНЗАКЦИИ') || ss.getSheetByName('Sheet1') || ss.getSheets()[0];
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hasOwner = headers.some(h => String(h).toLowerCase().includes('owner'));
  
  if (!hasOwner) {
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue('owner');
    Logger.log('✅ Столбец owner добавлен в колонку ' + nextCol);
  } else {
    Logger.log('ℹ️ Столбец owner уже существует');
  }
}


// ============================================================
// writeBranchDaily — запись данных от Telegram-бота филиала
// Версия 11 задеплоена 24 февр. 2026
// POST ?action=writeBranchDaily
// Body: { branch: "М16", date: "2026-02-23", atelie: 32500, clients: 18 }
// ============================================================
function writeBranchDaily(data) {
  var ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(data.branch);

  if (!sheet) {
    return { success: false, error: 'Лист не найден: ' + data.branch };
  }

  var dateParts = String(data.date).split('-');
  if (dateParts.length !== 3) {
    return { success: false, error: 'Неверный формат даты: ' + data.date };
  }
  var targetYear  = parseInt(dateParts[0]);
  var targetMonth = parseInt(dateParts[1]);
  var targetDay   = parseInt(dateParts[2]);

  var monthNames = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
  ];
  var targetMonthName = monthNames[targetMonth - 1];

  var values = sheet.getDataRange().getValues();
  var headerRow = values[0];

  var dateCol = -1;
  for (var col = 0; col < headerRow.length; col++) {
    if (String(headerRow[col]).trim() === 'Дата') {
      dateCol = col;
      break;
    }
  }

  if (dateCol < 0) {
    return { success: false, error: 'Столбец Дата не найден в листе ' + data.branch };
  }

  var atCol = dateCol + 1;  // Ателье/оборот (C)
  var klCol = dateCol + 2;  // Клиенты (D)
  var cashCol = dateCol + 3; // Наличные (E)
  var cardCol = dateCol + 4; // Безналичные (F)

  var inMonth = false;
  var targetRow = -1;

  for (var r = 1; r < values.length; r++) {
    var cell = values[r][dateCol];
    var isDate = cell instanceof Date;
    var cellStr = isDate ? '' : String(cell).trim();

    if (!isDate && cellStr === targetMonthName) {
      inMonth = true;
      continue;
    }

    if (inMonth) {
      if (!isDate && (cellStr.indexOf('>') >= 0)) {
        break;
      }
      if (!isDate && monthNames.indexOf(cellStr) >= 0 && cellStr !== targetMonthName) {
        break;
      }
      if (isDate) {
        var cellYear  = cell.getFullYear();
        var cellMonth = cell.getMonth() + 1;
        var cellDay   = cell.getDate();
        if (cellYear === targetYear && cellMonth === targetMonth && cellDay === targetDay) {
          targetRow = r + 1; // +1 т.к. Sheets API 1-indexed
          break;
        }
      }
    }
  }

  if (targetRow < 0) {
    return {
      success: false,
      error: 'Дата ' + data.date + ' не найдена в листе ' + data.branch
    };
  }

  sheet.getRange(targetRow, atCol + 1).setValue(data.atelie);
  sheet.getRange(targetRow, klCol + 1).setValue(data.clients);

  // Наличные и безналичные (столбцы E и F) — пишем если переданы
  if (data.cash !== undefined && data.cash !== null) {
    sheet.getRange(targetRow, cashCol + 1).setValue(data.cash);
  }
  if (data.card !== undefined && data.card !== null) {
    sheet.getRange(targetRow, cardCol + 1).setValue(data.card);
  }

  Logger.log('writeBranchDaily: ' + data.branch + ' ' + data.date +
             ' atelie=' + data.atelie + ' clients=' + data.clients +
             ' cash=' + (data.cash || 0) + ' card=' + (data.card || 0) + ' row=' + targetRow);

  return {
    success: true,
    branch: data.branch,
    date: data.date,
    atelie: data.atelie,
    clients: data.clients,
    cash: data.cash || 0,
    card: data.card || 0,
    row: targetRow
  };
}

// ═══════════════════════════════════════════════════════════════
// uploadReportPhoto — сохранение фото отчёта в Google Drive
// POST ?action=uploadReportPhoto
// Body: { branch: "Г11", date: "2026-03-14", photo: "data:image/jpeg;base64,..." }
// ═══════════════════════════════════════════════════════════════
function handleUploadReportPhoto(data) {
  if (!data.branch || !data.date || !data.photo) {
    return { success: false, error: 'Нужны branch, date и photo' };
  }

  var base64Data = data.photo.replace(/^data:image\/\w+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg',
    data.branch + '_' + data.date + '.jpg');

  // Папка "DressCode Отчёты" в корне Drive (создаётся автоматически)
  var folderName = 'DressCode Отчёты';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  // Подпапка по филиалу
  var subFolders = folder.getFoldersByName(data.branch);
  var subFolder = subFolders.hasNext() ? subFolders.next() : folder.createFolder(data.branch);

  var file = subFolder.createFile(blob);

  return {
    success: true,
    fileId: file.getId(),
    fileName: file.getName()
  };
}

// ─── К3: ЗАГЛУШКИ (пока не реализованы) ───────────────────────────────────

function handleGetHistory(e) {
  var branchFilter = (e && e.parameter && e.parameter.branch) || '';
  var startMonth = parseInt((e && e.parameter && e.parameter.startMonth) || '1');
  var endMonth = parseInt((e && e.parameter && e.parameter.endMonth) || new Date().getMonth() + 1);

  if (startMonth < 1) startMonth = 1;
  if (endMonth > 12) endMonth = 12;
  if (startMonth > endMonth) startMonth = endMonth;

  var ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  var monthNames = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                     'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var history = [];

  for (var m = startMonth; m <= endMonth; m++) {
    var monthTotals = readBranchTotalsFromObsh(ss, m);
    if (!monthTotals) continue;

    var monthData = {
      month: m,
      monthName: monthNames[m],
      branches: {}
    };

    for (var code in monthTotals) {
      if (code === '_OVERALL') {
        monthData.overall = monthTotals[code];
        continue;
      }
      if (branchFilter && code !== branchFilter) continue;
      monthData.branches[code] = monthTotals[code];
    }

    history.push(monthData);
  }

  return { success: true, data: history, startMonth: startMonth, endMonth: endMonth, branchFilter: branchFilter || 'all' };
}

function handleGetBranchDaily(e) {
  var branchCode = (e && e.parameter && e.parameter.branch) || '';
  var month = parseInt((e && e.parameter && e.parameter.month) || new Date().getMonth() + 1);

  if (!branchCode) {
    return { success: false, message: 'Параметр branch обязателен (например: М16, В8, П14)' };
  }
  if (month < 1 || month > 12) {
    return { success: false, message: 'Параметр month должен быть от 1 до 12' };
  }

  var ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(branchCode);
  if (!sheet) {
    return { success: false, message: 'Филиал не найден: ' + branchCode };
  }

  var monthNames = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                     'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var shortMonths = ['', 'Янв', 'Фев', 'Март', 'Апр', 'Май', 'Июнь',
                      'Июль', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  var detail = parseBranchSheet(sheet, month, monthNames, shortMonths);

  return {
    success: true,
    branch: branchCode,
    month: month,
    monthName: monthNames[month],
    dailyData: detail.daily || [],
    totals: {
      revenue: detail.revenue,
      atelie: detail.atelie,
      himchistka: detail.himchistka,
      clients: detail.clients,
      expenses: detail.expenses,
      profit: detail.profit
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// ДДС — ДВИЖЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ (бот v9, Этап 3)
// Лист «ДДС 2026» в таблице АТЕЛЬЕ 2026
// Колонки: date | type | amount | category | description | source | addedAt
// ═══════════════════════════════════════════════════════════════

function handleGetDDS(e) {
  const ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ДДС 2026');
  if (!sheet) return { success: true, data: [], total_income: 0, total_expense: 0 };

  const raw = sheet.getDataRange().getValues();
  if (raw.length <= 1) return { success: true, data: [], total_income: 0, total_expense: 0 };

  const today = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy');
  const monthKey = Utilities.formatDate(new Date(), 'Europe/Moscow', 'MM.yyyy');

  const all = raw.slice(1).map(row => ({
    date: row[0],
    type: row[1],       // 'income' | 'expense' | 'transfer'
    amount: row[2],
    category: row[3],
    description: row[4],
    source: row[5],
    addedAt: row[6]
  })).filter(r => r.date && r.amount);

  // Статистика за сегодня
  const todayItems = all.filter(r => String(r.date).startsWith(today) || r.date === today);
  const todayIncome = todayItems.filter(r => r.type === 'income').reduce((s, r) => s + (r.amount || 0), 0);
  const todayExpense = todayItems.filter(r => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0);

  return {
    success: true,
    data: all,
    today_income: todayIncome,
    today_expense: todayExpense,
    today_balance: todayIncome - todayExpense
  };
}

function handlePostDDS(data) {
  const ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ДДС 2026');

  if (!sheet) {
    sheet = ss.insertSheet('ДДС 2026');
    sheet.appendRow(['date', 'type', 'amount', 'category', 'description', 'source', 'addedAt']);
    // Заморозить первую строку
    sheet.setFrozenRows(1);
  }

  // Принимаем один объект или массив
  const items = Array.isArray(data) ? data : (data.items ? data.items : [data]);

  if (!items || items.length === 0) {
    return { success: false, error: 'No DDS data provided' };
  }

  let added = 0;
  const now = new Date().toISOString();

  items.forEach(item => {
    if (!item.amount || !item.type) return;

    sheet.appendRow([
      item.date || Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy'),
      item.type || 'expense',        // income / expense / transfer
      Math.abs(item.amount) || 0,
      item.category || 'прочее',
      item.description || '',
      item.source || '',
      item.addedAt || now
    ]);
    added++;
  });

  return { success: true, added: added };
}

// ═══════════════════════════════════════════════════════════════
// ЗАДАЧИ (бот v9, Этап 2)
// Лист «ЗАДАЧИ» в таблице АТЕЛЬЕ 2026
// Колонки: date | task | done | doneAt | addedAt
// ═══════════════════════════════════════════════════════════════

function handleGetTasks(e) {
  const ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ЗАДАЧИ');
  if (!sheet) return { success: true, data: [] };

  const raw = sheet.getDataRange().getValues();
  if (raw.length <= 1) return { success: true, data: [] };

  const tasks = raw.slice(1).map((row, i) => ({
    id: i + 2,  // номер строки (с учётом заголовка)
    date: row[0],
    task: row[1],
    done: row[2] === true || row[2] === 'TRUE' || row[2] === 1,
    doneAt: row[3] || '',
    addedAt: row[4] || ''
  })).filter(t => t.task);

  // Сначала незакрытые, потом закрытые
  tasks.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));

  return { success: true, data: tasks };
}

function handleAddTask(data) {
  const ss = SpreadsheetApp.openById(ATELIE_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ЗАДАЧИ');

  if (!sheet) {
    sheet = ss.insertSheet('ЗАДАЧИ');
    sheet.appendRow(['date', 'task', 'done', 'doneAt', 'addedAt']);
    sheet.setFrozenRows(1);
  }

  if (!data.task) {
    return { success: false, error: 'No task text' };
  }

  const now = new Date().toISOString();
  const today = data.date || Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy');

  sheet.appendRow([today, data.task, false, '', now]);

  return { success: true, added: 1, task: data.task };
}
