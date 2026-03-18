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
  var plan = data.plan;
  var maxAtelie = Math.max.apply(null, days.map(function(d) { return d.atelie; })) || 1;
  maxAtelie = Math.max(maxAtelie, plan.dailyAtelie) * 1.1;
  var maxClients = Math.max.apply(null, days.map(function(d) { return d.clients; })) || 1;
  maxClients = Math.max(maxClients, plan.dailyClients) * 1.1;

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

    // Детали по филиалам (скрыты)
    html += '<div id="dailyDetail-' + i + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid #E5E7EB;"></div>';

    html += '</div>';
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
