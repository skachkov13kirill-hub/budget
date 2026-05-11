// ═══════════════════════════════════════════════════════════════
// BUSINESS.JS — Вкладка "Бизнес" (филиалы + прогноз + РСч)
// DressCode v4.0
// ═══════════════════════════════════════════════════════════════

// ── OVERVIEW ──
function renderBizOverview(data) {
  if (!data || !data.totals) return;
  var t = data.totals;

  // Fallback: если plan.clients нет в totals — суммируем из филиалов
  if (t.plan && !t.plan.clients && data.filials) {
    var sumCl = 0;
    data.filials.forEach(function(f) { if (f.plan && f.plan.clients) sumCl += f.plan.clients; });
    if (sumCl > 0) t.plan.clients = sumCl;
  }

  // Рассчитываем план на текущий день
  var now = new Date();
  var month = data.currentMonth || (now.getMonth() + 1);
  var yearSel = document.getElementById('bizYearSelect');
  var year = yearSel ? parseInt(yearSel.value) : now.getFullYear();
  var isCurrentMonth = (now.getMonth() + 1) === month && now.getFullYear() === year;
  var daysInMonth = new Date(year, month, 0).getDate();
  var daysWithData = isCurrentMonth ? Math.max(1, now.getDate() - 1) : daysInMonth;
  var dayRatio = daysWithData / daysInMonth; // доля месяца с данными

  // Химчистка — суммируем из филиалов (надёжнее чем totals)
  var himchFact = 0;
  if (data.filials) data.filials.forEach(function(f) { himchFact += (f.fact.himchistka || 0); });
  if (!himchFact) himchFact = t.fact.himchistka || 0;

  // Общий оборот = ателье + химчистка
  var totalWithHimch = (t.fact.atelie || 0) + (t.fact.himchistka || 0);
  var totalOborot = (t.fact.atelie || 0) + himchFact;

  // ── Оборот ──
  document.getElementById('ov-oborot').textContent = fmt(totalOborot);
  var planTotal = (t.plan && t.plan.total) ? t.plan.total : 0;
  if (planTotal > 0) {
    var planTotalToday = Math.round(planTotal * dayRatio);
    var pctOborot = planTotalToday > 0 ? Math.round(totalOborot / planTotalToday * 100) : 0;
    var oborotStatus = pctOborot >= 100 ? '\u2705' : pctOborot >= 90 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
    document.getElementById('ov-oborot-plan').textContent = isCurrentMonth
      ? oborotStatus + ' план ' + daysWithData + 'д: ' + fmtShort(planTotalToday) + ' (' + pctOborot + '%)'
      : 'План: ' + fmtShort(planTotal) + ' (' + (t.performance.total || 0) + '%)';
  } else {
    document.getElementById('ov-oborot-plan').textContent = '';
  }

  // ── Ателье ──
  document.getElementById('ov-atelie').textContent = fmt(t.fact.atelie);
  if (t.plan && t.plan.total > 0) {
    var planAtelieToday = Math.round((t.plan.atelie || 0) * dayRatio);
    var pctAtelieToday = planAtelieToday > 0 ? Math.round(t.fact.atelie / planAtelieToday * 100) : 0;
    var atelieStatus = pctAtelieToday >= 100 ? '\u2705' : pctAtelieToday >= 90 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
    document.getElementById('ov-atelie-plan').textContent = isCurrentMonth
      ? atelieStatus + ' план ' + daysWithData + 'д: ' + fmtShort(planAtelieToday) + ' (' + pctAtelieToday + '%)'
      : 'План: ' + fmtShort(t.plan.atelie) + ' (' + t.performance.atelie + '%)';
  }

  // ── Химчистка (одно поле) ──
  document.getElementById('ov-himch-fact').textContent = fmt(himchFact);
  var himchPlan = (t.plan && t.plan.himchistka) ? t.plan.himchistka : 0;
  var himchSharePct = totalOborot > 0 ? Math.round(himchFact / totalOborot * 100) : 0;
  if (himchPlan > 0) {
    var planHimchToday = Math.round(himchPlan * dayRatio);
    var pctHimch = planHimchToday > 0 ? Math.round(himchFact / planHimchToday * 100) : 0;
    var himchStatus = pctHimch >= 100 ? '\u2705' : pctHimch >= 90 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
    document.getElementById('ov-himch-sub').textContent = isCurrentMonth
      ? himchStatus + ' ' + himchSharePct + '% об. \u00b7 план ' + fmtShort(planHimchToday) + ' (' + pctHimch + '%)'
      : himchSharePct + '% об. \u00b7 План: ' + fmtShort(himchPlan) + ' (' + (t.performance.himchistka || 0) + '%)';
  } else {
    document.getElementById('ov-himch-sub').textContent = himchSharePct + '% оборота';
  }

  // ── Клиенты · Чек ──
  var avgCheck = t.fact.avgCheck || 0;
  var clients = t.fact.clients || 0;
  document.getElementById('ov-clients-check').textContent = clients + ' кл \u00b7 ' + fmt(avgCheck);
  var avgCheckPlan = (t.plan && t.plan.clients > 0 && t.plan.atelie > 0) ? Math.round(t.plan.atelie / t.plan.clients) : 0;
  if (avgCheckPlan > 0) {
    document.getElementById('ov-clients-check-sub').textContent = 'план чека: ' + fmt(avgCheckPlan);
  } else {
    document.getElementById('ov-clients-check-sub').textContent = '';
  }

  // Прогресс-бар: по плану на текущий день
  var planTodayTotal = isCurrentMonth ? Math.round(t.plan.total * dayRatio) : t.plan.total;
  var pctBar = planTodayTotal > 0 ? Math.min(Math.round((t.fact.total || totalWithHimch) / planTodayTotal * 100), 150) : 0;
  document.getElementById('ov-progress').style.width = Math.min(pctBar, 100) + '%';
  document.getElementById('ov-progress').textContent = pctBar + '%';

  var netForecast = calcNetworkForecast(data.filials);
  if (netForecast > 0) {
    document.getElementById('ov-forecast').textContent = fmtShort(netForecast);
    var fcPct = t.plan.total > 0 ? Math.round(netForecast / t.plan.total * 100) : 0;
    document.getElementById('ov-forecast-sub').textContent = fcPct + '% плана';
  }

  // Погодный бейдж со стрелкой дельты
  var weatherEl = document.getElementById('ov-weather');
  if (weatherEl && typeof getWeatherDisplay === 'function') {
    var wd = getWeatherDisplay();
    if (wd && wd.correctionPct !== null && data.filials) {
      var fcWithout = 0;
      data.filials.forEach(function(f) {
        var fc0 = calcForecast3Weeks(f.fact.total, month, null);
        fcWithout += fc0 ? fc0.total : f.fact.total;
      });
      var delta = netForecast - fcWithout;
      var arrow = delta >= 0 ? '\u2191' : '\u2193';
      weatherEl.innerHTML = wd.icon + ' ' + wd.temp + '\u00B0 ' + arrow + fmtShort(Math.abs(delta));
      weatherEl.style.display = '';
    } else {
      weatherEl.style.display = 'none';
    }
  }

  document.getElementById('bizLoading').style.display = 'none';
  document.getElementById('bizOverviewContent').style.display = 'block';

  // Блок «Сегодня» — отчёты филиалов
  renderTodayReport(data);

  // Пульс дня
  renderDailyPulse(data);

  // Планировщик — 4 цифры маржи
  renderPlanner(data);

  // Аномалии — 6-й блок «Контроль»
  detectAnomalies(data);
}

// ═══════════════════════════════════════════════════════════════
// ANOMALIES — детектор аномалий
// ═══════════════════════════════════════════════════════════════
var lastAnomalies = [];

function detectAnomalies(data) {
  var anomalies = [];
  if (!data || !data.filials) {
    updateAnomalyBadge(anomalies);
    return;
  }

  var now = new Date();
  var month = data.currentMonth || (now.getMonth() + 1);
  var yearSel = document.getElementById('bizYearSelect');
  var year = yearSel ? parseInt(yearSel.value) : now.getFullYear();
  var isCurrentMonth = (now.getMonth() + 1) === month && now.getFullYear() === year;
  var daysInMonth = new Date(year, month, 0).getDate();
  var daysWithData = isCurrentMonth ? Math.max(1, now.getDate() - 1) : daysInMonth;

  data.filials.forEach(function(f) {
    // 🔴 Не сдал отчёт (текущий месяц, 0 клиентов и 0 выручка)
    if (isCurrentMonth && f.fact.atelie === 0 && f.fact.clients === 0 && daysWithData > 1) {
      anomalies.push({ severity: 'red', filial: f.name, code: f.code, message: 'Нет данных за весь месяц', type: 'no_data' });
    }

    // 🟡 Выполнение < 50%
    if (f.performance && f.performance.total < 50 && f.plan && f.plan.total > 0 && daysWithData > 5) {
      anomalies.push({ severity: 'yellow', filial: f.name, code: f.code, message: 'Выполнение ' + f.performance.total + '% — критически низко', type: 'low_perf' });
    }

    // 🟡 Средний чек < 500₽ (если есть клиенты)
    if (f.fact.clients > 10 && f.fact.avgCheck > 0 && f.fact.avgCheck < 500) {
      anomalies.push({ severity: 'yellow', filial: f.name, code: f.code, message: 'Ср. чек ' + fmt(f.fact.avgCheck) + ' — подозрительно низкий', type: 'low_check' });
    }

    // 🟡 Средний чек > 5000₽ (ошибка?)
    if (f.fact.clients > 5 && f.fact.avgCheck > 5000) {
      anomalies.push({ severity: 'yellow', filial: f.name, code: f.code, message: 'Ср. чек ' + fmt(f.fact.avgCheck) + ' — подозрительно высокий', type: 'high_check' });
    }

    // 🟡 Химчистка = 0 при плане > 0
    if (f.plan && f.plan.himchistka > 0 && (f.fact.himchistka || 0) === 0 && daysWithData > 5) {
      anomalies.push({ severity: 'yellow', filial: f.name, code: f.code, message: 'Химчистка 0₽ при плане ' + fmtShort(f.plan.himchistka), type: 'no_himch' });
    }
  });

  // Дневные аномалии из dailyChart (если данные загружены)
  if (typeof dailyChartData !== 'undefined' && dailyChartData && dailyChartData.days) {
    dailyChartData.days.forEach(function(d) {
      if (!d.branches) return;
      d.branches.forEach(function(br) {
        if (br.clients > 30) {
          anomalies.push({ severity: 'red', filial: br.code, code: br.code, message: d.date + ': ' + br.clients + ' клиентов — аномально много', type: 'daily_clients' });
        }
        if (br.atelie > 30000) {
          anomalies.push({ severity: 'red', filial: br.code, code: br.code, message: d.date + ': ' + fmtShort(br.atelie) + ' выручка — аномально высокая', type: 'daily_revenue' });
        }
      });
    });
  }

  // Сортировка: red сначала
  anomalies.sort(function(a, b) {
    if (a.severity === 'red' && b.severity !== 'red') return -1;
    if (a.severity !== 'red' && b.severity === 'red') return 1;
    return 0;
  });

  lastAnomalies = anomalies;
  updateAnomalyBadge(anomalies);
}

function updateAnomalyBadge(anomalies) {
  var el = document.getElementById('ov-anomalies');
  var sub = document.getElementById('ov-anomalies-sub');
  if (!el) return;

  var reds = anomalies.filter(function(a) { return a.severity === 'red'; }).length;
  var yellows = anomalies.filter(function(a) { return a.severity === 'yellow'; }).length;
  var total = anomalies.length;

  if (total === 0) {
    el.textContent = '\u2705';
    el.style.color = '#22C55E';
    sub.textContent = 'всё ок';
  } else {
    el.textContent = total;
    el.style.color = reds > 0 ? '#EF4444' : '#FFAA00';
    var parts = [];
    if (reds > 0) parts.push('\uD83D\uDD34 ' + reds);
    if (yellows > 0) parts.push('\uD83D\uDFE1 ' + yellows);
    sub.textContent = parts.join(' \u00b7 ');
  }
}

function openAnomalies() {
  var overlay = getOverlay('anomaliesOverlay');
  var anomalies = lastAnomalies;

  var html = '<div class="overlay-handle"></div>' +
    '<div style="font-size:18px;font-weight:700;padding:16px 0 12px;text-align:center;">\u26A0\uFE0F Контроль — аномалии</div>';

  if (anomalies.length === 0) {
    html += '<div style="text-align:center;padding:40px;color:#22C55E;font-size:16px;">\u2705 Аномалий не обнаружено</div>';
  } else {
    anomalies.forEach(function(a) {
      var icon = a.severity === 'red' ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      var bgColor = a.severity === 'red' ? '#FEF2F2' : '#FFFBEB';
      var borderColor = a.severity === 'red' ? '#FECACA' : '#FDE68A';
      html += '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:10px;padding:10px 14px;margin:0 0 6px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:14px;">' + icon + '</span>' +
          '<span style="font-weight:600;font-size:13px;color:#333;">' + a.filial + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#666;margin-top:4px;padding-left:22px;">' + a.message + '</div>' +
      '</div>';
    });
  }

  html += '<div class="overlay-close" onclick="closeOverlay(\'anomaliesOverlay\')">Закрыть</div>';
  overlay.querySelector('.overlay-panel').innerHTML = html;
  showOverlay('anomaliesOverlay');
}

