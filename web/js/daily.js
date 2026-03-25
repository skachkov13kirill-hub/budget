// ═══════════════════════════════════════════════════════════════
// DAILY.JS — Вкладка "Дни" (ежедневный оборот + клиенты)
// DressCode v1.0
// ═══════════════════════════════════════════════════════════════

var dailyChartData = null;
var dailyChartLoaded = false;

// ── Загрузка данных ──
function loadDailyChart() {
  if (dailyChartLoaded && dailyChartData) {
    renderDailyChart(dailyChartData);
    return;
  }

  document.getElementById('dailyChartLoading').style.display = '';
  document.getElementById('dailyChartContent').style.display = 'none';
  document.getElementById('dailyChartError').style.display = 'none';

  fetchWithTimeout(API_ATELIE + '?action=getDailyChart&days=14', 25000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.success) throw new Error(data.error || 'Ошибка');
      // Если API не вернул plan — строим из state.branches
      if (!data.plan && state.branches && state.branches.totals) {
        var t = state.branches.totals;
        var now = new Date();
        var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        data.plan = {
          dailyAtelie: t.plan && t.plan.atelie ? Math.round(t.plan.atelie / daysInMonth) : 0,
          dailyClients: t.plan && t.plan.clients ? Math.round(t.plan.clients / daysInMonth) : 0,
          daysInMonth: daysInMonth
        };
      }
      dailyChartData = data;
      dailyChartLoaded = true;
      renderDailyChart(data);
    })
    .catch(function(err) {
      document.getElementById('dailyChartLoading').style.display = 'none';
      document.getElementById('dailyChartError').style.display = '';
      document.getElementById('dailyChartError').innerHTML =
        '<div style="text-align:center;padding:40px;color:#E74C3C;">Ошибка: ' + err.message + '</div>';
    });
}

