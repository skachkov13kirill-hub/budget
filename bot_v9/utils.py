#!/usr/bin/env python3
"""
utils.py -- Logging setup, global state, utility functions.
"""

import json
import logging
import logging.handlers
import re
from datetime import datetime
from typing import Optional


# ════════════════════════════════════════
# ЛОГИРОВАНИЕ: консоль + файл (ротация по 5 МБ, хранить 3 файла)
# ════════════════════════════════════════
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
LOG_FILE = 'bot.log'

# Основной логгер
logger = logging.getLogger('dresscode_bot')
logger.setLevel(logging.INFO)

# Консоль (как было)
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter(LOG_FORMAT))
logger.addHandler(console_handler)

# Файл с ротацией: максимум 5 МБ, хранить 3 последних файла
file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8'
)
file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
logger.addHandler(file_handler)

# Также ловим логи от telegram библиотеки
logging.getLogger('telegram').setLevel(logging.WARNING)
logging.getLogger('httpx').setLevel(logging.WARNING)

user_state = {}
owner_chat_id = None

# ════════════════════════════════════════
# МАППИНГ ЧАТОВ ФИЛИАЛОВ
# ════════════════════════════════════════

BRANCH_CHATS_FILE = 'branch_chats.json'

def load_branch_chats() -> dict:
    try:
        with open(BRANCH_CHATS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.info(f"Файл {BRANCH_CHATS_FILE} не найден — создастся при первой регистрации")
        return {}
    except Exception as e:
        logger.error(f"Ошибка загрузки {BRANCH_CHATS_FILE}: {e}")
        return {}

def save_branch_chats(chats: dict):
    try:
        with open(BRANCH_CHATS_FILE, 'w') as f:
            json.dump(chats, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Ошибка сохранения {BRANCH_CHATS_FILE}: {e}")

branch_chats = load_branch_chats()

# ════════════════════════════════════════
# УТИЛИТЫ
# ════════════════════════════════════════

def is_owner(chat_id: int) -> bool:
    return chat_id == owner_chat_id

def get_state(chat_id: int) -> dict:
    if chat_id not in user_state:
        user_state[chat_id] = {'mode': 'chat', 'context': [], 'registered': False}
    return user_state[chat_id]

def fmt(num):
    if num is None: return "—"
    return f"{num:,.0f}₽".replace(",", " ")

def fmt_short(num):
    if num is None: return "—"
    if abs(num) >= 1_000_000: return f"{num/1_000_000:.1f}М"
    if abs(num) >= 1_000: return f"{num/1_000:.0f}К"
    return f"{num:.0f}₽"

def days_until(date_str):
    try:
        target = datetime.strptime(date_str, "%Y-%m-%d")
        return (target - datetime.now()).days
    except Exception as e:
        logger.warning(f"Ошибка парсинга даты '{date_str}': {e}")
        return None

def get_today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")

def get_today_display() -> str:
    return datetime.now().strftime("%d.%m.%Y")

# ════════════════════════════════════════
# ПАРСИНГ СООБЩЕНИЯ ОТ ПОРТНЫХ
# ════════════════════════════════════════

def parse_branch_report(text: str):
    cleaned = text.strip()
    normalized = re.sub(r'[^\d\s,.]', ' ', cleaned)
    tokens = re.findall(r'\d+', normalized)

    if len(tokens) < 2:
        return None, None

    numbers = []
    i = 0
    while i < len(tokens):
        num = int(tokens[i])
        if (i + 1 < len(tokens) and
            num < 1000 and
            len(tokens[i+1]) == 3 and
            int(tokens[i+1]) < 1000):
            combined = num * 1000 + int(tokens[i+1])
            numbers.append(combined)
            i += 2
        else:
            numbers.append(num)
            i += 1

    if len(numbers) < 2:
        return None, None

    turnover = numbers[0]
    clients = numbers[1]

    if turnover < 100:
        return None, None
    if clients > 500:
        return None, None

    return turnover, clients

# ════════════════════════════════════════
# ВСПОМОГАТЕЛЬНЫЕ
# ════════════════════════════════════════

def save_owner(chat_id: int):
    try:
        with open('owner.txt', 'w') as f:
            f.write(str(chat_id))
    except Exception as e:
        logger.error(f"Ошибка сохранения owner.txt: {e}")

def load_owner() -> Optional[int]:
    try:
        with open('owner.txt', 'r') as f:
            return int(f.read().strip())
    except FileNotFoundError:
        logger.info("owner.txt не найден — первый /start зарегистрирует владельца")
        return None
    except Exception as e:
        logger.error(f"Ошибка загрузки owner.txt: {e}")
        return None
