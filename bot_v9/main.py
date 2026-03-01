#!/usr/bin/env python3
"""
🧠 Финансовый бот Кирилла v9 — ЭТАП 1: ГОЛОС + ИИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Новое в v9 (поверх v8):
  1. Голосовые сообщения → OpenAI Whisper → текст
  2. Текст → Claude Haiku → JSON намерения (intent)
  3. Intent router → нужный handler
  4. Запрос бизнес-данных: «Какой оборот за сегодня?»
  5. Задачи: «Запиши задачу: позвонить юристу»

Requires:
  pip install openai anthropic

Config (config.py):
  OPENAI_API_KEY = "sk-..."     # для Whisper
  ANTHROPIC_API_KEY = "sk-ant-..." # для Claude Haiku
"""

import asyncio
import json
import logging
import logging.handlers
import os
import re
import tempfile
import traceback
from datetime import datetime, timedelta
from typing import Optional

import aiohttp
import aiofiles

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters
)

from config import (
    BOT_TOKEN, SHEETS_SCRIPT_URL,
    CREDITS, ACCOUNTS, RENT, SUBLEASES,
    MARGIN_FORECAST, FAMILY_EXPENSE_ESTIMATE,
    CREDIT_TOTAL_PAYMENT, SUBLEASE_TOTAL, CHEM_CONTRACTORS_PCT,
    BRANCH_NAMES,
    OPENAI_API_KEY, ANTHROPIC_API_KEY
)

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
# GOOGLE SHEETS API
# ════════════════════════════════════════

async def sheets_get(action, params=None):
    url = SHEETS_SCRIPT_URL + f"?action={action}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                return await resp.json(content_type=None)
    except Exception as e:
        logger.error(f"sheets_get error: {e}")
        return None

async def sheets_post(action, data):
    url = SHEETS_SCRIPT_URL + f"?action={action}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=data,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                return await resp.json(content_type=None)
    except Exception as e:
        logger.error(f"sheets_post error: {e}")
        return None

async def write_branch_daily(branch: str, turnover: int, clients: int) -> dict:
    return await sheets_post('writeBranchDaily', {
        'branch': branch,
        'date': get_today_str(),
        'atelie': turnover,
        'clients': clients
    })

async def get_branches_data() -> dict:
    """Получает данные по всем филиалам за сегодня"""
    return await sheets_get('getBranches')

async def add_task_to_sheets(task_text: str) -> dict:
    """Добавляет задачу в лист ЗАДАЧИ"""
    return await sheets_post('addTask', {
        'task': task_text,
        'date': get_today_str(),
        'addedAt': datetime.now().isoformat()
    })

async def get_tasks_from_sheets() -> dict:
    """Получает список задач из листа ЗАДАЧИ"""
    return await sheets_get('getTasks')

# ════════════════════════════════════════
# ИИ: WHISPER (ГОЛОС → ТЕКСТ)
# ════════════════════════════════════════

async def transcribe_voice(file_path: str) -> Optional[str]:
    """
    Отправляет .ogg файл в OpenAI Whisper.
    Стоимость: ~$0.006/мин → полкопейки за сообщение.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY == "YOUR_OPENAI_KEY":
        return None

    try:
        async with aiohttp.ClientSession() as session:
            with open(file_path, 'rb') as audio_file:
                data = aiohttp.FormData()
                data.add_field('file',
                               audio_file,
                               filename='voice.ogg',
                               content_type='audio/ogg')
                data.add_field('model', 'whisper-1')
                data.add_field('language', 'ru')

                async with session.post(
                    'https://api.openai.com/v1/audio/transcriptions',
                    headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
                    data=data,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    result = await resp.json()
                    return result.get('text', '').strip()
    except Exception as e:
        logger.error(f"Whisper error: {e}")
        return None

# ════════════════════════════════════════
# ИИ: CLAUDE HAIKU (ТЕКСТ → НАМЕРЕНИЕ)
# ════════════════════════════════════════

INTENT_SYSTEM_PROMPT = """Ты — ИИ-парсер намерений для личного ассистента Кирилла.
Кирилл управляет сетью ателье, следит за финансами, ведёт задачи и трекает здоровье.

По тексту определи намерение и верни ТОЛЬКО JSON (без пояснений, без markdown).

Модули и действия:
- business / query_today — «Какой оборот сегодня?», «Сводка по сети», «Как дела у филиалов?»
- business / query_branch — «Как дела у М16?», «Сколько на Менделеева?» (params.branch = название)
- business / record_revenue — «32500 18», «Оборот 45 тысяч, 12 клиентов» (params.turnover, params.clients)
- tasks / add_task — «Запиши задачу: ...», «Напомни...», «Нужно сделать...» (params.task = текст задачи)
- tasks / list_tasks — «Покажи задачи», «Что нужно сделать?», «Список дел»
- finance / query — «Кредиты», «Счета», «Долг», «Сколько на счетах?»
- health / record — «Сон 7 часов», «Тренировка 40 минут», «Вес 82 кг» (params.type, params.value)
- unknown / unknown — непонятное намерение (params.raw = исходный текст)

Формат ответа:
{"module": "...", "action": "...", "params": {...}, "confidence": 0.9}

