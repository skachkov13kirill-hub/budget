#!/usr/bin/env python3
"""
planner.py — Модуль планирования: задачи + Google Calendar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Функции:
  1. Расширенные задачи (приоритет, категория, дедлайн, статус)
  2. Google Calendar API (создание/чтение событий)
  3. Утренняя/вечерняя сводка (план дня)
  4. Автоматические напоминания о платежах и аренде
"""

import os
import logging
import re
from datetime import datetime, timedelta, date
from typing import Optional

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger('dresscode_bot')

# ═══════════════════════════════════════════════════════════════
# КОНФИГУРАЦИЯ
# ═══════════════════════════════════════════════════════════════

SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
]

SERVICE_ACCOUNT_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'service_account.json'
)

# Категории задач
CATEGORIES = {
    'business': '💼 Бизнес',
    'finance': '💰 Финансы',
    'personal': '🏠 Личное',
    'health': '🏃 Здоровье',
    'family': '👨‍👩‍👧 Семья',
}

PRIORITY_ICONS = {1: '🔴', 2: '🟡', 3: '🟢'}
STATUS_ICONS = {'todo': '⬜', 'in_progress': '🔄', 'done': '✅', 'cancelled': '❌'}


# ═══════════════════════════════════════════════════════════════
# GOOGLE CALENDAR CLIENT
# ═══════════════════════════════════════════════════════════════

