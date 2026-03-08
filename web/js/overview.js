// ═══════════════════════════════════════════════════════════════
// OVERVIEW.JS — Вкладка Главная DressCode v4.0
// Свободные деньги, мини-карточки, платежи, кредиты, прогноз
// ═══════════════════════════════════════════════════════════════

function renderOverview() {
  renderFreeMoney();
  renderMiniCards();
  renderPaymentsCard();
  renderForecastWidget();
  if (typeof renderHealthBadge === 'function') renderHealthBadge();
  if (typeof renderAdvisorHome === 'function') renderAdvisorHome();
  if (typeof renderPatternsCard === 'function') renderPatternsCard();
  if (typeof renderStoriesButton === 'function') renderStoriesButton();
}

// ═══════════════════════════════════════════════════════════════
// FREE MONEY WIDGET
// ═══════════════════════════════════════════════════════════════
function renderFreeMoney() {
  var el = document.getElementById('freeMoneyContent');
  if (!state.credits || !state.credits.length) {
    el.innerHTML = '<div class="free-money-title">\u{1F4B0} \u0421\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0435 \u0434\u0435\u043D\u044C\u0433\u0438</div>' +
      '<div style="font-size:13px;opacity:0.5;margin-top:8px;">\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u043A\u0440\u0435\u0434\u0438\u0442\u0430\u0445</div>';
    return;
  }

  // Use shared forecast data for consistency
  var d = getForecastData();

  // Balance on accounts
  var totalBalance = 0;
  (state.balances || []).forEach(function(b) {
    if (b.type !== '\u041A\u0440\u0435\u0434\u0438\u0442\u043D\u0430\u044F') totalBalance += (parseFloat(b.balance) || 0);
  });

  var daily = d.daysLeft > 0 ? d.bottom / d.daysLeft : 0;
  var monthProgress = Math.round((d.dayOfMonth / d.daysInMonth) * 100);

  el.innerHTML =
    '<div class="free-money-title">\u{1F4B0} \u0421\u0412\u041E\u0411\u041E\u0414\u041D\u042B\u0415 \u0414\u0415\u041D\u042C\u0413\u0418</div>' +
    '<div class="free-money-total">\u041D\u0430 \u0441\u0447\u0435\u0442\u0430\u0445: ' + fmtShort(totalBalance) + '</div>' +
    '<div class="free-money-row"><span class="label">\u0414\u043E\u0445\u043E\u0434 \u0430\u0442\u0435\u043B\u044C\u0435 (\u043F\u0440\u043E\u0433\u043D\u043E\u0437)</span><span class="value">' + fmtShort(d.familyIncome) + '</span></div>' +
    '<div class="free-money-row"><span class="label">\u0420\u0430\u0441\u0445\u043E\u0434\u044B \u0441\u0435\u043C\u044C\u0438 (\u043F\u0440\u043E\u0433\u043D\u043E\u0437)</span><span class="value negative">\u2212' + fmtShort(d.spendForecast) + '</span></div>' +
    '<div class="free-money-row"><span class="label">\u041A\u0440\u0435\u0434\u0438\u0442\u044B</span><span class="value negative">\u2212' + fmtShort(d.creditPay) + '</span></div>' +
    '<hr class="free-money-divider">' +
    '<div class="free-money-result"><span>\u041E\u0441\u0442\u0430\u0442\u043E\u043A</span><span class="' + (d.bottom >= 0 ? 'positive' : 'negative') + '">' +
      (d.bottom >= 0 ? '+' : '') + fmtShort(d.bottom) + '</span></div>' +
    (d.daysLeft > 0 ? '<div class="free-money-daily">' + fmtShort(Math.max(0, daily)) + ' / \u0434\u0435\u043D\u044C \u00b7 \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C ' + d.daysLeft + ' \u0434\u043D.</div>' : '') +
    '<div class="month-progress"><div class="month-progress-fill" style="width:' + monthProgress + '%">' + monthProgress + '% \u043C\u0435\u0441\u044F\u0446\u0430</div></div>';
}