Примеры:
"Как дела у М16 за неделю?" → {"module":"business","action":"query_branch","params":{"branch":"М16"},"confidence":0.95}
"Запиши: позвонить юристу по договору" → {"module":"tasks","action":"add_task","params":{"task":"позвонить юристу по договору"},"confidence":0.97}
"Сон 7.5 часов" → {"module":"health","action":"record","params":{"type":"sleep","value":"7.5 часов"},"confidence":0.9}
"32500 18" → {"module":"business","action":"record_revenue","params":{"turnover":32500,"clients":18},"confidence":0.99}
"""

async def parse_intent(text: str) -> dict:
    """
    Отправляет текст в Claude Haiku для распознавания намерения.
    Стоимость: ~$0.001 за запрос.
    """
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY == "YOUR_ANTHROPIC_KEY":
        # Без API — базовый keyword-парсер
        return _parse_intent_basic(text)

    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 256,
                "system": INTENT_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": text}]
            }
            async with session.post(
                'https://api.anthropic.com/v1/messages',
                headers={
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                json=payload,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                result = await resp.json()
                raw = result['content'][0]['text'].strip()
                # Убираем markdown если вдруг есть
                if raw.startswith('```'):
                    raw = re.sub(r'```[a-z]*\n?', '', raw).strip()
                return json.loads(raw)
    except Exception as e:
        logger.error(f"Claude intent error: {e}")
        return _parse_intent_basic(text)


def _parse_intent_basic(text: str) -> dict:
    """Базовый keyword-парсер — работает без API ключей"""
    t = text.lower().strip()

    # Запись выручки
    turnover, clients = parse_branch_report(text)
    if turnover:
        return {"module": "business", "action": "record_revenue",
                "params": {"turnover": turnover, "clients": clients}, "confidence": 0.9}

    # Бизнес запросы
    if any(w in t for w in ['оборот', 'выручка', 'сеть', 'филиал', 'клиент', 'сегодня по', 'сводка']):
        return {"module": "business", "action": "query_today", "params": {}, "confidence": 0.7}

    # Задачи
    if any(w in t for w in ['запиши', 'задачу', 'напомни', 'нужно', 'сделать', 'задача']):
        # Пытаемся извлечь текст задачи после двоеточия или после ключевых слов
        task_match = re.sub(r'^(запиши|задача|напомни|нужно сделать)[:\s]*', '', t).strip()
        return {"module": "tasks", "action": "add_task",
                "params": {"task": task_match or text}, "confidence": 0.7}

    if any(w in t for w in ['задачи', 'список', 'что нужно', 'что делать', 'дела']):
        return {"module": "tasks", "action": "list_tasks", "params": {}, "confidence": 0.7}

    # Финансы
    if any(w in t for w in ['кредит', 'счёт', 'счет', 'долг', 'баланс', 'деньги']):
        return {"module": "finance", "action": "query", "params": {}, "confidence": 0.7}

    # Здоровье
    if any(w in t for w in ['сон', 'спал', 'тренировка', 'бег', 'вес', 'давление', 'пробежал']):
        return {"module": "health", "action": "record", "params": {"raw": text}, "confidence": 0.6}

    return {"module": "unknown", "action": "unknown", "params": {"raw": text}, "confidence": 0.0}

# ════════════════════════════════════════
# INTENT ROUTER — обрабатывает распознанное намерение
# ════════════════════════════════════════

async def handle_intent(intent: dict, update: Update, ctx: ContextTypes.DEFAULT_TYPE, original_text: str = ""):
    """Маршрутизирует намерение к нужному обработчику"""
    module = intent.get("module", "unknown")
    action = intent.get("action", "unknown")
    params = intent.get("params", {})
    confidence = intent.get("confidence", 0)

    logger.info(f"Intent: {module}/{action} conf={confidence} params={params}")

    # ── БИЗНЕС ──
    if module == "business":
        if action == "query_today":
            await handle_query_business_today(update, ctx)
            return

        if action == "query_branch":
            await handle_query_branch(update, ctx, params.get("branch", ""))
            return

        if action == "record_revenue":
            turnover = params.get("turnover")
            clients = params.get("clients")
            if turnover and clients:
                await handle_record_revenue_owner(update, ctx, turnover, clients)
            else:
                await update.message.reply_text(
                    "Не понял оборот и клиентов. Попробуй:\n"
                    "`32500 18` или «оборот 32500 клиентов 18»",
                    parse_mode='Markdown'
                )
            return

    # ── ЗАДАЧИ ──
    if module == "tasks":
        if action == "add_task":
            task_text = params.get("task", "").strip()
            if not task_text:
                await update.message.reply_text("Не понял текст задачи. Скажи точнее.")
                return
            await handle_add_task(update, ctx, task_text)
            return

        if action == "list_tasks":
            await handle_list_tasks(update, ctx)
            return

    # ── ФИНАНСЫ — передаём в process_smart ──
    if module == "finance":
        response = process_smart(original_text or params.get("raw", "финансы"), get_state(update.effective_chat.id))
        await update.message.reply_text(response, parse_mode='Markdown')
        return

    # ── ЗДОРОВЬЕ ──
    if module == "health":
        await update.message.reply_text(
            f"📝 Записал: «{params.get('raw', original_text)}»\n\n"
            f"_Трекинг здоровья будет в Этапе 4. Пока сохраняю только в памяти._",
            parse_mode='Markdown'
        )
        return

    # ── НЕИЗВЕСТНО — fallback на keyword-парсер ──
    text = params.get("raw", original_text)
    if text:
        response = process_smart(text, get_state(update.effective_chat.id))
        await update.message.reply_text(response, parse_mode='Markdown')
    else:
        await update.message.reply_text(
            "Не понял команду. Попробуй иначе или напиши /help",
            parse_mode='Markdown'
        )

# ════════════════════════════════════════
# ОБРАБОТЧИКИ БИЗНЕС-ЗАПРОСОВ
# ════════════════════════════════════════

async def handle_query_business_today(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """«Какой оборот сегодня?» → запрос к Apps Script"""
    msg = await update.message.reply_text("⏳ Запрашиваю данные...")

    data = await get_branches_data()

    if not data or not data.get('success'):
        await msg.edit_text(
            "⚠️ Не удалось получить данные.\n"
            "Apps Script, возможно, не отвечает."
        )
        return

    branches = data.get('branches', data.get('data', []))
    today = get_today_display()

    if not branches:
        await msg.edit_text(f"📊 Данных за сегодня ({today}) ещё нет.")
        return

    # Формируем сводку
    total_turnover = sum(b.get('today', 0) or 0 for b in branches)
    total_clients = sum(b.get('todayClients', 0) or 0 for b in branches)

    lines = [f"📊 *Сводка за {today}:*\n"]
    for b in branches:
        name = b.get('name', b.get('branch', '—'))
        t = b.get('today', 0) or 0
        c = b.get('todayClients', 0) or 0
        if t > 0:
            lines.append(f"• *{name}:* {fmt_short(t)} | {c} кл.")
        else:
            lines.append(f"• *{name}:* нет данных")

    lines.append(f"\n💰 *Итого: {fmt(total_turnover)} | {total_clients} клиентов*")

    await msg.edit_text('\n'.join(lines), parse_mode='Markdown')


async def handle_query_branch(update: Update, ctx: ContextTypes.DEFAULT_TYPE, branch_name: str):
    """«Как дела у М16?» → данные конкретного филиала"""
    msg = await update.message.reply_text(f"⏳ Запрашиваю {branch_name}...")

    data = await get_branches_data()

    if not data or not data.get('success'):
        await msg.edit_text("⚠️ Не удалось получить данные.")
        return

    branches = data.get('branches', data.get('data', []))
    branch = next((b for b in branches if branch_name.upper() in str(b.get('name', b.get('branch', ''))).upper()), None)

    if not branch:
        await msg.edit_text(
            f"❓ Филиал «{branch_name}» не найден.\n"
            f"Доступные: {', '.join(BRANCH_NAMES)}"
        )
        return

    name = branch.get('name', branch.get('branch', branch_name))
    today_t = branch.get('today', 0) or 0
    today_c = branch.get('todayClients', 0) or 0
    month_t = branch.get('monthTotal', 0) or 0
    month_c = branch.get('monthClients', 0) or 0
    plan = branch.get('plan', 0) or 0

    lines = [f"📊 *Филиал {name}:*\n"]
    lines.append(f"Сегодня: *{fmt_short(today_t)} | {today_c} кл.*")
    if month_t:
        lines.append(f"Месяц: {fmt_short(month_t)} | {month_c} кл.")
    if plan:
        pct = int(month_t / plan * 100) if plan > 0 else 0
        lines.append(f"Прогресс: *{pct}%* от плана {fmt_short(plan)}")

    await msg.edit_text('\n'.join(lines), parse_mode='Markdown')


async def handle_record_revenue_owner(update: Update, ctx: ContextTypes.DEFAULT_TYPE, turnover: int, clients: int):
    """Запись выручки из личного чата владельца — нужно уточнить филиал"""
    # В личном чате не знаем, какой филиал — спрашиваем
    keyboard = []
    row = []
    for i, branch in enumerate(BRANCH_NAMES):
        row.append(InlineKeyboardButton(branch, callback_data=f"rec_{branch}_{turnover}_{clients}"))
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)

    await update.message.reply_text(
        f"💰 *{fmt(turnover)}* | 👥 *{clients} кл.*\n\n"
        f"Для какого филиала записать?",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

# ════════════════════════════════════════
# ОБРАБОТЧИКИ ЗАДАЧ
# ════════════════════════════════════════

async def handle_add_task(update: Update, ctx: ContextTypes.DEFAULT_TYPE, task_text: str):
    """Добавление задачи"""
    msg = await update.message.reply_text("⏳ Записываю задачу...")

    result = await add_task_to_sheets(task_text)

    if result and result.get('success'):
        await msg.edit_text(
            f"✅ Задача записана:\n_«{task_text}»_\n\n"
            f"/tasks — посмотреть все задачи",
            parse_mode='Markdown'
        )
    else:
        # Сохраняем локально в памяти как fallback
        state = get_state(update.effective_chat.id)
        if 'tasks' not in state:
            state['tasks'] = []
        state['tasks'].append({'task': task_text, 'date': get_today_str(), 'done': False})

        await msg.edit_text(
            f"✅ Задача записана (локально, синхронизируй позже):\n_«{task_text}»_",
            parse_mode='Markdown'
        )

async def handle_list_tasks(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Список задач"""
    msg = await update.message.reply_text("⏳ Загружаю задачи...")

    result = await get_tasks_from_sheets()

    # Сначала задачи из облака
    if result and result.get('success') and result.get('data'):
        tasks = result['data']
        if tasks:
            lines = ["📋 *Задачи:*\n"]
            for i, t in enumerate(tasks[:15], 1):  # Максимум 15
                done = t.get('done', False)
                icon = "✅" if done else "⬜"
                lines.append(f"{icon} {i}. {t.get('task', '—')}")
            await msg.edit_text('\n'.join(lines), parse_mode='Markdown')
            return

    # Fallback — задачи из памяти
    state = get_state(update.effective_chat.id)
    local_tasks = state.get('tasks', [])

    if not local_tasks:
        await msg.edit_text("📋 Задач нет.\n\nДобавь: «Запиши задачу: текст задачи»")
        return

    lines = ["📋 *Задачи (локальные):*\n"]
    for i, t in enumerate(local_tasks, 1):
        icon = "✅" if t.get('done') else "⬜"
        lines.append(f"{icon} {i}. {t.get('task', '—')}")
    await msg.edit_text('\n'.join(lines), parse_mode='Markdown')

