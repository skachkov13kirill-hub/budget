#!/usr/bin/env python3
"""
handlers.py -- ALL command handlers, intent handlers, message handlers, callback handler.
"""

import os
import re
import tempfile
import traceback

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from config import (
    CREDITS, ACCOUNTS, RENT,
    MARGIN_FORECAST,
    SUBLEASE_TOTAL, BRANCH_NAMES,
    OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY
)
import utils
from utils import (
    logger, user_state, branch_chats,
    is_owner, get_state, fmt, fmt_short, days_until,
    get_today_str, get_today_display,
    parse_branch_report, save_branch_chats, save_owner, load_owner
)
from datetime import datetime, timedelta
from sheets_api import (
    write_branch_daily, get_branches_data,
    add_task_to_sheets, get_tasks_from_sheets,
    add_schedule_slot, get_schedule_day, update_schedule_slot
)
from ai_handlers import transcribe_voice, parse_intent
from financial import (
    calc_total_balance, calc_total_debt, calc_monthly_payments,
    calc_total_rent, calc_first_week_obligations,
    get_current_month, get_month_name,
    calc_brain_recommendation, calc_cashflow_forecast, process_smart
)


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
            date = params.get("date", "сегодня")
            period = params.get("period", "day")
            await handle_query_business_today(update, ctx, date=date, period=period)
            return

        if action == "query_branch":
            date = params.get("date", "сегодня")
            period = params.get("period", "day")
            await handle_query_branch(update, ctx, params.get("branch", ""), date=date, period=period)
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

    # ── ПЛАНИРОВЩИК ──
    if module == "planner":
        if action == "add_slot":
            await handle_planner_add(update, ctx, params)
            return
        if action == "list_day":
            await handle_planner_list_day(update, ctx, params)
            return
        if action == "move_slot":
            await handle_planner_move(update, ctx, params)
            return
        if action == "done_slot":
            await handle_planner_done(update, ctx, params)
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

