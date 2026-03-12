// ═══════════════════════════════════════════════════════════════
// BUSINESS.JS — Вкладка "Бизнес" (филиалы + прогноз + РСч)
// DressCode v4.0
// ═══════════════════════════════════════════════════════════════

// ── OVERVIEW ──
function renderBizOverview(data) {
  if (!data || !data.totals) return;
  var t = data.totals;
  document.getElementById('ov-atelie').textContent = fmt(t.fact.atelie);
  document.getElementById('ov-himch').textContent = fmt(t.fact.avgCheck || 0);
  document.getElementById('ov-total').textContent = fmt(t.fact.total);
  document.getElementById('ov-clients').textContent = t.fact.clients.toLocaleString('ru-RU');
  document.getElementById('ov-profit').textContent = fmt(t.fact.profit);

  if (t.plan.total > 0) {
    document.getElementById('ov-atelie-plan').textContent = 'План: ' + fmt(t.plan.atelie) + ' (' + t.performance.atelie + '%)';
    document.getElementById('ov-himch-plan').textContent = t.fact.clients + ' кл · план ' + fmtShort(t.plan.atelie);
    document.getElementById('ov-total-plan').textContent = 'План: ' + fmt(t.plan.total) + ' (' + t.performance.total + '%)';
  }
  if (t.fact.avgCheck) document.getElementById('ov-avg-check').textContent = 'Ср.чек: ' + fmt(t.fact.avgCheck);

  var pct = t.performance ? Math.min(t.performance.total, 100) : 0;
  document.getElementById('ov-progress').style.width = pct + '%';
  document.getElementById('ov-progress').textContent = (t.performance ? t.performance.total : 0) + '%';

  var netForecast = calcNetworkForecast(data.filials);
  if (netForecast > 0) {
    document.getElementById('ov-forecast').textContent = fmtShort(netForecast);
    var fcPct = t.plan.total > 0 ? Math.round(netForecast / t.plan.total * 100) : 0;
    document.getElementById('ov-forecast-sub').textContent = fcPct + '% плана';
  }

  document.getElementById('bizLoading').style.display = 'none';
  document.getElementById('bizOverviewContent').style.display = 'block';

  // Пульс дня
  renderDailyPulse(data);

  // Планировщик — 4 цифры маржи
  renderPlanner(data);
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

  var dayOfMonth = now.getDate();
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var daysLeft = daysInMonth - dayOfMonth;

  var factAtelie = parseFloat(t.fact.atelie) || 0;
  var factHimch = parseFloat(t.fact.himchistka) || 0;
  if (factAtelie <= 0 || dayOfMonth < 3) { el.style.display = 'none'; return; }

  // Дневные скорости (на р/с)
  var dailyBankAtelie = Math.round(factAtelie / 2 / dayOfMonth);
  var dailyBankHimch = Math.round(factHimch / dayOfMonth);
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
        '<div style="font-size:11px;color:#888;">' + dayOfMonth + '-й день &#183; осталось ' + daysLeft + '</div>' +
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
// Доп. доход (получаем в день оплаты кредитов)
var EXTRA_INCOME = 100000;

var MONTH_NAMES_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDaysInMonth(m, y) {
  // m: 0-based
  if (m === 1 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) return 29;
  return MONTH_DAYS[m];
}

// ═══ Получить состояние доп. дохода (100К) ═══
function getExtraIncomeKey() {
  var now = new Date();
  return 'dresscode_extra_income_' + now.getFullYear() + '-' + (now.getMonth() + 1);
}
function isExtraIncomeReceived() {
  return localStorage.getItem(getExtraIncomeKey()) === '1';
}
function toggleExtraIncome() {
  var key = getExtraIncomeKey();
  localStorage.setItem(key, localStorage.getItem(key) === '1' ? '0' : '1');
  renderCreditsChecklist();
  if (typeof renderPlanner === 'function' && state.branches) renderPlanner(state.branches);
}

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
  var dayOfMonth = now.getDate();
  var dataMonth = (data.currentMonth || (curMonth + 1)) - 1;

  if (dataMonth !== curMonth) { el.style.display = 'none'; return; }

  var t = data.totals;
  var factAtelie = parseFloat(t.fact.atelie) || 0;
  var factHimch = parseFloat(t.fact.himchistka) || 0;
  if (factAtelie <= 0 || dayOfMonth < 3) { el.style.display = 'none'; return; }

  var daysInCurMonth = getDaysInMonth(curMonth, curYear);
  var daysLeft = daysInCurMonth - dayOfMonth;

  // ═══ Дневные скорости ═══
  var dailyAtelie = Math.round(factAtelie / dayOfMonth);        // полный оборот ателье/день
  var dailyHimch = Math.round(factHimch / dayOfMonth);           // химч/день
  var dailyBankAtelie = Math.round(factAtelie / 2 / dayOfMonth); // на р/с (ателье÷2)
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
  var capMonth = function(m) { return MONTH_NAMES_SHORT[m].charAt(0).toUpperCase() + MONTH_NAMES_SHORT[m].slice(1); };

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

  html += cardBlock('&#x1F4CC;', capMonth(curMonth) + ' (факт)', dayOfMonth + ' дней &#183; ' + fmtShort(dailyBank) + '/день', cur.family, detailBlock(cur, true));
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
  return filials.reduce(function(sum, f) {
    var fc3 = calcForecast3Weeks(f.fact.total, month);
    return sum + (fc3 ? fc3.total : f.fact.total);
  }, 0);
}