# ════════════════════════════════════════
# ФИНАНСОВЫЕ РАСЧЁТЫ (из v8)
# ════════════════════════════════════════

def calc_total_balance():
    return sum(a['balance'] for a in ACCOUNTS)

def calc_total_debt():
    return sum(c['balance'] for c in CREDITS)

def calc_monthly_payments():
    return sum(c['payment'] for c in CREDITS)

def calc_total_rent():
    total = sum(r['amount'] + r.get('comm', 0) for r in RENT)
    return total - SUBLEASE_TOTAL

def calc_first_week_obligations():
    credits = sum(c['payment'] for c in CREDITS if c.get('day', 0) in [1, 2])
    rent = calc_total_rent()
    total = credits + rent
    return credits, rent, 0, total

def get_current_month():
    return datetime.now().month

def get_month_name(m):
    names = {1:'Январь',2:'Февраль',3:'Март',4:'Апрель',5:'Май',6:'Июнь',
             7:'Июль',8:'Август',9:'Сентябрь',10:'Октябрь',11:'Ноябрь',12:'Декабрь'}
    return names.get(m, str(m))

def calc_brain_recommendation():
    month = get_current_month()
    margin = MARGIN_FORECAST.get(month, 600000)
    payments = calc_monthly_payments()
    rent = calc_total_rent()
    family = FAMILY_EXPENSE_ESTIMATE
    free = margin - payments - rent - family
    grace_days = days_until("2026-05-05")

    lines = [f"📊 *{get_month_name(month)}:* маржа ~{fmt_short(margin)}"]
    lines.append(f"💳 Платежи: {fmt_short(payments)} | 🏠 Аренда: {fmt_short(rent)}")
    lines.append(f"👛 Семья: ~{fmt_short(family)} | 💡 Свободно: *{fmt_short(free)}*")

    if grace_days and grace_days > 0:
        lines.append(f"\n⚠️ Кредитка Сбер: грейс ещё *{grace_days} дн.* (до 05.05)")

    if free < 0:
        lines.append(f"\n🔴 *Дефицит {fmt_short(abs(free))}!* Нужна стратегия.")
    elif free < 100000:
        lines.append(f"\n🟡 Мало свободных. Не тратить лишнего.")
    else:
        lines.append(f"\n🟢 Есть запас. Можно {fmt_short(min(free*0.5, 200000))} на досрочку Т-Банка.")

    return '\n'.join(lines)

