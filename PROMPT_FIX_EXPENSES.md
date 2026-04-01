Задача: Починить Finance Helper — точные цифры семейных расходов

## Кто я и что за проект

Я Кирилл, владелец сети из 10 ателье DressCode в Петербурге. У меня есть PWA-приложение Finance Helper для анализа банковских выписок. Оно парсит PDF-выписки со Сбера и Тинькофф, категоризирует операции и показывает дашборд с расходами и прогнозом.

Проект: /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER
Технологии: Vanilla JS (ES6+, const/let/arrow functions/template literals), HTML, CSS, PWA с Service Worker
Деплой: GitHub Pages → https://skachkov13kirill-hub.github.io/-/finance/
Деплой-репо: https://github.com/skachkov13kirill-hub/-.git → папка finance/
gh CLI: /opt/homebrew/bin/gh (не в PATH, используй полный путь)

## Файлы проекта

* js/app.js — основной файл (~4950 строк), вся логика
* css/styles.css — стили
* index.html — HTML
* sw.js — Service Worker (текущая версия CACHE_NAME = 'finhelper-v7')
* docs/ — документация

## Бэкап с данными пользователя

/Users/kbhbkk/Downloads/finance_backup_2026-03-06.json — бэкап из приложения, содержит:
* 5286 транзакций за год (2025-02 — 2026-03)
* 96 пользовательских правил (customRules)
* 3 пользовательские категории (Сигарета, Спорт, Бизнес)
* 4 smart patterns
* Настройки: salaryDate=25, dashExclude=[Кредиты, Бизнес, Путешествия]

## Моя финансовая ситуация

* 2 карты Сбер: моя (Скачков Кирилл Владимирович) + жены (Скачкова Алёна Сергеевна)
* Оборот по физ.карте: ~2 000 000₽/мес
* Реальные траты семьи: ~300 000₽/мес
* Остальное (~1 700 000₽) — переводы между картами, бизнес-траты, наличные, возвраты
* Доход приходит с бизнеса (ИП) + 100 000₽/мес от партнёра

Что НЕ является расходом семьи:
* Переводы между моими картами/счетами/вкладами
* Переводы мне ↔ жене (Алёна Сергеевна)
* Внесение/снятие наличных (ATM)
* Переводы на вклад/копилку/инвесткопилку
* Бизнес-траты с физ.карты (реклама, налоги, подрядчики)
* Возвраты
* Перевод средств ИП на личный счет

## РЕЗУЛЬТАТЫ ПРОВЕРКИ (11 марта 2026)

Я проверил приложение с загруженным бэкапом. Вот что нашёл:

### Что уже работает правильно:
- Миграции v2–v9 уже применились — 1934 переводов имеют type=transfer
- dashExclude=[Кредиты, Бизнес, Путешествия] работает — эти категории не входят в расходы на дашборде
- 0 переводов с type=expense (категории «Перевод себе» и «Переводы» уже исправлены)
- Семейные расходы по месяцам приблизительно верные (200–380К/мес)

### Данные из localStorage (type distribution):
- expense: 2965 транзакций
- transfer: 1934 транзакций
- income: 363 транзакции

### Семейные расходы по месяцам (после исключения Бизнес/Кредиты/Путешествия):
| Месяц | Family расход | Исключено |
|-------|-------------|-----------|
| 2025-03 | 380 761₽ | 88 330₽ |
| 2025-04 | 421 433₽ | 167 866₽ |
| 2025-05 | 205 940₽ | 67 241₽ |
| 2025-06 | 325 634₽ | 255 415₽ |
| 2025-07 | 304 731₽ | 193 497₽ |
| 2025-08 | 195 778₽ | 137 585₽ |
| 2025-09 | 232 190₽ | 257 973₽ |
| 2025-10 | 288 898₽ | 394 733₽ |
| 2025-11 | 319 048₽ | 230 646₽ |
| 2025-12 | 266 760₽ | 329 940₽ |
| 2026-01 | 383 514₽ | 280 631₽ |
| 2026-02 | 246 825₽ | 219 403₽ |
| 2026-03 | 25 733₽ | 33 835₽ (неполный) |

### Проблемы, которые РЕАЛЬНО нужно исправить:

**ПРОБЛЕМА 1: «Обычно вы тратите: 575 691₽»**
Среднее на дашборде считается по ВСЕМ расходам (включая Бизнес/Кредиты/Путешествия), а не только по семейным. Нужно считать среднее только из семейных расходов (с учётом dashExclude). Реальное среднее семейных ≈ 300К.

**ПРОБЛЕМА 2: ATM-снятия считаются расходами**
4 операции ATM с type=expense на сумму 198 000₽:
- 2025-04-13: ATM 60015994 BUGRY RUS — 150 000₽
- 2025-04-17: ATM 60039916 MURINO RUS — 45 000₽
- 2025-05-07: ATM 8152 RAIFFEISEN MURINO RUS — 2 000₽
- 2025-06-25: ATM 60180525 POROSHKINO RUS — 1 000₽
Категория «Наличные расход» с type=expense. Должно быть type=transfer.

**ПРОБЛЕМА 3: 149 операций «Прочее» на 182 578₽**
Не категоризированы. Примеры из февраля 2026 (21 шт):
- YANDEX7299*GO_BERIZARYAD (8 шт) → Транспорт
- Murino FOTO KOPITSENTR → Дом
- Плата за оповещения об операциях → Подписки и связь
- LAZURNAYA BUKHTA, PLYAZH SOCHIPARK, KAFE KINZA → Путешествия/Еда

**ПРОБЛЕМА 4: Грязные описания в UI**
cleanDescription() (~строка 906) существует но НЕ вызывается при рендере транзакций.
Показывается: «MURINO TRC NEBO MURINO RUS», «OOO MAKSPLEY G GATCHINA RUS»
Должно быть: чистые читаемые названия.

**ПРОБЛЕМА 5: Нет drill-down на цифру расходов**
Клик на «Расходы -246 825₽» ничего не делает. Нужна модалка с разбивкой по категориям.

**ПРОБЛЕМА 6: Нет кнопки исключения транзакции**
Нельзя вручную исключить операцию из расходов.

**ПРОБЛЕМА 7: Прогноз без объяснения формулы**
Показывает «Прогноз к концу месяца: 72 519₽» без формулы расчёта.

**ПРОБЛЕМА 8: Код не задеплоен**
Локальная версия (с миграциями v2–v9) отличается от продакшен-версии на GitHub Pages.

## ПЛАН РАБОТЫ (5 фаз)

### Фаза 1: Фикс данных — ATM и среднее

**1.1 Миграция v10: ATM-снятия → transfer**
Файл: js/app.js, после последней миграции (Migration v9, ~строка 394)

```javascript
// Migration v10: fix ATM withdrawals type (198K false expenses)
if (!s._migrationATMTypeV10) {
  let fixed = 0;
  s.transactions.forEach(t => {
    if (t.category === 'Наличные расход' && t.type === 'expense') {
      t.type = 'transfer';
      fixed++;
    }
  });
  s._migrationATMTypeV10 = true;
  if (fixed > 0) console.log(`[FinHelper] Migration v10: fixed ${fixed} ATM types`);
}
```

**1.2 Расширить classifyTransferType()**
Файл: js/app.js, функция classifyTransferType() (~строка 926)
Добавить паттерны:
* АЛЁНА СЕРГЕЕВНА, АЛЕНА, С. АЛЁНА → transfer (переводы жене)
* ПОПОЛНЕНИЕ. СИСТЕМА БЫСТРЫХ ПЛ → transfer
* ПЕРЕВОД СОБСТВЕННЫХ СРЕДСТВ → transfer
* ПРОЧИЕ ВЫПЛАТЫ → transfer
* ПЕРЕВОД ОТ С. КИРИЛЛ ВЛАДИМИРО → transfer
* ВНЕШНИЙ ПЕРЕВОД ПО НОМЕРУ ТЕЛЕ → transfer
* Перевод средств ИП на личный счет → transfer
* ИНВЕСТКОПИЛКА → transfer

**1.3 Фикс «Обычно вы тратите»**
В renderForecast() (~строка 2359) — при расчёте среднего за прошлые месяцы использовать только семейные расходы (с учётом dashExclude). Сейчас считает по всем type=expense.

### Фаза 2: Новые правила категоризации

**2.1 Добавить в MERCHANT_RULES (~строка 495)**