// ── Рендер графика ──
function renderDailyChart(data) {
  document.getElementById('dailyChartLoading').style.display = 'none';
  document.getElementById('dailyChartContent').style.display = '';

  var days = data.days;
  var plan = data.plan || { dailyAtelie: 0, dailyClients: 0 };
  var maxAtelie = Math.max.apply(null, days.map(function(d) { return d.atelie; })) || 1;
  maxAtelie = Math.max(maxAtelie, plan.dailyAtelie || 0) * 1.1;
  var maxClients = Math.max.apply(null, days.map(function(d) { return d.clients; })) || 1;
  maxClients = Math.max(maxClients, plan.dailyClients || 0) * 1.1;

  var WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  var html = '';

  // Заголовок
  html += '<div style="padding:12px 0 8px;display:flex;justify-content:space-between;align-items:center;">';
  html += '<div style="font-size:16px;font-weight:700;color:#111;">Ежедневно</div>';
  html += '<button onclick="dailyChartLoaded=false;loadDailyChart();" style="background:none;border:1px solid #ddd;border-radius:8px;padding:4px 12px;font-size:12px;color:#666;cursor:pointer;">Обновить</button>';
  html += '</div>';

  // Легенда
  html += '<div style="display:flex;gap:16px;padding:0 0 12px;font-size:11px;color:#888;">';
  html += '<span><span style="display:inline-block;width:10px;height:10px;background:#6C5CE7;border-radius:2px;margin-right:4px;"></span>Оборот</span>';
  html += '<span><span style="display:inline-block;width:10px;height:10px;background:#00B894;border-radius:2px;margin-right:4px;"></span>Клиенты</span>';
  html += '<span style="color:#FF6B6B;">- - план</span>';
  html += '</div>';

  // Линия плана (оборот)
  var planPctAtelie = Math.round(plan.dailyAtelie / maxAtelie * 100);

  // Бары по дням
  for (var i = 0; i < days.length; i++) {
    var d = days[i];
    var pctAtelie = Math.round(d.atelie / maxAtelie * 100);
    var pctClients = Math.round(d.clients / maxClients * 100);
    var isToday = i === days.length - 1;
    var isWeekend = d.weekday === 0 || d.weekday === 6;
    var abovePlan = d.atelie >= plan.dailyAtelie;

    var barColor = abovePlan ? '#6C5CE7' : '#A29BFE';
    var clientColor = '#00B894';
    var bgColor = isToday ? '#F0EDFF' : (isWeekend ? '#FAFAFA' : '#FFF');
    var dateShort = d.date.substring(0, 2) + '.' + d.date.substring(3);
    var dayName = WEEKDAYS[d.weekday];

    html += '<div onclick="toggleDailyDetail(' + i + ')" style="cursor:pointer;background:' + bgColor + ';border-radius:10px;padding:10px 12px;margin-bottom:4px;' + (isToday ? 'border:2px solid #6C5CE7;' : '') + '">';

    // Дата + цифры
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<div style="font-size:13px;font-weight:' + (isToday ? '700' : '500') + ';color:#333;">';
    html += dateShort + ' <span style="color:#999;font-weight:400;">' + dayName + '</span>';
    if (isToday) html += ' <span style="font-size:10px;color:#6C5CE7;">сегодня</span>';
    html += '</div>';
    html += '<div style="text-align:right;">';
    html += '<span style="font-size:14px;font-weight:700;color:' + (abovePlan ? '#22C55E' : '#333') + ';">' + fmtShort(d.atelie) + '</span>';
    html += '<span style="font-size:11px;color:#888;margin-left:8px;">' + d.clients + ' кл</span>';
    html += '</div>';
    html += '</div>';

    // Бар оборота
    html += '<div style="position:relative;height:16px;background:#F3F4F6;border-radius:4px;margin-bottom:3px;">';
    html += '<div style="height:100%;width:' + Math.min(pctAtelie, 100) + '%;background:' + barColor + ';border-radius:4px;transition:width 0.3s;"></div>';
    // Линия плана
    html += '<div style="position:absolute;top:0;bottom:0;left:' + Math.min(planPctAtelie, 100) + '%;width:2px;background:#FF6B6B;opacity:0.7;"></div>';
    html += '</div>';

    // Бар клиентов (тонкий)
    var planPctCl = Math.round(plan.dailyClients / maxClients * 100);
    html += '<div style="position:relative;height:8px;background:#F3F4F6;border-radius:3px;">';
    html += '<div style="height:100%;width:' + Math.min(pctClients, 100) + '%;background:' + clientColor + ';border-radius:3px;opacity:0.8;"></div>';
    html += '<div style="position:absolute;top:0;bottom:0;left:' + Math.min(planPctCl, 100) + '%;width:2px;background:#FF6B6B;opacity:0.5;"></div>';
    html += '</div>';

    // План дня: % выполнения и разница в ₽
    if (plan.dailyAtelie > 0) {
      var dayPlanPct = Math.round(d.atelie / plan.dailyAtelie * 100);
      var dayPlanDiff = d.atelie - plan.dailyAtelie;
      var planColor = dayPlanPct >= 100 ? '#22C55E' : dayPlanPct >= 80 ? '#FFAA00' : '#FF4D4D';
      var diffSign = dayPlanDiff >= 0 ? '+' : '';
      html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#888;">';
      html += '<span>план ' + fmtShort(plan.dailyAtelie) + '</span>';
      html += '<span style="font-weight:700;color:' + planColor + ';">' + dayPlanPct + '% ' + diffSign + fmtShort(dayPlanDiff) + '</span>';
      html += '</div>';
    }

    // Детали по филиалам (скрыты)
    html += '<div id="dailyDetail-' + i + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid #E5E7EB;"></div>';

    html += '</div>';
  }

  // ── ПРОГНОЗНЫЕ ДНИ (до 10 дней вперёд) ──
  var forecastDays = buildForecastDays(days, plan);
  if (forecastDays.length > 0) {
    // Сохраняем прогнозы для проверки точности
    saveDailyForecasts(forecastDays);

    html += '<div style="margin-top:16px;padding:10px 0 6px;display:flex;align-items:center;gap:8px;">';
    html += '<div style="font-size:14px;font-weight:700;color:#7B61FF;">\uD83D\uDD2E Прогноз</div>';
    html += '<div style="font-size:11px;color:#999;">' + forecastDays.length + ' дней вперёд</div>';
    html += '</div>';

    var maxFcAtelie = Math.max(maxAtelie, Math.max.apply(null, forecastDays.map(function(d) { return d.atelie; })) * 1.1);
    var avgFcAtelie = forecastDays.reduce(function(s, d) { return s + d.atelie; }, 0) / forecastDays.length;

    for (var fi = 0; fi < forecastDays.length; fi++) {
      var fd = forecastDays[fi];
      var pctFcAtelie = Math.round(fd.atelie / maxFcAtelie * 100);
      var isWeekendFc = fd.weekday === 0 || fd.weekday === 6;
      var bgFc = isWeekendFc ? '#F5F3FF' : '#FAFAFF';
      var dayNameFc = WEEKDAYS[fd.weekday];
      var abovePlanFc = fd.atelie >= plan.dailyAtelie;

      // Проверяем точность вчерашнего прогноза
      var accuracyHtml = '';
      var acc = checkForecastAccuracy(fd.dateKey, days);
      if (acc) {
        var accPct = acc.fact > 0 ? Math.round((acc.predicted / acc.fact - 1) * 100) : 0;
        var accColor = Math.abs(accPct) <= 10 ? '#22C55E' : Math.abs(accPct) <= 20 ? '#FFAA00' : '#FF4D4D';
        var accSign = accPct >= 0 ? '+' : '';
        accuracyHtml = '<div style="font-size:10px;color:' + accColor + ';font-weight:600;margin-top:3px;">' +
          '\u2714 факт ' + fmtShort(acc.fact) + ' \u00b7 \u0394' + accSign + accPct + '%</div>';
      }

      html += '<div style="background:' + bgFc + ';border-radius:10px;padding:10px 12px;margin-bottom:4px;border:1px dashed #C4B5FD;">';

      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
      var isHighDay = fd.atelie >= avgFcAtelie;
      var dayColor = isHighDay ? '#22C55E' : '#A29BFE';
      html += '<div style="font-size:13px;font-weight:500;color:#7B61FF;">';
      html += fd.dateShort + ' <span style="color:' + dayColor + ';font-weight:' + (isHighDay ? '700' : '400') + ';">' + dayNameFc + '</span>';
      if (isWeekendFc && !isHighDay) html += ' <span style="font-size:9px;color:#A29BFE;">\u{1F4A4}</span>';
      if (fd.weatherIcon) html += ' <span style="font-size:11px;">' + fd.weatherIcon + fd.temp + '\u00B0</span>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<span style="font-size:14px;font-weight:700;color:' + (isHighDay ? '#22C55E' : '#7B61FF') + ';">' + fmtShort(fd.atelie) + '</span>';
      html += '<span style="font-size:11px;color:#A29BFE;margin-left:8px;">' + fd.clients + ' кл</span>';
      html += '</div>';
      html += '</div>';

      // Бар
      html += '<div style="position:relative;height:16px;background:#EDE9FE;border-radius:4px;">';
      html += '<div style="height:100%;width:' + Math.min(pctFcAtelie, 100) + '%;background:linear-gradient(90deg,#A29BFE,#7B61FF);border-radius:4px;opacity:0.6;"></div>';
      html += '<div style="position:absolute;top:0;bottom:0;left:' + Math.min(planPctAtelie, 100) + '%;width:2px;background:#FF6B6B;opacity:0.5;"></div>';
      html += '</div>';

      if (accuracyHtml) html += accuracyHtml;

      html += '</div>';
    }
  }

  // Итого за 2 недели
  var totalAt = days.reduce(function(s, d) { return s + d.atelie; }, 0);
  var totalCl = days.reduce(function(s, d) { return s + d.clients; }, 0);
  var avgAt = Math.round(totalAt / days.length);
  var avgCl = Math.round(totalCl / days.length);

  html += '<div style="background:#F8F7FF;border-radius:12px;padding:14px;margin-top:8px;">';
  html += '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:6px;">Итого за ' + days.length + ' дней</div>';
  html += '<div style="display:flex;justify-content:space-between;">';
  html += '<div><span style="font-size:12px;color:#888;">Оборот:</span> <span style="font-weight:700;">' + fmtShort(totalAt) + '</span></div>';
  html += '<div><span style="font-size:12px;color:#888;">Клиенты:</span> <span style="font-weight:700;">' + totalCl + '</span></div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:4px;">';
  html += '<div><span style="font-size:12px;color:#888;">Среднее/день:</span> <span style="font-weight:600;">' + fmtShort(avgAt) + '</span></div>';
  html += '<div><span style="font-size:12px;color:#888;">План/день:</span> <span style="font-weight:600;color:#FF6B6B;">' + fmtShort(plan.dailyAtelie) + '</span></div>';
  html += '</div>';
  html += '</div>';

  document.getElementById('dailyChartBars').innerHTML = html;
}

