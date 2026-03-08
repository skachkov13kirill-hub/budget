// ═══════════════════════════════════════════════════════════════
// STORIES.JS — Monthly Stories (Spotify Wrapped стиль)
// DressCode v4.0
// ═══════════════════════════════════════════════════════════════

var _storySlides = [];
var _storyIndex = 0;

var STORY_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
];

var MONTH_NAMES_GEN = ['',
  '\u044F\u043D\u0432\u0430\u0440\u044F','\u0444\u0435\u0432\u0440\u0430\u043B\u044F','\u043C\u0430\u0440\u0442\u0430',
  '\u0430\u043F\u0440\u0435\u043B\u044F','\u043C\u0430\u044F','\u0438\u044E\u043D\u044F',
  '\u0438\u044E\u043B\u044F','\u0430\u0432\u0433\u0443\u0441\u0442\u0430','\u0441\u0435\u043D\u0442\u044F\u0431\u0440\u044F',
  '\u043E\u043A\u0442\u044F\u0431\u0440\u044F','\u043D\u043E\u044F\u0431\u0440\u044F','\u0434\u0435\u043A\u0430\u0431\u0440\u044F'
];

function generateStorySlides() {
  var slides = [];
  var now = new Date();
  var cm = now.getMonth() + 1;
  var cmKey = currentMonthKey();
  var prevMK = getPrevMonthKey(cmKey);
  var monthName = MONTH_NAMES_CAP[cm];

  // Slide 1: Business revenue
  if (state.branches && state.branches.totals && state.branches.totals.fact) {
    var t = state.branches.totals;
    var total = parseFloat(t.fact.total) || 0;
    var plan = parseFloat(t.plan ? t.plan.total : 0) || 1;
    var planPct = Math.round((total / plan) * 100);
    slides.push({
      emoji: '\uD83C\uDFE2', title: '\u0410\u0442\u0435\u043B\u044C\u0435 \u0437\u0430\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u043E',
      big: fmtShort(total),
      sub: '\u041F\u043B\u0430\u043D: ' + planPct + '%' + (planPct >= 100 ? ' \uD83C\uDF89' : ''),
      gradient: 0
    });
  }

  // Slide 2: Business profit / margin
  var bizProfit = getBizProfit();
  if (bizProfit > 0) {
    var rev = (state.branches && state.branches.totals && state.branches.totals.fact)
      ? (parseFloat(state.branches.totals.fact.total) || 0) : 0;
    var marginPct = rev > 0 ? Math.round((bizProfit / rev) * 100) : 0;
    slides.push({
      emoji: '\uD83D\uDCB0', title: '\u0420\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u0430\u0440\u0436\u0430',
      big: fmtShort(bizProfit),
      sub: marginPct + '% \u043E\u0442 \u0432\u044B\u0440\u0443\u0447\u043A\u0438',
      gradient: 1
    });
  }

  // Slide 3: Family spending
  var famSpent = 0;
  var prevSpent = 0;
  (familyData.transactions || []).forEach(function(tx) {
    var mk = tx.monthKey || famGetMonthKey(tx.date);
    var amt = Math.abs(parseFloat(tx.amount) || 0);
    if (mk === cmKey) famSpent += amt;
    if (mk === prevMK) prevSpent += amt;
  });
  if (famSpent > 0) {
    var change = prevSpent > 0 ? Math.round(((famSpent - prevSpent) / prevSpent) * 100) : 0;
    var changeText = change > 0 ? ('\u043D\u0430 ' + change + '% \u0431\u043E\u043B\u044C\u0448\u0435')
                   : change < 0 ? ('\u043D\u0430 ' + Math.abs(change) + '% \u043C\u0435\u043D\u044C\u0448\u0435 \uD83D\uDC4D') : monthName;
    slides.push({
      emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', title: '\u0421\u0435\u043C\u044C\u044F \u043F\u043E\u0442\u0440\u0430\u0442\u0438\u043B\u0430',
      big: fmtShort(famSpent),
      sub: changeText,
      gradient: 2
    });
  }

  // Slide 4: Top expense category
  var catTotals = {};
  (familyData.transactions || []).filter(function(tx) {
    return (tx.monthKey || famGetMonthKey(tx.date)) === cmKey;
  }).forEach(function(tx) {
    var cat = tx.category || '\u041F\u0440\u043E\u0447\u0435\u0435';
    catTotals[cat] = (catTotals[cat] || 0) + Math.abs(parseFloat(tx.amount) || 0);
  });
  var topCat = Object.keys(catTotals).sort(function(a, b) { return catTotals[b] - catTotals[a]; })[0];
  if (topCat) {
    var icon = CATEGORY_ICONS[topCat] || '\uD83D\uDCCB';
    slides.push({
      emoji: icon, title: '\u0422\u043E\u043F \u0440\u0430\u0441\u0445\u043E\u0434',
      big: topCat,
      sub: fmtShort(catTotals[topCat]),
      gradient: 3
    });
  }

  // Slide 5: Credits remaining
  var totalDebt = 0;
  var monthlyPay = 0;
  (state.credits || []).forEach(function(cr) {
    totalDebt += (parseFloat(cr.balanceCurrent || cr.balance) || 0);
    if (cr.status === '\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0439' || !cr.status) monthlyPay += (parseFloat(cr.payment) || 0);
  });
  if (totalDebt > 0) {
    slides.push({
      emoji: '\uD83D\uDCB3', title: '\u041A\u0440\u0435\u0434\u0438\u0442\u043E\u0432 \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C',
      big: fmtShort(totalDebt),
      sub: fmtShort(monthlyPay) + '/\u043C\u0435\u0441',
      gradient: 4
    });
  }

  // Slide 6: Health Score
  var health = calcHealthScore();
  slides.push({
    emoji: getHealthEmoji(health.score), title: '\u0424\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u043E\u0435 \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u0435',
    big: health.score + '/100',
    sub: getHealthLabel(health.score),
    gradient: 5
  });

  return slides;
}