| Паттерн | Категория | Кол-во |
|---------|-----------|--------|
| SBSCR_Сервисы Яндекса, SBSCR_СЕРВИСЫ | Подписки и связь | 27 |
| ZHOLOBOV VADIM | Развлечения | 23+ |
| ULYBKA RADUGI | Дом | 15 |
| GALAMART | Дом | 8 |
| NOVOE KACHESTVO DOROG | Автомобиль | 5 |
| WHSD | Автомобиль | 5 |
| DINOLAND | Дети | 4 |
| YANDEXSCOOTERS, YANDEX7999*SCOOTER | Транспорт | 4 |
| YANDEXGO_BERIZARYAD, YANDEXGO_RUNCHARGE | Транспорт | 6 |
| kopimurino, KOPI TSENTR | Дом | 6 |
| BUKVOED | Дети | 3 |
| CDEK | Маркетплейсы | 3 |
| SPB DEVYATKINO | Транспорт | 3 |
| IP FILIPPOV | Развлечения | 6 |
| IP Daud Aladkham | Еда вне дома | 3 |
| Перевод средств ИП | Перевод себе | 12 |
| Плата за оповещения | Подписки и связь | - |

**2.2 Авто-детект бизнес-подрядчиков**
Добавить массив бизнес-контактов и логику: если описание содержит «ПЕРЕВОД ДЛЯ» + имя → category = 'Бизнес':

```javascript
const BUSINESS_CONTACTS = [
  'ГАСАНАГА', 'М. ГАСАНАГА',
  'К. АННА ВИКТОРОВНА',
  'К. ЖАННА ВАСИЛЬЕВН',
  'Н. АНЖЕЛИКА ИВАНОВ',
  'П. ВИКТОР АНДРЕЕВИ',
  'Н. ЕВГЕНИЙ ВИКТОРО',
  'Ф. ОКСАНА НИКОЛАЕВ',
  'Б. РАИСА'
];
```

**2.3 Миграция v11: пере-категоризация «Прочее»**
Пройтись по `category === 'Прочее'` и применить новые MERCHANT_RULES. Не трогать транзакции с `_userEdited === true`.

### Фаза 3: Прозрачность цифр

**3.1 Drill-down модалка**
Клик на «Расходы: 246К» → модальное окно:
- Список категорий с суммами и процентами
- Внизу: «Исключено: Переводы 1.2М, Бизнес 180К, Перевод себе 320К»
- Клик на категорию → список транзакций

**3.2 Прогноз с объяснением формулы**
В renderForecast() показать:
```
302К расход ÷ 8 дней = 37.8К/день
До зарплаты 17 дней → прогноз ~643К
```

**3.3 Подпись что исключено**
На Dashboard под цифрами: «Семейные расходы · без переводов, бизнеса и кредитов»
(Уже есть, но проверить что текст соответствует реальным фильтрам)

### Фаза 4: UX-улучшения

**4.1 Чистые описания**
Активировать cleanDescription() (~строка 906) в рендере транзакций. Функция уже есть но не вызывается в UI.
«MAPP_SBERBANK_ONL@IN_PAY_RU_PYATEROCHKA» → «Пятёрочка»

**4.2 Кнопка исключения**
На каждой транзакции — кнопка/иконка «✕ Исключить». При нажатии: type = 'excluded', операция уходит из расходов. Показать кнопку «Показать исключённые» для проверки и возврата.

**4.3 Экран после загрузки PDF**
После парсинга PDF показать модалку:
* «Загружено 367 операций за январь 2026»
* Разбивка: 280 расходы семьи, 50 переводов, 37 бизнес
* Топ-5 категорий
* Кнопка «Разобрать Прочее» если > 20%

**4.4 Обновить Service Worker**
sw.js → CACHE_NAME = 'finhelper-v8' с skipWaiting + clients.claim

### Фаза 5: Деплой и проверка

**5.1 Локальная проверка**
Для локальной проверки:
```bash
# Скопировать файлы в /tmp/finhelper_app/
rm -rf /tmp/finhelper_app && mkdir -p /tmp/finhelper_app/js /tmp/finhelper_app/css /tmp/finhelper_app/assets
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/index.html /tmp/finhelper_app/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/js/app.js /tmp/finhelper_app/js/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/css/styles.css /tmp/finhelper_app/css/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/sw.js /tmp/finhelper_app/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/manifest.json /tmp/finhelper_app/
```

