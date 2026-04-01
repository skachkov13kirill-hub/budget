#!/usr/bin/env python3
"""
⚠️ DEPRECATED (2026-04-01) — НЕ ИСПОЛЬЗУЕТСЯ
Активный модуль: sheets_api.py (HTTP через Apps Script)
Этот файл оставлен для справки, не импортируется нигде.

📊 sheets_direct.py — Прямая работа с Google Sheets через gspread
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Заменяет цепочку: sheets_post → Apps Script → Google Sheets
На прямую:        gspread → Google Sheets

Требует:
  pip install gspread google-auth
  + файл service_account.json (ключ сервисного аккаунта Google)

Использование:
  from sheets_direct import SheetsClient
  sheets = SheetsClient()
  result = sheets.write_branch_daily('М16', '2026-02-25', 20000, 1)
"""

import os
import logging
from datetime import datetime, date

import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# КОНФИГУРАЦИЯ
# ═══════════════════════════════════════════════════════════════

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
]

# ID таблицы ателье (из config.py / Apps Script)
ATELIE_SPREADSHEET_ID = '1cRdejpUv8gRyNTQVJPw16pp44FqmX6CZUSdUkWcUa40'

# Путь к файлу сервисного аккаунта
SERVICE_ACCOUNT_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'service_account.json'
)

# Маппинг: код филиала → название листа в таблице
# ⚠️ В таблице листы с ПРОБЕЛАМИ: "М 16", "В 8" и т.д.
FILIAL_SHEET_NAMES = {
    'М16': 'М 16', 'В8': 'В 8', 'П14': 'П 14', 'А6': 'А 6', 'Г4': 'Г 4',
    'В22': 'В 22', 'Ек8': 'Ек 8', 'В20': 'В 20', 'Ек17': 'Ек 17', 'Г11': 'Г 11'
}


# ═══════════════════════════════════════════════════════════════
# КЛИЕНТ
# ═══════════════════════════════════════════════════════════════