// ── DAILY PULSE (две базы: доходы и расходы) ──
function renderDailyPulse(data) {
  var el = document.getElementById('dailyPulseCard');
  if (!el) return;

  if (!data || !data.totals || !data.totals.fact) {
    el.style.display = 'none';
    return;
  }

  var t = data.totals;
  var month = data.currentMonth || (new Date().getMonth() + 1);
  var now = new Date();
  var isCurrentMonth = (now.getMonth() + 1) === month;
  if (!isCurrentMonth) { el.style.display = 'none'; return; }

  var today = now.getDate();
  var daysWithData = Math.max(1, today - 1); // вчера = последний закрытый день
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var daysLeft = daysInMonth - daysWithData; // оставшиеся дни (включая сегодня)

  var factAtelie = parseFloat(t.fact.atelie) || 0;
  var factHimch = parseFloat(t.fact.himchistka) || 0;
  if (factAtelie <= 0 || daysWithData < 2) { el.style.display = 'none'; return; }

  // Дневные скорости (на р/с) — делим на закрытые дни, не на сегодняшний
  var dailyBankAtelie = Math.round(factAtelie / 2 / daysWithData);
  var dailyBankHimch = Math.round(factHimch / daysWithData);
  var dailyBank = dailyBankAtelie + dailyBankHimch;

  // ДОХОДЫ за месяц (экстраполяция)
  var incAtelie = dailyBankAtelie * daysInMonth;
  var incHimch = dailyBankHimch * daysInMonth;
  var extraReceived = isExtraIncomeReceived();
  var incExtra = extraReceived ? EXTRA_INCOME : 0;
  var totalIncome = incAtelie + incHimch + incExtra;

  // РАСХОДЫ за месяц
  var expHimch = Math.round(dailyBankHimch * daysInMonth * 0.6);
  var creditsPaid = typeof getCreditsPaidTotal === 'function' ? getCreditsPaidTotal() : 0;
  var creditsLeft = CREDIT_PAYMENTS - creditsPaid;
  var totalExpenses = expHimch + FIXED_COSTS + creditsLeft;

  var familyMoney = totalIncome - totalExpenses;
  var fmColor = familyMoney >= 0 ? 'var(--green)' : 'var(--red)';
  var fmEmoji = familyMoney >= 200000 ? '&#x2705;' : familyMoney >= 0 ? '&#x1F7E1;' : '&#x1F534;';

  // Ещё придёт
  var expectedIncome = dailyBank * daysLeft;

  // Ввод баланса
  var bufferHtml =
    '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.06);">' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:8px;">&#x1F3E6; Расч&#1105;т от баланса р/с</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:12px;white-space:nowrap;">Сейчас на р/с:</span>' +
        '<input type="text" id="pulseBalanceInput" inputmode="numeric" placeholder="сумма"' +
          ' style="flex:1;border:1.5px solid #ddd;border-radius:10px;padding:8px 12px;font-size:15px;font-weight:700;text-align:right;max-width:150px;background:#FAFAFA;"' +
          ' oninput="calcPulseResult(this.value,' + dailyBank + ',' + daysLeft + ',' + daysInMonth + ',' + totalExpenses + ')">' +
      '</div>' +
      '<div id="pulseCalcResult">' +
        '<div class="pulse-row">' +
          '<span style="font-size:12px;">&#x1F4E5; Ещ&#1105; прид&#1105;т за ' + daysLeft + ' дн.</span>' +
          '<span style="font-weight:700;color:var(--green);">+' + fmtShort(expectedIncome) + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:#aaa;text-align:center;margin-top:6px;">&#x261D;&#xFE0F; Введите баланс р/с для расч&#1105;та</div>' +
      '</div>' +
    '</div>';

  el.innerHTML =
    '<div class="card" style="background:white;border-radius:16px;padding:16px;margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:14px;font-weight:700;">&#x1F4B3; На р/с</div>' +
        '<div style="font-size:11px;color:#888;">данные за ' + daysWithData + ' дн. &#183; осталось ' + daysLeft + '</div>' +
      '</div>' +

      // ДОХОДЫ
      '<div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px;">&#x1F4E5; ДОХОДЫ (прогноз на месяц)</div>' +
      '<div class="pulse-row" style="padding-left:8px;">' +
        '<span style="font-size:12px;">атель&#1077; &#247; 2</span>' +
        '<span style="font-weight:700;">' + fmtShort(incAtelie) + '</span>' +
      '</div>' +
      '<div class="pulse-row" style="padding-left:8px;">' +
        '<span style="font-size:12px;">химчистка</span>' +
        '<span style="font-weight:700;">' + fmtShort(incHimch) + '</span>' +
      '</div>' +
      (incExtra > 0
        ? '<div class="pulse-row" style="padding-left:8px;"><span style="font-size:12px;">+ доход 100К</span><span style="font-weight:700;">' + fmtShort(incExtra) + '</span></div>'
        : '<div class="pulse-row" style="padding-left:8px;"><span style="font-size:12px;">+ доход 100К</span><span style="font-size:11px;color:#bbb;">не получен</span></div>') +
      '<div class="pulse-row" style="font-weight:700;margin-top:2px;">' +
        '<span style="font-size:12px;">ИТОГО доходы</span>' +
        '<span style="font-size:15px;color:var(--green);">' + fmtShort(totalIncome) + '</span>' +
      '</div>' +

      // РАСХОДЫ
      '<div style="font-size:11px;font-weight:700;color:var(--red);margin-top:10px;margin-bottom:4px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.06);">&#x1F4E4; РАСХОДЫ</div>' +
      '<div class="pulse-row" style="padding-left:8px;">' +
        '<span style="font-size:12px;">химч подрядчикам (60%)</span>' +
        '<span style="font-weight:600;color:var(--text-3);">&#8722;' + fmtShort(expHimch) + '</span>' +
      '</div>' +
      '<div class="pulse-row" style="padding-left:8px;">' +
        '<span style="font-size:12px;">фикс (аренда и тд)</span>' +
        '<span style="font-weight:600;color:var(--text-3);">&#8722;' + fmtShort(FIXED_COSTS) + '</span>' +
      '</div>' +
      '<div class="pulse-row" style="padding-left:8px;">' +
        '<span style="font-size:12px;">кредиты</span>' +
        '<span style="font-weight:600;color:var(--text-3);">&#8722;' + fmtShort(creditsLeft) + '</span>' +
      '</div>' +
      '<div class="pulse-row" style="font-weight:700;margin-top:2px;">' +
        '<span style="font-size:12px;">ИТОГО расходы</span>' +
        '<span style="font-size:15px;color:var(--red);">&#8722;' + fmtShort(totalExpenses) + '</span>' +
      '</div>' +

      // НА СЕМЬЮ
      '<div class="pulse-row" style="margin-top:10px;padding-top:8px;border-top:2px solid rgba(0,0,0,0.1);">' +
        '<span style="font-size:14px;font-weight:800;">' + fmEmoji + ' На сем&#1100;ю</span>' +
        '<span style="font-weight:900;font-size:20px;color:' + fmColor + ';">' + fmtShort(familyMoney) + '</span>' +
      '</div>' +
      '<div style="font-size:10px;color:#aaa;margin-top:2px;">~' + fmtShort(dailyBank) + '/день на р/с (атель&#1077;&#247;2 + химч)</div>' +
      bufferHtml +
    '</div>';
  el.style.display = '';
}