class CalendarClient:
    """Клиент для работы с Google Calendar API."""

    def __init__(self, credentials_file=None, calendar_id=None):
        self._service = None
        self._creds_file = credentials_file or SERVICE_ACCOUNT_FILE
        self._calendar_id = calendar_id  # Устанавливается из config
        self._initialized = False

    def _get_service(self):
        """Ленивая инициализация Calendar API."""
        if self._service is None:
            try:
                creds = Credentials.from_service_account_file(
                    self._creds_file, scopes=SCOPES
                )
                self._service = build('calendar', 'v3', credentials=creds)
                self._initialized = True
                logger.info("Google Calendar: клиент авторизован")
            except Exception as e:
                logger.error(f"Google Calendar init error: {e}")
                raise
        return self._service

    @property
    def calendar_id(self):
        return self._calendar_id or 'primary'

    @calendar_id.setter
    def calendar_id(self, value):
        self._calendar_id = value

    def is_available(self) -> bool:
        """Проверяет доступность Calendar API."""
        try:
            self._get_service()
            return True
        except Exception:
            return False

    # ─── СОЗДАНИЕ СОБЫТИЙ ───

    def create_event(self, summary: str, start_dt: datetime,
                     end_dt: datetime = None, description: str = '',
                     color_id: str = None, reminders_minutes: list = None) -> dict:
        """Создаёт событие в Google Calendar."""
        try:
            service = self._get_service()

            if end_dt is None:
                end_dt = start_dt + timedelta(hours=1)

            event_body = {
                'summary': summary,
                'description': description,
                'start': {
                    'dateTime': start_dt.isoformat(),
                    'timeZone': 'Asia/Yekaterinburg',
                },
                'end': {
                    'dateTime': end_dt.isoformat(),
                    'timeZone': 'Asia/Yekaterinburg',
                },
            }

            if color_id:
                event_body['colorId'] = color_id

            if reminders_minutes:
                event_body['reminders'] = {
                    'useDefault': False,
                    'overrides': [
                        {'method': 'popup', 'minutes': m} for m in reminders_minutes
                    ]
                }

            event = service.events().insert(
                calendarId=self.calendar_id,
                body=event_body
            ).execute()

            logger.info(f"Calendar: создано событие '{summary}' на {start_dt}")
            return {'success': True, 'event_id': event.get('id'), 'link': event.get('htmlLink')}

        except Exception as e:
            logger.error(f"Calendar create_event error: {e}")
            return {'success': False, 'error': str(e)}

    def create_all_day_event(self, summary: str, event_date: date,
                             description: str = '', color_id: str = None) -> dict:
        """Создаёт событие на весь день."""
        try:
            service = self._get_service()
            next_day = event_date + timedelta(days=1)

            event_body = {
                'summary': summary,
                'description': description,
                'start': {'date': event_date.isoformat()},
                'end': {'date': next_day.isoformat()},
            }

            if color_id:
                event_body['colorId'] = color_id

            event = service.events().insert(
                calendarId=self.calendar_id,
                body=event_body
            ).execute()

            logger.info(f"Calendar: создано событие на весь день '{summary}' на {event_date}")
            return {'success': True, 'event_id': event.get('id'), 'link': event.get('htmlLink')}

        except Exception as e:
            logger.error(f"Calendar create_all_day_event error: {e}")
            return {'success': False, 'error': str(e)}

    def create_recurring_event(self, summary: str, start_dt: datetime,
                               end_dt: datetime = None, description: str = '',
                               rrule: str = '', color_id: str = None,
                               reminders_minutes: list = None) -> dict:
        """Создаёт повторяющееся событие (RRULE)."""
        try:
            service = self._get_service()

            if end_dt is None:
                end_dt = start_dt + timedelta(hours=1)

            event_body = {
                'summary': summary,
                'description': description,
                'start': {
                    'dateTime': start_dt.isoformat(),
                    'timeZone': 'Asia/Yekaterinburg',
                },
                'end': {
                    'dateTime': end_dt.isoformat(),
                    'timeZone': 'Asia/Yekaterinburg',
                },
            }

            if rrule:
                event_body['recurrence'] = [rrule]

            if color_id:
                event_body['colorId'] = color_id

            if reminders_minutes:
                event_body['reminders'] = {
                    'useDefault': False,
                    'overrides': [
                        {'method': 'popup', 'minutes': m} for m in reminders_minutes
                    ]
                }

            event = service.events().insert(
                calendarId=self.calendar_id,
                body=event_body
            ).execute()

            logger.info(f"Calendar: создано повторяющееся событие '{summary}'")
            return {'success': True, 'event_id': event.get('id'), 'link': event.get('htmlLink')}

        except Exception as e:
            logger.error(f"Calendar create_recurring error: {e}")
            return {'success': False, 'error': str(e)}

    # ─── ЧТЕНИЕ СОБЫТИЙ ───

    def get_events_today(self) -> list:
        """Возвращает все события на сегодня."""
        now = datetime.now()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        return self.get_events(start, end)

    def get_events_tomorrow(self) -> list:
        """Возвращает все события на завтра."""
        tomorrow = datetime.now() + timedelta(days=1)
        start = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        return self.get_events(start, end)

    def get_events_week(self) -> list:
        """Возвращает события на ближайшие 7 дней."""
        now = datetime.now()
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        return self.get_events(start, end)

    def get_events(self, time_min: datetime, time_max: datetime,
                   max_results: int = 50) -> list:
        """Получает события за указанный период."""
        try:
            service = self._get_service()

            events_result = service.events().list(
                calendarId=self.calendar_id,
                timeMin=time_min.isoformat() + 'Z' if time_min.tzinfo is None
                    else time_min.isoformat(),
                timeMax=time_max.isoformat() + 'Z' if time_max.tzinfo is None
                    else time_max.isoformat(),
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime'
            ).execute()

            items = events_result.get('items', [])
            events = []
            for item in items:
                start = item['start'].get('dateTime', item['start'].get('date'))
                end = item['end'].get('dateTime', item['end'].get('date'))
                events.append({
                    'id': item.get('id'),
                    'summary': item.get('summary', '(без названия)'),
                    'description': item.get('description', ''),
                    'start': start,
                    'end': end,
                    'all_day': 'date' in item['start'],
                    'link': item.get('htmlLink', ''),
                    'color_id': item.get('colorId', ''),
                })

            return events

        except Exception as e:
            logger.error(f"Calendar get_events error: {e}")
            return []

    # ─── УДАЛЕНИЕ ───

    def delete_event(self, event_id: str) -> dict:
        """Удаляет событие по ID."""
        try:
            service = self._get_service()
            service.events().delete(
                calendarId=self.calendar_id,
                eventId=event_id
            ).execute()
            logger.info(f"Calendar: удалено событие {event_id}")
            return {'success': True}
        except Exception as e:
            logger.error(f"Calendar delete_event error: {e}")
            return {'success': False, 'error': str(e)}


