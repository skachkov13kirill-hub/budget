// ═══════════════════════════════════════════════════════════════
// ADVISOR.JS — Этап 4: Health Score, AI-Советник, Smart Patterns
// DressCode v4.0
// ═══════════════════════════════════════════════════════════════

// ── HELPERS ──
function getPrevMonthKey(mk) {
  var parts = mk.split('-');
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]) - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
}

function getBizProfit() {
  if (!state.branches || !state.branches.totals) return 0;
  var t = state.branches.totals;
  var mA = parseFloat(state.settings['маржа_ателье']) || 0.5;
  var mH = parseFloat(state.settings['маржа_химчистка']) || 0.4;
  var fA = t.fact ? (parseFloat(t.fact.atelie) || 0) : 0;
  var fH = t.fact ? (parseFloat(t.fact.himchistka) || 0) : 0;
  return fA * mA + fH * mH;
}

// ═══════════════════════════════════════════════════════════════
// 1. HEALTH SCORE (0-100)
// ═══════════════════════════════════════════════════════════════
function calcHealthScore() {
  var score = 0;
  var breakdown = [];
  var cmKey = currentMonthKey();
  var prevMK = getPrevMonthKey(cmKey);

  // --- data ---
  var bizProfit = getBizProfit();
  var incPct = parseFloat(localStorage.getItem('family_income_percent')) || 50;
  var familyIncome = bizProfit * (incPct / 100);

  var famSpent = 0;
  var prevSpent = 0;
  (familyData.transactions || []).forEach(function(tx) {
    var mk = tx.monthKey || famGetMonthKey(tx.date);
    var amt = Math.abs(parseFloat(tx.amount) || 0);
    if (mk === cmKey) famSpent += amt;
    if (mk === prevMK) prevSpent += amt;
  });

  var creditPay = 0;
  (state.credits || []).forEach(function(cr) {
    if (cr.status === 'Активный' || !cr.status) creditPay += (parseFloat(cr.payment) || 0);
  });

  var totalBalance = 0;
  (state.balances || []).forEach(function(b) {
    if (b.type !== 'Кредитная') totalBalance += (parseFloat(b.balance) || 0);
  });

  // 1. Расходы семьи < дохода → +30
  if (familyIncome > 0 && famSpent < familyIncome) {
    score += 30;
    breakdown.push({ name: 'Расходы < доходов', points: 30, max: 30, ok: true });
  } else {
    breakdown.push({ name: 'Расходы < доходов', points: 0, max: 30, ok: false });
  }

  // 2. Кредитная нагрузка < 30% → +20
  var creditRatio = familyIncome > 0 ? (creditPay / familyIncome) : 1;
  if (creditRatio < 0.3) {
    score += 20;
    breakdown.push({ name: 'Кредиты < 30% дохода', points: 20, max: 20, ok: true, detail: Math.round(creditRatio * 100) + '%' });
  } else {
    breakdown.push({ name: 'Кредиты < 30% дохода', points: 0, max: 20, ok: false, detail: Math.round(creditRatio * 100) + '%' });
  }

  // 3. Расходы снижаются м/м → +15
  if (prevSpent > 0 && famSpent <= prevSpent) {
    score += 15;
    breakdown.push({ name: 'Расходы снижаются', points: 15, max: 15, ok: true });
  } else if (prevSpent > 0) {
    var growthPct = Math.round((famSpent - prevSpent) / prevSpent * 100);
    breakdown.push({ name: 'Расходы снижаются', points: 0, max: 15, ok: false, detail: '+' + growthPct + '%' });
  } else {
    breakdown.push({ name: 'Расходы снижаются', points: 0, max: 15, ok: null, detail: 'нет данных' });
  }

  // 4. Подушка безопасности → +15
  var cushionMonths = famSpent > 0 ? totalBalance / famSpent : 0;
  if (cushionMonths >= 1) {
    score += 15;
    breakdown.push({ name: 'Подушка безопасности', points: 15, max: 15, ok: true, detail: cushionMonths.toFixed(1) + ' мес.' });
  } else {
    breakdown.push({ name: 'Подушка безопасности', points: 0, max: 15, ok: false, detail: cushionMonths.toFixed(1) + ' мес.' });
  }

  // 5. Маржа ателье > 40% → +10
  var bizMargin = 0;
  if (state.branches && state.branches.totals && state.branches.totals.fact) {
    var totalRev = parseFloat(state.branches.totals.fact.total) || 0;
    if (totalRev > 0) bizMargin = bizProfit / totalRev;
  }
  if (bizMargin > 0.4) {
    score += 10;
    breakdown.push({ name: 'Маржа ателье > 40%', points: 10, max: 10, ok: true, detail: Math.round(bizMargin * 100) + '%' });
  } else {
    breakdown.push({ name: 'Маржа ателье > 40%', points: 0, max: 10, ok: false, detail: Math.round(bizMargin * 100) + '%' });
  }

  // 6. Бюджеты не превышены → +10
  var budgetsOk = true;
  var catTotals = {};
  (familyData.transactions || []).filter(function(tx) {
    return (tx.monthKey || famGetMonthKey(tx.date)) === cmKey;
  }).forEach(function(tx) {
    var cat = tx.category || 'Прочее';
    catTotals[cat] = (catTotals[cat] || 0) + Math.abs(parseFloat(tx.amount) || 0);
  });
  Object.keys(catTotals).forEach(function(cat) {
    var budget = (typeof getCategoryBudget === 'function') ? getCategoryBudget(cat) : (DEFAULT_NORMS[cat] ? DEFAULT_NORMS[cat].monthly_avg : 0);
    if (budget > 0 && catTotals[cat] > budget) budgetsOk = false;
  });
  if (budgetsOk) {
    score += 10;
    breakdown.push({ name: 'Бюджеты не превышены', points: 10, max: 10, ok: true });
  } else {
    breakdown.push({ name: 'Бюджеты не превышены', points: 0, max: 10, ok: false });
  }

  return { score: score, breakdown: breakdown };
}

