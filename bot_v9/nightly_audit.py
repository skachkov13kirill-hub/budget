#!/usr/bin/env python3
"""
nightly_audit.py — Ночной аудит данных дашборда
Запускается ежедневно в 03:00 МСК через JobQueue.
Проверяет адекватность данных по всем филиалам и отправляет отчёт владельцу.
"""

from datetime import datetime

from sheets_api import sheets_get
from utils import logger, fmt, owner_chat_id


# ═══════════════════════════════════════
# ПОРОГИ ПРОВЕРОК
# ═══════════════════════════════════════

AVG_CHECK_MIN = 500       # Минимальный адекватный средний чек
AVG_CHECK_MAX = 5000      # Максимальный адекватный средний чек
MIN_CLIENTS_THRESHOLD = 5 # Минимум клиентов для проверки среднего чека
DAY_THRESHOLD = 5         # После какого дня месяца считать 0 данных аномалией
DAILY_REVENUE_MAX = 30000 # Максимальная адекватная дневная выручка филиала
DAILY_CLIENTS_MAX = 30    # Максимальное адекватное кол-во клиентов в день
PLAN_RATIO_MAX = 3.0      # План / факт не должен быть больше этого (после DAY_THRESHOLD)


# ═══════════════════════════════════════
# ПРОВЕРКИ
# ═══════════════════════════════════════

def check_avg_check(filial: dict) -> list:
    """Средний чек вне диапазона 500–5000₽"""
    issues = []
    fact = filial.get('fact', {})
    clients = fact.get('clients', 0)
    avg = fact.get('avgCheck', 0)

    if clients < MIN_CLIENTS_THRESHOLD or avg == 0:
        return issues

    if avg < AVG_CHECK_MIN:
        issues.append({
            'severity': 'yellow',
            'filial': filial.get('name', '?'),
            'message': f'Ср. чек {fmt(avg)} — подозрительно низкий (норма {AVG_CHECK_MIN}–{AVG_CHECK_MAX}₽)'
        })
    elif avg > AVG_CHECK_MAX:
        issues.append({
            'severity': 'red',
            'filial': filial.get('name', '?'),
            'message': f'Ср. чек {fmt(avg)} — подозрительно высокий (норма {AVG_CHECK_MIN}–{AVG_CHECK_MAX}₽)'
        })
    return issues


def check_zero_data(filial: dict, day_of_month: int) -> list:
    """0 клиентов и 0 выручка после 5-го числа"""
    issues = []
    if day_of_month <= DAY_THRESHOLD:
        return issues

    fact = filial.get('fact', {})
    if fact.get('atelie', 0) == 0 and fact.get('clients', 0) == 0:
        issues.append({
            'severity': 'red',
            'filial': filial.get('name', '?'),
            'message': f'Нет данных за {day_of_month} дней — 0 клиентов, 0 выручка'
        })
    return issues


def check_himchistka_zero(filial: dict, day_of_month: int) -> list:
    """Химчистка = 0 при наличии плана"""
    issues = []
    if day_of_month <= DAY_THRESHOLD:
        return issues

    plan = filial.get('plan', {})
    fact = filial.get('fact', {})
    if plan.get('himchistka', 0) > 0 and (fact.get('himchistka', 0) == 0):
        issues.append({
            'severity': 'yellow',
            'filial': filial.get('name', '?'),
            'message': f'Химчистка 0₽ при плане {fmt(plan["himchistka"])}'
        })
    return issues


def check_plan_reality(filial: dict, day_of_month: int) -> list:
    """План сильно расходится с фактом (после 5 дней данных)"""
    issues = []
    if day_of_month <= DAY_THRESHOLD:
        return issues

    fact = filial.get('fact', {})
    plan = filial.get('plan', {})
    fact_total = fact.get('total', 0)
    plan_total = plan.get('total', 0)

    if plan_total == 0 or fact_total == 0:
        return issues

    # Экстраполяция факта на весь месяц
    days_in_month = 30  # приблизительно
    projected = fact_total / day_of_month * days_in_month

    if plan_total > projected * PLAN_RATIO_MAX:
        pct = round(projected / plan_total * 100)
        issues.append({
            'severity': 'yellow',
            'filial': filial.get('name', '?'),
            'message': f'Прогноз {fmt(round(projected))} = {pct}% плана ({fmt(plan_total)}) — план может быть завышен'
        })
    return issues


