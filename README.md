# DressCode Financial System

Финансовая экосистема для управления сетью ателье DressCode (10 филиалов) + семейный бюджет.

## Архитектура

```
Филиалы (report.html форма)
       |
Google Sheets "АТЕЛЬЕ 2026" <--- Apps Script API (v47)
       |                              |
GitHub Pages (index.html дашборд)   Web UI
       |
Telegram Bot (Python, VPS) — на паузе
```

## Структура проекта

```
bot_v9/              # Telegram-бот (Python) — на паузе
  main.py            # Точка входа
  handlers.py        # Обработчики команд и сообщений
  utils.py           # Утилиты, логирование, состояние
  ai_handlers.py     # Whisper (голос) + Claude (намерения)
  financial.py       # Финансовые расчёты
  sheets_api.py      # Google Sheets API (активный путь)
  sheets_direct.py   # Прямая запись через gspread (мёртвый код)
  pdf_parser.py      # Парсер PDF-выписок
  planner.py         # Планировщик
  seed_calendar.py   # Заполнение календаря
  config.example.py  # Шаблон конфигурации
  requirements.txt   # Python-зависимости

web/                 # Фронтенд (GitHub Pages)
  index.html         # Главный дашборд (5 вкладок)
  report.html        # Форма отчётов для филиалов (КЛЮЧЕВОЙ)
  js/app.js          # Ядро: загрузка данных, кэш, рендеринг
  js/business.js     # Карточки филиалов
  js/daily.js        # 14-дневный график
  js/payments.js     # Отслеживание платежей
  js/tasks.js        # Задачи
  js/agents.js       # Дашборд агентов
  js/weather.js      # Погода
  js/advisor.js      # AI-советник
  js/family.js       # Семейный бюджет
  js/family-features.js  # Фичи семейного бюджета
  js/overview.js     # Обзор
  js/parser.js       # Парсер данных
  js/stories.js      # Stories
  css/app.css        # Стили
  agents-config.json # Конфиг агентов
  manifest.json      # PWA-манифест
  report-manifest.json # PWA манифест для форм
  sw.js              # Service Worker
  report-sw.js       # Service Worker для форм
  icon-512.svg       # PWA иконка
  script_for_deploy.js # Скрипт деплоя (GitHub Actions)

scripts/             # Скрипты
  _clasp_deploy/Код.js   # Google Apps Script (30+ endpoints)
  deploy_dashboard.sh    # Деплой дашборда
  deploy_pdf.sh          # Деплой PDF-формы

data/                # Финансовые данные (Excel)
docs/                # Документация (VISION_BOT, БАГИ, КОНТЕКСТ)
АУДИТ_2026-04-01.md  # Аудит безопасности и качества кода
PROMPT_FIX_EXPENSES.md  # 5-фазный план починки Finance Helper
```

## Быстрый старт

```bash
cd bot_v9
cp config.example.py config.py   # Заполнить реальными данными
pip install -r requirements.txt
python main.py
```

## Деплой на VPS

```bash
bash bot_v9/deploy_v9.sh
```

## Стек

- **Backend:** Python 3, python-telegram-bot, aiohttp
- **AI:** OpenAI Whisper, Anthropic Claude Haiku
- **Data:** Google Sheets + Apps Script (v47)
- **Frontend:** HTML/CSS/JS, PWA, GitHub Pages
- **VPS:** 176.124.208.212 (Timeweb), systemd

## Статус
Продакшн. report.html + index.html используются ежедневно. Бот на паузе (Telegram глушат в РФ).