// ═══════════════════════════════════════════════════════════════
// MINI CARDS
// ═══════════════════════════════════════════════════════════════
function renderMiniCards() {
  // Business
  var bizCard = document.getElementById('miniCardBiz');
  if (state.branches && state.branches.totals) {
    var t = state.branches.totals;
    var total = t.fact ? (parseFloat(t.fact.total) || 0) : 0;
    var plan = t.plan ? (parseFloat(t.plan.total) || 1) : 1;
    var pct = Math.round((total / plan) * 100);
    bizCard.querySelector('.mini-card-value').textContent = fmtShort(total);
    bizCard.querySelector('.mini-card-sub').textContent = pct + '% плана';
  }

  // Family
  var famCard = document.getElementById('miniCardFamily');
  var cmKey = currentMonthKey();
  var famSpent = 0;
  (familyData.transactions || []).forEach(function(tx) {
    if (getMonthKey(tx.date) === cmKey && tx.type !== 'income') {
      famSpent += (parseFloat(tx.amount) || 0);
    }
  });
  famCard.querySelector('.mini-card-value').textContent = fmtShort(famSpent);
  famCard.querySelector('.mini-card-sub').textContent = familyData.transactions.length + ' операций';

  // Credits
  var credCard = document.getElementById('miniCardCredits');
  var totalDebt = 0;
  var monthlyPay = 0;
  (state.credits || []).forEach(function(cr) {
    totalDebt += (parseFloat(cr.balanceCurrent || cr.balance) || 0);
    if (cr.status === 'Активный' || !cr.status) {
      monthlyPay += (parseFloat(cr.payment) || 0);
    }
  });
  credCard.querySelector('.mini-card-value').textContent = fmtShort(totalDebt);
  credCard.querySelector('.mini-card-sub').textContent = fmtShort(monthlyPay) + '/мес';
}

// ═══════════════════════════════════════════════════════════════
// PAYMENTS CARD
// ═══════════════════════════════════════════════════════════════
function renderPaymentsCard() {
  var el = document.getElementById('paymentsContent');
  var monthName = document.getElementById('payMonthName');
  var now = new Date();
  var cm = now.getMonth() + 1;
  monthName.textContent = MONTH_NAMES[cm];

  if (!state.credits || !state.credits.length) {
    el.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:10px 0;">Нет данных о платежах</div>';
    return;
  }

  // Collect payments
  var payments = [];
  state.credits.forEach(function(cr) {
    if (cr.status === 'Заморожен') return;
    var day = parseInt(cr.paymentDay) || parseInt(cr.paymentDate) || 0;
    if (day === 0) {
      var dm = String(cr.paymentDate || '').match(/(\d{1,2})/);
      if (dm) day = parseInt(dm[1]);
    }
    payments.push({
      name: cr.name || cr.Кредитор || 'Кредит',
      amount: parseFloat(cr.payment) || 0,
      day: day,
      paid: day > 0 && day < now.getDate(),
      isToday: day === now.getDate(),
      status: cr.status
    });
  });

  payments.sort(function(a, b) { return a.day - b.day; });

  // Next payment
  var nextPay = payments.find(function(p) { return !p.paid && !p.isToday; });
  var todayPay = payments.find(function(p) { return p.isToday; });
  var html = '';

  if (todayPay) {
    html += '<div class="next-payment today"><div class="next-label">\u{1F534} СЕГОДНЯ</div>' +
      '<div class="next-info">' + todayPay.name + ' \u2014 ' + fmt(todayPay.amount) + '</div></div>';
  } else if (nextPay) {
    var daysTo = nextPay.day - now.getDate();
    var cls = daysTo <= 3 ? 'urgent' : '';
    html += '<div class="next-payment ' + cls + '"><div class="next-label">' +
      (daysTo <= 3 ? '\u26A0\uFE0F СКОРО' : '\u23F3 СЛЕДУЮЩИЙ') + '</div>' +
      '<div class="next-info">' + nextPay.name + ' \u2014 ' + fmt(nextPay.amount) + '</div>' +
      '<div class="next-date">' + nextPay.day + ' ' + MONTH_NAMES[cm] + ' \u00b7 через ' + daysTo + ' дн.</div></div>';
  }

  // Payment rows
  var totalPaid = 0, totalLeft = 0;
  payments.forEach(function(p) {
    var icon = p.paid ? '\u2705' : (p.isToday ? '\u{1F534}' : '\u23F3');
    var cls = p.paid ? ' paid' : '';
    html += '<div class="pay-row' + cls + '">' +
      '<div class="pay-day">' + (p.day || '\u2014') + '</div>' +
      '<div class="pay-name">' + p.name + '</div>' +
      '<div class="pay-amount">' + fmtShort(p.amount) + '</div>' +
      '<div class="pay-status">' + icon + '</div></div>';
    if (p.paid) totalPaid += p.amount; else totalLeft += p.amount;
  });

  html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-3);margin-top:10px;font-weight:600;">' +
    '<span>\u2705 Оплачено: ' + fmtShort(totalPaid) + '</span>' +
    '<span>\u23F3 Осталось: ' + fmtShort(totalLeft) + '</span></div>';

  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// FORECAST WIDGET — "Хватит ли денег?" (v5 enhanced)
