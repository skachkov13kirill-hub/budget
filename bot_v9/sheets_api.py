#!/usr/bin/env python3
"""
sheets_api.py -- All Google Sheets API functions.
"""

from datetime import datetime

import aiohttp

from config import SHEETS_SCRIPT_URL
from utils import logger, get_today_str


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

async def write_branch_daily(branch: str, turnover: int, clients: int, cash: int = 0, card: int = 0, hc_atelie: int = 0, hc_clients: int = 0, hc_cash: int = 0, hc_card: int = 0) -> dict:
    data = {
        'branch': branch,
        'date': get_today_str(),
        'atelie': turnover,
        'clients': clients,
        'cash': cash,
        'card': card,
    }
    if hc_atelie: data['hcAtelie'] = hc_atelie
    if hc_clients: data['hcClients'] = hc_clients
    if hc_cash: data['hcCash'] = hc_cash
    if hc_card: data['hcCard'] = hc_card
    return await sheets_post('writeBranchDaily', data)

async def get_branches_data(date: str = None, period: str = None) -> dict:
    """Получает данные по всем филиалам. Опционально за конкретную дату/период."""
    params = {}
    if date:
        params['date'] = date
    if period:
        params['period'] = period
    return await sheets_get('getBranches', params if params else None)

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
# ПЛАНИРОВЩИК (лист ПЛАН)
# ════════════════════════════════════════

async def add_schedule_slot(date: str, name: str, start_time: str = '',
                            end_time: str = '', duration: int = 60,
                            category: str = '') -> dict:
    """Добавляет слот в расписание"""
    return await sheets_post('addScheduleSlot', {
        'date': date,
        'name': name,
        'startTime': start_time,
        'endTime': end_time,
        'duration': duration,
        'category': category,
        'source': 'voice'
    })

async def get_schedule_day(date: str) -> dict:
    """Получает расписание на конкретный день"""
    return await sheets_get('getScheduleDay', {'date': date})

async def get_schedule_week(week_start: str) -> dict:
    """Получает расписание на неделю"""
    return await sheets_get('getScheduleWeek', {'weekStart': week_start})

async def update_schedule_slot(row: int, action: str = 'update',
                               field: str = '', value=None) -> dict:
    """Обновляет слот (done/delete/update поле)"""
    data = {'row': row, 'action': action}
    if field:
        data['field'] = field
    if value is not None:
        data['value'] = value
    return await sheets_post('updateScheduleSlot', data)
