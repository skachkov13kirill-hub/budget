#!/usr/bin/env python3
"""
ai_handlers.py -- INTENT_SYSTEM_PROMPT, transcribe_voice, parse_intent, _parse_intent_basic.

Все AI-запросы идут через Cloudflare Worker прокси (обход блокировок из РФ).
Бот → CF Worker → Groq API → CF Worker → Бот
"""

import base64
import json
import re
from typing import Optional

import aiohttp

from config import GROQ_API_KEY
from utils import logger, parse_branch_report

CF_PROXY = "https://groq-proxy.skachkovkirill8.workers.dev"


# ════════════════════════════════════════
# ИИ: WHISPER (ГОЛОС → ТЕКСТ)
# ════════════════════════════════════════

async def transcribe_voice(file_path: str) -> Optional[str]:
    """
    Отправляет аудио через Cloudflare Worker → Groq Whisper.
    """
    if not GROQ_API_KEY or GROQ_API_KEY == "YOUR_GROQ_KEY":
        return None

    try:
        with open(file_path, 'rb') as f:
            audio_b64 = base64.b64encode(f.read()).decode('utf-8')

        payload = {
            "audio_base64": audio_b64,
            "api_key": GROQ_API_KEY,
            "language": "ru"
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{CF_PROXY}/whisper",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as resp:
                result = await resp.json()
                logger.info(f"Whisper proxy: status={resp.status}, success={result.get('success')}, text={str(result.get('text', ''))[:80]}")
                if result.get('success') and result.get('text'):
                    return result['text'].strip()
                if not result.get('success'):
                    logger.error(f"Whisper proxy error: {result.get('error', 'unknown')}")
    except Exception as e:
        logger.error(f"Whisper proxy exception: {e}")

    return None


# ════════════════════════════════════════
# ИИ: INTENT (ТЕКСТ → НАМЕРЕНИЕ)
# ════════════════════════════════════════

INTENT_SYSTEM_PROMPT = """Ты — ИИ-парсер намерений для личного ассистента Кирилла.
Кирилл управляет сетью ателье, следит за финансами, ведёт задачи и трекает здоровье.

По тексту определи намерение и верни ТОЛЬКО JSON (без пояснений, без markdown).

Модули и действия:
- business / query_today — «Какой оборот сегодня?», «Сводка по сети», «Как дела у филиалов?», «Оборот вчера», «Выручка за неделю», «Сколько за месяц?»
  (params.date = "сегодня"/"вчера"/"позавчера" или ISO дата "2026-03-12". По умолчанию "сегодня")
  (params.period = "day"/"week"/"month". По умолчанию "day". "за неделю"→"week", "за месяц"→"month")
- business / query_branch — «Как дела у М16?», «Сколько на Менделеева?», «М16 за вчера», «Менделеева за неделю»
  (params.branch = название, params.date = дата, params.period = период — аналогично query_today)
- business / record_revenue — «32500 18», «Оборот 45 тысяч, 12 клиентов» (params.turnover, params.clients)
- tasks / add_task — «Запиши задачу: ...», «Напомни...», «Нужно сделать...» (params.task = текст задачи)
- tasks / list_tasks — «Покажи задачи», «Что нужно сделать?», «Список дел»
- finance / query — «Кредиты», «Счета», «Долг», «Сколько на счетах?»
- health / record — «Сон 7 часов», «Тренировка 40 минут», «Вес 82 кг» (params.type, params.value)
- planner / add_slot — «На завтра в 10 утра позвонить по стройке, час», «Запланируй на среду встречу с юристом в 14:00 на полтора часа»
  (params.task = текст задачи, params.date = "завтра"/"среда"/"2026-03-12", params.time = "10:00", params.duration = 60)
  ВАЖНО: если пользователь говорит «час» — duration=60, «полчаса»=30, «полтора часа»=90, «два часа»=120. По умолчанию 60.
  Если дата не указана — params.date = "сегодня". Время в формате HH:MM (24ч).
- planner / list_day — «Что у меня на завтра?», «План на понедельник», «Что запланировано?»
  (params.date = "завтра"/"понедельник"/"сегодня". Если дата не указана — "сегодня")
- planner / move_slot — «Перенеси встречу с юристом на четверг в 14:00», «Подвинь стройку на 15:00»
  (params.task_query = ключевые слова задачи, params.new_date = новый день, params.new_time = новое время)
- planner / done_slot — «Стройка готово», «Позвонил юристу», «Сделал то что на 10 утра»
  (params.task_query = ключевые слова задачи)
- unknown / unknown — непонятное намерение (params.raw = исходный текст)

Формат ответа:
{"module": "...", "action": "...", "params": {...}, "confidence": 0.9}

Примеры:
"Какой оборот вчера?" → {"module":"business","action":"query_today","params":{"date":"вчера","period":"day"},"confidence":0.95}
"Выручка за неделю" → {"module":"business","action":"query_today","params":{"date":"сегодня","period":"week"},"confidence":0.95}
"Сколько за месяц?" → {"module":"business","action":"query_today","params":{"date":"сегодня","period":"month"},"confidence":0.95}
"Как дела у М16 за неделю?" → {"module":"business","action":"query_branch","params":{"branch":"М16","period":"week"},"confidence":0.95}
"Запиши: позвонить юристу по договору" → {"module":"tasks","action":"add_task","params":{"task":"позвонить юристу по договору"},"confidence":0.97}
"Сон 7.5 часов" → {"module":"health","action":"record","params":{"type":"sleep","value":"7.5 часов"},"confidence":0.9}
"32500 18" → {"module":"business","action":"record_revenue","params":{"turnover":32500,"clients":18},"confidence":0.99}
"На завтра в десять утра позвонить по стройке час" → {"module":"planner","action":"add_slot","params":{"task":"позвонить по стройке","date":"завтра","time":"10:00","duration":60},"confidence":0.95}
"Что у меня на понедельник?" → {"module":"planner","action":"list_day","params":{"date":"понедельник"},"confidence":0.95}
"Перенеси юриста на среду в 14" → {"module":"planner","action":"move_slot","params":{"task_query":"юрист","new_date":"среда","new_time":"14:00"},"confidence":0.9}
"Стройка готово" → {"module":"planner","action":"done_slot","params":{"task_query":"стройка"},"confidence":0.9}
"""

async def parse_intent(text: str) -> dict:
    """
    Парсит намерение через Cloudflare Worker → Groq Llama.
    Fallback: keyword-парсер.
    """
    if GROQ_API_KEY and GROQ_API_KEY != "YOUR_GROQ_KEY":
        try:
            payload = {
                "text": text,
                "system_prompt": INTENT_SYSTEM_PROMPT,
                "api_key": GROQ_API_KEY
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{CF_PROXY}/intent",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    result = await resp.json()
                    if result.get('success') and result.get('content'):
                        raw = result['content'].strip()
                        if raw.startswith('```'):
                            raw = re.sub(r'```[a-z]*\n?', '', raw).strip()
                        return json.loads(raw)
                    logger.error(f"Intent proxy error: {result.get('error', 'unknown')}")
        except Exception as e:
            logger.error(f"Intent proxy exception: {e}")

    # Fallback: keyword-парсер
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
        params = {}
        # Определяем дату
        if 'вчера' in t:
            params['date'] = 'вчера'
        elif 'позавчера' in t:
            params['date'] = 'позавчера'
        # Определяем период
        if 'недел' in t:
            params['period'] = 'week'
        elif 'месяц' in t:
            params['period'] = 'month'
        return {"module": "business", "action": "query_today", "params": params, "confidence": 0.7}

    # Задачи
    if any(w in t for w in ['запиши', 'задачу', 'напомни', 'нужно', 'сделать', 'задача']):
        task_match = re.sub(r'^(запиши|задача|напомни|нужно сделать)[:\s]*', '', t).strip()
        return {"module": "tasks", "action": "add_task",
                "params": {"task": task_match or text}, "confidence": 0.7}

    if any(w in t for w in ['задачи', 'список', 'что нужно', 'что делать', 'дела']):
        return {"module": "tasks", "action": "list_tasks", "params": {}, "confidence": 0.7}

    # Финансы
    if any(w in t for w in ['кредит', 'счёт', 'счет', 'долг', 'баланс', 'деньги']):
        return {"module": "finance", "action": "query", "params": {}, "confidence": 0.7}

    # Планировщик
    if any(w in t for w in ['план на', 'что на завтра', 'что на понедельник', 'что на вторник',
                            'что на среду', 'что на четверг', 'что на пятницу', 'что на субботу',
                            'что на воскресенье', 'что запланировано', 'расписание']):
        return {"module": "planner", "action": "list_day", "params": {"date": "сегодня"}, "confidence": 0.6}

    if any(w in t for w in ['запланируй', 'на завтра', 'в план', 'внеси в план']):
        return {"module": "planner", "action": "add_slot",
                "params": {"task": text, "date": "завтра", "time": "", "duration": 60}, "confidence": 0.5}

    if 'готово' in t or 'сделал' in t or 'выполнил' in t:
        return {"module": "planner", "action": "done_slot",
                "params": {"task_query": text}, "confidence": 0.5}

    # Здоровье
    if any(w in t for w in ['сон', 'спал', 'тренировка', 'бег', 'вес', 'давление', 'пробежал']):
        return {"module": "health", "action": "record", "params": {"raw": text}, "confidence": 0.6}

    return {"module": "unknown", "action": "unknown", "params": {"raw": text}, "confidence": 0.0}