# ═══════════════════════════════════════════════════════════════
# ПЛАНИРОВЩИК — ОБЪЕДИНЯЕТ ЗАДАЧИ + КАЛЕНДАРЬ
# ═══════════════════════════════════════════════════════════════

class Planner:
    """Центральный планировщик: задачи + события + сводки."""

    def __init__(self, calendar_client: CalendarClient = None,
                 sheets_client=None):
        self.calendar = calendar_client or CalendarClient()
        self.sheets = sheets_client  # SheetsClient из sheets_direct.py

    # ─── ЗАДАЧИ (расширенные) ───

    def add_task(self, text: str, category: str = 'business',
                 priority: int = 2, deadline: str = '',
                 create_calendar_event: bool = True) -> dict:
        """
        Добавляет задачу в Sheets + опционально в Calendar.

        Args:
            text: текст задачи
            category: business/finance/personal/health/family
            priority: 1 (высокий), 2 (средний), 3 (низкий)
            deadline: дата дедлайна 'YYYY-MM-DD' или 'YYYY-MM-DD HH:MM'
            create_calendar_event: создавать ли событие в календаре
        """
        result = {'success': False}
        now = datetime.now()
        event_id = ''

        # Нормализуем категорию
        if category not in CATEGORIES:
            category = 'business'

        # Записываем в Sheets (расширенный формат)
        if self.sheets:
            try:
                sheet_result = self.sheets.add_task_extended(
                    task_text=text,
                    category=category,
                    priority=priority,
                    deadline=deadline,
                    status='todo',
                    date_str=now.strftime('%Y-%m-%d'),
                    added_at=now.isoformat()
                )
                result['sheets'] = sheet_result
            except Exception as e:
                logger.error(f"Planner add_task sheets error: {e}")
                result['sheets'] = {'success': False, 'error': str(e)}

        # Создаём событие в Calendar если есть дедлайн
        if create_calendar_event and deadline and self.calendar.is_available():
            try:
                cal_summary = f"{PRIORITY_ICONS.get(priority, '🟡')} {text}"
                cal_desc = f"Категория: {CATEGORIES.get(category, category)}\nПриоритет: {priority}"

                # Парсим дедлайн
                if len(deadline) > 10:
                    # Формат YYYY-MM-DD HH:MM
                    dt = datetime.strptime(deadline[:16], '%Y-%m-%d %H:%M')
                    cal_result = self.calendar.create_event(
                        summary=cal_summary,
                        start_dt=dt,
                        end_dt=dt + timedelta(minutes=30),
                        description=cal_desc,
                        color_id=_priority_to_color(priority),
                        reminders_minutes=[30, 10]
                    )
                else:
                    # Формат YYYY-MM-DD → событие на весь день
                    dt = datetime.strptime(deadline[:10], '%Y-%m-%d').date()
                    cal_result = self.calendar.create_all_day_event(
                        summary=cal_summary,
                        event_date=dt,
                        description=cal_desc,
                        color_id=_priority_to_color(priority)
                    )

                result['calendar'] = cal_result
                if cal_result.get('success'):
                    event_id = cal_result.get('event_id', '')

            except Exception as e:
                logger.error(f"Planner add_task calendar error: {e}")
                result['calendar'] = {'success': False, 'error': str(e)}

        # Обновляем event_id в Sheets если создали событие
        if event_id and self.sheets and result.get('sheets', {}).get('success'):
            try:
                row = result['sheets'].get('row')
                if row:
                    self.sheets.update_task_event_id(row, event_id)
            except Exception as e:
                logger.warning(f"Planner: не удалось записать event_id: {e}")

        result['success'] = True
        result['text'] = text
        result['category'] = category
        result['priority'] = priority
        result['deadline'] = deadline
        return result

    def complete_task(self, task_row: int) -> dict:
        """Отмечает задачу как выполненную."""
        if not self.sheets:
            return {'success': False, 'error': 'Sheets не подключён'}

        try:
            result = self.sheets.complete_task(task_row)
            return result
        except Exception as e:
            logger.error(f"Planner complete_task error: {e}")
            return {'success': False, 'error': str(e)}

    def get_tasks(self, category: str = None, status: str = 'todo') -> list:
        """Получает задачи с фильтрацией."""
        if not self.sheets:
            return []

        try:
            result = self.sheets.get_tasks_extended(
                category=category, status=status
            )
            if result.get('success'):
                return result.get('tasks', [])
            return []
        except Exception as e:
            logger.error(f"Planner get_tasks error: {e}")
            return []

    # ─── СВОДКИ ───

    def get_morning_digest(self) -> str:
        """Утренняя сводка: события + задачи + платежи."""
        lines = []
        today = datetime.now()
        today_str = today.strftime('%d.%m.%Y')
        weekday_names = ['Понедельник', 'Вторник', 'Среда', 'Четверг',
                         'Пятница', 'Суббота', 'Воскресенье']
        weekday = weekday_names[today.weekday()]

        lines.append(f"☀️ *{weekday}, {today_str}*\n")

        # 1. События из календаря
        if self.calendar.is_available():
            events = self.calendar.get_events_today()
            if events:
                lines.append("📅 *Расписание:*")
                for ev in events:
                    time_str = _format_event_time(ev)
                    lines.append(f"  {time_str} — {ev['summary']}")
                lines.append("")

        # 2. Задачи на сегодня
        tasks = self.get_tasks(status='todo')
        today_tasks = [t for t in tasks if t.get('deadline', '').startswith(today.strftime('%Y-%m-%d'))]
        overdue_tasks = [t for t in tasks if t.get('deadline') and t['deadline'][:10] < today.strftime('%Y-%m-%d')]

        if overdue_tasks:
            lines.append(f"🔴 *Просрочено ({len(overdue_tasks)}):*")
            for t in overdue_tasks[:5]:
                icon = PRIORITY_ICONS.get(t.get('priority', 2), '🟡')
                lines.append(f"  {icon} {t['task']} _{t.get('deadline', '')[:10]}_")
            lines.append("")

        if today_tasks:
            lines.append(f"✅ *Задачи на сегодня ({len(today_tasks)}):*")
            for t in today_tasks:
                icon = PRIORITY_ICONS.get(t.get('priority', 2), '🟡')
                cat = CATEGORIES.get(t.get('category', ''), '')
                lines.append(f"  {icon} {t['task']} {cat}")
            lines.append("")

        # 3. Задачи без дедлайна (высокий приоритет)
        no_deadline_urgent = [t for t in tasks if not t.get('deadline') and t.get('priority', 2) == 1]
        if no_deadline_urgent:
            lines.append(f"🔴 *Срочные без дедлайна:*")
            for t in no_deadline_urgent[:3]:
                lines.append(f"  🔴 {t['task']}")
            lines.append("")

        # 4. Финансовые напоминания (платежи близко)
        payment_reminders = self._get_payment_reminders(today)
        if payment_reminders:
            lines.append("💳 *Платежи:*")
            for r in payment_reminders:
                lines.append(f"  {r}")
            lines.append("")

        if len(lines) == 1:
            lines.append("📭 На сегодня ничего не запланировано.\nДобавь: «Запланируй: ...»")

        return '\n'.join(lines)

    def get_week_plan(self) -> str:
        """План на неделю: события + задачи по дням."""
        lines = []
        today = datetime.now()
        weekday_names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

        lines.append("📋 *План на неделю:*\n")

        # Получаем события на неделю
        events = []
        if self.calendar.is_available():
            events = self.calendar.get_events_week()

        # Получаем задачи
        tasks = self.get_tasks(status='todo')

        for day_offset in range(7):
            day = today + timedelta(days=day_offset)
            day_str = day.strftime('%Y-%m-%d')
            day_display = day.strftime('%d.%m')
            wd = weekday_names[day.weekday()]

            # События на этот день
            day_events = [e for e in events if e['start'][:10] == day_str]
            # Задачи на этот день
            day_tasks = [t for t in tasks if t.get('deadline', '')[:10] == day_str]

            if day_events or day_tasks:
                is_today = "*(сегодня)*" if day_offset == 0 else ""
                lines.append(f"*{wd} {day_display}* {is_today}")

                for ev in day_events:
                    time_str = _format_event_time(ev)
                    lines.append(f"  📅 {time_str} {ev['summary']}")

                for t in day_tasks:
                    icon = PRIORITY_ICONS.get(t.get('priority', 2), '🟡')
                    lines.append(f"  {icon} {t['task']}")

                lines.append("")

        if len(lines) == 1:
            lines.append("📭 На неделю ничего не запланировано.")

        return '\n'.join(lines)

    def get_today_plan(self) -> str:
        """Подробный план на сегодня."""
        lines = []
        today = datetime.now()
        today_str = today.strftime('%d.%m.%Y')

        lines.append(f"📅 *План на сегодня ({today_str}):*\n")

        # События
        if self.calendar.is_available():
            events = self.calendar.get_events_today()
            if events:
                lines.append("*Расписание:*")
                for ev in events:
                    time_str = _format_event_time(ev)
                    desc = f"\n    _{ev['description'][:80]}_" if ev.get('description') else ""
                    lines.append(f"  {time_str} — {ev['summary']}{desc}")
                lines.append("")

        # Задачи
        tasks = self.get_tasks(status='todo')
        today_date = today.strftime('%Y-%m-%d')
        today_tasks = [t for t in tasks if t.get('deadline', '')[:10] == today_date]
        no_deadline = [t for t in tasks if not t.get('deadline')]

        if today_tasks:
            lines.append(f"*Задачи ({len(today_tasks)}):*")
            for i, t in enumerate(today_tasks, 1):
                icon = PRIORITY_ICONS.get(t.get('priority', 2), '🟡')
                cat_key = t.get('category', '')
                cat = CATEGORIES.get(cat_key, '')
                lines.append(f"  {icon} {i}. {t['task']} {cat}")
            lines.append("")

        if no_deadline:
            lines.append(f"*Без дедлайна ({len(no_deadline)}):*")
            for t in sorted(no_deadline, key=lambda x: x.get('priority', 2))[:7]:
                icon = PRIORITY_ICONS.get(t.get('priority', 2), '🟡')
                lines.append(f"  {icon} {t['task']}")
            lines.append("")

        if len(lines) == 1:
            lines.append("📭 Нет задач и событий на сегодня.")

        return '\n'.join(lines)

    # ─── ВНУТРЕННИЕ ───

    def _get_payment_reminders(self, today: datetime) -> list:
        """Проверяет предстоящие платежи по кредитам."""
        reminders = []
        try:
            from config import CREDITS, RENT
            day_of_month = today.day

            for c in CREDITS:
                pay_day = c.get('day', 0)
                if pay_day == 0:
                    continue
                days_to = pay_day - day_of_month
                if days_to < 0:
                    days_to += 30  # примерно
                if 0 <= days_to <= 3:
                    if days_to == 0:
                        reminders.append(f"💳 *Сегодня:* {c['name']} — {c['payment']:,.0f}₽".replace(',', ' '))
                    else:
                        reminders.append(f"💳 Через {days_to}д: {c['name']} — {c['payment']:,.0f}₽".replace(',', ' '))

        except ImportError:
            pass
        return reminders


