# === КОНФИГУРАЦИЯ БОТА v9 ===
# Скопируй этот файл как config.py и заполни реальными данными
# cp config.example.py config.py

# Токен от @BotFather
BOT_TOKEN = "YOUR_BOT_TOKEN"

# Google Sheets Apps Script URL
SHEETS_SCRIPT_URL = "YOUR_APPS_SCRIPT_URL"

# API ключи для ИИ
OPENAI_API_KEY = "YOUR_OPENAI_KEY"       # platform.openai.com -> API Keys
ANTHROPIC_API_KEY = "YOUR_ANTHROPIC_KEY"  # console.anthropic.com -> API Keys

# Все 10 филиалов (имена листов в Google Sheets)
BRANCH_NAMES = ['М16', 'В8', 'П14', 'А6', 'Г4', 'В22', 'Е8', 'В20', 'Е17', 'Г11']

# === ФИНАНСОВЫЕ ДАННЫЕ ===
# Заполнить актуальными данными

CREDITS = [
    # {"name": "Название", "rate": 0.0, "balance": 0, "payment": 0, "day": 1, "close": "Дата", "priority": 0},
]

ACCOUNTS = [
    # {"name": "Название счёта", "balance": 0},
]

RENT = [
    # {"branch": "М16", "landlord": "ФИО", "amount": 0, "comm": 0, "acc": "С1"},
]

SUBLEASES = [
    # {"branch": "М16", "amount": 0},
]

MARGIN_FORECAST = {
    1: 0, 2: 0, 3: 0, 4: 0,
    5: 0, 6: 0, 7: 0, 8: 0,
    9: 0, 10: 0, 11: 0, 12: 0
}

FAMILY_EXPENSE_ESTIMATE = 0
CREDIT_TOTAL_PAYMENT = 0
CHEM_CONTRACTORS_PCT = 0.50
SUBLEASE_TOTAL = 0
