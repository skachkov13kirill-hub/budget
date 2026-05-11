#!/usr/bin/env python3
"""
Финансовый бот Кирилла v9 — ЭТАП 1: ГОЛОС + ИИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Новое в v9 (поверх v8):
  1. Голосовые сообщения → OpenAI Whisper → текст
  2. Текст → Claude Haiku → JSON намерения (intent)
  3. Intent router → нужный handler
  4. Запрос бизнес-данных: «Какой оборот за сегодня?»
  5. Задачи: «Запиши задачу: позвонить юристу»

Requires:
  pip install openai anthropic
"""

import datetime
import traceback

from telegram import Update
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, filters
)

from config import BOT_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, BRANCH_NAMES
import utils
from utils import logger, branch_chats, load_owner
from handlers import (
    start, help_cmd, brain_cmd, balance_cmd, credits_cmd,
    week_cmd, cashflow_cmd, rent_cmd, status_cmd, tasks_cmd,
    register_cmd, unregister_cmd, branches_cmd,
    callback_handler, handle_voice, handle_message
)
from nightly_audit import run_nightly_audit


def main():
    utils.owner_chat_id = load_owner()
    if utils.owner_chat_id:
        logger.info(f"Owner loaded: {utils.owner_chat_id}")

    logger.info(f"Branch chats loaded: {branch_chats}")

    if BOT_TOKEN == "YOUR_BOT_TOKEN":
        print("\n❌ ОШИБКА: Вставь токен бота в config.py\n")
        return

    voice_ok = bool((GROQ_API_KEY and GROQ_API_KEY != "YOUR_GROQ_KEY") or (OPENAI_API_KEY and OPENAI_API_KEY != "YOUR_OPENAI_KEY"))
    ai_ok = bool((GROQ_API_KEY and GROQ_API_KEY != "YOUR_GROQ_KEY") or (ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != "YOUR_ANTHROPIC_KEY"))

    app = Application.builder().token(BOT_TOKEN).build()

    # Глобальный обработчик ошибок — ловит ВСЕ необработанные исключения
    async def error_handler(update, context):
        logger.error(f"НЕОБРАБОТАННАЯ ОШИБКА: {context.error}\n{traceback.format_exc()}")
        # Пытаемся уведомить пользователя
        if update and update.effective_message:
            try:
                await update.effective_message.reply_text(
                    "⚠️ Произошла внутренняя ошибка. Попробуйте позже."
                )
            except:
                pass

    app.add_error_handler(error_handler)

    # Команды
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("brain", brain_cmd))
    app.add_handler(CommandHandler("balance", balance_cmd))
    app.add_handler(CommandHandler("credits", credits_cmd))
    app.add_handler(CommandHandler("week", week_cmd))
    app.add_handler(CommandHandler("cashflow", cashflow_cmd))
    app.add_handler(CommandHandler("rent", rent_cmd))
    app.add_handler(CommandHandler("status", status_cmd))
    app.add_handler(CommandHandler("tasks", tasks_cmd))
    app.add_handler(CommandHandler("register", register_cmd))
    app.add_handler(CommandHandler("unregister", unregister_cmd))
    app.add_handler(CommandHandler("branches", branches_cmd))

    # Callbacks (inline кнопки)
    app.add_handler(CallbackQueryHandler(callback_handler))

    # Голосовые сообщения (НОВОЕ в v9!)
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))

    # Текстовые сообщения
    app.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND,
        handle_message
    ))

    print("\n" + "=" * 55)
    print("🧠 ФИНАНСОВЫЙ БОТ v9 — ГОЛОС + ИИ — ЗАПУЩЕН")
    print("=" * 55)
    print(f"\nOwner: {utils.owner_chat_id or 'Первый /start'}")
    print(f"Чаты филиалов: {len(branch_chats)}/{len(BRANCH_NAMES)}")
    print(f"🎤 Whisper: {'✅ ГОТОВ (Groq)' if voice_ok else '❌ нужен API KEY'}")
    print(f"🧠 Claude Haiku: {'✅ ГОТОВ (Groq Llama)' if ai_ok else '❌ нужен API KEY'}")
    if not voice_ok or not ai_ok:
        print("\n⚠️  Добавь ключи в config.py и перезапусти бота")
        print("   OPENAI_API_KEY — platform.openai.com")
        print("   ANTHROPIC_API_KEY — console.anthropic.com")
    print("\nОткрой бота и напиши /start")
    print("Ctrl+C для остановки\n")

    # ── Ночной аудит: ОТКЛЮЧЁН 11.05.2026 по решению Кирилла ──
    # Шумел в личке, заглушал нужные уведомления о приходе отчётов от филиалов.
    # Если понадобится вернуть — раскомментировать блок ниже.
    # try:
    #     import pytz
    #     msk = pytz.timezone('Europe/Moscow')
    # except ImportError:
    #     import zoneinfo
    #     msk = zoneinfo.ZoneInfo('Europe/Moscow')
    #
    # audit_time = datetime.time(hour=3, minute=0, tzinfo=msk)
    # app.job_queue.run_daily(run_nightly_audit, time=audit_time, name='nightly_audit')
    # logger.info(f"🔍 Ночной аудит запланирован на 03:00 МСК")
    logger.info("🔇 Ночной аудит отключён (см. комментарий выше)")

    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