# ═══════════════════════════════════════════════════════════════
# ПАРСИНГ ЗАДАЧ ИЗ ТЕКСТА
# ═══════════════════════════════════════════════════════════════

def parse_task_from_text(text: str) -> dict:
    """
    Парсит задачу из свободного текста.
    Примеры:
        "Позвонить юристу завтра" → deadline=tomorrow
        "Оплатить аренду М16 15 марта приоритет 1" → deadline=15.03, priority=1
        "Купить подарок жене" → no deadline, category=family
    """
    result = {
        'task': text.strip(),
        'category': 'business',
        'priority': 2,
        'deadline': '',
    }

    t = text.lower()

    # Определяем категорию по ключевым словам
    if any(w in t for w in ['аренд', 'оплат', 'кредит', 'платёж', 'платеж', 'банк', 'счёт', 'счет']):
        result['category'] = 'finance'
    elif any(w in t for w in ['жен', 'муж', 'ребён', 'семь', 'дом', 'подарок']):
        result['category'] = 'family'
    elif any(w in t for w in ['тренир', 'бег', 'спорт', 'здоров', 'врач', 'больниц']):
        result['category'] = 'health'
    elif any(w in t for w in ['отдых', 'личн', 'хобби', 'книг', 'фильм']):
        result['category'] = 'personal'
    elif any(w in t for w in ['филиал', 'ателье', 'портн', 'заказ', 'клиент', 'сеть']):
        result['category'] = 'business'

    # Определяем приоритет
    priority_match = re.search(r'приоритет\s*(\d)', t)
    if priority_match:
        p = int(priority_match.group(1))
        result['priority'] = max(1, min(3, p))
        result['task'] = re.sub(r'\s*приоритет\s*\d', '', result['task']).strip()

    if any(w in t for w in ['срочно', 'urgent', 'немедленно', 'ASAP', 'критичн']):
        result['priority'] = 1

    # Определяем дедлайн
    today = datetime.now()

    if 'сегодня' in t:
        result['deadline'] = today.strftime('%Y-%m-%d')
        result['task'] = result['task'].replace('сегодня', '').strip()
    elif 'завтра' in t:
        result['deadline'] = (today + timedelta(days=1)).strftime('%Y-%m-%d')
        result['task'] = result['task'].replace('завтра', '').strip()
    elif 'послезавтра' in t:
        result['deadline'] = (today + timedelta(days=2)).strftime('%Y-%m-%d')
        result['task'] = result['task'].replace('послезавтра', '').strip()
    else:
        # Ищем дату в формате "15 марта", "15.03", "15/03"
        months_ru = {
            'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4,
            'мая': 5, 'май': 5, 'июн': 6, 'июл': 7, 'август': 8,
            'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12
        }

        for month_name, month_num in months_ru.items():
            date_match = re.search(rf'(\d{{1,2}})\s*{month_name}\w*', t)
            if date_match:
                day = int(date_match.group(1))
                year = today.year
                if month_num < today.month or (month_num == today.month and day < today.day):
                    year += 1
                try:
                    result['deadline'] = f"{year}-{month_num:02d}-{day:02d}"
                    result['task'] = re.sub(rf'\s*\d{{1,2}}\s*{month_name}\w*', '', result['task']).strip()
                except ValueError:
                    pass
                break

        # Формат DD.MM или DD.MM.YYYY
        date_dot = re.search(r'(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?', text)
        if date_dot and not result['deadline']:
            day = int(date_dot.group(1))
            month = int(date_dot.group(2))
            year_str = date_dot.group(3)
            year = int(year_str) if year_str else today.year
            if year < 100:
                year += 2000
            try:
                datetime(year, month, day)
                result['deadline'] = f"{year}-{month:02d}-{day:02d}"
                result['task'] = text[:date_dot.start()].strip() + text[date_dot.end():].strip()
                result['task'] = result['task'].strip()
            except ValueError:
                pass

    # Ищем время HH:MM
    time_match = re.search(r'в\s*(\d{1,2})[:\.](\d{2})', t)
    if time_match and result['deadline']:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            result['deadline'] += f" {hour:02d}:{minute:02d}"
            result['task'] = re.sub(r'\s*в\s*\d{1,2}[:.]\d{2}', '', result['task']).strip()

    # Чистим текст задачи от лишних пробелов
    result['task'] = ' '.join(result['task'].split())

    return result