function calcForecast3Weeks(factTotal, month) {
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var daysPassed = (now.getMonth() + 1) === month ? now.getDate() : ((now.getMonth() + 1) > month ? daysInMonth : 0);
  if (daysPassed === 0) return null;
  var nonWork = (month === 1) ? 5 : 0;
  var workPassed = Math.max(1, daysPassed - (month === 1 ? Math.min(nonWork, daysPassed) : 0));
  var workTotal = daysInMonth - nonWork;
  var workLeft = workTotal - workPassed;
  var dailyAvg = factTotal / workPassed;
  return { total: Math.round(factTotal + dailyAvg * Math.max(0, workLeft)), daysPassed: workPassed, daysLeft: workLeft, daysInMonth: workTotal, note: '(' + workPassed + ' раб.дн.)' };
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
  if (rscData && rscData.transactions) {
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
  if (!rscData || !rscData.ekvayring) return {};
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
      var fc3 = calcForecast3Weeks(f.fact.total, month);
      var fcTotal = fc3 ? fc3.total : f.fact.total;
      var fcPct = f.plan.total > 0 ? Math.round(fcTotal / f.plan.total * 100) : 0;
      var fcEmoji = fcPct >= 95 ? '\uD83D\uDFE2' : fcPct >= 85 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
      fcHtml = '<div style="background:#EEF2FF;padding:10px 12px;border-radius:10px;margin-top:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="color:#7B61FF;font-weight:600;margin-bottom:2px;">\uD83D\uDD2E Прогноз</div></div>' +
        '<div style="text-align:right;"><div style="font-weight:800;font-size:14px;">' + fmt(fcTotal) + ' ' + fcEmoji + '</div><div style="font-size:10px;color:#888;">' + fcPct + '% плана</div></div></div>';
    }

    var card = document.createElement('div');
    card.className = 'filial-card';
    card.innerHTML =
      '<div class="filial-top"><div class="filial-name">' + f.name + '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;"><div style="font-size:10px;color:#A29BFE;font-weight:600;">\u25B6 аналитика</div>' +
      '<div class="filial-rank" style="background:' + rankColor + ';">#' + (i + 1) + '</div></div></div>' +
      '<div class="filial-row"><span>Ателье:</span><span>' + fmt(f.fact.atelie) + '</span></div>' +
      '<div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">План: ' + fmt(f.plan.atelie) + ' (' + f.performance.atelie + '%)</div>' +
      '<div class="filial-row"><span>Ср. чек:</span><span>' + fmt(f.fact.himchistka) + '</span></div>' +
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
}