def check_consistency(filial: dict) -> list:
    """total ≠ atelie + himchistka"""
    issues = []
    fact = filial.get('fact', {})
    atelie = fact.get('atelie', 0)
    himch = fact.get('himchistka', 0)
    total = fact.get('total', 0)

    expected = atelie + himch
    if total > 0 and abs(total - expected) > 100:
        issues.append({
            'severity': 'red',
            'filial': filial.get('name', '?'),
            'message': f'Несовпадение: итого {fmt(total)} ≠ ателье {fmt(atelie)} + химч {fmt(himch)} = {fmt(expected)}'
        })
    return issues


def check_plan_avg_check(filial: dict) -> list:
    """План по среднему чеку нереалистичный (plan.atelie / plan.clients)"""
    issues = []
    plan = filial.get('plan', {})
    plan_atelie = plan.get('atelie', 0)
    plan_clients = plan.get('clients', 0)

    if plan_clients > 0 and plan_atelie > 0:
        plan_avg = round(plan_atelie / plan_clients)
        if plan_avg > AVG_CHECK_MAX:
            issues.append({
                'severity': 'yellow',
                'filial': filial.get('name', '?'),
                'message': f'План ср. чека {fmt(plan_avg)} (= {fmt(plan_atelie)} / {plan_clients} кл.) — выше нормы {AVG_CHECK_MAX}₽'
            })
    return issues


# ═══════════════════════════════════════
# ФОРМАТ ОТЧЁТА
# ═══════════════════════════════════════

def format_audit_report(issues: list, total_filials: int) -> str:
    """Формирует текст отчёта для Telegram"""
    now = datetime.now()
    month_names = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

    header = f"🔍 Ночной аудит — {month_names[now.month]} {now.year}\n\n"

    if not issues:
        return header + f"✅ Все {total_filials} филиалов — норма"

    ok_count = total_filials - len(set(i['filial'] for i in issues))
    reds = [i for i in issues if i['severity'] == 'red']
    yellows = [i for i in issues if i['severity'] == 'yellow']

    lines = [header]
    if ok_count > 0:
        lines.append(f"✅ {ok_count} филиалов — норма")
    lines.append(f"⚠️ {len(issues)} проблем:\n")

    for issue in reds:
        lines.append(f"🔴 {issue['filial']}: {issue['message']}")
    for issue in yellows:
        lines.append(f"🟡 {issue['filial']}: {issue['message']}")

    return '\n'.join(lines)


# ═══════════════════════════════════════
# ОСНОВНАЯ ФУНКЦИЯ (JobQueue callback)
# ═══════════════════════════════════════

async def run_nightly_audit(context):
    """Ночной аудит данных — запускается в 03:00 МСК через JobQueue"""
    logger.info("🔍 Запуск ночного аудита...")

    chat_id = owner_chat_id
    if not chat_id:
        logger.warning("Ночной аудит: owner_chat_id не установлен, пропускаем")
        return

    try:
        data = await sheets_get('getBranches')
    except Exception as e:
        logger.error(f"Ночной аудит: ошибка получения данных: {e}")
        await context.bot.send_message(chat_id=chat_id, text="⚠️ Ночной аудит: не удалось получить данные")
        return

    if not data or not data.get('success') or not data.get('filials'):
        logger.warning("Ночной аудит: данные пустые или ошибка API")
        await context.bot.send_message(chat_id=chat_id, text="⚠️ Ночной аудит: API вернул пустые данные")
        return

    filials = data['filials']
    day_of_month = datetime.now().day
    issues = []

    for f in filials:
        issues += check_avg_check(f)
        issues += check_plan_avg_check(f)
        issues += check_zero_data(f, day_of_month)
        issues += check_himchistka_zero(f, day_of_month)
        issues += check_plan_reality(f, day_of_month)
        issues += check_consistency(f)

    # Сортировка: red сначала
    issues.sort(key=lambda x: 0 if x['severity'] == 'red' else 1)

    report = format_audit_report(issues, len(filials))
    logger.info(f"Ночной аудит завершён: {len(issues)} проблем из {len(filials)} филиалов")

    await context.bot.send_message(chat_id=chat_id, text=report)