def calc_cashflow_forecast():
    month = get_current_month()
    lines = ["📈 *Прогноз кэш-флоу на 3 месяца:*\n"]
    for i in range(3):
        m = ((month - 1 + i) % 12) + 1
        mg = MARGIN_FORECAST.get(m, 600000)
        pay = calc_monthly_payments()
        rent = calc_total_rent()
        fam = FAMILY_EXPENSE_ESTIMATE
        free = mg - pay - rent - fam
        lines.append(f"*{get_month_name(m)}:* маржа {fmt_short(mg)} → свободно {fmt_short(free)}")
    return '\n'.join(lines)

def process_smart(text: str, state: dict) -> str:
    """Keyword-парсер для финансовых команд"""
    t = text.lower().strip()

    if any(w in t for w in ['привет', 'здравствуй', 'хай', 'добр']):
        balance = calc_total_balance()
        month = get_current_month()
        margin = MARGIN_FORECAST.get(month, 0)
        return (
            f"Привет! 👋\n\n"
            f"💰 На счетах: *{fmt(balance)}*\n"
            f"📊 {get_month_name(month)}: маржа прогноз {fmt_short(margin)}\n\n"
            f"🧠 /brain — что делать сейчас"
        )

    if any(w in t for w in ['кредит', 'долг', 'долги', 'сколько должен', 'платёж']):
        total = calc_total_debt()
        pay = calc_monthly_payments()
        return (
            f"💳 Долг: *{fmt_short(total)}* ({len(CREDITS)} кредитов)\n"
            f"📤 Платежи: *{fmt_short(pay)}/мес*\n"
            f"🎯 Приоритет: Т-Банк 27.3%\n\n"
            f"/credits — подробнее"
        )

    if any(w in t for w in ['баланс', 'счёт', 'счет', 'остаток', 'деньги']):
        balance = calc_total_balance()
        return f"💰 На счетах: *{fmt(balance)}*\n\n/balance — по каждому счёту"

    if any(w in t for w in ['аренда', 'арендодатель']):
        return f"🏠 Аренда: *{fmt(calc_total_rent())}/мес* (чистая)\n\n/rent — детали"

    if any(w in t for w in ['прогноз', 'кэш', 'cashflow']):
        return calc_cashflow_forecast()

    if any(w in t for w in ['кредитка', 'грейс']):
        grace_days = days_until("2026-05-05")
        return (
            f"⚠️ *Кредитка Сбербанк*\n\n"
            f"Долг: *500 000₽* | Грейс: *{grace_days} дн.* (до 05.05)\n"
            f"Ставка после: *25.4%*"
        )

    if any(w in t for w in ['помощь', 'help', 'команд', 'что умеешь']):
        return (
            "*Команды:*\n"
            "🧠 /brain | 💰 /balance | 💳 /credits\n"
            "📅 /cashflow | ⚡ /week | 🏠 /rent\n"
            "📊 /status | 📋 /branches | ✅ /tasks\n\n"
            "*Голосовые команды (новое!):* 🎤\n"
            "«Какой оборот сегодня?»\n"
            "«Запиши задачу: позвонить юристу»\n"
            "«Как дела у М16?»"
        )

    return (
        f"Получил: «{text}»\n\n"
        "Попробуй:\n"
        "• «кредиты», «счета», «аренда»\n"
        "• «прогноз», «кэш-флоу»\n\n"
        "Или голосом: «оборот сегодня», «запиши задачу»\n\n"
        "🧠 /brain — главная рекомендация"
    )