// ── PULSE CALCULATOR ──
function calcPulseResult(rawVal, dailyBank, daysLeft, daysInMonth, totalExpenses) {
  var el = document.getElementById('pulseCalcResult');
  if (!el) return;
  var val = parseInt(String(rawVal).replace(/\s/g, '').replace(/\D/g, ''), 10);
  var expectedIncome = dailyBank * daysLeft;
  if (!val || val <= 0) {
    el.innerHTML =
      '<div class="pulse-row">' +
        '<span style="font-size:12px;">&#x1F4E5; Ещ&#1105; прид&#1105;т за ' + daysLeft + ' дн.</span>' +
        '<span style="font-weight:700;color:var(--green);">+' + fmtShort(expectedIncome) + '</span>' +
      '</div>' +
      '<div style="font-size:11px;color:#aaa;text-align:center;margin-top:6px;">&#x261D;&#xFE0F; Введите баланс р/с</div>';
    return;
  }
  var totalByEnd = val + expectedIncome;
  var canWithdraw = totalByEnd - totalExpenses;
  var cwColor = canWithdraw >= 0 ? 'var(--green)' : 'var(--red)';
  var cwText = canWithdraw >= 0 ? fmtShort(canWithdraw) : '&#x26A0;&#xFE0F; нехватка ' + fmtShort(Math.abs(canWithdraw));
  var statusEmoji = canWithdraw >= 200000 ? '&#x2705;' : canWithdraw >= 0 ? '&#x1F7E1;' : '&#x1F534;';
  el.innerHTML =
    '<div class="pulse-row">' +
      '<span style="font-size:12px;">&#x1F4E5; Ещ&#1105; прид&#1105;т за ' + daysLeft + ' дн.</span>' +
      '<span style="font-weight:700;color:var(--green);">+' + fmtShort(expectedIncome) + '</span>' +
    '</div>' +
    '<div class="pulse-row">' +
      '<span style="font-size:12px;">&#x1F3E6; Итого к ' + daysInMonth + '-му</span>' +
      '<span style="font-weight:700;">' + fmtShort(totalByEnd) + '</span>' +
    '</div>' +
    '<div class="pulse-row">' +
      '<span style="font-size:12px;">&#x2796; Расходы</span>' +
      '<span style="font-weight:600;color:var(--text-3);">&#8722;' + fmtShort(totalExpenses) + '</span>' +
    '</div>' +
    '<div class="pulse-row" style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,0.06);">' +
      '<span style="font-size:13px;font-weight:700;">' + statusEmoji + ' На сем&#1100;ю</span>' +
      '<span style="font-weight:800;font-size:17px;color:' + cwColor + ';">' + cwText + '</span>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════
// ПЛАНИРОВЩИК — Динамический план + 4 цифры маржи
// ═══════════════════════════════════════════════════════════════

// Фиксированные расходы/мес: аренда 421К + коммуналка 9К + расходники 20К
var FIXED_COSTS = 450000;
// Кредиты ежемесячно
var CREDIT_PAYMENTS = 321000;
// EXTRA_INCOME определён в payments.js

var PLANNER_MONTH_NAMES = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDaysInMonth(m, y) {
  // m: 0-based
  if (m === 1 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) return 29;
  return MONTH_DAYS[m];
}

// ═══ Доп. доход (100К) — функции в payments.js ═══
// isExtraIncomeReceived(), toggleExtraIncome(), EXTRA_INCOME — определены в payments.js

function renderPlanner(data) {
  var el = document.getElementById('plannerCard');
  if (!el) return;

  if (!data || !data.totals || !data.totals.fact) {
    el.style.display = 'none';
    return;
  }

  var now = new Date();
  var curMonth = now.getMonth();
  var curYear = now.getFullYear();
  var today = now.getDate();
  var daysWithData = Math.max(1, today - 1); // вчера = последний закрытый день
  var dataMonth = (data.currentMonth || (curMonth + 1)) - 1;

  if (dataMonth !== curMonth) { el.style.display = 'none'; return; }

  var t = data.totals;
  var factAtelie = parseFloat(t.fact.atelie) || 0;
  var factHimch = parseFloat(t.fact.himchistka) || 0;
  if (factAtelie <= 0 || daysWithData < 2) { el.style.display = 'none'; return; }

  var daysInCurMonth = getDaysInMonth(curMonth, curYear);
  var daysLeft = daysInCurMonth - daysWithData; // оставшиеся дни (включая сегодня)

  // ═══ Дневные скорости (делим на закрытые дни) ═══
  var dailyAtelie = Math.round(factAtelie / daysWithData);        // полный оборот ателье/день
  var dailyHimch = Math.round(factHimch / daysWithData);           // химч/день
  var dailyBankAtelie = Math.round(factAtelie / 2 / daysWithData); // на р/с (ателье÷2)
  var dailyBankHimch = dailyHimch;                                // на р/с (химч вся)

  // Кредиты
  var creditsPaid = typeof getCreditsPaidTotal === 'function' ? getCreditsPaidTotal() : 0;
  var extraReceived = isExtraIncomeReceived();

  // ═══ Две базы для расчёта «на семью» ═══
  function calcBases(days, isCurrentMonth) {
    // ДОХОДЫ (что приходит на р/с)
    var incAtelie = dailyBankAtelie * days;
    var incHimch = dailyBankHimch * days;
    var incExtra = isCurrentMonth ? (extraReceived ? EXTRA_INCOME : 0) : EXTRA_INCOME;
    var totalIncome = incAtelie + incHimch + incExtra;

    // РАСХОДЫ
    var expHimchContractors = Math.round(dailyHimch * days * 0.6); // 60% от химч = подрядчики
    var expFixed = FIXED_COSTS;
    var expCredits = isCurrentMonth ? (CREDIT_PAYMENTS - creditsPaid) : CREDIT_PAYMENTS;
    var totalExpenses = expHimchContractors + expFixed + expCredits;

    return {
      incAtelie: incAtelie,
      incHimch: incHimch,
      incExtra: incExtra,
      totalIncome: totalIncome,
      expHimch: expHimchContractors,
      expFixed: expFixed,
      expCredits: expCredits,
      totalExpenses: totalExpenses,
      family: Math.round(totalIncome - totalExpenses)
    };
  }

  // ═══ Расчёты по периодам ═══
  var cur = calcBases(daysInCurMonth, true);

  var planAtelie = (t.plan && parseFloat(t.plan.atelie)) || 0;
  var planHimch = (t.plan && parseFloat(t.plan.himchistka)) || 0;
  var plan = null;
  if (planAtelie > 0) {
    var pIncA = Math.round(planAtelie / 2);
    var pIncH = Math.round(planHimch);
    var pIncE = extraReceived ? EXTRA_INCOME : 0;
    var pExpH = Math.round(planHimch * 0.6);
    var pTotInc = pIncA + pIncH + pIncE;
    var pTotExp = pExpH + FIXED_COSTS + (CREDIT_PAYMENTS - creditsPaid);
    plan = { totalIncome: pTotInc, totalExpenses: pTotExp, family: Math.round(pTotInc - pTotExp), incAtelie: pIncA, incHimch: pIncH };
    if (plan.family <= cur.family) plan = null; // план не лучше факта — не показываем
  }

  var nextMonth = (curMonth + 1) % 12;
  var nextYear = curMonth === 11 ? curYear + 1 : curYear;
  var daysInNextMonth = getDaysInMonth(nextMonth, nextYear);
  var nxt = calcBases(daysInNextMonth, false);

  var family3Sum = 0;
  var months3 = [];
  for (var i = 1; i <= 3; i++) {
    var mi = (curMonth + i) % 12;
    var yi = curMonth + i > 11 ? curYear + 1 : curYear;
    var diM = getDaysInMonth(mi, yi);
    var m = calcBases(diM, false);
    family3Sum += m.family;
    months3.push({ month: mi, days: diM, income: m.totalIncome, expenses: m.totalExpenses, family: m.family });
  }

  // ═══ RENDER ═══
  var capMonth = function(m) { return PLANNER_MONTH_NAMES[m].charAt(0).toUpperCase() + PLANNER_MONTH_NAMES[m].slice(1); };

  var bigNum = function(val) {
    var color = val >= 0 ? 'var(--green)' : 'var(--red)';
    return '<span style="font-weight:900;font-size:20px;color:' + color + ';">' + fmtShort(val) + '</span>';
  };

  var row = function(label, val, isNeg) {
    var display = typeof val === 'string' ? val : fmtShort(val);
    var color = isNeg ? 'color:var(--red);' : '';
    return '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);padding:2px 0;">' +
      '<span>' + label + '</span><span style="font-weight:600;' + color + '">' + display + '</span></div>';
  };

  // Детали с двумя базами
  function detailBlock(b, showExtra) {
    var html = '<div style="margin-top:6px;padding:6px 0;">';
    // ДОХОДЫ
    html += '<div style="font-size:10px;font-weight:700;color:var(--green);margin-bottom:2px;">ДОХОДЫ</div>';
    html += row('  ателье ÷ 2', fmtShort(b.incAtelie));
    html += row('  химчистка', fmtShort(b.incHimch));
    if (showExtra && b.incExtra > 0) html += row('  + доход 100К', fmtShort(b.incExtra));
    else if (showExtra && b.incExtra === 0) html += row('  + доход 100К', '⬜ не получен');
    html += row('  ИТОГО', fmtShort(b.totalIncome));
    // РАСХОДЫ
    html += '<div style="font-size:10px;font-weight:700;color:var(--red);margin-top:4px;margin-bottom:2px;">РАСХОДЫ</div>';
    html += row('  химч подрядчикам (60%)', '−' + fmtShort(b.expHimch));
    html += row('  фикс (аренда и тд)', '−' + fmtShort(b.expFixed));
    html += row('  кредиты', '−' + fmtShort(b.expCredits));
    html += row('  ИТОГО', '−' + fmtShort(b.totalExpenses));
    html += '</div>';
    return html;
  }

  function cardBlock(emoji, title, subtitle, familyVal, detailsHtml) {
    var statusEmoji = familyVal >= 200000 ? '&#x2705;' : familyVal >= 0 ? '&#x1F7E1;' : '&#x1F534;';
    return '<div class="planner-block">' +
      '<div class="planner-block-head">' +
        '<div><div style="font-size:13px;font-weight:700;">' + emoji + ' ' + title + '</div>' +
        '<div style="font-size:10px;color:var(--text-3);margin-top:1px;">' + subtitle + '</div></div>' +
        '<div style="text-align:right;">' + bigNum(familyVal) + '<div style="font-size:9px;color:var(--text-3);margin-top:1px;">' + statusEmoji + ' на семью</div></div>' +
      '</div>' +
      (detailsHtml || '') +
    '</div>';
  }

  // Детали 3 месяца
  var details3 = '';
  months3.forEach(function(d) {
    var mColor = d.family >= 0 ? 'var(--green)' : 'var(--red)';
    details3 += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;">' +
      '<span style="color:var(--text-3);">' + capMonth(d.month) + ' (' + d.days + 'д)</span>' +
      '<span><span style="color:var(--text-3);margin-right:6px;">+' + fmtShort(d.income) + '</span>' +
      '<span style="color:var(--text-3);margin-right:6px;">−' + fmtShort(d.expenses) + '</span>' +
      '<span style="font-weight:700;color:' + mColor + ';">' + fmtShort(d.family) + '</span></span></div>';
  });

  var dailyBank = dailyBankAtelie + dailyBankHimch;

  var html = '<div class="card" style="border-radius:16px;padding:16px;margin-bottom:12px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:14px;font-weight:800;">&#x1F4B0; На семью</div>' +
    '<div style="font-size:10px;color:var(--text-3);background:var(--surface-2);padding:3px 8px;border-radius:6px;font-weight:600;">доходы − расходы</div>' +
  '</div>';
  html += '<div style="font-size:11px;color:var(--text-3);margin-bottom:12px;">На р/с: <strong style="color:var(--text);">~' + fmtShort(dailyBank) + '/день</strong> (ателье&#247;2 ' + fmtShort(dailyBankAtelie) + ' + химч ' + fmtShort(dailyBankHimch) + ')</div>';

  html += cardBlock('&#x1F4CC;', capMonth(curMonth) + ' (факт)', daysWithData + ' дн. данных &#183; ' + fmtShort(dailyBank) + '/день', cur.family, detailBlock(cur, true));
  if (plan) {
    html += cardBlock('&#x1F4C8;', capMonth(curMonth) + ' (план)', 'если выполним план', plan.family,
      row('&#x1F4E5; Доходы по плану', fmtShort(plan.totalIncome)) +
      row('&#x1F4E4; Расходы', '&#8722;' + fmtShort(plan.totalExpenses)) +
      row('Разница с текущим', '+' + fmtShort(plan.family - cur.family)));
  }
  html += cardBlock('&#x1F4C6;', capMonth(nextMonth), daysInNextMonth + ' дней &#183; та же скорость', nxt.family, detailBlock(nxt, false));
  html += cardBlock('&#x1F4CA;', '3 месяца', capMonth((curMonth+1)%12) + '&#8211;' + capMonth((curMonth+3)%12) + ' суммарно', family3Sum, details3);

  html += '</div>';
  el.innerHTML = html;
  el.style.display = '';
}

// ── FORECAST ──
function calcNetworkForecast(filials) {
  if (!filials) return 0;
  var month = new Date().getMonth() + 1;
  var wf = typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
  return filials.reduce(function(sum, f) {
    var fc3 = calcForecast3Weeks(f.fact.total, month, wf);
    return sum + (fc3 ? fc3.total : f.fact.total);
  }, 0);
}

function calcForecast3Weeks(factTotal, month, weatherFactor) {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var daysPassed = (now.getMonth() + 1) === month ? Math.max(1, now.getDate() - 1) : ((now.getMonth() + 1) > month ? daysInMonth : 0);
  if (daysPassed === 0) return null;
  var nonWork = (month === 1) ? 5 : 0;
  var workPassed = Math.max(1, daysPassed - (month === 1 ? Math.min(nonWork, daysPassed) : 0));
  var workTotal = daysInMonth - nonWork;
  var workLeft = workTotal - workPassed;
  var dailyAvg = factTotal / workPassed;
  var adjustedDailyAvg = weatherFactor ? dailyAvg * weatherFactor : dailyAvg;
  return { total: Math.round(factTotal + adjustedDailyAvg * Math.max(0, workLeft)), daysPassed: workPassed, daysLeft: workLeft, daysInMonth: workTotal, note: '(' + workPassed + ' раб.дн.)', weatherFactor: weatherFactor || null };
}

// ═══════════════════════════════════════════════════════════════
// РЕАЛЬНАЯ МАРЖА — Этап 2
// ═══════════════════════════════════════════════════════════════

// Маппинг RSC-категорий → укрупнённые группы для маржи
// Исключаем: Переводы себе, Погашение кредитов (не расходы бизнеса)
var MARGIN_CAT_MAP = {
  'Аренда':                 'rent',
  'Подрядчики (химчистка)': 'salary',
  'Подрядчики (ателье)':    'salary',
  'Реклама':                'ads',
  'Налоги':                 'taxes',
  'Комиссии банка':         'acquiring',
  'Коммуналка':             'utilities',
  'Расходники':             'consumables',
  'Амортизация':            'equipment',
  'Оплата по счетам':       'other',
  'Прочее':                 'other'
};

var MARGIN_GROUP_META = {
  rent:        { label: 'Аренда',      emoji: '\uD83C\uDFE0', order: 1, source: 'K9' },
  salary:      { label: 'Подрядчики',  emoji: '\uD83D\uDC77', order: 2, source: 'РСч' },
  taxes:       { label: 'Налоги',      emoji: '\uD83D\uDCCB', order: 3, source: 'РСч' },
  consumables: { label: 'Расходные',   emoji: '\uD83D\uDCE6', order: 4, source: 'РСч' },
  ads:         { label: 'Реклама',     emoji: '\uD83D\uDCE2', order: 5, source: 'РСч' },
  acquiring:   { label: 'Эквайринг',   emoji: '\uD83C\uDFE6', order: 6, source: '0.7%' },
  utilities:   { label: 'Коммуналка',  emoji: '\uD83D\uDD27', order: 7, source: 'РСч' },
  equipment:   { label: 'Оборудование', emoji: '\uD83D\uDD28', order: 8, source: 'РСч' },
  other:       { label: 'Прочее',      emoji: '\u2753',        order: 9, source: 'РСч' }
};

// Авто-категоризатор для бизнес-транзакций из семейных выписок
var BIZ_AUTO_CATS = [
  { group: 'ads',    patterns: ['AVITO','АВИТО','YANDEX BUSINESS','ЯНДЕКС БИЗНЕС','VK РЕКЛАМ','РЕКЛАМ','YCLIENTS'] },
  { group: 'taxes',  patterns: ['НАЛОГ','NALOG','ФНС','ГОСУСЛУГ','УСН','НДФЛ','ПФР','ФСС','ПЕНСИОН'] },
  { group: 'other',  patterns: ['ДОМКЛИК','DOMCLICK','ИНГОССТРАХ','INGOSSTRAKH','СТРАХОВ'] }
];

function getBizAutoGroup(desc) {
  var upper = (desc || '').toUpperCase();
  for (var i = 0; i < BIZ_AUTO_CATS.length; i++) {
    for (var j = 0; j < BIZ_AUTO_CATS[i].patterns.length; j++) {
      if (upper.indexOf(BIZ_AUTO_CATS[i].patterns[j]) >= 0) return BIZ_AUTO_CATS[i].group;
    }
  }
  return 'other';
}

function calcRealMarginData(branchData) {
  if (!branchData || !branchData.totals) return null;

  var t = branchData.totals;
  var revenue = t.fact.total || 0;
  var profit = t.fact.profit || 0;
  var rentK9 = revenue - profit;

  // Собираем расходы из RSC
  var rscExpenses = {};
  if (typeof rscData !== 'undefined' && rscData && rscData.transactions) {
    var filtered = rscFilterMonth(rscData.transactions);
    filtered.forEach(function(tx) {
      var cat = rscGetCat(tx);
      if (cat === 'Переводы себе' || cat === 'Погашение кредитов') return;
      var group = MARGIN_CAT_MAP[cat] || 'other';
      if (group === 'rent') return; // Аренда только из K9
      if (!rscExpenses[group]) rscExpenses[group] = 0;
      rscExpenses[group] += tx.amount;
    });
  }

  // Собираем расходы из семейных выписок (bucket='business')
  var famBizExpenses = {};
  var excl = (familyData && familyData.excludedTransactions) || [];
  var nowMK = currentMonthKey();
  excl.forEach(function(tx) {
    if (tx.bucket !== 'business') return;
    var mk = tx.monthKey || getMonthKey(tx.date);
    if (mk !== nowMK) return;
    var group = getBizAutoGroup(tx.description);
    if (!famBizExpenses[group]) famBizExpenses[group] = 0;
    famBizExpenses[group] += Math.abs(tx.amount || 0);
  });

  // Объединяем: RSC приоритет, семейные добавляем
  var groups = {};
  for (var g in MARGIN_GROUP_META) {
    if (g === 'rent') continue;
    groups[g] = (rscExpenses[g] || 0) + (famBizExpenses[g] || 0);
  }

  // Эквайринг: если нет данных из RSC, расчёт 0.7% от выручки
  if (!groups.acquiring && revenue > 0) {
    groups.acquiring = Math.round(revenue * 0.007);
  }

  var totalExpenses = rentK9;
  for (var k in groups) totalExpenses += groups[k];

  var margin = revenue - totalExpenses;
  var marginPct = revenue > 0 ? (margin / revenue * 100).toFixed(1) : 0;

  return {
    revenue: revenue,
    rentK9: rentK9,
    groups: groups,
    totalExpenses: totalExpenses,
    margin: margin,
    marginPct: parseFloat(marginPct),
    hasRscData: !!rscData,
    hasFamBizData: Object.keys(famBizExpenses).length > 0
  };
}

function renderRealMargin(branchData) {
  var el = document.getElementById('realMarginCard');
  if (!el) return;

  var data = calcRealMarginData(branchData);
  if (!data) { el.style.display = 'none'; return; }

  var rows = '';
  // Аренда (K9) — всегда первая
  rows += '<div class="margin-row"><span>\uD83C\uDFE0 Аренда <span class="margin-src">(K9)</span></span><span class="margin-neg">\u2212' + fmtShort(data.rentK9) + '</span></div>';

  // Остальные группы, отсортированные
  var sorted = Object.keys(data.groups)
    .filter(function(g) { return data.groups[g] > 0; })
    .sort(function(a, b) { return data.groups[b] - data.groups[a]; });

  sorted.forEach(function(g) {
    var meta = MARGIN_GROUP_META[g];
    rows += '<div class="margin-row"><span>' + meta.emoji + ' ' + meta.label + ' <span class="margin-src">(' + meta.source + ')</span></span><span class="margin-neg">\u2212' + fmtShort(data.groups[g]) + '</span></div>';
  });

  var marginColor = data.marginPct >= 40 ? 'var(--green)' : data.marginPct >= 25 ? '#FFAA00' : 'var(--red)';
  var dataSource = data.hasRscData ? '\uD83D\uDCCA РСч + K9' : (data.hasFamBizData ? '\uD83D\uDCCA Выписки + K9' : '\uD83D\uDCCA Только K9');

  el.innerHTML =
    '<div class="card margin-card">' +
      '<div class="margin-header">' +
        '<div>\uD83D\uDCB0 Реальная маржа</div>' +
        '<div class="margin-src-badge">' + dataSource + '</div>' +
      '</div>' +
      '<div class="margin-revenue"><span>Выручка</span><span style="font-weight:800;">' + fmtShort(data.revenue) + '</span></div>' +
      '<div class="margin-divider"></div>' +
      rows +
      '<div class="margin-divider"></div>' +
      '<div class="margin-total"><span style="font-weight:800;">МАРЖА</span><span style="font-weight:800;font-size:18px;color:' + marginColor + ';">' + fmtShort(data.margin) + ' <span style="font-size:13px;">(' + data.marginPct + '%)</span></span></div>' +
      (!data.hasRscData && !data.hasFamBizData ? '<div class="margin-hint">\uD83D\uDCA1 Загрузите JSON в РСч-анализатор или PDF в семейный бюджет для точного расчёта расходов</div>' : '') +
    '</div>';
  el.style.display = '';
}

// Per-filial expenses from RSC ekvayring merchant mapping
function getFilialExpenses() {
  if (typeof rscData === 'undefined' || !rscData || !rscData.ekvayring) return {};
  if (typeof rscMerchantMap === 'undefined' || !rscMerchantMap) return {};
  var result = {};
  for (var mid in rscData.ekvayring) {
    var branch = rscMerchantMap[mid];
    if (!branch) continue;
    var ekv = rscData.ekvayring[mid];
    if (!result[branch]) result[branch] = { commission: 0, received: 0 };
    result[branch].commission += ekv.commission || 0;
    result[branch].received += ekv.received || 0;
  }
  return result;
}

// ── FILIALS ──
function renderFilials(data) {
  var grid = document.getElementById('filialsGrid');
  grid.innerHTML = '';
  if (!data || !data.filials) return;
  var month = data.currentMonth || (new Date().getMonth() + 1);
  var nowMonth = new Date().getMonth() + 1;
  var dayOfMonth = new Date().getDate();

  var filialExpenses = getFilialExpenses();

  var withZone = data.filials.map(function(f) {
    var perf = f.performance.total;
    var zone;
    if (dayOfMonth <= 5 && month === nowMonth) zone = 'yellow';
    else zone = perf >= 95 ? 'green' : perf >= 85 ? 'yellow' : 'red';
    return Object.assign({}, f, { zone: zone });
  });
  var sorted = [].concat(
    withZone.filter(function(f) { return f.zone === 'red'; }).sort(function(a, b) { return a.performance.total - b.performance.total; }),
    withZone.filter(function(f) { return f.zone === 'yellow'; }).sort(function(a, b) { return a.performance.total - b.performance.total; }),
    withZone.filter(function(f) { return f.zone === 'green'; }).sort(function(a, b) { return b.performance.total - a.performance.total; })
  );

  var zoneTitles = { red: '\uD83D\uDD34 Требуют внимания', yellow: '\uD83D\uDFE1 Под наблюдением', green: '\uD83D\uDFE2 Идут хорошо' };
  var lastZone = '';

  sorted.forEach(function(f, i) {
    var zone = f.zone;
    if (zone !== lastZone) {
      lastZone = zone;
      var zoneEl = document.createElement('div');
      zoneEl.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;font-weight:700;';
      zoneEl.innerHTML = zoneTitles[zone];
      grid.appendChild(zoneEl);
    }

    var perf = f.performance.total;
    var rankColor = zone === 'red' ? '#FF4D4D' : zone === 'yellow' ? '#FFAA00' : '#22C55E';
    var perfClass = zone === 'green' ? 'perf-high' : zone === 'yellow' ? 'perf-med' : 'perf-low';

    var fcHtml = '';
    if (month === nowMonth) {
      var wf = typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
      var fc3 = calcForecast3Weeks(f.fact.total, month, wf);
      var fcTotal = fc3 ? fc3.total : f.fact.total;
      var fcPct = f.plan.total > 0 ? Math.round(fcTotal / f.plan.total * 100) : 0;
      var fcEmoji = fcPct >= 95 ? '\uD83D\uDFE2' : fcPct >= 85 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
      var weatherDelta = '';
      if (fc3 && fc3.weatherFactor) {
        var fc0 = calcForecast3Weeks(f.fact.total, month, null);
        var d0 = fc0 ? (fcTotal - fc0.total) : 0;
        if (d0 !== 0) {
          var arr = d0 >= 0 ? '\u2191' : '\u2193';
          weatherDelta = ' <span style="font-size:10px;color:#7B61FF;">' + arr + fmtShort(Math.abs(d0)) + '</span>';
        }
      }
      fcHtml = '<div style="background:#EEF2FF;padding:10px 12px;border-radius:10px;margin-top:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="color:#7B61FF;font-weight:600;margin-bottom:2px;">\uD83D\uDD2E Прогноз</div></div>' +
        '<div style="text-align:right;"><div style="font-weight:800;font-size:14px;">' + fmt(fcTotal) + ' ' + fcEmoji + weatherDelta + '</div><div style="font-size:10px;color:#888;">' + fcPct + '% плана</div></div></div>';
    }

    var card = document.createElement('div');
    card.className = 'filial-card';
    card.innerHTML =
      '<div class="filial-top"><div class="filial-name">' + f.name + '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;"><div style="font-size:10px;color:#A29BFE;font-weight:600;">\u25B6 аналитика</div>' +
      '<div class="filial-rank" style="background:' + rankColor + ';">#' + (i + 1) + '</div></div></div>' +
      '<div class="filial-row"><span>Ателье:</span><span>' + fmt(f.fact.atelie) + '</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">План: ' + fmt(f.plan.atelie) + ' (' + f.performance.atelie + '%)</div>' +
      '<div class="filial-row"><span>Химчистка:</span><span>' + fmt(f.fact.himchistka) + '</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">План: ' + fmt(f.plan.himchistka) + ' (' + f.performance.himchistka + '%)</div>' +
      '<div class="filial-row"><span><strong>ИТОГО:</strong></span><span><strong>' + fmt(f.fact.total) + '</strong></span></div>' +
      '<div class="filial-perf ' + perfClass + '">' + perf + '% от плана</div>' +
      '<div style="background:#E7F3FF;padding:8px;border-radius:8px;margin-top:8px;font-size:11px;">' +
      '<div style="display:flex;justify-content:space-between;"><span>Ср.чек:</span><strong>' + fmt(f.fact.avgCheck) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;"><span>Прибыль:</span><strong>' + fmt(f.fact.profit) + '</strong></div>' +
      (function() {
        var fex = filialExpenses[f.name];
        if (!fex) return '';
        var realMargin = f.fact.profit - fex.commission;
        var rmPct = f.fact.total > 0 ? Math.round(realMargin / f.fact.total * 100) : 0;
        return '<div style="display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;border-top:1px dashed #C7D2FE;">' +
          '<span>Эквайринг:</span><strong style="color:var(--red);">\u2212' + fmt(fex.commission) + '</strong></div>' +
          '<div style="display:flex;justify-content:space-between;"><span style="font-weight:700;">Реал. маржа:</span>' +
          '<strong style="color:' + (rmPct >= 40 ? 'var(--green)' : rmPct >= 25 ? '#FFAA00' : 'var(--red)') + ';">' + fmt(realMargin) + ' (' + rmPct + '%)</strong></div>';
      })() +
      '</div>' + fcHtml;

    card.addEventListener('click', function() { openFilialDetail(f, month); });
    grid.appendChild(card);
  });

  // ── Карточка "Химчистка" (общая по сети) ──
  if (data.totals) {
    var t = data.totals;
    var himchFact = 0;
    data.filials.forEach(function(f) { himchFact += (f.fact.himchistka || 0); });
    if (!himchFact) himchFact = t.fact.himchistka || 0;
    var himchPlan = (t.plan && t.plan.himchistka) ? t.plan.himchistka : 0;
    var himchPerf = himchPlan > 0 ? Math.round(himchFact / himchPlan * 100) : 0;
    var himchZone = himchPerf >= 95 ? 'green' : himchPerf >= 85 ? 'yellow' : 'red';
    var himchPerfClass = himchZone === 'green' ? 'perf-high' : himchZone === 'yellow' ? 'perf-med' : 'perf-low';
    var himchRankColor = himchZone === 'red' ? '#FF4D4D' : himchZone === 'yellow' ? '#FFAA00' : '#22C55E';

    // Прогноз химчистки
    var himchFcHtml = '';
    if (month === nowMonth && himchFact > 0) {
      var wf = typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
      var himchFc = calcForecast3Weeks(himchFact, month, wf);
      var himchFcTotal = himchFc ? himchFc.total : himchFact;
      var himchFcPct = himchPlan > 0 ? Math.round(himchFcTotal / himchPlan * 100) : 0;
      var himchFcEmoji = himchFcPct >= 95 ? '\uD83D\uDFE2' : himchFcPct >= 85 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
      himchFcHtml = '<div style="background:#EEF2FF;padding:10px 12px;border-radius:10px;margin-top:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="color:#7B61FF;font-weight:600;margin-bottom:2px;">\uD83D\uDD2E Прогноз</div></div>' +
        '<div style="text-align:right;"><div style="font-weight:800;font-size:14px;">' + fmt(himchFcTotal) + ' ' + himchFcEmoji + '</div><div style="font-size:10px;color:#888;">' + himchFcPct + '% плана</div></div></div>';
    }

    // Разбивка по филиалам
    var himchByBranch = '';
    data.filials.forEach(function(f) {
      var hc = f.fact.himchistka || 0;
      if (hc > 0) {
        himchByBranch += '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#666;">' + f.name + '</span><strong>' + fmtShort(hc) + '</strong></div>';
      }
    });

    var zoneLabel = document.createElement('div');
    zoneLabel.style.cssText = 'font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px;font-weight:700;';
    zoneLabel.innerHTML = '\uD83E\uDDF9 Химчистка (сеть)';
    grid.appendChild(zoneLabel);

    var himchCard = document.createElement('div');
    himchCard.className = 'filial-card';
    himchCard.style.borderLeft = '4px solid ' + himchRankColor;
    himchCard.innerHTML =
      '<div class="filial-top"><div class="filial-name">\uD83E\uDDF9 Химчистка</div>' +
      '<div class="filial-rank" style="background:' + himchRankColor + ';">' + himchPerf + '%</div></div>' +
      '<div class="filial-row"><span>Факт:</span><span><strong>' + fmt(himchFact) + '</strong></span></div>' +
      '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">План: ' + fmt(himchPlan) + ' (' + himchPerf + '%)</div>' +
      '<div class="filial-perf ' + himchPerfClass + '">' + himchPerf + '% от плана</div>' +
      (himchByBranch ? '<div style="background:#E7F3FF;padding:8px;border-radius:8px;margin-top:8px;font-size:11px;">' + himchByBranch + '</div>' : '') +
      himchFcHtml;
    grid.appendChild(himchCard);
  }
}

// ── FILIAL DETAIL OVERLAY ── (moved to bottom of file, enhanced version)

function loadBranchDailyData(f, month, zoneColor) {
  // Используем getBranchDaily — прямые дневные данные филиала
  var year = document.getElementById('bizYearSelect') ? document.getElementById('bizYearSelect').value : new Date().getFullYear();
  fetchWithTimeout(API_ATELIE + '?action=getBranchDaily&branch=' + encodeURIComponent(f.code) + '&month=' + month, 15000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.success || !data.dailyData || data.dailyData.length < 3) {
        // Фолбэк на старый метод getDailyChart
        loadBranchDailyDataFallback(f, month, zoneColor);
        return;
      }
      var branchDays = data.dailyData.map(function(d) {
        var dd = d.date.substring(0, 2);
        var mm = d.date.substring(3, 5);
        return {
          date: year + '-' + mm + '-' + dd,
          total: d.atelie || 0,
          clients: d.clients || 0
        };
      }).filter(function(d) { return d.total > 0 || d.clients > 0; });

      if (branchDays.length < 3) {
        showBranchDataEmpty();
        return;
      }
      var weeks = buildWeeksFromDays(branchDays, month);
      var el = document.getElementById('weekRevChart');
      if (el) el.innerHTML = renderWeekBars(weeks, zoneColor);
      var analyticsEl = document.getElementById('branchAnalytics');
      if (analyticsEl) analyticsEl.innerHTML = renderBranchAnalytics(weeks);

      // Показать дневную таблицу под графиком
      var dailyEl = document.getElementById('branchDailyTable');
      if (dailyEl) dailyEl.innerHTML = renderDailyTable(data.dailyData, data.totals);
    })
    .catch(function() {
      loadBranchDailyDataFallback(f, month, zoneColor);
    });
}

