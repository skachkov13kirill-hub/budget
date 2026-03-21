// ═══════════════════════════════════════════════════════════
// SPARKLINE HELPER — добавить в Apps Script (script_for_deploy.js)
// Запуск: вызвать addSparklinesToBranches() из редактора Scripts
// ═══════════════════════════════════════════════════════════

/**
 * Добавляет SPARKLINE формулы в листы филиалов
 * Показывает план/факт визуально: зелёный если >= 90% плана, красный если < 70%
 *
 * ВАЖНО: перед запуском проверить что:
 * 1. Столбцы факта и плана совпадают (см. переменные COL_FACT, COL_PLAN, COL_SPARKLINE)
 * 2. Строка с итогами существует (см. TOTAL_ROW)
 */
function addSparklinesToBranches() {
  var ss = SpreadsheetApp.openById('1cRdejpUv8gRyNTQVJPw16pp44FqmX6CZUSdUkWcUa40');
  var branches = ['М16', 'В8', 'П14', 'А6', 'Г4', 'В22', 'Е8', 'В20', 'Е17', 'Г11'];

  // ⚠️ НАСТРОИТЬ ПОД РЕАЛЬНУЮ СТРУКТУРУ ЛИСТОВ:
  var COL_FACT = 'C';       // Столбец с фактической выручкой (итог за месяц)
  var COL_PLAN = 'D';       // Столбец с планом
  var COL_SPARKLINE = 'F';  // Куда поставить SPARKLINE
  var TOTAL_ROW = 2;        // Строка с итогами месяца (обычно 2-я строка после заголовка)

  // Данные за дни: диапазон с ежедневной выручкой
  var DAILY_START_COL = 'C'; // Первый столбец с данными по дням
  var DAILY_END_COL = 'AG';  // Последний столбец (31 день)
  var DAILY_ROW = 3;         // Строка "Ателье" с ежедневными данными

  branches.forEach(function(code) {
    var sheet = ss.getSheetByName(code);
    if (!sheet) {
      Logger.log('Лист не найден: ' + code);
      return;
    }

    // 1. SPARKLINE прогресс план/факт (горизонтальная полоса)
    var sparkFormula = '=SPARKLINE(' + COL_FACT + TOTAL_ROW + '/' + COL_PLAN + TOTAL_ROW + ', ' +
      '{"charttype","bar"; "max",1; "min",0; ' +
      '"color1",IF(' + COL_FACT + TOTAL_ROW + '/' + COL_PLAN + TOTAL_ROW + '>=0.9,"#22C55E",IF(' + COL_FACT + TOTAL_ROW + '/' + COL_PLAN + TOTAL_ROW + '>=0.7,"#F59E0B","#EF4444")); ' +
      '"color2","#E5E7EB"})';

    sheet.getRange(COL_SPARKLINE + TOTAL_ROW).setFormula(sparkFormula);

    // 2. SPARKLINE тренд выручки по дням (линейный график)
    var trendFormula = '=SPARKLINE(' + DAILY_START_COL + DAILY_ROW + ':' + DAILY_END_COL + DAILY_ROW + ', ' +
      '{"charttype","line"; "linewidth",2; "color","#3B82F6"})';

    // Ставим тренд в строку ниже
    sheet.getRange(COL_SPARKLINE + (TOTAL_ROW + 1)).setFormula(trendFormula);

    Logger.log('Sparklines добавлены для ' + code);
  });

  Logger.log('Готово! Sparklines добавлены во все филиалы.');
}

/**
 * Альтернатива: простая формула SPARKLINE для вставки в любую ячейку вручную
 *
 * Прогресс-бар план/факт:
 * =SPARKLINE(C2/D2, {"charttype","bar"; "max",1; "color1",IF(C2/D2>=0.9,"green","red"); "color2","lightgray"})
 *
 * Тренд по дням (линия):
 * =SPARKLINE(C3:AG3, {"charttype","line"; "linewidth",2; "color","blue"})
 *
 * Столбиковая диаграмма по дням:
 * =SPARKLINE(C3:AG3, {"charttype","column"; "color","#3B82F6"; "lowcolor","#EF4444"; "highcolor","#22C55E"})
 */