# ════════════════════════════════════════
# ОБРАБОТЧИКИ КОМАНД
# ════════════════════════════════════════

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    global owner_chat_id
    chat_id = update.effective_chat.id
    user = update.effective_user
    state = get_state(chat_id)
    chat_type = update.effective_chat.type

    if chat_type == 'private':
        if owner_chat_id is None:
            owner_chat_id = chat_id
            save_owner(chat_id)
            state['registered'] = True
            voice_status = "✅" if (OPENAI_API_KEY and OPENAI_API_KEY != "YOUR_OPENAI_KEY") else "❌ нет ключа"
            ai_status = "✅" if (ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != "YOUR_ANTHROPIC_KEY") else "❌ нет ключа"
            await update.message.reply_text(
                f"👋 Привет, {user.first_name}!\n\n"
                f"Ты зарегистрирован как владелец.\n\n"
                f"*Статус ИИ:*\n"
                f"🎤 Whisper (голос): {voice_status}\n"
                f"🧠 Claude Haiku (ИИ): {ai_status}\n\n"
                f"*Финансы:*\n"
                f"🧠 /brain | 💰 /balance | 💳 /credits\n"
                f"📅 /cashflow | ⚡ /week | 🏠 /rent\n\n"
                f"*Бизнес и задачи:*\n"
                f"📊 /status | ✅ /tasks | 🗣 Голос\n\n"
                f"*Для чатов филиалов:*\n"
                f"Добавь меня в чат → `/register М16`",
                parse_mode='Markdown'
            )
        elif is_owner(chat_id):
            rec = calc_brain_recommendation()
            await update.message.reply_text(
                f"С возвращением! 👋\n\n{rec}\n\n"
                f"🧠 /brain — подробнее",
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text("Привет! Я финансовый бот Кирилла.")
    else:
        branch = branch_chats.get(str(chat_id))
        if branch:
            await update.message.reply_text(
                f"✅ Чат филиала *{branch}* активен.\n"
                f"Отправляйте: `оборот клиенты` (например: `32500 18`)",
                parse_mode='Markdown'
            )
        else:
            await update.message.reply_text(
                f"Привет! ID чата: `{chat_id}`\n"
                f"Для регистрации: `/register М16`",
                parse_mode='Markdown'
            )

async def tasks_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Показать список задач. /tasks"""
    if not is_owner(update.effective_chat.id): return
    await handle_list_tasks(update, ctx)

async def register_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    global branch_chats
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id
    chat_type = update.effective_chat.type

    if chat_type == 'private':
        await update.message.reply_text(
            "Эта команда работает только в групповых чатах!\n"
            "Добавь меня в чат филиала и напиши там /register М16"
        )
        return

    if owner_chat_id is None or user_id != owner_chat_id:
        await update.message.reply_text("Только владелец может регистрировать чаты.")
        return

    # Парсим название филиала прямо из текста сообщения (не из ctx.args)
    raw_text = update.message.text or ''
    logger.info(f"register_cmd вызван: raw_text='{raw_text}', chat_id={chat_id}")

    # Убираем /register и возможный @botname
    match = re.match(r'^/register(?:@\S+)?\s*(.*)', raw_text, re.IGNORECASE)
    branch_input = match.group(1).strip() if match else ''

    if not branch_input:
        branches_list = ', '.join(BRANCH_NAMES)
        await update.message.reply_text(
            f"Укажи название филиала: /register М16\n\nДоступные: {branches_list}"
        )
        return

    # Приводим к верхнему регистру и убираем лишние пробелы
    branch_name = branch_input.upper().replace(' ', '')

    # Если ввели с пробелом "М 16" — уже убрали пробел выше → "М16"
    # Если ввели "Ек17" — заменяем на "Е17"
    if branch_name.startswith('ЕК'):
        branch_name = 'Е' + branch_name[2:]

    logger.info(f"register_cmd: ввод='{branch_input}', результат='{branch_name}'")

    if branch_name not in BRANCH_NAMES:
        branches_list = ', '.join(BRANCH_NAMES)
        await update.message.reply_text(
            f"Неизвестный филиал: {branch_name}\nДоступные: {branches_list}"
        )
        return

    branch_chats[str(chat_id)] = branch_name
    save_branch_chats(branch_chats)

    await update.message.reply_text(
        f"Чат зарегистрирован как филиал {branch_name}!\n\n"
        f"Теперь портные могут отправлять:\n32500 18 (оборот пробел клиенты)"
    )

    if owner_chat_id:
        try:
            await ctx.bot.send_message(
                chat_id=owner_chat_id,
                text=f"Зарегистрирован чат филиала {branch_name}\nChat ID: {chat_id}"
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить владельца о регистрации {branch_name}: {e}")

async def unregister_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    global branch_chats
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id

    if owner_chat_id is None or user_id != owner_chat_id:
        await update.message.reply_text("⛔ Только владелец.")
        return

    key = str(chat_id)
    if key in branch_chats:
        branch_name = branch_chats.pop(key)
        save_branch_chats(branch_chats)
        await update.message.reply_text(f"✅ Чат отвязан от филиала *{branch_name}*", parse_mode='Markdown')
    else:
        await update.message.reply_text("Этот чат не зарегистрирован.")

async def branches_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return

    if not branch_chats:
        await update.message.reply_text(
            "Нет зарегистрированных чатов.\n\n"
            "Добавь меня в чат филиала и напиши `/register М16`"
        )
        return

    lines = ["📋 *Зарегистрированные чаты:*\n"]
    for chat_id_str, branch in branch_chats.items():
        lines.append(f"• *{branch}* — `{chat_id_str}`")

    not_registered = [b for b in BRANCH_NAMES if b not in branch_chats.values()]
    if not_registered:
        lines.append(f"\n⏳ Не зарегистрированы: {', '.join(not_registered)}")

    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')

async def help_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    chat_type = update.effective_chat.type
    if chat_type != 'private':
        branch = branch_chats.get(str(update.effective_chat.id), '—')
        await update.message.reply_text(
            f"Филиал: *{branch}*\nОтправьте: `оборот клиенты`\nПример: `32500 18`",
            parse_mode='Markdown'
        )
        return

    await update.message.reply_text(
        "*Команды:*\n"
        "🧠 /brain — рекомендация\n"
        "💰 /balance — счета\n"
        "💳 /credits — кредиты\n"
        "📅 /cashflow — прогноз\n"
        "⚡ /week — обязательства 1-7\n"
        "🏠 /rent — аренда\n"
        "📊 /status — сводка\n"
        "✅ /tasks — задачи\n\n"
        "*Голосовые команды:* 🎤\n"
        "• «Какой оборот сегодня?»\n"
        "• «Запиши задачу: позвонить юристу»\n"
        "• «Как дела у М16?»\n\n"
        "*Чаты филиалов:*\n"
        "📌 /register М16 | 📋 /branches | ❌ /unregister",
        parse_mode='Markdown'
    )

async def brain_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    await update.message.reply_text(calc_brain_recommendation(), parse_mode='Markdown')

async def balance_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    lines = ["💰 *Счета:*\n"]
    for a in ACCOUNTS:
        note = f" _{a.get('note', '')}_" if a.get('note') else ""
        lines.append(f"• {a['name']}: *{fmt(a['balance'])}*{note}")
    lines.append(f"\n💼 Итого: *{fmt(calc_total_balance())}*")
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')

async def credits_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    lines = ["💳 *Кредиты (по приоритету):*\n"]
    sorted_credits = sorted([c for c in CREDITS if c.get('priority', 0) > 0], key=lambda x: x['priority'])
    for c in sorted_credits:
        lines.append(f"*{c['name']}* {c['rate']}% → {fmt(c['balance'])} / {fmt(c['payment'])}/мес")
    other = [c for c in CREDITS if c.get('priority', 0) == 0]
    if other:
        lines.append("\n_Низкий приоритет:_")
        for c in other:
            lines.append(f"• {c['name']} {c['rate']}% — {fmt(c['balance'])}")
    lines.append(f"\n📊 Долг: *{fmt_short(calc_total_debt())}* | Платежи: *{fmt_short(calc_monthly_payments())}/мес*")
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')

async def week_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    cr, rn, ch, total = calc_first_week_obligations()
    await update.message.reply_text(
        f"⚡ *1-7 число — {fmt_short(total)}:*\n\n"
        f"💳 Кредиты: {fmt_short(cr)}\n"
        f"🏠 Аренда: {fmt_short(rn)}\n"
        f"👔 Химчистка ~подрядчики: отдельно",
        parse_mode='Markdown'
    )

async def cashflow_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    await update.message.reply_text(calc_cashflow_forecast(), parse_mode='Markdown')

async def rent_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    lines = ["🏠 *Аренда по филиалам:*\n"]
    total_gross = 0
    for r in RENT:
        gross = r['amount'] + r.get('comm', 0)
        total_gross += gross
        comm_str = f" (+{r['comm']}К комм)" if r.get('comm') else ""
        lines.append(f"• *{r['branch']}* {r['landlord']}: {fmt(r['amount'])}{comm_str}")
    lines.append(f"\n💰 Брутто: {fmt(total_gross)}")
    lines.append(f"💚 Субаренда: -{fmt(SUBLEASE_TOTAL)}")
    lines.append(f"💼 *Чистая: {fmt(calc_total_rent())}*")
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')

async def status_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_owner(update.effective_chat.id): return
    month = get_current_month()
    grace_days = days_until("2026-05-05")
    registered_count = len(branch_chats)
    voice_ok = bool(OPENAI_API_KEY and OPENAI_API_KEY != "YOUR_OPENAI_KEY")
    ai_ok = bool(ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != "YOUR_ANTHROPIC_KEY")

    await update.message.reply_text(
        f"📊 *Статус системы v9:*\n\n"
        f"💰 На счетах: *{fmt(calc_total_balance())}*\n"
        f"💳 Долг: *{fmt_short(calc_total_debt())}*\n"
        f"📅 {get_month_name(month)}: маржа {fmt_short(MARGIN_FORECAST.get(month, 0))}\n"
        f"⚠️ Кредитка грейс: {grace_days} дн. (до 05.05)\n\n"
        f"🏢 Чатов филиалов: *{registered_count}/{len(BRANCH_NAMES)}*\n"
        f"🎤 Whisper: {'✅' if voice_ok else '❌ нужен OPENAI_API_KEY'}\n"
        f"🧠 Claude Haiku: {'✅' if ai_ok else '❌ нужен ANTHROPIC_API_KEY'}\n\n"
        f"/branches — список чатов",
        parse_mode='Markdown'
    )

# ════════════════════════════════════════
# ОБРАБОТКА СООБЩЕНИЙ
# ════════════════════════════════════════

async def handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Главный обработчик текстовых сообщений"""
    try:
        chat_id = update.effective_chat.id
        text = update.message.text or ""
        chat_type = update.effective_chat.type

        # ── Групповой чат филиала ──
        if chat_type in ('group', 'supergroup'):
            branch = branch_chats.get(str(chat_id))
            if branch:
                await handle_branch_message(update, ctx, branch, text)
            return

        # ── Личный чат владельца ──
        if is_owner(chat_id):
            # Сначала пробуем ИИ-роутинг
            intent = await parse_intent(text)
            await handle_intent(intent, update, ctx, original_text=text)
        else:
            await update.message.reply_text("Привет! Я работаю только с владельцем.")
    except Exception as e:
        logger.error(f"ОШИБКА handle_message: {e}\n{traceback.format_exc()}")
        try:
            await update.message.reply_text("⚠️ Произошла ошибка. Попробуйте позже.")
        except:
            pass


async def handle_voice(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """
    🎤 Обработчик голосовых сообщений
    Только в личном чате владельца.
    """
    chat_id = update.effective_chat.id

    if not is_owner(chat_id):
        return

    if not OPENAI_API_KEY or OPENAI_API_KEY == "YOUR_OPENAI_KEY":
        await update.message.reply_text(
            "🎤 Голосовые сообщения пока не настроены.\n\n"
            "Нужен OpenAI API ключ → укажи в config.py\n"
            "Регистрация: platform.openai.com"
        )
        return

    # Скачиваем .ogg файл от Telegram
    processing_msg = await update.message.reply_text("🎤 Слушаю...")

    try:
        voice = update.message.voice
        file = await ctx.bot.get_file(voice.file_id)

        # Создаём временный файл
        with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as tmp:
            tmp_path = tmp.name

        await file.download_to_drive(tmp_path)

        # Транскрибируем через Whisper
        await processing_msg.edit_text("🎤 Распознаю...")
        text = await transcribe_voice(tmp_path)

        # Удаляем временный файл
        os.unlink(tmp_path)

        if not text:
            await processing_msg.edit_text("❌ Не удалось распознать голос. Попробуй ещё раз.")
            return

        logger.info(f"Voice transcribed: '{text}'")

        # Показываем что распознали
        await processing_msg.edit_text(f"🎤 «{text}»\n\n⏳ Обрабатываю...")

        # Разбираем намерение
        intent = await parse_intent(text)

        # Обновляем сообщение — убираем "обрабатываю"
        await processing_msg.delete()

        # Обрабатываем намерение
        await handle_intent(intent, update, ctx, original_text=text)

    except Exception as e:
        logger.error(f"Voice handler error: {e}")
        await processing_msg.edit_text(f"❌ Ошибка обработки голоса:\n{str(e)[:100]}")


async def handle_branch_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE, branch: str, text: str):
    """Обработка сообщения из чата филиала"""
    try:
        chat_id = update.effective_chat.id
        user = update.effective_user

        turnover, clients = parse_branch_report(text)

        if turnover is None:
            logger.info(f"Branch {branch}: non-report '{text[:50]}' from {user.first_name}")
            return

        today = get_today_display()
        logger.info(f"Branch {branch}: turnover={turnover}, clients={clients}, date={today}")

        await update.message.reply_text(f"⏳ Записываю в таблицу...")

        result = await write_branch_daily(branch, turnover, clients)

        if result and result.get('success'):
            await update.message.reply_text(
                f"✅ *{branch}* записан за {today}:\n"
                f"💰 Оборот: *{fmt(turnover)}*\n"
                f"👥 Клиенты: *{clients}*",
                parse_mode='Markdown'
            )
            if owner_chat_id:
                try:
                    await ctx.bot.send_message(
                        chat_id=owner_chat_id,
                        text=f"📊 *{branch}* — {today}\n💰 {fmt(turnover)} | 👥 {clients} клиентов",
                        parse_mode='Markdown'
                    )
                except Exception as e:
                    logger.error(f"Failed to notify owner: {e}")
        else:
            error = result.get('error', 'Неизвестная ошибка') if result else 'Нет ответа'
            await update.message.reply_text(
                f"⚠️ Не удалось записать!\nОшибка: {error}\n\nДанные: {fmt(turnover)}, {clients} клиентов.\nЗапишите вручную."
            )
            if owner_chat_id:
                try:
                    await ctx.bot.send_message(
                        chat_id=owner_chat_id,
                        text=f"🔴 Ошибка записи *{branch}* — {today}\nДанные: {fmt(turnover)}, {clients} кл.\nОшибка: {error}",
                        parse_mode='Markdown'
                    )
                except Exception as e:
                    logger.error(f"Не удалось уведомить владельца об ошибке записи {branch}: {e}")
    except Exception as e:
        logger.error(f"ОШИБКА handle_branch_message ({branch}): {e}\n{traceback.format_exc()}")
        try:
            await update.message.reply_text("⚠️ Ошибка обработки. Попробуйте ещё раз.")
        except:
            pass

# ════════════════════════════════════════
# CALLBACKS
# ════════════════════════════════════════

async def callback_handler(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Обработчик inline кнопок"""
    try:
        query = update.callback_query
        await query.answer()
        data = query.data

        # Запись выручки для конкретного филиала
        if data.startswith("rec_"):
            parts = data.split("_")
            if len(parts) >= 4:
                branch = parts[1]
                turnover = int(parts[2])
                clients = int(parts[3])
                today = get_today_display()

                await query.edit_message_text(f"⏳ Записываю в {branch}...")

                result = await write_branch_daily(branch, turnover, clients)

                if result and result.get('success'):
                    await query.edit_message_text(
                        f"✅ *{branch}* записан за {today}:\n"
                        f"💰 {fmt(turnover)} | 👥 {clients} клиентов",
                        parse_mode='Markdown'
                    )
                else:
                    error = result.get('error', 'Ошибка') if result else 'Нет ответа'
                    await query.edit_message_text(f"❌ Ошибка записи: {error}")
    except Exception as e:
        logger.error(f"ОШИБКА callback_handler: {e}\n{traceback.format_exc()}")

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

# ════════════════════════════════════════
# MAIN
# ════════════════════════════════════════

def main():
    global owner_chat_id
    owner_chat_id = load_owner()
    if owner_chat_id:
        logger.info(f"Owner loaded: {owner_chat_id}")

    logger.info(f"Branch chats loaded: {branch_chats}")

    if BOT_TOKEN == "YOUR_BOT_TOKEN":
        print("\n❌ ОШИБКА: Вставь токен бота в config.py\n")
        return

    voice_ok = bool(OPENAI_API_KEY and OPENAI_API_KEY != "YOUR_OPENAI_KEY")
    ai_ok = bool(ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != "YOUR_ANTHROPIC_KEY")

    app = Application.builder().token(BOT_TOKEN).build()

    # Глобальный обработчик ошибок — ловит ВСЕ необработанные исключения
    async def error_handler(update, context):
        logger.error(f"НЕОБРАБОТАННАЯ ОШИБКА: {context.error}\n{traceback.format_exc()}")
        # Пытаемся уведомить пользователя
        if update and update.effective_message:
            try:
                await update.effective_message.reply_text(
                    "⚠️ Произошла внутренняя ошибка. Попробуйте позже."
                )
            except:
                pass

    app.add_error_handler(error_handler)

    # Команды
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("brain", brain_cmd))
    app.add_handler(CommandHandler("balance", balance_cmd))
    app.add_handler(CommandHandler("credits", credits_cmd))
    app.add_handler(CommandHandler("week", week_cmd))
    app.add_handler(CommandHandler("cashflow", cashflow_cmd))
    app.add_handler(CommandHandler("rent", rent_cmd))
    app.add_handler(CommandHandler("status", status_cmd))
    app.add_handler(CommandHandler("tasks", tasks_cmd))
    app.add_handler(CommandHandler("register", register_cmd))
    app.add_handler(CommandHandler("unregister", unregister_cmd))
    app.add_handler(CommandHandler("branches", branches_cmd))

    # Callbacks (inline кнопки)
    app.add_handler(CallbackQueryHandler(callback_handler))

    # Голосовые сообщения (НОВОЕ в v9!)
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))

    # Текстовые сообщения
    app.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND,
        handle_message
    ))

    print("\n" + "=" * 55)
    print("🧠 ФИНАНСОВЫЙ БОТ v9 — ГОЛОС + ИИ — ЗАПУЩЕН")
    print("=" * 55)
    print(f"\nOwner: {owner_chat_id or 'Первый /start'}")
    print(f"Чаты филиалов: {len(branch_chats)}/{len(BRANCH_NAMES)}")
    print(f"🎤 Whisper: {'✅ ГОТОВ' if voice_ok else '❌ нужен OPENAI_API_KEY'}")
    print(f"🧠 Claude Haiku: {'✅ ГОТОВ' if ai_ok else '❌ нужен ANTHROPIC_API_KEY'}")
    if not voice_ok or not ai_ok:
        print("\n⚠️  Добавь ключи в config.py и перезапусти бота")
        print("   OPENAI_API_KEY — platform.openai.com")
        print("   ANTHROPIC_API_KEY — console.anthropic.com")
    print("\nОткрой бота и напиши /start")
    print("Ctrl+C для остановки\n")

    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
