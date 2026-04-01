#!/usr/bin/env python3
"""
seed_calendar.py — Одноразовый скрипт для заполнения Google Calendar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Создаёт повторяющиеся события:
  1. Кредитные платежи (из config.CREDITS)
  2. Арендные платежи (из config.RENT)

Запуск: python seed_calendar.py
⚠️ Запускать ОДИН раз! Повторный запуск создаст дубликаты.
"""

import sys
import os

# Добавляем текущую директорию в PATH
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import GOOGLE_CALENDAR_ID
from planner import CalendarClient, seed_recurring_payments, seed_rent_payments


def main():
    if not GOOGLE_CALENDAR_ID:
        print("❌ GOOGLE_CALENDAR_ID не задан в config.py")
        print()
        print("Инструкция:")
        print("1. Открой Google Calendar → Настройки")
        print("2. Создай новый календарь 'DressCode'")
        print("3. Расшарь его на email сервисного аккаунта")
        print("   (найди client_email в service_account.json)")
        print("4. Скопируй ID календаря в config.py → GOOGLE_CALENDAR_ID")
        return

    print("=" * 55)
    print("📅 ЗАПОЛНЕНИЕ GOOGLE CALENDAR")
    print("=" * 55)
    print(f"\nCalendar ID: {GOOGLE_CALENDAR_ID}")
    print()

    cal = CalendarClient(calendar_id=GOOGLE_CALENDAR_ID)

    if not cal.is_available():
        print("❌ Не удалось подключиться к Google Calendar")
        print("   Проверь service_account.json и права доступа")
        return

    # Кредитные платежи
    print("💳 Создаю кредитные платежи...")
    credit_results = seed_recurring_payments(cal)
    for r in credit_results:
        status = "✅" if r['result'].get('success') else "❌"
        print(f"  {status} {r['credit']} (день {r['day']})")

    print()

    # Арендные платежи
    print("🏠 Создаю арендные платежи...")
    rent_results = seed_rent_payments(cal)
    for r in rent_results:
        status = "✅" if r['result'].get('success') else "❌"
        amount_str = f"{r['amount']:,.0f}₽".replace(',', ' ')
        print(f"  {status} {r['branch']} — {amount_str}")

    print()
    total = len(credit_results) + len(rent_results)
    ok = sum(1 for r in credit_results + rent_results if r['result'].get('success'))
    print(f"Итого: {ok}/{total} событий создано")
    print()
    print("⚠️ НЕ запускай этот скрипт повторно — будут дубликаты!")


if __name__ == '__main__':
    main()
