#!/usr/bin/env python3
"""
ai_handlers.py -- INTENT_SYSTEM_PROMPT, transcribe_voice, parse_intent, _parse_intent_basic.
"""

import json
import re
from typing import Optional

import aiohttp

from config import OPENAI_API_KEY, ANTHROPIC_API_KEY
from utils import logger, parse_branch_report


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