// ═══════════════════════════════════════════════════════════════
function getForecastData() {
  var now = new Date();
  var cm = now.getMonth() + 1;
  var dayOfMonth = now.getDate();
  var daysInMonth = new Date(now.getFullYear(), cm, 0).getDate();
  var daysLeft = daysInMonth - dayOfMonth;

  // Use real margin if available (from business.js calcRealMarginData)
  var useRealMargin = localStorage.getItem('forecast_use_real_margin') !== 'false';
  var hasRealMargin = typeof calcRealMarginData === 'function';
  var bizProfit = 0;
  var rent = parseFloat(state.settings['\u0430\u0440\u0435\u043D\u0434\u0430_\u0432\u0441\u0435\u0433\u043E']) || 396000;
  var marginSource = 'estimate';
  var bizExpenses = 0;

  if (useRealMargin && hasRealMargin && state.branches) {
    var mData = calcRealMarginData(state.branches);
    if (mData && mData.revenue > 0) {
      bizProfit = mData.revenue;
      bizExpenses = mData.totalExpenses || 0;
      rent = mData.rentK9 || rent;
      marginSource = mData.source || 'K9';
      if (dayOfMonth > 3 && dayOfMonth < daysInMonth) {
        var ratio = daysInMonth / dayOfMonth;
        bizProfit = bizProfit * ratio;
        bizExpenses = bizExpenses * ratio;
      }
    }
  }

  // Fallback: simple margin estimate
  if (bizProfit === 0 && state.branches && state.branches.totals) {
    var t = state.branches.totals;
    var mA = parseFloat(state.settings['\u043C\u0430\u0440\u0436\u0430_\u0430\u0442\u0435\u043B\u044C\u0435']) || 0.5;
    var mH = parseFloat(state.settings['\u043C\u0430\u0440\u0436\u0430_\u0445\u0438\u043C\u0447\u0438\u0441\u0442\u043A\u0430']) || 0.4;
    var fA = t.fact ? (parseFloat(t.fact.atelie) || 0) : 0;
    var fH = t.fact ? (parseFloat(t.fact.himchistka) || 0) : 0;
    bizProfit = fA * mA + fH * mH;
    if (dayOfMonth > 3 && dayOfMonth < daysInMonth) {
      bizProfit = (bizProfit / dayOfMonth) * daysInMonth;
    }
    marginSource = 'estimate';
  }

  // Family spending forecast — prioritize budget data
  var cmKey = currentMonthKey();
  var famSpent = 0;
  (familyData.transactions || []).forEach(function(tx) {
    if (getMonthKey(tx.date) === cmKey && tx.type !== 'income') famSpent += (parseFloat(tx.amount) || 0);
  });

  var budgetTotal = 0;
  var hasBudgets = false;
  var budgets = {};
  try { budgets = JSON.parse(localStorage.getItem('family_budgets') || '{}'); } catch(e) {}
  var budgetKeys = Object.keys(budgets);
  if (budgetKeys.length > 0) {
    hasBudgets = true;
    budgetKeys.forEach(function(k) { budgetTotal += (parseFloat(budgets[k]) || 0); });
  }

  var spendForecast;
  var spendSource = '';
  if (hasBudgets && budgetTotal > 0) {
    spendForecast = budgetTotal;
    spendSource = 'budget';
  } else {
    var stored = localStorage.getItem('family_spending_forecast');
    spendForecast = stored ? parseFloat(stored) : null;
    if (!spendForecast && dayOfMonth > 5) {
      spendForecast = (famSpent / dayOfMonth) * daysInMonth;
      spendSource = 'trend';
    }
    spendForecast = spendForecast || parseFloat(state.settings['\u0440\u0430\u0441\u0445\u043E\u0434\u044B_\u0441\u0435\u043C\u044C\u044F']) || 300000;
    if (!spendSource) spendSource = 'default';
  }

  // Credit payments
  var creditPay = 0;
  (state.credits || []).forEach(function(cr) {
    if (cr.status === '\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439' || !cr.status) creditPay += (parseFloat(cr.payment) || 0);
  });

  var incPct = parseFloat(localStorage.getItem('family_income_percent')) || 50;

  // Income calculation
  var familyIncome;
  if (marginSource !== 'estimate' && bizExpenses > 0) {
    familyIncome = (bizProfit - bizExpenses) * (incPct / 100);
  } else {
    familyIncome = (bizProfit - rent) * (incPct / 100);
  }

  var bottom = familyIncome - spendForecast - creditPay;

  return {
    bizProfit: bizProfit, rent: rent, bizExpenses: bizExpenses,
    familyIncome: familyIncome, famSpent: famSpent,
    spendForecast: spendForecast, creditPay: creditPay,
    incPct: incPct, bottom: bottom, daysLeft: daysLeft,
    dayOfMonth: dayOfMonth, daysInMonth: daysInMonth,
    marginSource: marginSource, spendSource: spendSource,
    hasBudgets: hasBudgets, budgetTotal: budgetTotal
  };
}