function getHealthColor(score) {
  if (score >= 80) return 'var(--green)';
  if (score >= 50) return 'var(--orange)';
  return 'var(--red)';
}
function getHealthEmoji(score) {
  if (score >= 80) return '\uD83D\uDCAA';
  if (score >= 60) return '\uD83D\uDC4D';
  if (score >= 40) return '\u26A0\uFE0F';
  return '\uD83C\uDD98';
}
function getHealthLabel(score) {
  if (score >= 80) return 'Отлично! Финансы в порядке';
  if (score >= 60) return 'Хорошо, но есть что улучшить';
  if (score >= 40) return 'Требует внимания';
  return 'Критическая ситуация';
}

// ── Health Badge (Home tab) ──
function renderHealthBadge() {
  var el = document.getElementById('healthBadgeHome');
  if (!el) return;
  var r = calcHealthScore();
  var color = getHealthColor(r.score);
  var emoji = getHealthEmoji(r.score);
  // SVG ring: r=18, circumference=113.1
  var dash = Math.round(r.score * 1.131);

  el.style.display = '';
  el.innerHTML = '<div class="health-badge" onclick="openHealthOverlay()">'
    + '<div class="health-score-ring">'
    + '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="4"/>'
    + '<circle cx="22" cy="22" r="18" fill="none" stroke="' + color + '" stroke-width="4" '
    + 'stroke-dasharray="' + dash + ' 113" stroke-linecap="round" transform="rotate(-90 22 22)"/></svg>'
    + '<span class="health-score-num">' + r.score + '</span></div>'
    + '<div class="health-badge-text">'
    + '<div class="health-badge-title">' + emoji + ' Финансовое здоровье</div>'
    + '<div class="health-badge-sub">' + r.score + '/100 \u00b7 нажмите для деталей</div></div></div>';
}

