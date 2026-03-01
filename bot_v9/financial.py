#!/usr/bin/env python3
"""
financial.py -- All calc_ functions and process_smart.
"""

from datetime import datetime

from config import (
    CREDITS, ACCOUNTS, RENT,
    MARGIN_FORECAST, FAMILY_EXPENSE_ESTIMATE,
    SUBLEASE_TOTAL
)
from utils import fmt, fmt_short, days_until


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