// ── Раскрытие деталей по филиалам ──
function toggleDailyDetail(dayIndex) {
  var el = document.getElementById('dailyDetail-' + dayIndex);
  if (!el) return;

  if (el.style.display !== 'none') {
    el.style.display = 'none';
    return;
  }

  var d = dailyChartData.days[dayIndex];
  var plan = dailyChartData.plan;
  var daysInMonth = plan.daysInMonth;

  // Сортируем филиалы по обороту
  var sorted = d.branches.slice().sort(function(a, b) { return b.atelie - a.atelie; });
  var maxBranch = sorted.length > 0 ? sorted[0].atelie : 1;

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var br = sorted[i];
    if (br.atelie === 0 && br.clients === 0) continue;
    var pct = maxBranch > 0 ? Math.round(br.atelie / maxBranch * 100) : 0;

    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">';
    html += '<div style="width:30px;font-size:11px;color:#666;font-weight:500;">' + br.code + '</div>';
    html += '<div style="flex:1;height:14px;background:#F3F4F6;border-radius:3px;position:relative;">';
    html += '<div style="height:100%;width:' + pct + '%;background:#C4B5FD;border-radius:3px;"></div>';
    html += '</div>';
    html += '<div style="width:65px;text-align:right;font-size:12px;font-weight:600;">' + fmtShort(br.atelie) + '</div>';
    html += '<div style="width:35px;text-align:right;font-size:11px;color:#888;">' + br.clients + ' кл</div>';
    html += '</div>';
  }

  el.innerHTML = html;
  el.style.display = '';
}