class SheetsClient:
    """Обёртка над gspread для работы с таблицей ателье."""

    def __init__(self, credentials_file=None):
        self._gc = None
        self._ss = None
        self._creds_file = credentials_file or SERVICE_ACCOUNT_FILE

    def _get_client(self):
        """Ленивая инициализация клиента gspread."""
        if self._gc is None:
            creds = Credentials.from_service_account_file(
                self._creds_file, scopes=SCOPES
            )
            self._gc = gspread.authorize(creds)
            logger.info("gspread: клиент авторизован")
        return self._gc

    def _get_spreadsheet(self):
        """Получает объект таблицы (кешируется)."""
        if self._ss is None:
            client = self._get_client()
            self._ss = client.open_by_key(ATELIE_SPREADSHEET_ID)
            logger.info(f"gspread: таблица открыта ({ATELIE_SPREADSHEET_ID})")
        return self._ss

    def _get_sheet(self, branch: str):
        """Получает лист по названию филиала."""
        sheet_name = FILIAL_SHEET_NAMES.get(branch)
        if not sheet_name:
            return None, f'Неизвестный филиал: {branch}'
        try:
            ss = self._get_spreadsheet()
            sheet = ss.worksheet(sheet_name)
            return sheet, None
        except gspread.exceptions.WorksheetNotFound:
            return None, f'Лист не найден: {sheet_name}'
        except Exception as e:
            return None, str(e)

    # ═══════════════════════════════════════════════════════════
    # ЗАПИСЬ ЕЖЕДНЕВНЫХ ДАННЫХ ФИЛИАЛА
    # ═══════════════════════════════════════════════════════════

    def write_branch_daily(self, branch: str, date_str: str,
                           turnover: float, clients: int,
                           himchistka: float = 0) -> dict:
        """
        Записывает данные филиала за день.
        Полный аналог handleWriteBranchDaily из Apps Script.

        Args:
            branch: код филиала ('М16', 'В8', ...)
            date_str: дата в формате 'YYYY-MM-DD'
            turnover: оборот (ателье)
            clients: количество клиентов
            himchistka: выручка химчистки (по умолчанию 0)

        Returns:
            dict: {'success': True/False, 'action': 'updated'/'appended', ...}
        """
        try:
            if not branch:
                return {'success': False, 'error': 'branch не указан'}
            if not date_str:
                return {'success': False, 'error': 'date не указана'}

            sheet, error = self._get_sheet(branch)
            if error:
                return {'success': False, 'error': error}

            # Получаем все данные листа
            rows = sheet.get_all_values()
            target = date_str[:10]  # "2026-02-25"

            # Ищем строку с нужной датой (колонка B = индекс 1)
            for i, row in enumerate(rows):
                cell_val = row[1] if len(row) > 1 else ''

                # Дата может быть в разных форматах:
                # "2026-02-25", "25.02.2026", Date object → string
                cell_date = self._normalize_date(cell_val)

                if cell_date == target:
                    # Обновляем существующую строку
                    row_num = i + 1  # gspread 1-indexed
                    # Batch update для минимизации запросов
                    sheet.update_cell(row_num, 3, turnover)   # col C = ателье
                    sheet.update_cell(row_num, 4, clients)    # col D = клиенты
                    if himchistka > 0:
                        sheet.update_cell(row_num, 6, himchistka)  # col F

                    logger.info(
                        f"gspread: обновлён {branch} за {target} "
                        f"(строка {row_num}): {turnover}₽, {clients} кл."
                    )
                    return {
                        'success': True,
                        'action': 'updated',
                        'branch': branch,
                        'date': target,
                        'row': row_num,
                        'atelie': turnover,
                        'clients': clients
                    }

            # Строки с такой датой нет — добавляем в конец
            last_row = len(rows) + 1
            sheet.update_cell(last_row, 2, date_str)       # col B = дата
            sheet.update_cell(last_row, 3, turnover)       # col C = ателье
            sheet.update_cell(last_row, 4, clients)        # col D = клиенты
            sheet.update_cell(last_row, 6, himchistka)     # col F = химчистка

            logger.info(
                f"gspread: добавлен {branch} за {target} "
                f"(строка {last_row}): {turnover}₽, {clients} кл."
            )
            return {
                'success': True,
                'action': 'appended',
                'branch': branch,
                'date': target,
                'row': last_row,
                'atelie': turnover,
                'clients': clients
            }

        except Exception as e:
            logger.error(f"gspread write_branch_daily error: {e}")
            return {'success': False, 'error': str(e)}

    # ═══════════════════════════════════════════════════════════
    # ЧТЕНИЕ ДАННЫХ ФИЛИАЛОВ (для getBranches)
    # ═══════════════════════════════════════════════════════════

    def get_branches_today(self, date_str: str = None) -> dict:
        """
        Получает данные всех филиалов за сегодня.
        Аналог handleGetBranches из Apps Script (упрощённый).

        Returns:
            dict: {'success': True, 'branches': {name: {atelie, clients}, ...}}
        """
        try:
            if not date_str:
                date_str = datetime.now().strftime('%Y-%m-%d')

            target = date_str[:10]
            branches = {}

            for branch_code, sheet_name in FILIAL_SHEET_NAMES.items():
                try:
                    ss = self._get_spreadsheet()
                    sheet = ss.worksheet(sheet_name)
                    rows = sheet.get_all_values()

                    found = False
                    for row in rows:
                        cell_val = row[1] if len(row) > 1 else ''
                        cell_date = self._normalize_date(cell_val)
                        if cell_date == target:
                            atelie = self._parse_num(row[2]) if len(row) > 2 else 0
                            clients = self._parse_int(row[3]) if len(row) > 3 else 0
                            branches[branch_code] = {
                                'atelie': atelie,
                                'clients': clients,
                                'date': target
                            }
                            found = True
                            break

                    if not found:
                        branches[branch_code] = {
                            'atelie': 0,
                            'clients': 0,
                            'date': target,
                            'note': 'нет данных'
                        }

                except Exception as e:
                    branches[branch_code] = {
                        'atelie': 0, 'clients': 0,
                        'error': str(e)
                    }

            return {'success': True, 'branches': branches, 'date': target}

        except Exception as e:
            logger.error(f"gspread get_branches_today error: {e}")
            return {'success': False, 'error': str(e)}

    # ═══════════════════════════════════════════════════════════
    # ЗАДАЧИ
    # ═══════════════════════════════════════════════════════════

    def add_task(self, task_text: str, date_str: str = None,
                 added_at: str = None) -> dict:
        """
        Добавляет задачу в лист ЗАДАЧИ.
        Аналог handleAddTask из Apps Script.
        """
        try:
            if not task_text:
                return {'success': False, 'error': 'Текст задачи пуст'}

            if not date_str:
                date_str = datetime.now().strftime('%Y-%m-%d')
            if not added_at:
                added_at = datetime.now().isoformat()

            ss = self._get_spreadsheet()
            try:
                sheet = ss.worksheet('ЗАДАЧИ')
            except gspread.exceptions.WorksheetNotFound:
                # Создаём лист если не существует
                sheet = ss.add_worksheet(title='ЗАДАЧИ', rows=100, cols=4)
                sheet.update_cell(1, 1, 'Задача')
                sheet.update_cell(1, 2, 'Дата')
                sheet.update_cell(1, 3, 'Добавлено')
                sheet.update_cell(1, 4, 'Выполнено')

            last_row = len(sheet.get_all_values()) + 1
            sheet.update_cell(last_row, 1, task_text)
            sheet.update_cell(last_row, 2, date_str)
            sheet.update_cell(last_row, 3, added_at)

            logger.info(f"gspread: задача добавлена: {task_text[:50]}")
            return {'success': True, 'row': last_row}

        except Exception as e:
            logger.error(f"gspread add_task error: {e}")
            return {'success': False, 'error': str(e)}

    def get_tasks(self) -> dict:
        """
        Получает список задач из листа ЗАДАЧИ.
        Аналог handleGetTasks из Apps Script.
        """
        try:
            ss = self._get_spreadsheet()
            try:
                sheet = ss.worksheet('ЗАДАЧИ')
            except gspread.exceptions.WorksheetNotFound:
                return {'success': True, 'tasks': []}

            rows = sheet.get_all_values()
            tasks = []

            # Пропускаем заголовок (первая строка)
            for i, row in enumerate(rows[1:], start=2):
                task_text = row[0] if len(row) > 0 else ''
                task_date = row[1] if len(row) > 1 else ''
                done = row[3] if len(row) > 3 else ''

                if task_text and not done:  # только невыполненные
                    tasks.append({
                        'task': task_text,
                        'date': task_date,
                        'row': i
                    })

            return {'success': True, 'tasks': tasks}

        except Exception as e:
            logger.error(f"gspread get_tasks error: {e}")
            return {'success': False, 'error': str(e)}

    # ═══════════════════════════════════════════════════════════
    # УТИЛИТЫ
    # ═══════════════════════════════════════════════════════════

    @staticmethod
    def _normalize_date(val: str) -> str:
        """
        Приводит дату к формату YYYY-MM-DD.
        Поддерживает: '2026-02-25', '25.02.2026', '02/25/2026'
        """
        if not val or not isinstance(val, str):
            return ''

        val = val.strip()

        # Уже в формате YYYY-MM-DD
        if len(val) >= 10 and val[4] == '-':
            return val[:10]

        # Формат DD.MM.YYYY или DD.MM.YY
        if '.' in val:
            parts = val.split('.')
            if len(parts) == 3:
                if len(parts[2]) == 4:
                    try:
                        d = datetime.strptime(val.strip(), '%d.%m.%Y')
                        return d.strftime('%Y-%m-%d')
                    except ValueError:
                        pass
                elif len(parts[2]) == 2:
                    try:
                        d = datetime.strptime(val.strip(), '%d.%m.%y')
                        return d.strftime('%Y-%m-%d')
                    except ValueError:
                        pass

        # Формат MM/DD/YYYY (Google Sheets иногда так отдаёт)
        if '/' in val:
            try:
                d = datetime.strptime(val[:10], '%m/%d/%Y')
                return d.strftime('%Y-%m-%d')
            except ValueError:
                pass

        return ''

    @staticmethod
    def _parse_num(val) -> float:
        """Парсит число из строки (с пробелами, запятыми)."""
        if isinstance(val, (int, float)):
            return float(val)
        if not val:
            return 0.0
        try:
            clean = str(val).replace(' ', '').replace(',', '.').replace('₽', '')
            return float(clean)
        except ValueError:
            return 0.0

    @staticmethod
    def _parse_int(val) -> int:
        """Парсит целое число."""
        if isinstance(val, int):
            return val
        if not val:
            return 0
        try:
            clean = str(val).replace(' ', '')
            return int(float(clean))
        except ValueError:
            return 0