# ═══════════════════════════════════════════════════════════════
# SEED — ЗАПОЛНЕНИЕ КАЛЕНДАРЯ ПЛАТЕЖАМИ / АРЕНДОЙ
# ═══════════════════════════════════════════════════════════════

def seed_recurring_payments(calendar: CalendarClient) -> list:
    """
    Создаёт повторяющиеся события для кредитных платежей.
    Вызывается один раз при настройке.
    """
    results = []
    try:
        from config import CREDITS

        for c in CREDITS:
            pay_day = c.get('day', 0)
            if pay_day == 0:
                continue

            # Ближайший платёж
            now = datetime.now()
            next_date = now.replace(day=pay_day, hour=9, minute=0, second=0, microsecond=0)
            if next_date < now:
                if now.month == 12:
                    next_date = next_date.replace(year=now.year + 1, month=1)
                else:
                    next_date = next_date.replace(month=now.month + 1)

            payment_str = f"{c['payment']:,.0f}₽".replace(',', ' ')
            summary = f"💳 {c['name']} — {payment_str}"
            desc = (
                f"Кредитный платёж: {c['name']}\n"
                f"Сумма: {payment_str}\n"
                f"Ставка: {c.get('rate', '?')}%\n"
                f"Остаток долга: {c['balance']:,.0f}₽".replace(',', ' ')
            )

            result = calendar.create_recurring_event(
                summary=summary,
                start_dt=next_date,
                end_dt=next_date + timedelta(minutes=30),
                description=desc,
                rrule='RRULE:FREQ=MONTHLY;BYMONTHDAY=' + str(pay_day),
                color_id='11',  # Tomato — красный для платежей
                reminders_minutes=[1440, 60]  # За сутки и за час
            )
            results.append({
                'credit': c['name'],
                'day': pay_day,
                'result': result
            })

    except ImportError:
        logger.warning("seed_recurring_payments: config.py не найден")
    except Exception as e:
        logger.error(f"seed_recurring_payments error: {e}")

    return results