// ═══════════════════════════════════════════════════════════════
// ПРОГНОЗНЫЕ ДНИ — 10 дней вперёд с учётом будней/выходных и погоды
// ═══════════════════════════════════════════════════════════════

function buildForecastDays(realDays, plan) {
  if (!realDays || realDays.length < 3) return [];

  // Считаем средний оборот/клиентов отдельно для будней и выходных
  var weekdayTotals = { atelie: 0, clients: 0, count: 0 };
  var weekendTotals = { atelie: 0, clients: 0, count: 0 };

  realDays.forEach(function(d) {
    var isWe = d.weekday === 0 || d.weekday === 6;
    if (isWe) {
      weekendTotals.atelie += d.atelie;
      weekendTotals.clients += d.clients;
      weekendTotals.count++;
    } else {
      weekdayTotals.atelie += d.atelie;
      weekdayTotals.clients += d.clients;
      weekdayTotals.count++;
    }
  });

  var avgWeekday = weekdayTotals.count > 0
    ? { atelie: Math.round(weekdayTotals.atelie / weekdayTotals.count), clients: Math.round(weekdayTotals.clients / weekdayTotals.count) }
    : { atelie: plan.dailyAtelie, clients: plan.dailyClients };
  var avgWeekend = weekendTotals.count > 0
    ? { atelie: Math.round(weekendTotals.atelie / weekendTotals.count), clients: Math.round(weekendTotals.clients / weekendTotals.count) }
    : { atelie: Math.round(avgWeekday.atelie * 0.7), clients: Math.round(avgWeekday.clients * 0.7) };

  // Средний чек для расчёта клиентов из оборота
  var totalAt = realDays.reduce(function(s, d) { return s + d.atelie; }, 0);
  var totalCl = realDays.reduce(function(s, d) { return s + d.clients; }, 0);
  var avgCheck = totalCl > 0 ? Math.round(totalAt / totalCl) : 1200;

  // Погодные данные
  var weatherData = typeof loadWeatherCache === 'function' ? loadWeatherCache() : null;
  var month = new Date().getMonth() + 1;

  // Генерируем 10 будущих дней (в рамках текущего месяца)
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var result = [];

  for (var offset = 1; offset <= 10; offset++) {
    var futureDay = now.getDate() + offset;
    if (futureDay > daysInMonth) break; // не выходим за месяц

    var futureDate = new Date(now.getFullYear(), now.getMonth(), futureDay);
    var wd = futureDate.getDay(); // 0=Вс, 6=Сб
    var isWeekend = wd === 0 || wd === 6;

    var base = isWeekend ? avgWeekend : avgWeekday;
    var atelie = base.atelie;

    // Погодная коррекция для конкретного дня
    var weatherIcon = '';
    var temp = null;
    if (weatherData && weatherData.dates) {
      var dateStr = futureDate.getFullYear() + '-' + String(month).padStart(2, '0') + '-' + String(futureDay).padStart(2, '0');
      var wIdx = weatherData.dates.indexOf(dateStr);
      if (wIdx !== -1) {
        var avgTemp = (weatherData.maxTemps[wIdx] + weatherData.minTemps[wIdx]) / 2;
        temp = Math.round(avgTemp);
        weatherIcon = typeof tempToIcon === 'function' ? tempToIcon(avgTemp) : '';
        var factor = typeof calcDayWeatherFactor === 'function' ? calcDayWeatherFactor(avgTemp, month) : 1;
        atelie = Math.round(atelie * factor);
      }
    }

    var clients = avgCheck > 0 ? Math.round(atelie / avgCheck) : 0;

    result.push({
      dateKey: futureDate.getFullYear() + '-' + String(month).padStart(2, '0') + '-' + String(futureDay).padStart(2, '0'),
      dateShort: String(futureDay).padStart(2, '0') + '.' + String(month).padStart(2, '0'),
      weekday: wd,
      atelie: atelie,
      clients: clients,
      weatherIcon: weatherIcon,
      temp: temp
    });
  }

  return result;
}