function openMonthlyStory() {
  _storySlides = generateStorySlides();
  if (_storySlides.length === 0) { showToast('\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445'); return; }
  _storyIndex = 0;
  renderStorySlide();
}

function renderStorySlide() {
  var overlay = getOverlay('storyOverlay');
  overlay.style.display = 'block';
  overlay.style.background = 'none';
  var panel = overlay.querySelector('.overlay-panel');
  panel.style.position = 'fixed';
  panel.style.top = '0';
  panel.style.bottom = '0';
  panel.style.borderRadius = '0';
  panel.style.maxHeight = '100vh';

  var slide = _storySlides[_storyIndex];
  var gradient = STORY_GRADIENTS[slide.gradient % STORY_GRADIENTS.length];
  var cm = new Date().getMonth() + 1;
  var monthName = MONTH_NAMES_CAP[cm];

  var html = '<div class="story-slide" style="background:' + gradient + ';" onclick="nextStorySlide(event)">';

  // Progress dots
  html += '<div class="story-progress">';
  for (var i = 0; i < _storySlides.length; i++) {
    html += '<div class="story-dot' + (i === _storyIndex ? ' active' : '') + (i < _storyIndex ? ' done' : '') + '"></div>';
  }
  html += '</div>';

  // Close
  html += '<div class="story-close" onclick="event.stopPropagation();closeStory()">\u2715</div>';

  // Content
  html += '<div class="story-content">';
  html += '<div class="story-month">' + monthName + '</div>';
  html += '<div class="story-emoji">' + slide.emoji + '</div>';
  html += '<div class="story-title">' + slide.title + '</div>';
  html += '<div class="story-big">' + slide.big + '</div>';
  html += '<div class="story-sub">' + slide.sub + '</div>';
  html += '</div>';

  // Counter
  html += '<div class="story-counter">' + (_storyIndex + 1) + ' / ' + _storySlides.length + '</div>';
  html += '</div>';

  panel.innerHTML = html;
  document.body.style.overflow = 'hidden';
}

function nextStorySlide(e) {
  if (e) {
    var x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    if (x < window.innerWidth * 0.3 && _storyIndex > 0) {
      _storyIndex--;
      renderStorySlide();
      return;
    }
  }
  if (_storyIndex < _storySlides.length - 1) {
    _storyIndex++;
    renderStorySlide();
  } else {
    closeStory();
  }
}

function closeStory() {
  var overlay = document.getElementById('storyOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.background = '';
    var panel = overlay.querySelector('.overlay-panel');
    if (panel) {
      panel.style.position = '';
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.borderRadius = '';
      panel.style.maxHeight = '';
    }
  }
  document.body.style.overflow = '';
}

function renderStoriesButton() {
  var el = document.getElementById('storiesButton');
  if (!el) return;
  var cm = new Date().getMonth() + 1;
  var monthGen = MONTH_NAMES_GEN[cm];
  el.style.display = '';
  el.innerHTML = '<div class="stories-btn" onclick="openMonthlyStory()">'
    + '<div class="stories-btn-left">'
    + '<div class="stories-btn-icon">\uD83D\uDCD6</div>'
    + '<div><div class="stories-btn-title">\u0418\u0442\u043E\u0433\u0438 ' + monthGen + '</div>'
    + '<div class="stories-btn-sub">6 \u0441\u043B\u0430\u0439\u0434\u043E\u0432 \u043E \u0432\u0430\u0448\u0438\u0445 \u0444\u0438\u043D\u0430\u043D\u0441\u0430\u0445</div></div></div>'
    + '<div class="stories-btn-arrow">\u2192</div></div>';
}