function renderForecastWidget() {
  var card = document.getElementById('card-forecast');
  var el = document.getElementById('forecastContent');
  if (!state.branches || !state.credits) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  var d = getForecastData();
  var isOk = d.bottom >= 0;

  // Source badges
  var marginBadge = d.marginSource === 'estimate'
    ? '<span class="fc-badge fc-badge-warn">\u2248 \u043E\u0446\u0435\u043D\u043A\u0430</span>'
    : '<span class="fc-badge fc-badge-ok">\u2705 ' + d.marginSource + '</span>';
  var spendBadge = d.spendSource === 'budget'
    ? '<span class="fc-badge fc-badge-ok">\u{1F3AF} \u0431\u044E\u0434\u0436\u0435\u0442</span>'
    : d.spendSource === 'trend'
    ? '<span class="fc-badge fc-badge-warn">\u{1F4C8} \u0442\u0440\u0435\u043D\u0434</span>'
    : '<span class="fc-badge fc-badge-warn">\u2248 \u043F\u043E \u0443\u043C\u043E\u043B\u0447.</span>';

  var html = '<div class="fc-rows">';

  if (d.marginSource !== 'estimate' && d.bizExpenses > 0) {
    html += '<div class="fc-row"><span>\u{1F3E2} \u0412\u044B\u0440\u0443\u0447\u043A\u0430 ' + marginBadge + '</span><strong>' + fmtShort(d.bizProfit) + '</strong></div>';
    html += '<div class="fc-row"><span>\u{1F4CA} \u0420\u0430\u0441\u0445\u043E\u0434\u044B \u0431\u0438\u0437\u043D\u0435\u0441\u0430</span><strong class="fc-neg">\u2212' + fmtShort(d.bizExpenses) + '</strong></div>';
  } else {
    html += '<div class="fc-row"><span>\u{1F4B0} \u041F\u0440\u0438\u0431\u044B\u043B\u044C \u0430\u0442\u0435\u043B\u044C\u0435 ' + marginBadge + '</span><strong>' + fmtShort(d.bizProfit) + '</strong></div>';
    html += '<div class="fc-row"><span>\u{1F3E0} \u0410\u0440\u0435\u043D\u0434\u0430</span><strong class="fc-neg">\u2212' + fmtShort(d.rent) + '</strong></div>';
  }

  html += '<div class="fc-row fc-row-income"><span>\u{1F46A} \u0412 \u0441\u0435\u043C\u044C\u044E (' + d.incPct + '%)</span><strong>' + fmtShort(d.familyIncome) + '</strong></div>';
  html += '<div class="fc-divider"></div>';
  html += '<div class="fc-row"><span>\u{1F6D2} \u0420\u0430\u0441\u0445\u043E\u0434\u044B \u0441\u0435\u043C\u044C\u0438 ' + spendBadge + '</span><strong class="fc-neg">\u2212' + fmtShort(d.spendForecast) + '</strong></div>';
  html += '<div class="fc-row"><span>\u{1F4B3} \u041A\u0440\u0435\u0434\u0438\u0442\u044B</span><strong class="fc-neg">\u2212' + fmtShort(d.creditPay) + '</strong></div>';
  html += '</div>';

  html += '<div class="forecast-box ' + (isOk ? 'forecast-ok' : 'forecast-bad') + '">';
  html += isOk
    ? '\u2705 \u0425\u0432\u0430\u0442\u0438\u0442! \u0417\u0430\u043F\u0430\u0441: ' + fmtShort(d.bottom)
    : '\u26A0\uFE0F \u0414\u0435\u0444\u0438\u0446\u0438\u0442: ' + fmtShort(Math.abs(d.bottom));
  html += '</div>';

  if (d.daysLeft > 0 && d.bottom > 0) {
    html += '<div class="fc-daily">\u{1F4C5} ' + fmtShort(Math.round(d.bottom / d.daysLeft)) + '/\u0434\u0435\u043D\u044C \u00b7 \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C ' + d.daysLeft + ' \u0434\u043D.</div>';
  }

  el.innerHTML = html;
}