Скрипт сервера уже лежит в /tmp/finhelper_serve.py. Конфиг launch.json:
```json
{
  "version": "0.0.1",
  "configurations": [{
    "name": "finance-helper",
    "runtimeExecutable": "/usr/bin/python3",
    "runtimeArgs": ["/tmp/finhelper_serve.py"],
    "port": 8080
  }]
}
```

Для загрузки бэкапа в localStorage (через preview_eval):
```javascript
(async () => {
  // Скопируй бэкап: cp /Users/kbhbkk/Downloads/finance_backup_2026-03-06.json /tmp/finhelper_app/backup.json
  const resp = await fetch('/backup.json');
  const backup = await resp.json();
  const state = JSON.parse(localStorage.getItem('financeHelper_v1') || '{}');
  const newState = {
    ...state,
    transactions: backup.data.transactions || [],
    customRules: backup.data.customRules || {},
    settings: { ...(state.settings || {}), ...backup.data.settings },
    files: backup.data.files || [],
    trash: backup.data.trash || [],
    budgets: backup.data.budgets || {},
    goals: backup.data.goals || [],
    smartPatterns: backup.data.smartPatterns || []
  };
  localStorage.setItem('financeHelper_v1', JSON.stringify(newState));
  return `Loaded ${newState.transactions.length} transactions`;
})()
```

**5.2 Деплой на GitHub Pages**
```bash
cd /tmp && rm -rf deploy_repo
/opt/homebrew/bin/gh repo clone skachkov13kirill-hub/- deploy_repo
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/index.html /tmp/deploy_repo/finance/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/js/app.js /tmp/deploy_repo/finance/js/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/css/styles.css /tmp/deploy_repo/finance/css/
cp /Users/kbhbkk/Desktop/DRESSCODE_PEREEZD/PROJECT_2_FINANCE_HELPER/sw.js /tmp/deploy_repo/finance/sw.js
cd /tmp/deploy_repo && git add finance/ && git commit -m "Fix: accurate family expenses + drill-down + filtering" && git push
```

**5.3 Проверка после деплоя**
1. Расход семьи за февраль ≈ 247К (не 466К)
2. «Обычно вы тратите» ≈ 300К (не 575К)
3. ATM-снятия не входят в расходы
4. Переводы Кирилл↔Алёна = исключены
5. Бизнес-траты = отдельная категория, исключены из дашборда
6. Клик на цифру расхода → drill-down с категориями
7. Прогноз показывает формулу
8. Кнопка исключения работает
9. Описания чистые (без MAPP_SBERBANK, без _RUS)
10. «Прочее» уменьшилось (новые правила мерчантов)

## Ключевые места в коде (js/app.js)

| Что | Строка (примерно) |
|-----|-------------------|
| APP_KEY | 5 |
| Миграции v1-v9 | 186–394 |
| MERCHANT_RULES | 495–807 |
| categorizeTransaction() | 809–895 |
| cleanDescription() | 906–922 |
| classifyTransferType() | 926–989 |
| renderForecast() | 2359–2438 |
| Dashboard расходы | 2300–2301 |
| handleFiles() / parsePDF() | 540–807 |
| exportBackup() | 4880 |
| importBackup() | 4908 |
| saveState() | использует APP_KEY = 'financeHelper_v1' |

## Существующие миграции (НЕ менять, только добавлять новые):

* v2: re-classify transfer types (BUG-4)
* v3: re-hash txIds (BUG-2)
* v4: clean descriptions + re-hash (FIX-1/2)
* v5: KARTA-CREDIT classification (FIX-3)
* v6: paired duplicate removal (FIX-6)
* v7: re-categorize Прочее (FIX-7)
* v8: income rules → Зарплата (FIX-8)
* v9: ATM income → transfer (FIX-9)

Добавить:
* v10: ATM expense → transfer (фикс 4 операций на 198К)
* v11: пере-категоризация Прочее с новыми правилами мерчантов

## ВАЖНО

* Код пишем на vanilla JS (ES6+, НЕ ES5)
* Все данные хранятся в localStorage, ключ: financeHelper_v1
* Не ломать существующие миграции и custom rules пользователя (_userEdited === true)
* При изменении sw.js ОБЯЗАТЕЛЬНО менять CACHE_NAME
* Язык интерфейса: русский
* Работаем фаза за фазой, после каждой фазы — проверка через preview