// ── Health Overlay (full breakdown) ──
function openHealthOverlay() {
  var r = calcHealthScore();
  var overlay = getOverlay('healthOverlay');
  var panel = overlay.querySelector('.overlay-panel');
  var color = getHealthColor(r.score);
  var emoji = getHealthEmoji(r.score);
  // Big ring: r=52, circumference=326.7
  var dash = Math.round(r.score * 3.267);

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="text-align:center;margin-bottom:20px;">';
  html += '<div class="health-ring-big">';
  html += '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="8"/>';
  html += '<circle cx="60" cy="60" r="52" fill="none" stroke="' + color + '" stroke-width="8" ';
  html += 'stroke-dasharray="' + dash + ' 327" stroke-linecap="round" transform="rotate(-90 60 60)"/></svg>';
  html += '<span class="health-ring-num">' + r.score + '</span></div>';
  html += '<div style="font-size:18px;font-weight:800;margin-top:8px;">' + emoji + ' Финансовое здоровье</div>';
  html += '<div style="font-size:13px;color:var(--text-3);">' + getHealthLabel(r.score) + '</div></div>';

  r.breakdown.forEach(function(item) {
    var icon = item.ok === true ? '\u2705' : (item.ok === false ? '\u274C' : '\u23F8\uFE0F');
    html += '<div class="health-row">';
    html += '<span>' + icon + ' ' + item.name + '</span>';
    html += '<span class="health-points">';
    if (item.detail) html += '<span style="color:var(--text-3);font-size:11px;margin-right:6px;">' + item.detail + '</span>';
    html += item.points + '/' + item.max + '</span></div>';
  });

  html += '</div><div class="overlay-close" onclick="closeOverlay(\'healthOverlay\')">Закрыть</div>';
  panel.innerHTML = html;
  showOverlay('healthOverlay');
}

// ═══════════════════════════════════════════════════════════════
// 2. AI-СОВЕТНИК (автоматические рекомендации)
// ═══════════════════════════════════════════════════════════════
function generateAdvisorTips() {
  var tips = [];
  var cmKey = currentMonthKey();
  var prevMK = getPrevMonthKey(cmKey);

  // Category totals for current and previous month
  var curCats = {};
  var prevCats = {};
  (familyData.transactions || []).forEach(function(tx) {
    var mk = tx.monthKey || famGetMonthKey(tx.date);
    var cat = tx.category || 'Прочее';
    var amt = Math.abs(parseFloat(tx.amount) || 0);
    if (mk === cmKey) curCats[cat] = (curCats[cat] || 0) + amt;
    if (mk === prevMK) prevCats[cat] = (prevCats[cat] || 0) + amt;
  });

  // Tip: category spending growth >30%
  Object.keys(curCats).forEach(function(cat) {
    if (prevCats[cat] && prevCats[cat] > 5000) {
      var growth = (curCats[cat] - prevCats[cat]) / prevCats[cat];
      if (growth > 0.3) {
        tips.push({
          icon: '\uD83D\uDCC8', type: 'warning',
          text: 'Расходы на ' + cat + ' выросли на ' + Math.round(growth * 100) + '% к прошлому месяцу',
          detail: fmt(curCats[cat]) + ' vs ' + fmt(prevCats[cat])
        });
      }
    }
  });

  // Tip: credit load
  var creditPay = 0;
  (state.credits || []).forEach(function(cr) {
    if (cr.status === 'Активный' || !cr.status) creditPay += (parseFloat(cr.payment) || 0);
  });
  var bizProfit = getBizProfit();
  var incPct = parseFloat(localStorage.getItem('family_income_percent')) || 50;
  var familyIncome = bizProfit * (incPct / 100);
  if (familyIncome > 0) {
    var creditRatio = Math.round((creditPay / familyIncome) * 100);
    if (creditRatio > 30) {
      tips.push({
        icon: '\uD83D\uDCB3', type: 'danger',
        text: 'Кредитная нагрузка = ' + creditRatio + '% от дохода (норма <30%)',
        detail: fmt(creditPay) + '/мес'
      });
    }
  }

  // Tip: yearly extrapolation for top category
  var topCats = Object.keys(curCats).sort(function(a, b) { return curCats[b] - curCats[a]; });
  if (topCats.length > 0) {
    var topCat = topCats[0];
    var yearly = curCats[topCat] * 12;
    if (yearly > 500000) {
      tips.push({
        icon: '\uD83D\uDD2E', type: 'info',
        text: 'При текущем темпе за год потратите ' + fmtShort(yearly) + ' на ' + topCat,
        detail: fmtShort(curCats[topCat]) + '/мес'
      });
    }
  }

  // Tip: business margin < 40%
  if (state.branches && state.branches.totals && state.branches.totals.fact) {
    var totalRev = parseFloat(state.branches.totals.fact.total) || 0;
    if (totalRev > 0 && bizProfit > 0) {
      var margin = bizProfit / totalRev;
      if (margin < 0.4) {
        tips.push({
          icon: '\uD83C\uDFE2', type: 'warning',
          text: 'Маржа ателье ниже 40%: ' + Math.round(margin * 100) + '%',
          detail: 'Прибыль: ' + fmtShort(bizProfit)
        });
      }
    }
  }

  // Tip: budget overruns
  Object.keys(curCats).forEach(function(cat) {
    var budget = (typeof getCategoryBudget === 'function') ? getCategoryBudget(cat) : (DEFAULT_NORMS[cat] ? DEFAULT_NORMS[cat].monthly_avg : 0);
    if (budget > 0 && curCats[cat] > budget) {
      var over = Math.round(((curCats[cat] - budget) / budget) * 100);
      tips.push({
        icon: '\u26A0\uFE0F', type: 'warning',
        text: cat + ': бюджет превышен на ' + over + '%',
        detail: fmt(curCats[cat]) + ' из ' + fmt(budget)
      });
    }
  });

  // Tip: positive — expenses decreased
  var totalCur = 0;
  var totalPrev = 0;
  Object.keys(curCats).forEach(function(k) { totalCur += curCats[k]; });
  Object.keys(prevCats).forEach(function(k) { totalPrev += prevCats[k]; });
  if (totalPrev > 0 && totalCur < totalPrev) {
    var decrease = Math.round(((totalPrev - totalCur) / totalPrev) * 100);
    tips.push({
      icon: '\u2705', type: 'good',
      text: 'Расходы снизились на ' + decrease + '% к прошлому месяцу',
      detail: fmt(totalCur) + ' vs ' + fmt(totalPrev)
    });
  }

  // Sort: danger → warning → info → good
  var order = { danger: 0, warning: 1, info: 2, good: 3 };
  tips.sort(function(a, b) { return (order[a.type] || 9) - (order[b.type] || 9); });
  return tips.slice(0, 8);
}