function openForecastSettings() {
  var ov = getOverlay('forecastSettingsOverlay');
  var panel = ov.querySelector('.overlay-panel');

  var incPct = parseFloat(localStorage.getItem('family_income_percent')) || 50;
  var useReal = localStorage.getItem('forecast_use_real_margin') !== 'false';

  var html = '<div class="overlay-handle"></div><div style="padding:20px 16px 10px;">';
  html += '<div style="font-size:18px;font-weight:800;margin-bottom:16px;">\u2699\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0430</div>';

  // Income percent
  html += '<div class="fc-setting">';
  html += '<div class="fc-setting-label">\u041F\u0440\u043E\u0446\u0435\u043D\u0442 \u0434\u043E\u0445\u043E\u0434\u0430 \u0432 \u0441\u0435\u043C\u044C\u044E</div>';
  html += '<div class="fc-setting-desc">\u0421\u043A\u043E\u043B\u044C\u043A\u043E % \u043E\u0442 \u043F\u0440\u0438\u0431\u044B\u043B\u0438 \u0430\u0442\u0435\u043B\u044C\u0435 \u0438\u0434\u0451\u0442 \u0432 \u0441\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0431\u044E\u0434\u0436\u0435\u0442</div>';
  html += '<div class="fc-setting-control">';
  html += '<input type="range" id="fcIncomeRange" min="10" max="100" step="5" value="' + incPct + '" oninput="document.getElementById(\'fcIncomeVal\').textContent=this.value+\'%\'" style="flex:1;">';
  html += '<span id="fcIncomeVal" style="font-weight:800;font-size:16px;min-width:44px;text-align:right;">' + incPct + '%</span>';
  html += '</div></div>';

  // Real margin toggle
  html += '<div class="fc-setting">';
  html += '<div class="fc-setting-label">\u0420\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u0430\u0440\u0436\u0430</div>';
  html += '<div class="fc-setting-desc">\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 K9/\u0420\u0421\u0427 \u0434\u043B\u044F \u0442\u043E\u0447\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0447\u0451\u0442\u0430</div>';
  html += '<label class="fc-toggle">';
  html += '<input type="checkbox" id="fcRealMargin" ' + (useReal ? 'checked' : '') + '>';
  html += '<span class="fc-toggle-slider"></span>';
  html += '</label></div>';

  html += '<button class="fam-btn-upload" style="margin-top:20px;" onclick="saveForecastSettings()">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C</button>';
  html += '</div>';
  html += '<div class="overlay-close" onclick="closeOverlay(\'forecastSettingsOverlay\')">\u0417\u0430\u043A\u0440\u044B\u0442\u044C</div>';

  panel.innerHTML = html;
  showOverlay('forecastSettingsOverlay');
}