// ── FILIAL DETAIL OVERLAY ──
function openFilialDetail(f, month) {
  var overlay = getOverlay('filialOverlay');
  var perf = f.performance.total;
  var zone = perf >= 95 ? 'green' : perf >= 85 ? 'yellow' : 'red';
  var zoneColor = zone === 'green' ? '#22C55E' : zone === 'yellow' ? '#FFAA00' : '#FF4D4D';
  var nowMonth = new Date().getMonth() + 1;
  var isPast = month < nowMonth;
  var fc3 = !isPast ? calcForecast3Weeks(f.fact.total, month) : null;
  var fcTotal = fc3 ? fc3.total : f.fact.total;
  var fcPct = f.plan.total > 0 ? Math.round(fcTotal / f.plan.total * 100) : 0;

  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="background:linear-gradient(135deg,#6C5CE7,#A29BFE);color:white;padding:16px 18px 18px;margin-top:8px;">' +
      '<div style="font-size:18px;font-weight:800;">' + f.name + '</div>' +
      '<div style="font-size:13px;opacity:0.85;margin-top:3px;">' + MONTH_NAMES_CAP[month] + ' 2026 \u00b7 ' + perf + '% плана' + (isPast ? ' \u00b7 закрыт' : ' \u00b7 прогноз ' + fcPct + '%') + '</div>' +
    '</div>' +
    '<div style="padding:14px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
        '<div style="background:white;border-radius:12px;padding:12px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">Средний чек</div><div style="font-size:20px;font-weight:800;">' + fmt(f.fact.avgCheck) + '</div></div>' +
        '<div style="background:white;border-radius:12px;padding:12px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">' + (isPast ? 'Итог' : 'Прогноз') + '</div><div style="font-size:20px;font-weight:800;">' + fmtShort(fcTotal) + '</div><div style="font-size:11px;color:' + zoneColor + ';margin-top:2px;">' + fcPct + '% плана</div></div>' +
      '</div>' +
      '<div style="background:white;border-radius:14px;padding:14px;margin-bottom:12px;">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:4px;">Выручка по неделям</div>' +
        '<div id="weekRevChart"><div class="loading-box" style="padding:20px;"><div class="spinner"></div></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="overlay-close" onclick="closeOverlay(\'filialOverlay\')">Закрыть</div>';

  showOverlay('filialOverlay');
  loadBranchDailyData(f, month, zoneColor);
}

function loadBranchDailyData(f, month, zoneColor) {
  fetchWithTimeout(API_ATELIE + '?action=getBranchDaily&code=' + f.code + '&month=' + month + '&year=2026', 10000)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.success && data.days && data.days.length >= 3) {
        var weeks = buildWeeksFromDays(data.days, month);
        var el = document.getElementById('weekRevChart');
        if (el) el.innerHTML = renderWeekBars(weeks, zoneColor);
      } else {
        var el = document.getElementById('weekRevChart');
        if (el) el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text-3);padding:20px;">Посуточные данные недоступны</div>';
      }
    })
    .catch(function() {
      var el = document.getElementById('weekRevChart');
      if (el) el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--text-3);padding:20px;">Не удалось загрузить</div>';
    });
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
    var prev = i > 0 ? weekMap[keys[i - 1]].total : null;
    var pct = prev && prev > 0 ? Math.round((w.total / prev - 1) * 100) : null;
    return { label: 'Нед ' + (i + 1), val: w.total, check: check, pct: pct };
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