def _resolve_business_date(date_text: str) -> str:
    """Конвертирует 'вчера', 'позавчера' → YYYY-MM-DD для бизнес-запросов"""
    if not date_text or date_text == 'сегодня':
        return datetime.now().strftime('%Y-%m-%d')
    t = date_text.lower().strip()
    if t == 'вчера':
        return (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    if t == 'позавчера':
        return (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
    # Дни недели
    for name, wd in WEEKDAY_MAP.items():
        if name in t:
            today = datetime.now()
            today_wd = today.weekday()
            delta = (today_wd - wd) % 7
            if delta == 0:
                delta = 7
            return (today - timedelta(days=delta)).strftime('%Y-%m-%d')
    # ISO дата
    if re.match(r'\d{4}-\d{2}-\d{2}', t):
        return t[:10]
    return datetime.now().strftime('%Y-%m-%d')


def _period_label(period: str, date_str: str) -> str:
    """Формирует человеческое описание периода"""
    if period == 'week':
        return 'неделю'
    if period == 'month':
        return 'месяц'
    # day — показываем дату
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    today = datetime.now().strftime('%Y-%m-%d')
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    if date_str == today:
        return f'сегодня ({dt.strftime("%d.%m")})'
    if date_str == yesterday:
        return f'вчера ({dt.strftime("%d.%m")})'
    day_name = DAY_NAMES_RU.get(dt.weekday(), '')
    return f'{day_name} {dt.strftime("%d.%m")}'


async def handle_query_business_today(update: Update, ctx: ContextTypes.DEFAULT_TYPE,
                                       date: str = 'сегодня', period: str = 'day'):
    """«Какой оборот сегодня/вчера/за неделю?» → запрос к Apps Script"""
    date_str = _resolve_business_date(date)
    label = _period_label(period, date_str)
    msg = await update.message.reply_text(f"⏳ Запрашиваю данные за {label}...")

    data = await get_branches_data(date=date_str, period=period)

    if not data or not data.get('success'):
        await msg.edit_text(
            "⚠️ Не удалось получить данные.\n"
            "Apps Script, возможно, не отвечает."
        )
        return

    branches = data.get('filials', data.get('branches', data.get('data', [])))

    if not branches:
        await msg.edit_text(f"📊 Данных за {label} ещё нет.")
        return

    # Формируем сводку
    # Поддерживаем как 'today' (для совместимости) так и 'turnover'
    total_turnover = sum((b.get('fact', {}).get('total', 0) or b.get('today', b.get('turnover', 0))) or 0 for b in branches)
    total_clients = sum((b.get('fact', {}).get('clients', 0) or b.get('todayClients', b.get('clients', 0))) or 0 for b in branches)

    lines = [f"📊 *Сводка за {label}:*\n"]
    for b in branches:
        name = b.get('name', b.get('branch', '—'))
        t = (b.get('fact', {}).get('total', 0) or b.get('today', b.get('turnover', 0))) or 0
        c = (b.get('fact', {}).get('clients', 0) or b.get('todayClients', b.get('clients', 0))) or 0
        if t > 0:
            lines.append(f"• *{name}:* {fmt_short(t)} | {c} кл.")
        else:
            lines.append(f"• *{name}:* нет данных")

    lines.append(f"\n💰 *Итого: {fmt(total_turnover)} | {total_clients} клиентов*")

    await msg.edit_text('\n'.join(lines), parse_mode='Markdown')


async def handle_query_branch(update: Update, ctx: ContextTypes.DEFAULT_TYPE, branch_name: str,
                               date: str = 'сегодня', period: str = 'day'):
    """«Как дела у М16?» → данные конкретного филиала"""
    date_str = _resolve_business_date(date)
    label = _period_label(period, date_str)
    msg = await update.message.reply_text(f"⏳ Запрашиваю {branch_name} за {label}...")

    data = await get_branches_data(date=date_str, period=period)

    if not data or not data.get('success'):
        await msg.edit_text("⚠️ Не удалось получить данные.")
        return

    branches = data.get('filials', data.get('branches', data.get('data', [])))
    branch = next((b for b in branches if branch_name.upper() in str(b.get('name', b.get('branch', ''))).upper()), None)

    if not branch:
        await msg.edit_text(
            f"❓ Филиал «{branch_name}» не найден.\n"
            f"Доступные: {', '.join(BRANCH_NAMES)}"
        )
        return

    name = branch.get('name', branch.get('branch', branch_name))
    today_t = branch.get('today', branch.get('turnover', 0)) or 0
    today_c = branch.get('todayClients', branch.get('clients', 0)) or 0
    month_t = branch.get('monthTotal', 0) or 0
    month_c = branch.get('monthClients', 0) or 0
    plan = branch.get('plan', 0) or 0

    lines = [f"📊 *Филиал {name}* за {label}:\n"]
    lines.append(f"Оборот: *{fmt_short(today_t)} | {today_c} кл.*")
    if month_t and period == 'day':
        lines.append(f"Месяц: {fmt_short(month_t)} | {month_c} кл.")
    if plan and period == 'day':
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
# ОБРАБОТЧИКИ КОМАНД
# ════════════════════════════════════════

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user = update.effective_user
    state = get_state(chat_id)
    chat_type = update.effective_chat.type

    if chat_type == 'private':
        if utils.owner_chat_id is None:
            utils.owner_chat_id = chat_id
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
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id
    chat_type = update.effective_chat.type

    if chat_type == 'private':
        await update.message.reply_text(
            "Эта команда работает только в групповых чатах!\n"
            "Добавь меня в чат филиала и напиши там /register М16"
        )
        return

    if utils.owner_chat_id is None or user_id != utils.owner_chat_id:
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

    if utils.owner_chat_id:
        try:
            await ctx.bot.send_message(
                chat_id=utils.owner_chat_id,
                text=f"Зарегистрирован чат филиала {branch_name}\nChat ID: {chat_id}"
            )
        except Exception as e:
            logger.error(f"Не удалось уведомить владельца о регистрации {branch_name}: {e}")

async def unregister_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id

    if utils.owner_chat_id is None or user_id != utils.owner_chat_id:
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
    logger.info(f">>> VOICE from chat_id={chat_id}, owner={utils.owner_chat_id}")

    if not is_owner(chat_id):
        logger.info(f">>> VOICE rejected: not owner")
        return

    has_groq = GROQ_API_KEY and GROQ_API_KEY != "YOUR_GROQ_KEY"
    has_openai = OPENAI_API_KEY and OPENAI_API_KEY != "YOUR_OPENAI_KEY"
    if not has_groq and not has_openai:
        await update.message.reply_text(
            "🎤 Голосовые сообщения пока не настроены.\n\n"
            "Нужен GROQ_API_KEY или OPENAI_API_KEY в config.py"
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
            if utils.owner_chat_id:
                try:
                    await ctx.bot.send_message(
                        chat_id=utils.owner_chat_id,
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
            if utils.owner_chat_id:
                try:
                    await ctx.bot.send_message(
                        chat_id=utils.owner_chat_id,
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
# ПЛАНИРОВЩИК — голосовое управление расписанием
# ════════════════════════════════════════

# Категория дня по дню недели (0=Пн, 6=Вс)
DAY_CATEGORIES = {0: 'kb', 1: 'my', 2: 'my', 3: 'kb', 4: 'family', 5: 'family', 6: 'plan'}
DAY_NAMES_RU = {0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'}
DAY_EMOJI = {'kb': '💼', 'my': '🟢', 'family': '💗', 'plan': '📋'}

WEEKDAY_MAP = {
    'понедельник': 0, 'вторник': 1, 'среду': 2, 'среда': 2, 'четверг': 3,
    'пятницу': 4, 'пятница': 4, 'субботу': 5, 'суббота': 5, 'воскресенье': 6,
}


def resolve_date(text: str) -> str:
    """Конвертирует 'завтра', 'понедельник', 'послезавтра' → YYYY-MM-DD"""
    if not text:
        return datetime.now().strftime('%Y-%m-%d')

    t = text.lower().strip()

    if t == 'сегодня' or t == '':
        return datetime.now().strftime('%Y-%m-%d')
    if t == 'завтра':
        return (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    if t == 'послезавтра':
        return (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')

    # День недели: ищем ближайший
    for name, wd in WEEKDAY_MAP.items():
        if name in t:
            today = datetime.now()
            today_wd = today.weekday()
            delta = (wd - today_wd) % 7
            if delta == 0:
                delta = 7  # следующий такой день
            return (today + timedelta(days=delta)).strftime('%Y-%m-%d')

    # Может быть уже ISO дата
    if re.match(r'\d{4}-\d{2}-\d{2}', t):
        return t[:10]

    return datetime.now().strftime('%Y-%m-%d')


def calc_end_time(start: str, duration: int) -> str:
    """'10:00' + 60min → '11:00'"""
    if not start:
        return ''
    try:
        h, m = map(int, start.split(':'))
        total = h * 60 + m + duration
        return f"{total // 60:02d}:{total % 60:02d}"
    except:
        return ''


async def handle_planner_add(update: Update, ctx: ContextTypes.DEFAULT_TYPE, params: dict):
    """Добавить задачу в расписание"""
    task = params.get('task', '').strip()
    if not task:
        await update.message.reply_text("Не понял задачу. Скажи: «На завтра в 10 утра встреча с юристом, час»")
        return

    date_str = resolve_date(params.get('date', 'сегодня'))
    time_str = params.get('time', '')
    duration = int(params.get('duration', 60))
    end_time = calc_end_time(time_str, duration)

    # Категория по дню недели
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    category = DAY_CATEGORIES.get(dt.weekday(), 'my')

    result = await add_schedule_slot(
        date=date_str,
        name=task,
        start_time=time_str,
        end_time=end_time,
        duration=duration,
        category=category
    )

    if result and result.get('success'):
        day_name = DAY_NAMES_RU.get(dt.weekday(), '')
        emoji = DAY_EMOJI.get(category, '')
        time_info = f" в {time_str}" if time_str else ""
        dur_info = f" ({duration} мин)" if duration != 60 else " (1 час)"
        await update.message.reply_text(
            f"✅ Записал в план:\n\n"
            f"{emoji} *{day_name} {dt.strftime('%d.%m')}*{time_info}{dur_info}\n"
            f"📌 {task}",
            parse_mode='Markdown'
        )
    else:
        error = result.get('error', 'Ошибка') if result else 'Нет ответа от таблицы'
        await update.message.reply_text(f"❌ Не удалось записать: {error}")


async def handle_planner_list_day(update: Update, ctx: ContextTypes.DEFAULT_TYPE, params: dict):
    """Показать расписание на день"""
    date_str = resolve_date(params.get('date', 'сегодня'))
    result = await get_schedule_day(date_str)

    if not result or not result.get('success'):
        await update.message.reply_text("❌ Не удалось загрузить расписание")
        return

    slots = result.get('slots', [])
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    day_name = DAY_NAMES_RU.get(dt.weekday(), '')
    category = DAY_CATEGORIES.get(dt.weekday(), 'my')
    emoji = DAY_EMOJI.get(category, '')

    if not slots:
        await update.message.reply_text(
            f"{emoji} *{day_name} {dt.strftime('%d.%m')}* — свободный день\n\nНет запланированных задач.",
            parse_mode='Markdown'
        )
        return

    total_min = sum(s.get('duration', 60) for s in slots)
    done_count = sum(1 for s in slots if s.get('done'))

    lines = [f"{emoji} *{day_name} {dt.strftime('%d.%m')}* — {len(slots)} задач ({total_min // 60}ч {total_min % 60}мин)\n"]

    for s in slots:
        check = '✅' if s.get('done') else '⬜'
        time_part = f"{s['startTime']}–{s['endTime']} " if s.get('startTime') else ''
        dur = s.get('duration', 60)
        lines.append(f"{check} {time_part}*{s['name']}* ({dur} мин)")

    if done_count > 0:
        lines.append(f"\n📊 Выполнено: {done_count}/{len(slots)}")

    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')


async def handle_planner_move(update: Update, ctx: ContextTypes.DEFAULT_TYPE, params: dict):
    """Переместить задачу на другой день/время"""
    query = params.get('task_query', '').lower()
    if not query:
        await update.message.reply_text("Не понял какую задачу перенести.")
        return

    # Ищем задачу в текущем расписании (сегодня + завтра)
    found_slot = None
    for offset in range(7):
        check_date = (datetime.now() + timedelta(days=offset)).strftime('%Y-%m-%d')
        result = await get_schedule_day(check_date)
        if result and result.get('success'):
            for slot in result.get('slots', []):
                if query in slot.get('name', '').lower():
                    found_slot = slot
                    break
        if found_slot:
            break

    if not found_slot:
        await update.message.reply_text(f"🔍 Не нашёл задачу «{query}» в ближайшие 7 дней.")
        return

    row = found_slot['row']

    # Обновляем дату если указана
    new_date = params.get('new_date')
    if new_date:
        new_date_str = resolve_date(new_date)
        await update_schedule_slot(row, 'update', 'date', new_date_str)

    # Обновляем время если указано
    new_time = params.get('new_time')
    if new_time:
        await update_schedule_slot(row, 'update', 'startTime', new_time)
        duration = found_slot.get('duration', 60)
        new_end = calc_end_time(new_time, duration)
        if new_end:
            await update_schedule_slot(row, 'update', 'endTime', new_end)

    # Формируем ответ
    parts = []
    if new_date:
        dt = datetime.strptime(resolve_date(new_date), '%Y-%m-%d')
        parts.append(f"📅 {DAY_NAMES_RU.get(dt.weekday(), '')} {dt.strftime('%d.%m')}")
    if new_time:
        parts.append(f"🕐 {new_time}")

    move_info = ', '.join(parts) if parts else 'обновлено'
    await update.message.reply_text(
        f"✅ Перенёс «{found_slot['name']}» → {move_info}",
        parse_mode='Markdown'
    )


async def handle_planner_done(update: Update, ctx: ContextTypes.DEFAULT_TYPE, params: dict):
    """Отметить задачу как выполненную"""
    query = params.get('task_query', '').lower()
    if not query:
        await update.message.reply_text("Не понял какую задачу отметить.")
        return

    # Ищем задачу сегодня и завтра
    found_slot = None
    for offset in range(3):
        check_date = (datetime.now() + timedelta(days=offset)).strftime('%Y-%m-%d')
        result = await get_schedule_day(check_date)
        if result and result.get('success'):
            for slot in result.get('slots', []):
                if not slot.get('done') and query in slot.get('name', '').lower():
                    found_slot = slot
                    break
        if found_slot:
            break

    if not found_slot:
        await update.message.reply_text(f"🔍 Не нашёл незавершённую задачу «{query}» в ближайшие 3 дня.")
        return

    result = await update_schedule_slot(found_slot['row'], 'done')
    if result and result.get('success'):
        await update.message.reply_text(f"✅ *{found_slot['name']}* — выполнено!", parse_mode='Markdown')
    else:
        await update.message.reply_text("❌ Не удалось обновить задачу")


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