function saveForecastSettings() {
  var incPct = document.getElementById('fcIncomeRange').value;
  var useReal = document.getElementById('fcRealMargin').checked;
  localStorage.setItem('family_income_percent', incPct);
  localStorage.setItem('forecast_use_real_margin', useReal ? 'true' : 'false');
  closeOverlay('forecastSettingsOverlay');
  renderOverview();
  showToast('\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B');
}

// ═══════════════════════════════════════════════════════════════
// CREDITS OVERLAY
// ═══════════════════════════════════════════════════════════════
function openCreditsOverlay() {
  var ov = getOverlay('creditsOverlay');
  var panel = ov.querySelector('.overlay-panel');

  var credits = (state.credits || []).slice().sort(function(a, b) {
    var rA = parseFloat(a.rate) || 0;
    var rB = parseFloat(b.rate) || 0;
    return rB - rA;
  });

  var totalDebt = 0, totalPay = 0;
  credits.forEach(function(cr) {
    totalDebt += (parseFloat(cr.balanceCurrent || cr.balance || cr.balanceInit) || 0);
    totalPay += (parseFloat(cr.payment) || 0);
  });

  var html = '<div class="overlay-handle"></div><div style="padding:20px 16px 10px;">' +
    '<div style="font-size:18px;font-weight:800;margin-bottom:4px;">\u{1F4B3} Кредиты (' + credits.length + ')</div>' +
    '<div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">Долг: ' + fmtShort(totalDebt) + ' \u00b7 Платёж: ' + fmtShort(totalPay) + '/мес</div>';

  credits.forEach(function(cr, i) {
    var bal = parseFloat(cr.balanceCurrent || cr.balance || cr.balanceInit) || 0;
    var init = parseFloat(cr.balanceInit || cr.balance) || bal;
    var rate = parseFloat(cr.rate) || 0;
    var pct = init > 0 ? Math.round(((init - bal) / init) * 100) : 0;
    var rateColor = rate > 20 ? 'var(--red)' : (rate > 10 ? 'var(--orange)' : 'var(--green)');
    var isGrace = /грейс|grace/i.test(cr.name || '');

    html += '<div class="credit-card' + (isGrace ? ' grace' : '') + '">' +
      '<div class="credit-top"><div class="credit-name">' + (cr.name || cr.Кредитор || 'Кредит') + '</div>' +
      '<div class="credit-rate" style="color:' + rateColor + ';background:' + rateColor + '15;">' + (rate > 1 ? rate.toFixed(1) : (rate * 100).toFixed(1)) + '%</div></div>' +
      '<div class="credit-amount">' + fmt(bal) + '</div>' +
      '<div class="credit-row"><span>Платёж</span><span>' + fmt(cr.payment) + '</span></div>' +
      '<div class="credit-row"><span>День платежа</span><span>' + (cr.paymentDay || '\u2014') + ' число</span></div>' +
      '<div class="credit-row"><span>Закрытие</span><span>' + (cr.closeDate || '\u2014') + '</span></div>' +
      '<div class="credit-progress"><div class="credit-progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<div style="text-align:center;font-size:10px;color:var(--text-3);margin-top:4px;">Погашено ' + pct + '%</div>' +
      '</div>';
  });

  html += '</div><div class="overlay-close" onclick="closeOverlay(\'creditsOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
  showOverlay('creditsOverlay');
}
