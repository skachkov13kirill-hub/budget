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