def seed_rent_payments(calendar: CalendarClient) -> list:
    """Создаёт повторяющиеся события для арендных платежей."""
    results = []
    try:
        from config import RENT

        now = datetime.now()
        # Аренда обычно 1 числа
        rent_date = now.replace(day=1, hour=10, minute=0, second=0, microsecond=0)
        if rent_date < now:
            if now.month == 12:
                rent_date = rent_date.replace(year=now.year + 1, month=1)
            else:
                rent_date = rent_date.replace(month=now.month + 1)

        for r in RENT:
            amount = r['amount'] + r.get('comm', 0)
            amount_str = f"{amount:,.0f}₽".replace(',', ' ')
            summary = f"🏠 Аренда {r['branch']} — {amount_str}"
            desc = (
                f"Арендодатель: {r.get('landlord', '—')}\n"
                f"Филиал: {r['branch']}\n"
                f"Сумма: {amount_str}"
            )

            result = calendar.create_recurring_event(
                summary=summary,
                start_dt=rent_date,
                end_dt=rent_date + timedelta(minutes=30),
                description=desc,
                rrule='RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
                color_id='6',  # Tangerine — оранжевый для аренды
                reminders_minutes=[2880, 1440]  # За 2 дня и за сутки
            )
            results.append({
                'branch': r['branch'],
                'amount': amount,
                'result': result
            })

    except ImportError:
        logger.warning("seed_rent_payments: config.py не найден")
    except Exception as e:
        logger.error(f"seed_rent_payments error: {e}")

    return results


# ═══════════════════════════════════════════════════════════════
# УТИЛИТЫ
# ═══════════════════════════════════════════════════════════════

def _format_event_time(event: dict) -> str:
    """Форматирует время события для отображения."""
    if event.get('all_day'):
        return "🌅 Весь день"

    start = event.get('start', '')
    if 'T' in start:
        try:
            dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            return f"⏰ {dt.strftime('%H:%M')}"
        except (ValueError, TypeError):
            pass
    return "⏰ —"


def _priority_to_color(priority: int) -> str:
    """Конвертирует приоритет в colorId для Google Calendar."""
    return {
        1: '11',  # Tomato — красный (срочно)
        2: '5',   # Banana — жёлтый (средний)
        3: '2',   # Sage — зелёный (низкий)
    }.get(priority, '5')