// ── Сохранение прогнозов для проверки точности ──
var FORECAST_STORE_KEY = 'daily_forecasts';

function saveDailyForecasts(forecastDays) {
  try {
    var stored = JSON.parse(localStorage.getItem(FORECAST_STORE_KEY) || '{}');
    forecastDays.forEach(function(fd) {
      // Записываем только если ещё нет прогноза на этот день (первый прогноз — самый ценный)
      if (!stored[fd.dateKey]) {
        stored[fd.dateKey] = { atelie: fd.atelie, clients: fd.clients, savedAt: Date.now() };
      }
    });
    // Чистим старые (>60 дней)
    var cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    Object.keys(stored).forEach(function(k) {
      if (stored[k].savedAt && stored[k].savedAt < cutoff) delete stored[k];
    });
    localStorage.setItem(FORECAST_STORE_KEY, JSON.stringify(stored));
  } catch(e) {}
}

// ── Проверка: был ли прогноз на этот день и сколько реально получилось ──
function checkForecastAccuracy(dateKey, realDays) {
  try {
    var stored = JSON.parse(localStorage.getItem(FORECAST_STORE_KEY) || '{}');
    if (!stored[dateKey]) return null;

    // Ищем реальные данные за этот день
    var parts = dateKey.split('-');
    var targetDate = parts[2] + '.' + parts[1];
    var realDay = null;
    for (var i = 0; i < realDays.length; i++) {
      if (realDays[i].date === targetDate) {
        realDay = realDays[i];
        break;
      }
    }

    if (!realDay || realDay.atelie === 0) return null;

    return {
      predicted: stored[dateKey].atelie,
      fact: realDay.atelie
    };
  } catch(e) { return null; }
}

// ── Автозагрузка при переходе на вкладку ──
var origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
document.addEventListener('DOMContentLoaded', function() {
  // Перехватываем switchTab
  var origFn = window.switchTab;
  window.switchTab = function(name, btn) {
    origFn(name, btn);
    if (name === 'daily') loadDailyChart();
  };
});