// ── Advisor Card (Home tab — top 3 tips) ──
function renderAdvisorHome() {
  var el = document.getElementById('advisorTipsHome');
  if (!el) return;
  var tips = generateAdvisorTips();
  if (tips.length === 0) { el.style.display = 'none'; return; }

  el.style.display = '';
  var html = '<div class="card"><div class="card-header">\uD83E\uDDE0 AI-Советник</div>';
  tips.slice(0, 3).forEach(function(tip) {
    var bg = tip.type === 'danger' ? 'var(--red-light)' :
             tip.type === 'warning' ? 'var(--orange-light)' :
             tip.type === 'good' ? 'var(--green-light)' : 'var(--surface-2)';
    html += '<div class="advisor-tip" style="background:' + bg + ';">';
    html += '<div class="advisor-tip-text">' + tip.icon + ' ' + tip.text + '</div>';
    if (tip.detail) html += '<div class="advisor-tip-detail">' + tip.detail + '</div>';
    html += '</div>';
  });
  if (tips.length > 3) {
    html += '<div style="text-align:center;padding:8px;font-size:12px;color:var(--primary);cursor:pointer;font-weight:600;" '
          + 'onclick="openAdvisorOverlay()">\u0415\u0449\u0451 ' + (tips.length - 3) + ' \u0441\u043E\u0432\u0435\u0442\u043E\u0432 \u2192</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ── Advisor Overlay (all tips) ──
function openAdvisorOverlay() {
  var tips = generateAdvisorTips();
  var overlay = getOverlay('advisorOverlay');
  var panel = overlay.querySelector('.overlay-panel');

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:16px;">\uD83E\uDDE0 AI-\u0421\u043E\u0432\u0435\u0442\u043D\u0438\u043A</div>';
  if (tips.length === 0) {
    html += '<div class="fam-empty">\u0412\u0441\u0451 \u043E\u0442\u043B\u0438\u0447\u043D\u043E! \u0421\u043E\u0432\u0435\u0442\u043E\u0432 \u043D\u0435\u0442.</div>';
  } else {
    tips.forEach(function(tip) {
      var bg = tip.type === 'danger' ? 'var(--red-light)' :
               tip.type === 'warning' ? 'var(--orange-light)' :
               tip.type === 'good' ? 'var(--green-light)' : 'var(--surface-2)';
      html += '<div class="advisor-tip" style="background:' + bg + ';">';
      html += '<div class="advisor-tip-text">' + tip.icon + ' ' + tip.text + '</div>';
      if (tip.detail) html += '<div class="advisor-tip-detail">' + tip.detail + '</div>';
      html += '</div>';
    });
  }
  html += '</div><div class="overlay-close" onclick="closeOverlay(\'advisorOverlay\')">\u0417\u0430\u043A\u0440\u044B\u0442\u044C</div>';
  panel.innerHTML = html;
  showOverlay('advisorOverlay');
}

// ═══════════════════════════════════════════════════════════════
// 3. SMART PATTERNS (регулярные платежи)
// ═══════════════════════════════════════════════════════════════
function detectSmartPatterns() {
  var allTx = (typeof getAllFamilyTx === 'function' ? getAllFamilyTx() : [])
    .concat(typeof getAllFamilyExcluded === 'function' ? getAllFamilyExcluded() : []);
  if (allTx.length < 10) return [];

  // Group by normalized merchant + rounded amount
  var groups = {};
  allTx.forEach(function(tx) {
    var merchant = (tx.merchant || (typeof extractMerchant === 'function' ? extractMerchant(tx.description) : '') || '').toUpperCase().substring(0, 20);
    if (!merchant || merchant === '\u041D\u0415\u0418\u0417\u0412\u0415\u0421\u0422\u041D\u041E') return;
    var amount = Math.round(Math.abs(parseFloat(tx.amount) || 0));
    if (amount <= 0) return;
    var amountKey = amount < 1000 ? Math.round(amount / 10) * 10 : Math.round(amount / 100) * 100;
    var key = merchant + '|' + amountKey;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      date: typeof famNormalizeDate === 'function' ? famNormalizeDate(tx.date) : String(tx.date || ''),
      amount: amount,
      merchant: tx.merchant || (typeof extractMerchant === 'function' ? extractMerchant(tx.description) : tx.description),
      category: tx.category,
      bucket: tx.bucket
    });
  });

  var patterns = [];
  Object.keys(groups).forEach(function(key) {
    var txs = groups[key];
    if (txs.length < 2) return;

    txs.sort(function(a, b) { return a.date.localeCompare(b.date); });

    // Calculate intervals between occurrences
    var intervals = [];
    for (var i = 1; i < txs.length; i++) {
      var d1 = new Date(txs[i - 1].date);
      var d2 = new Date(txs[i].date);
      var diff = Math.round((d2 - d1) / 86400000);
      if (diff > 0) intervals.push(diff);
    }
    if (intervals.length === 0) return;

    var avgInterval = intervals.reduce(function(s, v) { return s + v; }, 0) / intervals.length;
    var isMonthly = avgInterval >= 25 && avgInterval <= 35;
    var isWeekly = avgInterval >= 5 && avgInterval <= 9;
    if (!isMonthly && !isWeekly) return;

    var avgAmount = txs.reduce(function(s, t) { return s + t.amount; }, 0) / txs.length;
    var lastTx = txs[txs.length - 1];

    patterns.push({
      merchant: lastTx.merchant,
      amount: Math.round(avgAmount),
      frequency: isMonthly ? 'ежемесячно' : 'еженедельно',
      occurrences: txs.length,
      lastDate: lastTx.date,
      category: lastTx.category || null,
      suggestedCategory: (isMonthly && avgAmount < 1000) ? '\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0438' : null,
      isBusiness: lastTx.bucket === 'business'
    });
  });

  patterns.sort(function(a, b) { return b.occurrences - a.occurrences; });
  return patterns.slice(0, 10);
}

