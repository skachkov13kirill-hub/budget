// ═══════════════════════════════════════════════════════════════
// WEATHER.JS — Погодная коррекция прогноза DressCode v1.0
// Open-Meteo API → localStorage cache → коэффициент коррекции
// ═══════════════════════════════════════════════════════════════

// СПб координаты (покрывает все филиалы: Пушкин, Екатерининка)
var WEATHER_LAT = 59.9343;
var WEATHER_LON = 30.3351;
var WEATHER_CACHE_KEY = 'weather_spb';
var WEATHER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов

// Средние температуры СПб по месяцам (Росгидромет, норма 1991-2020)
// Индекс 0 = placeholder, 1 = январь ... 12 = декабрь
var SPB_MONTHLY_AVG_TEMP = [0, -5.5, -5.8, -1.0, 5.4, 12.0, 16.8, 20.0, 18.5, 13.0, 7.0, 1.5, -2.5];

// Коэффициент влияния температуры на выручку (0.008 = 0.8% на градус)
var WEATHER_TEMP_COEFF = 0.008;
// Штраф за сильный мороз (ниже -15°C)
var WEATHER_FROST_THRESHOLD = -15;
var WEATHER_FROST_PENALTY = 0.85;

// ═══════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════
function loadWeatherCache() {
  try {
    var raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    if (Date.now() - c.ts > WEATHER_CACHE_TTL) return null;
    return c.data;
  } catch(e) { return null; }
}

function saveWeatherCache(data) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// FETCH — Open-Meteo API (бесплатный, без ключа)
// ═══════════════════════════════════════════════════════════════
function fetchWeather() {
  // Не запрашиваем если кеш свежий
  var cached = loadWeatherCache();
  if (cached) return Promise.resolve(cached);

  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + WEATHER_LAT +
    '&longitude=' + WEATHER_LON +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&timezone=Europe/Moscow' +
    '&forecast_days=7';

  return fetchWithTimeout(url, 10000)
    .then(function(r) { return r.json(); })
    .then(function(resp) {
      if (!resp.daily || !resp.daily.time) return null;
      var data = {
        dates: resp.daily.time,
        maxTemps: resp.daily.temperature_2m_max,
        minTemps: resp.daily.temperature_2m_min
      };
      saveWeatherCache(data);
      return data;
    })
    .catch(function() { return null; });
}

// ═══════════════════════════════════════════════════════════════
// КОРРЕКЦИЯ — коэффициент для прогноза
// ═══════════════════════════════════════════════════════════════

// Коэффициент для одного дня
function calcDayWeatherFactor(avgTemp, month) {
  var norm = SPB_MONTHLY_AVG_TEMP[month] || 0;
  var delta = avgTemp - norm;
  var factor = 1 + delta * WEATHER_TEMP_COEFF;
  if (avgTemp < WEATHER_FROST_THRESHOLD) factor *= WEATHER_FROST_PENALTY;
  return factor;
}

// Композитный коэффициент для оставшихся дней месяца
// Возвращает число (напр. 0.98) или null если нет данных / не текущий месяц
function getWeatherFactor(month) {
  var now = new Date();
  var currentMonth = now.getMonth() + 1;
  // Коррекция только для текущего месяца
  if (month !== currentMonth) return null;

  var data = loadWeatherCache();
  if (!data || !data.dates || !data.dates.length) return null;

  var daysInMonth = new Date(now.getFullYear(), month, 0).getDate();
  var today = now.getDate();
  var daysLeft = daysInMonth - today;
  if (daysLeft <= 0) return null;

  // Собираем факторы для дней прогноза, попадающих в оставшиеся дни месяца
  var factors = [];
  for (var i = 0; i < data.dates.length; i++) {
    var d = new Date(data.dates[i]);
    var dayNum = d.getDate();
    var dayMonth = d.getMonth() + 1;
    // Только будущие дни текущего месяца
    if (dayMonth === month && dayNum > today && dayNum <= daysInMonth) {
      var avgTemp = (data.maxTemps[i] + data.minTemps[i]) / 2;
      factors.push(calcDayWeatherFactor(avgTemp, month));
    }
  }

  if (factors.length === 0) return null;

  // Дни за горизонтом прогноза — factor 1.0
  var coveredDays = factors.length;
  var uncoveredDays = daysLeft - coveredDays;
  var sum = 0;
  for (var j = 0; j < factors.length; j++) sum += factors[j];
  sum += uncoveredDays * 1.0; // дни без прогноза = нейтральный фактор

  return sum / daysLeft;
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════
function tempToIcon(temp) {
  if (temp < -15) return '\u2744\uFE0F'; // ❄️
  if (temp < 0)   return '\u{1F328}';     // 🌨
  if (temp < 10)  return '\u{1F327}';     // 🌧
  if (temp < 20)  return '\u26C5';        // ⛅
  return '\u2600\uFE0F';                  // ☀️
}

// Возвращает объект для рендера или null
function getWeatherDisplay() {
  var data = loadWeatherCache();
  if (!data || !data.dates || !data.dates.length) return null;

  var now = new Date();
  var month = now.getMonth() + 1;
  // Ищем сегодняшний день в прогнозе
  var todayStr = now.getFullYear() + '-' + String(month).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var idx = data.dates.indexOf(todayStr);
  if (idx === -1) idx = 0; // fallback на первый день

  var avgTemp = Math.round((data.maxTemps[idx] + data.minTemps[idx]) / 2);
  var factor = getWeatherFactor(month);
  var correctionPct = factor ? Math.round((factor - 1) * 100) : null;

  return {
    temp: avgTemp,
    icon: tempToIcon(avgTemp),
    correctionPct: correctionPct,
    factor: factor
  };
}