// ── NETWORK DETAIL OVERLAY ──
function openNetworkDetail(metricKey) {
  if (!state.branches || !state.branches.filials) return;
  var data = state.branches;
  var METRIC = {
    atelie:   { title: 'Ателье \u2014 сеть', field: 'atelie', planField: 'atelie', fmt: 'money', color: '#6C5CE7' },
    himch:    { title: 'Химчистка \u2014 сеть', field: 'himchistka', planField: 'himchistka', fmt: 'money', color: '#0984E3' },
    avgcheck: { title: 'Средний чек \u2014 сеть', field: 'avgCheck', planField: null, fmt: 'money', color: '#0984E3' },
    total:    { title: 'Выручка итого', field: 'total', planField: 'total', fmt: 'money', color: '#00B894' },
    clients:  { title: 'Клиенты \u2014 сеть', field: 'clients', planField: 'clients', fmt: 'count', color: '#E17055' },
    profit:   { title: 'Прибыль \u2014 сеть', field: 'profit', planField: 'total', fmt: 'money', color: '#FDCB6E' },
    forecast: { title: 'Прогноз', field: null, planField: 'total', fmt: 'money', color: '#A29BFE' }
  };
  var cfg = METRIC[metricKey]; if (!cfg) return;
  var month = data.currentMonth || (new Date().getMonth() + 1);

  var rows = data.filials.map(function(f) {
    var fact = 0, plan = 0;
    if (metricKey === 'forecast') {
      var fc3 = calcForecast3Weeks(f.fact.total, month);
      fact = fc3 ? fc3.total : f.fact.total;
      plan = f.plan.total || 0;
    } else if (metricKey === 'profit') {
      fact = f.fact.profit || 0;
      plan = Math.round((f.plan.atelie || 0) * 0.5 + (f.plan.himchistka || 0) * 0.4);
    } else if (metricKey === 'avgcheck') {
      fact = f.fact.avgCheck || 0;
      plan = 0; // нет плана по среднему чеку
    } else {
      fact = f.fact[cfg.field] || 0;
      plan = cfg.planField ? (f.plan[cfg.planField] || 0) : 0;
    }
    var pct = plan > 0 ? Math.round(fact / plan * 100) : 0;
    return { name: f.name, fact: fact, plan: plan, pct: pct };
  }).sort(function(a, b) { return b.fact - a.fact; });

  var totalFact, totalPlan, totalPct;
  if (metricKey === 'avgcheck') {
    // Средний чек сети = общий avgCheck
    totalFact = data.totals.fact.avgCheck || 0;
    totalPlan = 0;
    totalPct = 0;
  } else {
    totalFact = rows.reduce(function(s, r) { return s + r.fact; }, 0);
    totalPlan = rows.reduce(function(s, r) { return s + r.plan; }, 0);
    totalPct = totalPlan > 0 ? Math.round(totalFact / totalPlan * 100) : 0;
  }
  var maxFact = rows[0] ? rows[0].fact : 1;
  var fmtV = function(v) { return cfg.fmt === 'count' ? v.toLocaleString('ru-RU') : fmtShort(v); };

  var rowsHtml = rows.map(function(r) {
    var barW = maxFact > 0 ? Math.round(r.fact / maxFact * 100) : 0;
    var zc = r.pct >= 95 ? '#22C55E' : r.pct >= 85 ? '#FFAA00' : '#FF4D4D';
    return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
      '<span style="font-size:13px;font-weight:600;">' + r.name + '</span><span style="font-size:13px;font-weight:800;">' + fmtV(r.fact) + '</span></div>' +
      '<div style="background:#F3F4F6;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;"><div style="height:100%;width:' + barW + '%;background:' + cfg.color + ';border-radius:6px;"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;"><span>план ' + fmtV(r.plan) + '</span><span style="color:' + zc + ';font-weight:700;">' + r.pct + '%</span></div></div>';
  }).join('');

  var overlay = getOverlay('networkOverlay');
  overlay.querySelector('.overlay-panel').innerHTML =
    '<div class="overlay-handle"></div>' +
    '<div style="background:linear-gradient(135deg,' + cfg.color + ',' + cfg.color + 'CC);color:white;padding:16px 18px 18px;margin-top:8px;">' +
      '<div style="font-size:18px;font-weight:800;">' + cfg.title + '</div>' +
      '<div style="font-size:13px;opacity:0.85;margin-top:3px;">' + MONTH_NAMES_CAP[month] + ' 2026 \u00b7 ' + totalPct + '% плана</div>' +
      '<div style="display:flex;gap:16px;margin-top:12px;">' +
        '<div><div style="font-size:10px;opacity:0.8;">ФАКТ</div><div style="font-size:22px;font-weight:800;">' + fmtV(totalFact) + '</div></div>' +
        '<div><div style="font-size:10px;opacity:0.8;">ПЛАН</div><div style="font-size:22px;font-weight:800;">' + fmtV(totalPlan) + '</div></div>' +
        '<div><div style="font-size:10px;opacity:0.8;">%</div><div style="font-size:22px;font-weight:800;">' + totalPct + '%</div></div>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.2);border-radius:8px;height:8px;overflow:hidden;margin-top:10px;"><div style="height:100%;width:' + Math.min(totalPct, 100) + '%;background:white;border-radius:8px;"></div></div>' +
    '</div>' +
    '<div style="padding:14px;"><div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">По филиалам</div>' + rowsHtml + '</div>' +
    '<div class="overlay-close" onclick="closeOverlay(\'networkOverlay\')">Закрыть</div>';

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