// ── Patterns Card (Home tab) ──
function renderPatternsCard() {
  var el = document.getElementById('patternsCard');
  if (!el) return;
  var patterns = detectSmartPatterns();
  if (patterns.length === 0) { el.style.display = 'none'; return; }

  el.style.display = '';
  var html = '<div class="card"><div class="card-header">\uD83D\uDD0D \u0420\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u044B\u0435 \u043F\u043B\u0430\u0442\u0435\u0436\u0438 '
    + '<span style="font-size:12px;font-weight:500;color:var(--text-3);">(' + patterns.length + ')</span></div>';
  patterns.slice(0, 3).forEach(function(p) {
    html += '<div class="pattern-row">';
    html += '<div class="pattern-info">';
    html += '<div class="pattern-name">' + (p.merchant || '?') + '</div>';
    html += '<div class="pattern-meta">' + fmt(p.amount) + ' \u00b7 ' + p.frequency + ' \u00b7 ' + p.occurrences + ' \u0440\u0430\u0437</div></div>';
    if (p.suggestedCategory && p.category !== p.suggestedCategory) {
      html += '<span class="pattern-badge">' + p.suggestedCategory + '?</span>';
    }
    html += '</div>';
  });
  if (patterns.length > 3) {
    html += '<div style="text-align:center;padding:8px;font-size:12px;color:var(--primary);cursor:pointer;font-weight:600;" '
          + 'onclick="openPatternsOverlay()">\u0412\u0441\u0435 ' + patterns.length + ' \u043F\u0430\u0442\u0442\u0435\u0440\u043D\u043E\u0432 \u2192</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// ── Patterns Overlay ──
function openPatternsOverlay() {
  var patterns = detectSmartPatterns();
  var overlay = getOverlay('patternsOverlay');
  var panel = overlay.querySelector('.overlay-panel');

  var html = '<div class="overlay-handle"></div><div style="padding:20px;">';
  html += '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">\uD83D\uDD0D Smart Patterns</div>';
  html += '<div style="font-size:12px;color:var(--text-3);margin-bottom:16px;">\u041D\u0430\u0439\u0434\u0435\u043D\u043E ' + patterns.length + ' \u0440\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u044B\u0445 \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439</div>';

  patterns.forEach(function(p, i) {
    html += '<div class="pattern-card">';
    html += '<div class="pattern-card-top">';
    html += '<div><div style="font-weight:700;font-size:14px;">' + (p.merchant || '?') + '</div>';
    html += '<div style="font-size:12px;color:var(--text-3);">' + p.frequency + ' \u00b7 ' + p.occurrences + ' \u0440\u0430\u0437 \u00b7 \u043F\u043E\u0441\u043B. ' + formatDate(p.lastDate) + '</div></div>';
    html += '<div style="font-size:16px;font-weight:800;">' + fmt(p.amount) + '</div></div>';
    if (p.suggestedCategory && p.category !== p.suggestedCategory) {
      html += '<div class="pattern-suggest">';
      html += '<span>\u041F\u043E\u0445\u043E\u0436\u0435 \u043D\u0430: <strong>' + p.suggestedCategory + '</strong></span>';
      html += '<button class="fam-btn" style="font-size:11px;padding:4px 10px;" onclick="applyPattern(' + i + ')">\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C</button>';
      html += '</div>';
    }
    if (p.isBusiness) {
      html += '<div style="font-size:11px;color:var(--primary);font-weight:600;margin-top:6px;">\uD83C\uDFE2 \u0411\u0438\u0437\u043D\u0435\u0441-\u0440\u0430\u0441\u0445\u043E\u0434</div>';
    }
    html += '</div>';
  });

  if (patterns.length === 0) {
    html += '<div class="fam-empty">\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u0430\u043D\u0430\u043B\u0438\u0437\u0430</div>';
  }

  html += '</div><div class="overlay-close" onclick="closeOverlay(\'patternsOverlay\')">\u0417\u0430\u043A\u0440\u044B\u0442\u044C</div>';
  panel.innerHTML = html;
  showOverlay('patternsOverlay');
}

// ── Apply Pattern (create user rule) ──
function applyPattern(idx) {
  var patterns = detectSmartPatterns();
  if (idx < 0 || idx >= patterns.length) return;
  var p = patterns[idx];
  if (!p.suggestedCategory || !p.merchant) return;

  var ruleKey = p.merchant.toUpperCase().substring(0, 20);
  userCategoryRules[ruleKey] = p.suggestedCategory;

  // Re-categorize matching transactions
  (familyData.transactions || []).forEach(function(tx) {
    var m = (tx.merchant || '').toUpperCase();
    if (m.indexOf(ruleKey) >= 0) tx.category = p.suggestedCategory;
  });

  saveFamilyLocal();
  openPatternsOverlay();
  if (typeof renderFamilyTab === 'function') renderFamilyTab();
  showToast('\u041F\u0440\u0430\u0432\u0438\u043B\u043E: ' + p.merchant + ' \u2192 ' + p.suggestedCategory);
  uploadAllDataDebounced();
}