function loadBranchDailyDataFallback(f, month, zoneColor) {
  fetchWithTimeout(API_ATELIE + '?action=getDailyChart&days=42', 15000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.success || !data.days || data.days.length < 3) {
        showBranchDataEmpty();
        return;
      }
      var year = document.getElementById('bizYearSelect') ? document.getElementById('bizYearSelect').value : new Date().getFullYear();
      var branchDays = data.days.map(function(d) {
        var br = (d.branches || []).find(function(b) { return b.code === f.code; });
        var dd = d.date.substring(0, 2);
        var mm = d.date.substring(3, 5);
        return { date: year + '-' + mm + '-' + dd, total: br ? (br.atelie || 0) : 0, clients: br ? (br.clients || 0) : 0 };
      }).filter(function(d) { return d.total > 0 || d.clients > 0; });
      if (branchDays.length < 3) { showBranchDataEmpty(); return; }
      var weeks = buildWeeksFromDays(branchDays, month);
      var el = document.getElementById('weekRevChart');
      if (el) el.innerHTML = renderWeekBars(weeks, zoneColor);
      var analyticsEl = document.getElementById('branchAnalytics');
      if (analyticsEl) analyticsEl.innerHTML = renderBranchAnalytics(weeks);
    })
    .catch(function() { showBranchDataEmpty(); });
}

function renderDailyTable(dailyData, totals) {
  if (!dailyData || dailyData.length === 0) return '';
  var html = '<div class="filial-detail-section">' +
    '<div class="filial-detail-section-title">&#x1F4C5; По дням</div>' +
    '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
    '<tr style="color:var(--text-3);border-bottom:1px solid var(--border);"><th style="text-align:left;padding:4px;">Дата</th><th style="text-align:right;padding:4px;">Ателье</th><th style="text-align:right;padding:4px;">ХЧ</th><th style="text-align:right;padding:4px;">Кл</th></tr>';
  dailyData.forEach(function(d) {
    html += '<tr style="border-bottom:1px solid var(--border);">' +
      '<td style="padding:3px 4px;">' + d.date + '</td>' +
      '<td style="text-align:right;padding:3px 4px;">' + fmtShort(d.atelie || 0) + '</td>' +
      '<td style="text-align:right;padding:3px 4px;">' + fmtShort(d.himchistka || 0) + '</td>' +
      '<td style="text-align:right;padding:3px 4px;">' + (d.clients || 0) + '</td>' +
    '</tr>';
  });
  if (totals) {
    html += '<tr style="font-weight:700;border-top:2px solid var(--text-1);">' +
      '<td style="padding:4px;">Итого</td>' +
      '<td style="text-align:right;padding:4px;">' + fmtShort(totals.atelie || 0) + '</td>' +
      '<td style="text-align:right;padding:4px;">' + fmtShort(totals.himchistka || 0) + '</td>' +
      '<td style="text-align:right;padding:4px;">' + (totals.clients || 0) + '</td>' +
    '</tr>';
  }
  html += '</table></div>';
  return html;
}

function showBranchDataEmpty() {
  var el = document.getElementById('weekRevChart');
  if (el) el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text-3);padding:20px;">Посуточные данные недоступны</div>';
}

function buildWeeksFromDays(days, month) {
  var weekMap = {};
  days.forEach(function(d) {
    var dt = new Date(d.date);
    var dow = dt.getDay();
    var diff = (dow === 0) ? -6 : 1 - dow;
    var mon = new Date(dt); mon.setDate(dt.getDate() + diff);
    var key = mon.toISOString().substring(0, 10);
    if (!weekMap[key]) weekMap[key] = { total: 0, clients: 0, days: 0 };
    weekMap[key].total += d.total;
    weekMap[key].clients += d.clients;
    weekMap[key].days++;
  });
  var keys = Object.keys(weekMap).sort().slice(-6);
  return keys.map(function(key, i) {
    var w = weekMap[key];
    var check = w.clients > 0 ? Math.round(w.total / w.clients) : 0;
    var prev = i > 0 ? weekMap[keys[i - 1]] : null;
    var pct = prev && prev.total > 0 ? Math.round((w.total / prev.total - 1) * 100) : null;
    var pctClients = prev && prev.clients > 0 ? Math.round((w.clients / prev.clients - 1) * 100) : null;
    var prevCheck = prev && prev.clients > 0 ? Math.round(prev.total / prev.clients) : 0;
    var pctCheck = prevCheck > 0 ? Math.round((check / prevCheck - 1) * 100) : null;
    return { label: 'Нед ' + (i + 1), val: w.total, check: check, clients: w.clients, days: w.days, pct: pct, pctClients: pctClients, pctCheck: pctCheck };
  });
}

function renderWeekBars(weeks, color) {
  var maxVal = Math.max.apply(null, weeks.map(function(w) { return w.val; }));
  return '<div style="display:flex;align-items:flex-end;gap:6px;height:100px;">' +
    weeks.map(function(w, i) {
      var h = Math.max(4, Math.round(w.val / maxVal * 80));
      var isLast = i === weeks.length - 1;
      var pctStr = w.pct !== null ? (w.pct > 0 ? '+' + w.pct + '%' : w.pct + '%') : '';
      var pctColor = w.pct > 0 ? '#22C55E' : w.pct < 0 ? '#FF4D4D' : '#888';
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<div style="font-size:8px;color:' + pctColor + ';font-weight:700;min-height:12px;">' + pctStr + '</div>' +
        '<div style="flex:1;display:flex;align-items:flex-end;width:100%;">' +
          '<div style="width:100%;height:' + h + 'px;background:' + (isLast ? color : '#C4B5FD') + ';border-radius:4px 4px 0 0;opacity:' + (isLast ? '1' : '0.7') + ';"></div>' +
        '</div>' +
        '<div style="font-size:7px;color:#666;">' + Math.round(w.val / 1000) + '\u041A</div>' +
        '<div style="font-size:7px;color:#888;">' + w.label + '</div></div>';
    }).join('') + '</div>';
}

