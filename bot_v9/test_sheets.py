#!/usr/bin/env python3
"""
🧪 Тестовый скрипт для проверки gspread подключения.
Запускать ПОСЛЕ настройки сервисного аккаунта:
  python3 test_sheets.py

Что проверяет:
  1. service_account.json существует и читается
  2. Авторизация в Google Sheets API проходит
  3. Таблица открывается
  4. Листы филиалов существуют
  5. Тестовая запись и чтение работают
"""

import sys
import os

# Добавляем путь к модулю
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sheets_direct import SheetsClient, SERVICE_ACCOUNT_FILE, FILIAL_SHEET_NAMES

def main():
    print("=" * 50)
    print("🧪 ТЕСТ GSPREAD ПОДКЛЮЧЕНИЯ")
    print("=" * 50)

    # 1. Проверка файла ключа
    print(f"\n1️⃣  Файл ключа: {SERVICE_ACCOUNT_FILE}")
    if os.path.exists(SERVICE_ACCOUNT_FILE):
        size = os.path.getsize(SERVICE_ACCOUNT_FILE)
        print(f"   ✅ Найден ({size} байт)")
    else:
        print("   ❌ НЕ НАЙДЕН!")
        print("   Скачайте JSON-ключ сервисного аккаунта и положите в эту папку.")
        print("   Подробнее: https://console.cloud.google.com → IAM → Service Accounts")
        sys.exit(1)

    # 2. Авторизация
    print("\n2️⃣  Авторизация в Google Sheets API...")
    try:
        client = SheetsClient()
        gc = client._get_client()
        print("   ✅ Авторизация успешна")
    except Exception as e:
        print(f"   ❌ Ошибка авторизации: {e}")
        sys.exit(1)

    # 3. Открытие таблицы
    print("\n3️⃣  Открытие таблицы ателье...")
    try:
        ss = client._get_spreadsheet()
        print(f"   ✅ Таблица: {ss.title}")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
        print("   Убедитесь что email сервисного аккаунта добавлен как Редактор таблицы.")
        sys.exit(1)

    # 4. Проверка листов
    print("\n4️⃣  Проверка листов филиалов...")
    sheet_titles = [s.title for s in ss.worksheets()]
    print(f"   Листы в таблице: {', '.join(sheet_titles)}")

    for code, name in FILIAL_SHEET_NAMES.items():
        if name in sheet_titles:
            print(f"   ✅ {code} → лист '{name}' найден")
        else:
            print(f"   ⚠️  {code} → лист '{name}' НЕ НАЙДЕН")

    # 5. Тестовое чтение листа М 16 (с пробелом!)
    print("\n5️⃣  Чтение данных листа 'М 16' (первые 5 строк)...")
    try:
        sheet = ss.worksheet('М 16')
        rows = sheet.get_all_values()
        print(f"   Всего строк: {len(rows)}")
        for i, row in enumerate(rows[:5]):
            print(f"   Строка {i+1}: {row[:6]}")
    except Exception as e:
        print(f"   ❌ Ошибка чтения: {e}")

    # 6. Тестовая запись (опциональная)
    print("\n6️⃣  Тестовая запись (DRY RUN)...")
    print("   Для реальной записи запустите:")
    print("   python3 test_sheets.py --write")

    if '--write' in sys.argv:
        from datetime import datetime
        test_date = datetime.now().strftime('%Y-%m-%d')
        print(f"\n   📝 Записываю тестовые данные: М16, {test_date}, 99999₽, 0 кл.")
        result = client.write_branch_daily('М16', test_date, 99999, 0)
        print(f"   Результат: {result}")

        if result.get('success'):
            print("   ✅ Запись успешна! Проверьте таблицу.")
            print("   ⚠️  Не забудьте удалить тестовую строку (99999₽) из таблицы!")
        else:
            print(f"   ❌ Ошибка записи: {result.get('error')}")
    else:
        print("   (пропущено)")

    # 7. Тест задач
    print("\n7️⃣  Чтение задач...")
    try:
        result = client.get_tasks()
        if result.get('success'):
            tasks = result.get('tasks', [])
            print(f"   ✅ Найдено задач: {len(tasks)}")
            for t in tasks[:3]:
                print(f"   • {t.get('task', '?')}")
        else:
            print(f"   ⚠️  {result.get('error', 'нет листа ЗАДАЧИ')}")
    except Exception as e:
        print(f"   ❌ {e}")

    print("\n" + "=" * 50)
    print("✅ ТЕСТ ЗАВЕРШЁН")
    print("=" * 50)


if __name__ == '__main__':
    main()
