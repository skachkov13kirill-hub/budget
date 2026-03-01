# DressCode Financial System

Финансовая экосистема для управления сетью ателье DressCode (10 филиалов) + семейный бюджет.

## Архитектура

```
Портные (10 Telegram-групп)
       |
Telegram Bot (Python, VPS)
       |
Google Sheets "АТЕЛЬЕ 2026" <--- Apps Script API
       |                              |
GitHub Pages (дашборды)          Web UI
```

## Структура проекта

```
bot_v9/              # Telegram-бот (Python)
  main.py            # Точка входа
  handlers.py        # Обработчики команд и сообщений
  utils.py           # Утилиты, логирование, состояние
  ai_handlers.py     # Whisper (голос) + Claude (намерения)
  financial.py       # Финансовые расчёты
  sheets_api.py      # Google Sheets API
  sheets_direct.py   # Прямая запись через gspread
  pdf_parser.py      # Парсер PDF-выписок
  config.py          # Конфигурация (НЕ в git)
  config.example.py  # Шаблон конфигурации
  requirements.txt   # Python-зависимости

web/                 # Фронтенд (GitHub Pages)
  index.html         # Главный дашборд
  dashboard.html     # Финансовый обзор
  family.html        # Семейный бюджет
  analyzer_v2.html   # Анализатор PDF
  manifest.json      # PWA-манифест
  sw.js              # Service Worker

scripts/             # Скрипты
  unified_apps_script.js  # Google Apps Script
  deploy_*.sh             # Деплой-скрипты

data/                # Финансовые данные (Excel)
docs/                # Документация
.secrets/            # Токены и ключи (НЕ в git)
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
- **Data:** Google Sheets + gspread + Apps Script
- **Frontend:** HTML/CSS/JS, PWA, GitHub Pages
- **VPS:** 176.124.208.212 (Timeweb), systemd