// ── BRANCH ANALYTICS — тренды за 6 недель ──
function renderBranchAnalytics(weeks) {
  if (!weeks || weeks.length < 2) return '';

  var html = '<div class="filial-detail-section" style="margin-top:12px;">' +
    '<div class="filial-detail-section-title">\uD83D\uDCCA Тренды за ' + weeks.length + ' недель</div>';

  // Тренд-индикаторы (последняя vs первая неделя)
  var first = weeks[0];
  var last = weeks[weeks.length - 1];
  var trendVal = first.val > 0 ? Math.round((last.val / first.val - 1) * 100) : 0;
  var trendCl = first.clients > 0 ? Math.round((last.clients / first.clients - 1) * 100) : 0;
  var trendChk = first.check > 0 ? Math.round((last.check / first.check - 1) * 100) : 0;

  function trendArrow(pct) {
    if (pct > 5) return '\u2191';
    if (pct < -5) return '\u2193';
    return '\u2192';
  }
  function trendColor(pct) {
    if (pct > 5) return '#22C55E';
    if (pct < -5) return '#EF4444';
    return '#888';
  }
  function trendSign(pct) { return pct > 0 ? '+' + pct + '%' : pct + '%'; }

  html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  html += '<div style="flex:1;background:#F8F7FF;border-radius:8px;padding:8px;text-align:center;">' +
    '<div style="font-size:10px;color:#888;">Выручка</div>' +
    '<div style="font-size:18px;font-weight:700;color:' + trendColor(trendVal) + ';">' + trendArrow(trendVal) + ' ' + trendSign(trendVal) + '</div></div>';
  html += '<div style="flex:1;background:#F0FFF4;border-radius:8px;padding:8px;text-align:center;">' +
    '<div style="font-size:10px;color:#888;">Клиенты</div>' +
    '<div style="font-size:18px;font-weight:700;color:' + trendColor(trendCl) + ';">' + trendArrow(trendCl) + ' ' + trendSign(trendCl) + '</div></div>';
  html += '<div style="flex:1;background:#FFF7ED;border-radius:8px;padding:8px;text-align:center;">' +
    '<div style="font-size:10px;color:#888;">Ср. чек</div>' +
    '<div style="font-size:18px;font-weight:700;color:' + trendColor(trendChk) + ';">' + trendArrow(trendChk) + ' ' + trendSign(trendChk) + '</div></div>';
  html += '</div>';

  // Таблица по неделям
  html += '<div style="overflow-x:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
  html += '<thead><tr style="border-bottom:2px solid #E5E7EB;">' +
    '<th style="text-align:left;padding:4px 6px;color:#888;">Нед</th>' +
    '<th style="text-align:right;padding:4px 6px;color:#888;">Выручка</th>' +
    '<th style="text-align:right;padding:4px 6px;color:#888;">\u0394</th>' +
    '<th style="text-align:right;padding:4px 6px;color:#888;">Кл</th>' +
    '<th style="text-align:right;padding:4px 6px;color:#888;">\u0394</th>' +
    '<th style="text-align:right;padding:4px 6px;color:#888;">Чек</th>' +
    '<th style="text-align:right;padding:4px 6px;color:#888;">\u0394</th>' +
    '</tr></thead><tbody>';

  weeks.forEach(function(w, i) {
    var isLast = i === weeks.length - 1;
    var rowBg = isLast ? '#F0EDFF' : (i % 2 === 0 ? '#FAFAFA' : '#FFF');
    html += '<tr style="background:' + rowBg + ';' + (isLast ? 'font-weight:700;' : '') + '">';
    html += '<td style="padding:5px 6px;">' + w.label + (w.days < 7 ? ' (' + w.days + 'д)' : '') + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;">' + fmtShort(w.val) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:' + (w.pct !== null ? trendColor(w.pct) : '#CCC') + ';font-size:10px;">' + (w.pct !== null ? trendSign(w.pct) : '\u2014') + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;">' + w.clients + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:' + (w.pctClients !== null ? trendColor(w.pctClients) : '#CCC') + ';font-size:10px;">' + (w.pctClients !== null ? trendSign(w.pctClients) : '\u2014') + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;">' + fmt(w.check) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:' + (w.pctCheck !== null ? trendColor(w.pctCheck) : '#CCC') + ';font-size:10px;">' + (w.pctCheck !== null ? trendSign(w.pctCheck) : '\u2014') + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

// ── NETWORK DETAIL OVERLAY (Enhanced) ──
function openNetworkDetail(metricKey) {
  if (!state.branches || !state.branches.filials) return;
  var data = state.branches;
  var month = data.currentMonth || (new Date().getMonth() + 1);
  var now = new Date();
  var yearSel = document.getElementById('bizYearSelect');
  var selYear = yearSel ? parseInt(yearSel.value) : now.getFullYear();
  var isCurrentMonth = (now.getMonth() + 1) === month && now.getFullYear() === selYear;
  var dayOfMonth = isCurrentMonth ? Math.max(1, now.getDate() - 1) : new Date(selYear, month, 0).getDate();
  var daysInMonth = new Date(selYear, month, 0).getDate();
  var daysLeft = isCurrentMonth ? daysInMonth - dayOfMonth : 0;

  var METRIC = {
    atelie:      { title: '\u2702\uFE0F Ателье \u2014 сеть', color: '#6C5CE7' },
    avgcheck:    { title: '\uD83D\uDCB0 Средний чек \u2014 сеть', color: '#0984E3' },
    total:       { title: '\uD83D\uDCCA Выручка итого', color: '#00B894' },
    clients:     { title: '\uD83D\uDC65 Клиенты \u2014 сеть', color: '#E17055' },
    himchistka:  { title: '\uD83E\uDDF9 Химчистка \u2014 сеть', color: '#00CEC9' },
    profit:      { title: '\uD83D\uDCC8 Эффективность \u2014 сеть', color: '#FDCB6E' },
    forecast:    { title: '\uD83D\uDD2E Прогноз \u2014 сеть', color: '#A29BFE' }
  };
  var cfg = METRIC[metricKey]; if (!cfg) return;

  // ── Build per-filial rows ──
  var rows = data.filials.map(function(f) {
    var r = { name: f.name, f: f };

    if (metricKey === 'avgcheck') {
      r.fact = f.fact.avgCheck || 0;
      r.plan = (f.plan.clients > 0 && f.plan.atelie > 0) ? Math.round(f.plan.atelie / f.plan.clients) : 0;
      r.pct = r.plan > 0 ? Math.round(r.fact / r.plan * 100) : 0;
      r.clients = f.fact.clients || 0;
    } else if (metricKey === 'clients') {
      r.fact = f.fact.clients || 0;
      r.plan = f.plan.clients || 0;
      r.pct = r.plan > 0 ? Math.round(r.fact / r.plan * 100) : 0;
      if (isCurrentMonth && dayOfMonth > 0) {
        r.forecast = Math.round(r.fact / dayOfMonth * daysInMonth);
        r.dailyNeed = daysLeft > 0 ? Math.max(0, Math.round((r.plan - r.fact) / daysLeft)) : 0;
        r.shortfall = Math.max(0, r.plan - r.forecast);
      }
    } else if (metricKey === 'forecast') {
      var wfFc = typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
      var fc = calcForecast3Weeks(f.fact.total, month, wfFc);
      r.fact = fc ? fc.total : f.fact.total;
      r.plan = f.plan.total || 0;
      r.pct = r.plan > 0 ? Math.round(r.fact / r.plan * 100) : 0;
      r.shortfall = Math.max(0, r.plan - r.fact);
      if (isCurrentMonth && daysLeft > 0) {
        r.dailyCurrent = Math.round(f.fact.total / dayOfMonth);
        r.dailyNeed = Math.max(0, Math.round((r.plan - f.fact.total) / daysLeft));
        r.dailyExtra = Math.max(0, r.dailyNeed - r.dailyCurrent);
      }
    } else if (metricKey === 'profit') {
      r.fact = f.fact.profit || 0;
      r.revenue = f.fact.total || 0;
      r.marginPct = r.revenue > 0 ? Math.round(r.fact / r.revenue * 100) : 0;
      r.plan = 0; r.pct = 0;
    } else if (metricKey === 'himchistka') {
      r.fact = f.fact.himchistka || 0;
      r.plan = f.plan.himchistka || 0;
      r.pct = r.plan > 0 ? Math.round(r.fact / r.plan * 100) : 0;
    } else if (metricKey === 'atelie') {
      r.fact = f.fact.atelie || 0;
      r.plan = f.plan.atelie || 0;
      r.pct = r.plan > 0 ? Math.round(r.fact / r.plan * 100) : 0;
      if (isCurrentMonth && dayOfMonth > 0) {
        var wfA = typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
        var fcA = calcForecast3Weeks(f.fact.atelie, month, wfA);
        r.forecast = fcA ? fcA.total : r.fact;
        r.forecastPct = r.plan > 0 ? Math.round(r.forecast / r.plan * 100) : 0;
        r.shortfall = Math.max(0, r.plan - r.forecast);
      }
    } else { // total
      r.fact = f.fact.total || 0;
      r.plan = f.plan.total || 0;
      r.pct = r.plan > 0 ? Math.round(r.fact / r.plan * 100) : 0;
      if (isCurrentMonth && dayOfMonth > 0) {
        var wfT = typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
        var fcT = calcForecast3Weeks(f.fact.total, month, wfT);
        r.forecast = fcT ? fcT.total : r.fact;
        r.forecastPct = r.plan > 0 ? Math.round(r.forecast / r.plan * 100) : 0;
        r.shortfall = Math.max(0, r.plan - r.forecast);
      }
    }
    return r;
  });

  // Sort
  if (metricKey === 'profit') rows.sort(function(a, b) { return b.marginPct - a.marginPct; });
  else rows.sort(function(a, b) { return b.fact - a.fact; });

  // ── Totals ──
  var totalFact, totalPlan, totalPct;
  if (metricKey === 'avgcheck') {
    totalFact = data.totals.fact.avgCheck || 0;
    var tPlanCl = data.totals.plan ? (data.totals.plan.clients || 0) : 0;
    var tPlanAt = data.totals.plan ? (data.totals.plan.atelie || 0) : 0;
    totalPlan = tPlanCl > 0 ? Math.round(tPlanAt / tPlanCl) : 0;
    totalPct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
  } else if (metricKey === 'profit') {
    totalFact = data.totals.fact.profit || 0;
    totalPlan = data.totals.fact.total || 0;
    totalPct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
  } else {
    totalFact = rows.reduce(function(s, r) { return s + r.fact; }, 0);
    totalPlan = rows.reduce(function(s, r) { return s + r.plan; }, 0);
    totalPct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
  }
  var maxFact = Math.max.apply(null, rows.map(function(r) { return metricKey === 'profit' ? Math.abs(r.fact) : r.fact; })) || 1;

  // ── Render rows per metric ──
  var rowsHtml = '';

  if (metricKey === 'avgcheck') {
    rows.forEach(function(r) {
      var barW = maxFact > 0 ? Math.round(r.fact / maxFact * 100) : 0;
      var zc = r.plan > 0 ? (r.pct >= 100 ? '#22C55E' : r.pct >= 90 ? '#FFAA00' : '#FF4D4D') : '#888';
      rowsHtml += '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
          '<span style="font-size:13px;font-weight:600;">' + r.name + '</span>' +
          '<span style="font-size:14px;font-weight:800;">' + fmt(r.fact) + '</span></div>' +
        '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + cfg.color + ';border-radius:6px;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;">' +
          '<span>' + r.clients + ' кл \u00b7 план ' + (r.plan > 0 ? fmt(r.plan) : '\u2014') + '</span>' +
          '<span style="color:' + zc + ';font-weight:700;">' + (r.plan > 0 ? r.pct + '%' : '') + '</span></div></div>';
    });

  } else if (metricKey === 'clients') {
    rows.forEach(function(r) {
      var barW = maxFact > 0 ? Math.round(r.fact / maxFact * 100) : 0;
      var zc = r.pct >= 95 ? '#22C55E' : r.pct >= 85 ? '#FFAA00' : '#FF4D4D';
      var extra = '';
      if (r.forecast !== undefined && isCurrentMonth) {
        var fcOk = r.forecast >= r.plan;
        extra = '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px;">' +
          '<span style="color:' + (fcOk ? '#22C55E' : '#FF4D4D') + ';">' + (fcOk ? '\uD83D\uDFE2' : '\uD83D\uDD34') + ' прогноз ' + r.forecast + ' кл</span>' +
          (r.dailyNeed > 0
            ? '<span style="color:#E17055;font-weight:600;">нужно ' + r.dailyNeed + ' кл/день</span>'
            : '<span style="color:#22C55E;font-weight:600;">\u2713 в плане</span>') +
        '</div>';
      }
      rowsHtml += '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
          '<span style="font-size:13px;font-weight:600;">' + r.name + '</span>' +
          '<span style="font-size:14px;font-weight:800;">' + r.fact + '</span></div>' +
        '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + cfg.color + ';border-radius:6px;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;">' +
          '<span>план ' + r.plan + '</span>' +
          '<span style="color:' + zc + ';font-weight:700;">' + r.pct + '%</span></div>' +
        extra + '</div>';
    });

  } else if (metricKey === 'profit') {
    rows.forEach(function(r) {
      var mc = r.marginPct >= 50 ? '#22C55E' : r.marginPct >= 40 ? '#FFAA00' : '#FF4D4D';
      var barW = Math.min(Math.max(r.marginPct, 0), 100);
      rowsHtml += '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
          '<span style="font-size:13px;font-weight:600;">' + r.name + '</span>' +
          '<span style="font-size:14px;font-weight:800;color:' + mc + ';">' + r.marginPct + '%</span></div>' +
        '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + mc + ';border-radius:6px;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;">' +
          '<span>выручка ' + fmtShort(r.revenue) + '</span>' +
          '<span>прибыль ' + fmtShort(r.fact) + '</span></div></div>';
    });

  } else if (metricKey === 'forecast') {
    rows.forEach(function(r) {
      var barW = r.plan > 0 ? Math.min(Math.round(r.fact / r.plan * 100), 100) : 0;
      var zc = r.pct >= 95 ? '#22C55E' : r.pct >= 85 ? '#FFAA00' : '#FF4D4D';
      var extra = '';
      if (isCurrentMonth && r.dailyNeed !== undefined) {
        var shortStr = r.shortfall > 0 ? 'не хватает ' + fmtShort(r.shortfall) : '\u2713 перевыполнение';
        var needStr = r.dailyNeed > 0 ? 'нужно ' + fmtShort(r.dailyNeed) + '/день' : '\u2713 темп ок';
        var needColor = r.dailyExtra > 0 ? '#FF4D4D' : '#22C55E';
        extra = '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px;">' +
          '<span style="color:#888;">' + shortStr + '</span>' +
          '<span style="color:' + needColor + ';font-weight:600;">' + needStr + '</span></div>';
        if (r.dailyExtra > 0) {
          extra += '<div style="font-size:9px;color:#aaa;margin-top:1px;">сейчас ' + fmtShort(r.dailyCurrent) + '/день \u2192 нужно +' + fmtShort(r.dailyExtra) + '/день</div>';
        }
      }
      rowsHtml += '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
          '<span style="font-size:13px;font-weight:600;">' + r.name + '</span>' +
          '<span style="font-size:14px;font-weight:800;">' + fmtShort(r.fact) + '</span></div>' +
        '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + cfg.color + ';border-radius:6px;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;">' +
          '<span>план ' + fmtShort(r.plan) + '</span>' +
          '<span style="color:' + zc + ';font-weight:700;">' + r.pct + '%</span></div>' +
        extra + '</div>';
    });

  } else {
    // atelie, total — with forecast + shortfall
    rows.forEach(function(r) {
      var barW = maxFact > 0 ? Math.round(r.fact / maxFact * 100) : 0;
      var zc = r.pct >= 95 ? '#22C55E' : r.pct >= 85 ? '#FFAA00' : '#FF4D4D';
      var extra = '';
      if (isCurrentMonth && r.forecast !== undefined) {
        var fcOk = r.forecastPct >= 95;
        var fcEmoji = r.forecastPct >= 95 ? '\uD83D\uDFE2' : r.forecastPct >= 85 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
        var shortStr = r.shortfall > 0 ? 'не хватает ' + fmtShort(r.shortfall) : '\u2713 перевып.';
        extra = '<div style="display:flex;justify-content:space-between;font-size:10px;color:#666;margin-top:2px;">' +
          '<span>' + fcEmoji + ' прогноз ' + fmtShort(r.forecast) + ' (' + r.forecastPct + '%)</span>' +
          '<span>' + shortStr + '</span></div>';
      }
      rowsHtml += '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
          '<span style="font-size:13px;font-weight:600;">' + r.name + '</span>' +
          '<span style="font-size:14px;font-weight:800;">' + fmtShort(r.fact) + '</span></div>' +
        '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + cfg.color + ';border-radius:6px;"></div></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;">' +
          '<span>план ' + fmtShort(r.plan) + '</span>' +
          '<span style="color:' + zc + ';font-weight:700;">' + r.pct + '%</span></div>' +
        extra + '</div>';
    });
  }

  // ── Header values per metric ──
  var headerVals = '';
  var headerSub = totalPct + '% плана';

  if (metricKey === 'profit') {
    var tMargin = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
    headerSub = '\u043C\u0430\u0440\u0436\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043F\u043E \u0444\u0438\u043B\u0438\u0430\u043B\u0430\u043C';
    headerVals = '<div style="display:flex;gap:16px;margin-top:12px;">' +
      '<div><div style="font-size:10px;opacity:0.8;">\u0412\u042B\u0420\u0423\u0427\u041A\u0410</div><div style="font-size:22px;font-weight:800;">' + fmtShort(totalPlan) + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">\u041F\u0420\u0418\u0411\u042B\u041B\u042C</div><div style="font-size:22px;font-weight:800;">' + fmtShort(totalFact) + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">\u041C\u0410\u0420\u0416\u0410</div><div style="font-size:22px;font-weight:800;">' + tMargin + '%</div></div></div>';
  } else if (metricKey === 'avgcheck') {
    headerVals = '<div style="display:flex;gap:16px;margin-top:12px;">' +
      '<div><div style="font-size:10px;opacity:0.8;">\u0424\u0410\u041A\u0422</div><div style="font-size:22px;font-weight:800;">' + fmt(totalFact) + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">\u041F\u041B\u0410\u041D</div><div style="font-size:22px;font-weight:800;">' + (totalPlan > 0 ? fmt(totalPlan) : '\u2014') + '</div></div>' +
      (totalPlan > 0 ? '<div><div style="font-size:10px;opacity:0.8;">%</div><div style="font-size:22px;font-weight:800;">' + totalPct + '%</div></div>' : '') + '</div>';
  } else if (metricKey === 'clients' && isCurrentMonth) {
    var tForecast = Math.round(totalFact / dayOfMonth * daysInMonth);
    var tDailyNeed = daysLeft > 0 ? Math.max(0, Math.round((totalPlan - totalFact) / daysLeft)) : 0;
    headerVals = '<div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">' +
      '<div><div style="font-size:10px;opacity:0.8;">\u0424\u0410\u041A\u0422</div><div style="font-size:20px;font-weight:800;">' + totalFact + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">\u041F\u041B\u0410\u041D</div><div style="font-size:20px;font-weight:800;">' + totalPlan + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">\u041F\u0420\u041E\u0413\u041D\u041E\u0417</div><div style="font-size:20px;font-weight:800;">' + tForecast + '</div></div>' +
      (tDailyNeed > 0 ? '<div><div style="font-size:10px;opacity:0.8;">\u041D\u0423\u0416\u041D\u041E/\u0414\u0415\u041D\u042C</div><div style="font-size:20px;font-weight:800;color:#FFD700;">' + tDailyNeed + '</div></div>' : '') + '</div>';
  } else {
    headerVals = '<div style="display:flex;gap:16px;margin-top:12px;">' +
      '<div><div style="font-size:10px;opacity:0.8;">\u0424\u0410\u041A\u0422</div><div style="font-size:22px;font-weight:800;">' + fmtShort(totalFact) + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">\u041F\u041B\u0410\u041D</div><div style="font-size:22px;font-weight:800;">' + fmtShort(totalPlan) + '</div></div>' +
      '<div><div style="font-size:10px;opacity:0.8;">%</div><div style="font-size:22px;font-weight:800;">' + totalPct + '%</div></div></div>';
  }

  var progressBar = metricKey !== 'profit' && totalPlan > 0
    ? '<div style="background:rgba(255,255,255,0.2);border-radius:8px;height:8px;overflow:hidden;margin-top:10px;"><div style="height:100%;width:' + Math.min(totalPct, 100) + '%;background:white;border-radius:8px;"></div></div>'
    : '';

  // ── Disclaimer for profit ──
  var disclaimer = '';
  if (metricKey === 'profit') {
    disclaimer = '<div style="padding:0 14px 10px;font-size:10px;color:#aaa;text-align:center;">\u26A0\uFE0F \u041F\u0440\u0438\u0431\u044B\u043B\u044C \u043F\u043E \u0434\u0430\u043D\u043D\u044B\u043C Google Sheets (K9). \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u043E\u0440\u043C\u0443\u043B\u044B \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0435 \u0435\u0441\u043B\u0438 \u0446\u0438\u0444\u0440\u044B \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B</div>';
  }

  var overlay = getOverlay('networkOverlay');
  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="background:linear-gradient(135deg,' + cfg.color + ',' + cfg.color + 'CC);color:white;padding:16px 18px 18px;margin-top:8px;">' +
      '<div style="font-size:18px;font-weight:800;">' + cfg.title + '</div>' +
      '<div style="font-size:13px;opacity:0.85;margin-top:3px;">' + MONTH_NAMES_CAP[month] + ' ' + selYear + ' \u00b7 ' + headerSub + '</div>' +
      headerVals + progressBar +
    '</div>' +
    '<div style="padding:14px;"><div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">\u041F\u043E \u0444\u0438\u043B\u0438\u0430\u043B\u0430\u043C</div>' + rowsHtml + '</div>' +
    disclaimer +
    '<div class="overlay-close" onclick="closeOverlay(\'networkOverlay\')">\u0417\u0430\u043A\u0440\u044B\u0442\u044C</div>';

  showOverlay('networkOverlay');
}

// ═══════════════════════════════════════════════════════════════
// РСч АНАЛИЗАТОР — Расчётный счёт ИП
// ═══════════════════════════════════════════════════════════════

var RSC_CATEGORIES = {
  'Переводы себе':          { emoji: '\uD83D\uDCB8', order: 1 },
  'Аренда':                 { emoji: '\uD83C\uDFE0', order: 2 },
  'Подрядчики (химчистка)': { emoji: '\uD83E\uDDF9', order: 3 },
  'Подрядчики (ателье)':    { emoji: '\uD83E\uDDF5', order: 4 },
  'Погашение кредитов':     { emoji: '\uD83D\uDCB3', order: 5 },
  'Реклама':                { emoji: '\uD83D\uDCE2', order: 6 },
  'Оплата по счетам':       { emoji: '\uD83D\uDCC4', order: 7 },
  'Налоги':                 { emoji: '\uD83D\uDCCB', order: 8 },
  'Комиссии банка':         { emoji: '\uD83C\uDFE6', order: 9 },
  'Коммуналка':             { emoji: '\uD83D\uDD27', order: 10 },
  'Расходники':             { emoji: '\uD83D\uDCE6', order: 11 },
  'Амортизация':            { emoji: '\uD83D\uDD28', order: 12 },
  'Прочее':                 { emoji: '\u2753', order: 99 }
};
var RSC_CAT_NAMES = Object.keys(RSC_CATEGORIES);

var RSC_BRANCHES = [
  'В 8', 'М 16', 'М 50', 'М 65', 'П 30', 'П 69', 'Д 21',
  'Химчистка 1', 'Химчистка 2', 'Не определён'
];

var rscData = null;
var rscCatChanges = {};
var rscMerchantMap = {};
var rscUndoStack = [];
var rscSelectedMonth = 'all';
var rscCurrentMerchant = null;

try { rscCatChanges = JSON.parse(localStorage.getItem('rsc_cats') || '{}'); } catch(e) {}
try { rscMerchantMap = JSON.parse(localStorage.getItem('rsc_merchants') || '{}'); } catch(e) {}

function rscSave() {
  localStorage.setItem('rsc_cats', JSON.stringify(rscCatChanges));
  localStorage.setItem('rsc_merchants', JSON.stringify(rscMerchantMap));
}

function rscGetCat(tx) {
  return rscCatChanges[tx.id] !== undefined ? rscCatChanges[tx.id] : tx.category;
}
function rscFmtFull(n) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function rscEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rscPushUndo(action) {
  rscUndoStack.push(action);
  if (rscUndoStack.length > 50) rscUndoStack.shift();
  rscUpdateUndoBtn();
}

function rscUndo() {
  if (!rscUndoStack.length) return;
  var action = rscUndoStack.pop();
  if (action.type === 'category') {
    if (action.oldCat === null) delete rscCatChanges[action.id];
    else rscCatChanges[action.id] = action.oldCat;
    showToast('\u21A9 Отменено');
  } else if (action.type === 'merchant') {
    if (action.oldBranch === null) delete rscMerchantMap[action.merchant];
    else rscMerchantMap[action.merchant] = action.oldBranch;
    showToast('\u21A9 Отменено');
  }
  rscSave();
  renderRsc();
}

function rscUpdateUndoBtn() {
  var btn = document.getElementById('rscUndoBtn');
  if (!btn) return;
  btn.disabled = !rscUndoStack.length;
  var badge = btn.querySelector('.rsc-undo-badge');
  if (badge) badge.remove();
  if (rscUndoStack.length) {
    var b = document.createElement('span');
    b.className = 'rsc-undo-badge';
    b.textContent = rscUndoStack.length;
    btn.appendChild(b);
  }
}

function rscChangeCat(id, newCat) {
  if (!rscData) return;
  var tx = null;
  for (var i = 0; i < rscData.transactions.length; i++) {
    if (rscData.transactions[i].id === id) { tx = rscData.transactions[i]; break; }
  }
  if (!tx) return;
  var oldCat = rscCatChanges[id] !== undefined ? rscCatChanges[id] : null;
  rscPushUndo({ type: 'category', id: id, oldCat: oldCat, newCat: newCat });
  if (newCat === tx.category) delete rscCatChanges[id];
  else rscCatChanges[id] = newCat;
  rscSave();
  if (tx.contragent && newCat !== tx.category) {
    rscSyncToSheets('category', tx.contragent, newCat);
  }
  showToast('\u2713 \u2192 ' + (RSC_CATEGORIES[newCat] ? RSC_CATEGORIES[newCat].emoji : '\u2753') + ' ' + newCat);
  renderRsc();
}

function rscOpenMerchantModal(mid) {
  rscCurrentMerchant = mid;
  var overlay = getOverlay('rscMerchantOverlay');
  var btns = RSC_BRANCHES.map(function(b) {
    var isActive = rscMerchantMap[mid] === b;
    return '<button class="rsc-branch-btn' + (isActive ? ' active' : '') + '" onclick="rscSetMerchantBranch(\'' + b + '\')">' + b + '</button>';
  }).join('');
  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="padding:20px;">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">Привязать к филиалу</div>' +
      '<div style="font-size:12px;color:var(--text-3);margin-bottom:14px;">Мерчант \u2116' + mid + '</div>' +
      '<div class="rsc-branch-list">' + btns + '</div>' +
    '</div>' +
    '<div class="overlay-close" onclick="closeOverlay(\'rscMerchantOverlay\')">Отмена</div>';
  showOverlay('rscMerchantOverlay');
}

function rscSetMerchantBranch(branch) {
  if (!rscCurrentMerchant) return;
  var old = rscMerchantMap[rscCurrentMerchant] || null;
  rscPushUndo({ type: 'merchant', merchant: rscCurrentMerchant, oldBranch: old, newBranch: branch });
  rscMerchantMap[rscCurrentMerchant] = branch;
  rscSave();
  rscSyncToSheets('merchant', rscCurrentMerchant, branch);
  showToast('\u2713 \u2116' + rscCurrentMerchant + ' \u2192 ' + branch);
  closeOverlay('rscMerchantOverlay');
  renderRsc();
}

function rscSyncToSheets(type, key, value) {
  try {
    fetch(API_ATELIE + '?action=saveBusinessRule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, key: key, value: value }),
      mode: 'no-cors'
    });
  } catch(e) {}
}

function rscLoadRulesFromSheets() {
  try {
    var script = document.createElement('script');
    script.src = API_ATELIE + '?action=getBusinessRules&callback=rscApplyCloudRules&t=' + Date.now();
    document.head.appendChild(script);
    script.onload = function() { script.remove(); };
  } catch(e) {}
}

function rscApplyCloudRules(data) {
  if (!data || data.error || !rscData) return;
  var applied = 0;
  if (data.merchants) {
    for (var mid in data.merchants) {
      if (!rscMerchantMap[mid]) {
        rscMerchantMap[mid] = data.merchants[mid];
        applied++;
      }
    }
  }
  if (data.categories && rscData.transactions) {
    for (var key in data.categories) {
      for (var i = 0; i < rscData.transactions.length; i++) {
        var tx = rscData.transactions[i];
        if ((tx.contragent === key || tx.id == key) && rscCatChanges[tx.id] === undefined) {
          rscCatChanges[tx.id] = data.categories[key];
          applied++;
          break;
        }
      }
    }
  }
  if (applied > 0) {
    rscSave();
    renderRsc();
    showToast('\u2601\uFE0F ' + applied + ' правил из облака');
  }
}

function rscGetMonths(txs) {
  var s = {};
  txs.forEach(function(t) {
    var parts = t.date.split('.');
    if (parts.length === 3) s[parts[2] + '-' + parts[1]] = true;
  });
  return Object.keys(s).sort();
}

function rscFilterMonth(txs) {
  if (rscSelectedMonth === 'all') return txs;
  return txs.filter(function(t) {
    var parts = t.date.split('.');
    return parts[2] + '-' + parts[1] === rscSelectedMonth;
  });
}

function rscSetMonth(m) {
  rscSelectedMonth = m;
  renderRsc();
}

function rscToggle(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

function renderRsc() {
  var content = document.getElementById('rscContent');
  var txContent = document.getElementById('rscTxContent');
  if (!content) return;

  if (!rscData) {
    content.innerHTML = '<div class="fam-empty">Нет данных РСч.<br>Загрузите JSON-файл с транзакциями.</div>';
    if (txContent) txContent.innerHTML = '';
    return;
  }

  content.innerHTML = '';
  rscUpdateUndoBtn();

  var periodEl = document.getElementById('rscPeriod');
  if (periodEl && rscData.period) periodEl.textContent = rscData.period;

  var months = rscGetMonths(rscData.transactions);
  var mnames = { '01':'Янв','02':'Фев','03':'Мар','04':'Апр','05':'Май','06':'Июн','07':'Июл','08':'Авг','09':'Сен','10':'Окт','11':'Ноя','12':'Дек' };
  var pills = '<button class="rsc-pill' + (rscSelectedMonth === 'all' ? ' active' : '') + '" onclick="rscSetMonth(\'all\')">Все</button>';
  months.forEach(function(m) {
    var parts = m.split('-');
    pills += '<button class="rsc-pill' + (rscSelectedMonth === m ? ' active' : '') + '" onclick="rscSetMonth(\'' + m + '\')">' + mnames[parts[1]] + ' ' + parts[0].slice(2) + '</button>';
  });
  var monthPills = document.getElementById('rscMonthPills');
  if (monthPills) monthPills.innerHTML = pills;

  var changes = Object.keys(rscCatChanges).length + Object.keys(rscMerchantMap).length;
  var balBar = document.getElementById('rscBalanceBar');
  if (balBar) {
    balBar.innerHTML =
      '<div class="rsc-bal-item"><div class="rsc-bal-label">Баланс ' + (rscData.balance_end_date || '') + '</div><div class="rsc-bal-value" style="color:var(--primary)">' + fmtShort(rscData.balance_end || 0) + '</div></div>' +
      '<div class="rsc-bal-item"><div class="rsc-bal-label">Поступления</div><div class="rsc-bal-value" style="color:var(--green)">+' + fmtShort(rscData.turnover_credit || 0) + '</div></div>' +
      '<div class="rsc-bal-item"><div class="rsc-bal-label">Списания</div><div class="rsc-bal-value" style="color:var(--red)">\u2212' + fmtShort(rscData.turnover_debit || 0) + '</div></div>' +
      '<div class="rsc-bal-item"><div class="rsc-bal-label">Изменений</div><div class="rsc-bal-value" style="color:var(--primary)">' + changes + '</div></div>';
  }

  var commEl = document.getElementById('rscCommission');
  if (commEl) {
    if (rscData.total_commission > 0) {
      commEl.style.display = 'flex';
      commEl.innerHTML =
        '<div>\u26A0\uFE0F Комиссия 0.7%: <strong style="color:var(--red);">' + rscFmtFull(rscData.total_commission) + '\u20BD</strong></div>' +
        '<div style="font-size:11px;color:var(--text-3);">Реальный: ' + fmtShort(rscData.total_real_turnover || 0) + '</div>';
    } else {
      commEl.style.display = 'none';
    }
  }

  var filtered = rscFilterMonth(rscData.transactions);
  var groups = {};
  filtered.forEach(function(t) {
    var cat = rscGetCat(t);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  });

  var sortedCats = Object.keys(groups).sort(function(a, b) {
    return ((RSC_CATEGORIES[a] || {}).order || 99) - ((RSC_CATEGORIES[b] || {}).order || 99);
  });

  var html = renderRscEkvayring();
  sortedCats.forEach(function(cat) {
    html += renderRscCatSection(cat, groups[cat]);
  });
  if (txContent) txContent.innerHTML = html;
}

function renderRscEkvayring() {
  if (!rscData || !rscData.ekvayring) return '';
  var ekv = rscData.ekvayring;
  var merchants = [];
  for (var id in ekv) merchants.push([id, ekv[id]]);
  merchants.sort(function(a, b) { return b[1].received - a[1].received; });

  var totalRec = 0, totalComm = 0, totalCount = 0, mapped = 0;
  merchants.forEach(function(m) {
    totalRec += m[1].received;
    totalComm += m[1].commission;
    totalCount += m[1].count;
    if (rscMerchantMap[m[0]]) mapped++;
  });

  var cards = merchants.map(function(m) {
    var id = m[0], d = m[1];
    var branch = rscMerchantMap[id];
    var tag = branch
      ? '<span class="rsc-tag" onclick="event.stopPropagation();rscOpenMerchantModal(\'' + id + '\')">' + branch + '</span>'
      : '<span class="rsc-tag unset" onclick="event.stopPropagation();rscOpenMerchantModal(\'' + id + '\')">+ Филиал</span>';
    return '<div class="rsc-ekv-card">' +
      '<div style="font-size:10px;color:var(--text-3);font-weight:600;">\u2116' + id + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:var(--green);margin:2px 0;">' + fmtShort(d.received) + '</div>' +
      '<div style="font-size:11px;color:var(--text-3);">Реал: ' + fmtShort(d.real_turnover) + ' <span style="color:var(--red);">(\u2212' + fmtShort(d.commission) + ')</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);">' + d.count + ' оп. \u2022 ' + d.active_days + ' дн.</div>' +
      tag + '</div>';
  }).join('');

  return '<div class="rsc-section">' +
    '<div class="rsc-section-head" onclick="rscToggle(this)">' +
      '<div style="display:flex;align-items:center;gap:8px;"><span>\uD83D\uDCB0</span><span style="font-weight:700;">Эквайринг</span>' +
      '<span class="rsc-count">' + totalCount + ' шт \u2022 ' + mapped + '/' + merchants.length + ' привязано</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="font-weight:800;color:var(--green);">+' + fmtShort(totalRec) + '</span><span class="rsc-arrow">\u25BC</span></div>' +
    '</div>' +
    '<div class="rsc-section-body">' +
      '<div style="padding:8px 14px;font-size:12px;color:var(--text-3);">Нажмите \u00AB+ Филиал\u00BB чтобы привязать мерчант к точке.</div>' +
      '<div class="rsc-ekv-grid">' + cards + '</div>' +
    '</div></div>';
}

function renderRscCatSection(catName, txs) {
  var cat = RSC_CATEGORIES[catName] || { emoji: '\u2753', order: 99 };
  var total = txs.reduce(function(s, t) { return s + t.amount; }, 0);

  var rows = txs.slice().sort(function(a, b) {
    return a.date.split('.').reverse().join('').localeCompare(b.date.split('.').reverse().join(''));
  }).map(function(t) {
    var changed = rscCatChanges[t.id] !== undefined;
    var opts = RSC_CAT_NAMES.map(function(c) {
      return '<option value="' + c + '"' + (c === catName ? ' selected' : '') + '>' + (RSC_CATEGORIES[c] ? RSC_CATEGORIES[c].emoji : '\u2753') + ' ' + c + '</option>';
    }).join('');
    return '<div class="rsc-tx">' +
      '<div class="rsc-tx-date">' + t.date + '</div>' +
      '<div class="rsc-tx-info">' +
        '<div class="rsc-tx-name">' + rscEsc(t.contragent || 'Не указан') + (changed ? '<span class="rsc-dot"></span>' : '') + '</div>' +
        '<div class="rsc-tx-desc" title="' + rscEsc(t.purpose) + '">' + rscEsc(t.purpose) + '</div>' +
      '</div>' +
      '<div class="rsc-tx-sum">\u2212' + rscFmtFull(t.amount) + '</div>' +
      '<div class="rsc-tx-cat"><select onchange="rscChangeCat(' + t.id + ',this.value)">' + opts + '</select></div>' +
    '</div>';
  }).join('');

  return '<div class="rsc-section">' +
    '<div class="rsc-section-head" onclick="rscToggle(this)">' +
      '<div style="display:flex;align-items:center;gap:8px;"><span>' + cat.emoji + '</span><span style="font-weight:700;">' + catName + '</span>' +
      '<span class="rsc-count">' + txs.length + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;"><span style="font-weight:800;color:var(--red);">\u2212' + fmtShort(total) + '</span><span class="rsc-arrow">\u25BC</span></div>' +
    '</div>' +
    '<div class="rsc-section-body">' + rows + '</div></div>';
}

function rscOpenImport() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data.transactions || !Array.isArray(data.transactions)) {
          showToast('Неверный формат JSON');
          return;
        }
        rscData = data;
        localStorage.setItem('rsc_data', JSON.stringify(data));
        renderRsc();
        rscLoadRulesFromSheets();
        showToast('\u2713 Загружено ' + data.transactions.length + ' транзакций');
      } catch(err) {
        showToast('Ошибка: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function rscLoadCached() {
  try {
    var raw = localStorage.getItem('rsc_data');
    if (raw) {
      rscData = JSON.parse(raw);
      renderRsc();
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DATE NAVIGATION — Шаг 7: выбор дат
// ═══════════════════════════════════════════════════════════════

function bizNavMonth(delta) {
  var mSel = document.getElementById('bizMonthSelect');
  var ySel = document.getElementById('bizYearSelect');
  if (!mSel || !ySel) return;
  var m = parseInt(mSel.value) + delta;
  var y = parseInt(ySel.value);
  if (m < 1) { m = 12; y--; }
  else if (m > 12) { m = 1; y++; }
  if (y < 2025) y = 2025;
  if (y > 2026) y = 2026;
  mSel.value = m;
  ySel.value = y;
  bizEnforceDateLimits();
  loadBranches();
}

function bizNavToday() {
  var now = new Date();
  var mSel = document.getElementById('bizMonthSelect');
  var ySel = document.getElementById('bizYearSelect');
  if (!mSel || !ySel) return;
  mSel.value = now.getMonth() + 1;
  ySel.value = now.getFullYear();
  bizEnforceDateLimits();
  bizSnapIndex = -1;
  bizIsHistorical = false;
  loadBranches();
}

function bizEnforceDateLimits() {
  var now = new Date();
  var cm = now.getMonth() + 1;
  var cy = now.getFullYear();
  var mSel = document.getElementById('bizMonthSelect');
  var ySel = document.getElementById('bizYearSelect');
  if (!mSel || !ySel) return;
  var selY = parseInt(ySel.value);
  mSel.querySelectorAll('option').forEach(function(o) {
    o.disabled = selY === cy && parseInt(o.value) > cm;
  });
}

// ═══════════════════════════════════════════════════════════════
// ENHANCED FILIAL DETAIL — Шаг 7: детали по филиалу
// ═══════════════════════════════════════════════════════════════

function openFilialDetail(f, month) {
  var overlay = getOverlay('filialOverlay');
  var perf = f.performance.total;
  var zone = perf >= 95 ? 'green' : perf >= 85 ? 'yellow' : 'red';
  var zoneColor = zone === 'green' ? '#22C55E' : zone === 'yellow' ? '#FFAA00' : '#FF4D4D';
  var nowMonth = new Date().getMonth() + 1;
  var isPast = month < nowMonth;
  var wfDetail = !isPast && typeof getWeatherFactor === 'function' ? getWeatherFactor(month) : null;
  var fc3 = !isPast ? calcForecast3Weeks(f.fact.total, month, wfDetail) : null;
  var fcTotal = fc3 ? fc3.total : f.fact.total;
  var fcPct = f.plan.total > 0 ? Math.round(fcTotal / f.plan.total * 100) : 0;
  var perfAtelie = f.performance.atelie || 0;
  var perfHimch = f.performance.himchistka || 0;

  var yearSel = document.getElementById('bizYearSelect');
  var year = yearSel ? parseInt(yearSel.value) : 2026;

  var html =
    '<div class="overlay-handle"></div>' +
    '<div class="filial-detail-header">' +
      '<div class="filial-detail-name">' + f.name + '</div>' +
      '<div class="filial-detail-sub">' + MONTH_NAMES_CAP[month] + ' ' + year +
        ' \u00b7 ' + perf + '% плана' +
        (isPast ? ' \u00b7 закрыт' : ' \u00b7 прогноз ' + fcPct + '%' + (wfDetail ? ' (с погодой)' : '')) +
      '</div>' +
    '</div>' +
    '<div class="filial-detail-stats">' +
      '<div class="filial-detail-stat">' +
        '<div class="filial-detail-stat-label">Ателье</div>' +
        '<div class="filial-detail-stat-value">' + fmtShort(f.fact.atelie) + '</div>' +
        '<div class="filial-detail-stat-sub" style="color:' + (perfAtelie >= 95 ? 'var(--green)' : perfAtelie >= 85 ? '#FFAA00' : 'var(--red)') + ';">' + perfAtelie + '% плана</div>' +
      '</div>' +
      '<div class="filial-detail-stat">' +
        '<div class="filial-detail-stat-label">Ср. чек</div>' +
        '<div class="filial-detail-stat-value">' + fmt(f.fact.avgCheck) + '</div>' +
        '<div class="filial-detail-stat-sub">' + (f.fact.clients || 0) + ' клиентов</div>' +
      '</div>' +
      '<div class="filial-detail-stat">' +
        '<div class="filial-detail-stat-label">' + (isPast ? 'Итог' : 'Прогноз') + '</div>' +
        '<div class="filial-detail-stat-value" style="color:' + zoneColor + ';">' + fmtShort(fcTotal) + '</div>' +
        '<div class="filial-detail-stat-sub">' + fcPct + '% плана</div>' +
      '</div>' +
    '</div>';

  // Performance bars
  html += '<div class="filial-detail-section">' +
    '<div class="filial-detail-section-title">&#x1F4CA; Выполнение плана</div>';
  var metrics = [
    {label: 'Ателье', fact: f.fact.atelie, plan: f.plan.atelie, pct: perfAtelie},
    {label: 'Химч', fact: f.fact.himchistka || 0, plan: f.plan.himchistka || 0, pct: perfHimch},
    {label: 'Итого', fact: f.fact.total, plan: f.plan.total, pct: perf}
  ];
  metrics.forEach(function(m) {
    var barColor = m.pct >= 95 ? 'var(--green)' : m.pct >= 85 ? '#FFAA00' : 'var(--red)';
    var barW = Math.min(m.pct, 100);
    html += '<div class="filial-detail-bar-row">' +
      '<div class="filial-detail-bar-label">' + m.label + '</div>' +
      '<div class="filial-detail-bar-wrap">' +
        '<div class="filial-detail-bar-fill" style="width:' + barW + '%;background:' + barColor + ';">' + (barW > 15 ? m.pct + '%' : '') + '</div>' +
      '</div>' +
      '<div class="filial-detail-bar-val">' + fmtShort(m.fact) + '</div>' +
    '</div>';
  });
  html += '</div>';

  // Financial summary
  html += '<div class="filial-detail-section">' +
    '<div class="filial-detail-section-title">&#x1F4B0; Финансы</div>' +
    '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span>Выручка</span><strong>' + fmt(f.fact.total) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span>Прибыль</span><strong style="color:' + (f.fact.profit >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + fmt(f.fact.profit) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--text-3);"><span>Маржа</span><strong>' + (f.fact.total > 0 ? Math.round(f.fact.profit / f.fact.total * 100) : 0) + '%</strong></div>';

  var fex = getFilialExpenses()[f.name];
  if (fex) {
    var realMargin = f.fact.profit - fex.commission;
    var rmPct = f.fact.total > 0 ? Math.round(realMargin / f.fact.total * 100) : 0;
    html += '<div style="border-top:1px dashed var(--border);margin-top:6px;padding-top:6px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0;"><span>Эквайринг</span><strong style="color:var(--red);">\u2212' + fmt(fex.commission) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0;"><span style="font-weight:700;">Реал. маржа</span><strong style="color:' + (rmPct >= 40 ? 'var(--green)' : rmPct >= 25 ? '#FFAA00' : 'var(--red)') + ';">' + fmt(realMargin) + ' (' + rmPct + '%)</strong></div>' +
    '</div>';
  }
  html += '</div>';

  // Weekly revenue chart
  html += '<div class="filial-detail-section">' +
    '<div class="filial-detail-section-title">&#x1F4C8; Выручка по неделям</div>' +
    '<div id="weekRevChart"><div class="loading-box" style="padding:20px;"><div class="spinner"></div></div></div>' +
  '</div>';

  // Deep analytics section
  html += '<div id="branchAnalytics"></div>';

  // Daily table section (populated by getBranchDaily API)
  html += '<div id="branchDailyTable"></div>';

  html += '<div class="overlay-close" onclick="closeOverlay(\'filialOverlay\')">Закрыть</div>';

  overlay.querySelector('.overlay-panel').innerHTML = html;
  showOverlay('filialOverlay');
  loadBranchDailyData(f, month, zoneColor);
}

// ═══════════════════════════════════════════════════════════════
// DAY BROWSER — навигация по дням (снимки)
// ═══════════════════════════════════════════════════════════════

var bizSnapList = [];
var bizSnapIndex = -1; // -1 = live (сегодня)

function bizUpdateDayNav() {
  var nav = document.getElementById('bizDayNav');
  if (!nav) return;

  var sel = document.getElementById('bizMonthSelect');
  var ySel = document.getElementById('bizYearSelect');
  var month = parseInt(sel.value);
  var year = ySel ? parseInt(ySel.value) : new Date().getFullYear();

  bizSnapList = getSnapshots(month, year);

  // Always show nav
  nav.style.display = '';
  bizUpdateDayLabel();
}

function bizSnapDay(delta) {
  if (bizSnapIndex === -1) {
    // On live data
    if (delta < 0) {
      // Go to previous snapshot
      if (!bizSnapList.length) return;
      // Find the latest snapshot that's before today
      var now = new Date();
      var todayDay = now.getDate();
      var idx = -1;
      for (var i = bizSnapList.length - 1; i >= 0; i--) {
        if (bizSnapList[i].day < todayDay) { idx = i; break; }
      }
      if (idx === -1) idx = bizSnapList.length - 1;
      bizSnapIndex = idx;
    } else {
      return; // already at latest
    }
  } else {
    bizSnapIndex += delta;
    if (bizSnapIndex >= bizSnapList.length || bizSnapIndex < 0) {
      // Return to live
      bizSnapIndex = -1;
      bizIsHistorical = false;
      loadBranches(true);
      bizUpdateDayLabel();
      return;
    }
  }

  // Load snapshot
  var snap = bizSnapList[bizSnapIndex];
  var data = loadSnapshot(snap.key);
  if (!data) {
    showToast('Снимок не найден');
    bizSnapIndex = -1;
    return;
  }

  bizIsHistorical = true;
  var month = parseInt(document.getElementById('bizMonthSelect').value);
  applyBranchData(data, month);
  bizUpdateDayLabel();
}

function bizUpdateDayLabel() {
  var label = document.getElementById('bizDayLabel');
  if (!label) return;

  var rightBtn = document.getElementById('bizDayRight');
  if (bizSnapIndex === -1) {
    var now = new Date();
    var dwd = Math.max(1, now.getDate() - 1);
    label.textContent = 'данные за ' + dwd + ' ' + MONTH_NAMES[now.getMonth() + 1].substring(0, 3);
    label.classList.remove('historical');
    bizIsHistorical = false;
    if (rightBtn) rightBtn.style.visibility = 'hidden';
    // Show pulse/planner
    var pulse = document.getElementById('dailyPulseCard');
    var planner = document.getElementById('plannerCard');
    if (pulse) pulse.style.display = '';
    if (planner) planner.style.display = '';
  } else {
    var snap = bizSnapList[bizSnapIndex];
    var month = parseInt(document.getElementById('bizMonthSelect').value);
    label.textContent = snap.day + ' ' + MONTH_NAMES[month].substring(0, 3) + ' (снимок)';
    label.classList.add('historical');
    if (rightBtn) rightBtn.style.visibility = 'visible';
    // Hide pulse/planner for historical view
    var pulse = document.getElementById('dailyPulseCard');
    var planner = document.getElementById('plannerCard');
    if (pulse) pulse.style.display = 'none';
    if (planner) planner.style.display = 'none';
  }
}

function bizSnapToday() {
  bizSnapIndex = -1;
  bizIsHistorical = false;
  loadBranches(true);
  bizUpdateDayLabel();
}

// ═══════════════════════════════════════════════════════════════
// БЛОК «СЕГОДНЯ» — отчёты филиалов + план дня
// ═══════════════════════════════════════════════════════════════
var _todayData = null;

function renderTodayReport(data) {
  var el = document.getElementById('todayReportCard');
  if (!el || !data || !data.filials) { if (el) el.style.display = 'none'; return; }

  var now = new Date();
  var selMonth = parseInt(document.getElementById('bizMonthSelect').value);
  var selYear = parseInt(document.getElementById('bizYearSelect').value);
  var daysInMonth = new Date(selYear, selMonth, 0).getDate();

  // Определяем целевой день: снапшот или сегодня
  var targetDay, targetMonth, targetYear;
  if (bizIsHistorical && bizSnapIndex >= 0 && bizSnapList[bizSnapIndex]) {
    targetDay = bizSnapList[bizSnapIndex].day;
    targetMonth = selMonth;
    targetYear = selYear;
  } else {
    var curMonth = now.getMonth() + 1;
    if (selMonth !== curMonth || selYear !== now.getFullYear()) { el.style.display = 'none'; return; }
    targetDay = now.getDate();
    targetMonth = curMonth;
    targetYear = now.getFullYear();
  }

  var targetLabel = (targetDay < 10 ? '0' : '') + targetDay + '.' + (targetMonth < 10 ? '0' : '') + targetMonth;

  // Загружаем данные из getDailyChart (кэшируем на весь месяц)
  var daysToFetch = now.getDate(); // от 1-го числа до сегодня
  if (_todayData && _todayData.ts && Date.now() - _todayData.ts < 120000 && _todayData.fetchDays >= daysToFetch) {
    _renderTodayBlock(el, data, _todayData.days, targetLabel, daysInMonth, targetDay, targetMonth);
    return;
  }

  fetchWithTimeout(API_ATELIE + '?action=getDailyChart&days=' + daysToFetch, 15000)
    .then(function(r) { return r.json(); })
    .then(function(resp) {
      if (resp.success && resp.days) {
        _todayData = { days: resp.days, ts: Date.now(), fetchDays: daysToFetch };
        _renderTodayBlock(el, data, resp.days, targetLabel, daysInMonth, targetDay, targetMonth);
      }
    }).catch(function() {
      _renderTodayBlock(el, data, null, targetLabel, daysInMonth, targetDay, targetMonth);
    });
}

function _renderTodayBlock(el, data, dailyDays, todayLabel, daysInMonth, targetDay, targetMonth) {
  var now = new Date();
  var today = targetDay || now.getDate();
  var curMonth = targetMonth || (now.getMonth() + 1);

  // Найти данные за целевой день в dailyDays
  var todayDay = null;
  if (dailyDays) {
    for (var i = dailyDays.length - 1; i >= 0; i--) {
      if (dailyDays[i].date === todayLabel) { todayDay = dailyDays[i]; break; }
    }
  }

  // План на день (общий) = план на месяц / дней в месяце
  var totalPlan = data.totals && data.totals.plan ? data.totals.plan : {};
  var dailyPlanAtelie = totalPlan.atelie ? Math.round(totalPlan.atelie / daysInMonth) : 0;

  // Заголовок: "Сегодня" / "Вчера" / "24 мар, пн"
  var WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var nowDay = now.getDate();
  var nowMonth = now.getMonth() + 1;
  var dayTitle;
  if (today === nowDay && curMonth === nowMonth) {
    dayTitle = 'Сегодня ' + today + ' ' + MONTH_NAMES[curMonth].substring(0,3);
  } else if (today === nowDay - 1 && curMonth === nowMonth) {
    dayTitle = 'Вчера ' + today + ' ' + MONTH_NAMES[curMonth].substring(0,3);
  } else {
    var selYear = parseInt(document.getElementById('bizYearSelect').value) || now.getFullYear();
    var wd = new Date(selYear, curMonth - 1, today).getDay();
    dayTitle = today + ' ' + MONTH_NAMES[curMonth].substring(0,3) + ', ' + WEEKDAY_SHORT[wd];
  }

  var reported = 0;
  var totalToday = 0;
  var html = '<div class="card" style="border-radius:16px;padding:14px;margin-bottom:12px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  html += '<div style="font-size:14px;font-weight:800;">&#x1F4CB; ' + dayTitle + '</div>';
  html += '<div id="todayReportCount" style="font-size:11px;color:#888;"></div>';
  html += '</div>';

  // Сортируем филиалы: сначала сдавшие (по убыванию выручки), потом не сдавшие
  var items = [];
  for (var i = 0; i < data.filials.length; i++) {
    var f = data.filials[i];
    var todayAtelie = 0;
    var todayClients = 0;
    if (todayDay && todayDay.branches) {
      for (var b = 0; b < todayDay.branches.length; b++) {
        if (todayDay.branches[b].code === f.code) {
          todayAtelie = todayDay.branches[b].atelie;
          todayClients = todayDay.branches[b].clients;
          break;
        }
      }
    }
    var hasReport = todayAtelie > 0 || todayClients > 0;
    if (hasReport) reported++;
    totalToday += todayAtelie;

    // Индивидуальный план на день
    var branchDailyPlan = f.plan && f.plan.atelie ? Math.round(f.plan.atelie / daysInMonth) : 0;
    var pct = branchDailyPlan > 0 ? Math.round(todayAtelie / branchDailyPlan * 100) : 0;
    var diff = todayAtelie - branchDailyPlan;

    items.push({ code: f.code, name: f.name, atelie: todayAtelie, clients: todayClients,
                 plan: branchDailyPlan, pct: pct, diff: diff, hasReport: hasReport });
  }

  items.sort(function(a, b) {
    if (a.hasReport !== b.hasReport) return b.hasReport - a.hasReport;
    return b.atelie - a.atelie;
  });

  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var dot = it.hasReport ? '<span style="color:#22C55E;font-size:10px;">&#x25CF;</span>' : '<span style="color:#DDD;font-size:10px;">&#x25CF;</span>';
    var pctColor = it.pct >= 100 ? '#22C55E' : it.pct >= 80 ? '#FFAA00' : '#FF4D4D';
    var diffStr = it.diff >= 0 ? '+' + fmtShort(it.diff) : fmtShort(it.diff);

    html += '<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #F3F4F6;gap:6px;">';
    html += dot;
    html += '<div style="width:30px;font-size:11px;font-weight:600;color:#555;">' + it.code + '</div>';

    if (it.hasReport) {
      html += '<div style="flex:1;font-size:13px;font-weight:700;">' + fmtShort(it.atelie) + '</div>';
      html += '<div style="font-size:11px;color:#888;">' + it.clients + ' кл</div>';
      html += '<div style="width:60px;text-align:right;font-size:11px;font-weight:700;color:' + pctColor + ';">' + it.pct + '%</div>';
      html += '<div style="width:55px;text-align:right;font-size:10px;color:' + pctColor + ';">' + diffStr + '</div>';
    } else {
      html += '<div style="flex:1;font-size:12px;color:#CCC;font-style:italic;">нет отчёта</div>';
      html += '<div style="width:60px;text-align:right;font-size:10px;color:#DDD;">план ' + fmtShort(it.plan) + '</div>';
      html += '<div style="width:55px;"></div>';
    }
    html += '</div>';
  }

  // Алерт: кто не сдал отчёт
  var notReported = items.filter(function(it) { return !it.hasReport; }).map(function(it) { return it.name; });
  if (notReported.length > 0) {
    html += '<div style="margin-top:8px;padding:10px 12px;background:#FFF5F5;border:1px solid #FED7D7;border-radius:10px;">';
    html += '<div style="font-size:12px;font-weight:700;color:#E53E3E;margin-bottom:4px;">Нет отч\u0451та за ' + today + ' ' + MONTH_NAMES[curMonth].substring(0,3) + ':</div>';
    html += '<div style="font-size:12px;color:#C53030;">' + notReported.join(', ') + '</div>';
    html += '</div>';
  }

  // Итого
  var totalPct = dailyPlanAtelie > 0 ? Math.round(totalToday / dailyPlanAtelie * 100) : 0;
  var totalDiff = totalToday - dailyPlanAtelie;
  var totalPctColor = totalPct >= 100 ? '#22C55E' : totalPct >= 80 ? '#FFAA00' : '#FF4D4D';
  html += '<div style="display:flex;align-items:center;padding:8px 0 2px;gap:6px;font-weight:700;">';
  html += '<div style="width:38px;font-size:11px;color:#333;">Итого</div>';
  html += '<div style="flex:1;font-size:14px;">' + fmtShort(totalToday) + '</div>';
  html += '<div style="font-size:11px;color:#888;">план ' + fmtShort(dailyPlanAtelie) + '</div>';
  html += '<div style="width:60px;text-align:right;font-size:12px;color:' + totalPctColor + ';">' + totalPct + '%</div>';
  html += '<div style="width:55px;text-align:right;font-size:11px;color:' + totalPctColor + ';">' + (totalDiff >= 0 ? '+' : '') + fmtShort(totalDiff) + '</div>';
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
  el.style.display = '';

  // Обновляем счётчик
  var cnt = document.getElementById('todayReportCount');
  if (cnt) cnt.textContent = reported + ' из ' + items.length + ' сдали';
}
