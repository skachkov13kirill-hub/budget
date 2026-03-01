#!/bin/bash
# Деплой PDF-парсера на VPS
# Запускать с Mac: bash deploy_pdf.sh
# Пароль не нужен — всё автоматически

DIR="$(cd "$(dirname "$0")" && pwd)"
KEY="$DIR/claude_key"
VPS_HOST="176.124.208.212"
VPS="root@$VPS_HOST"
PASS='q9ZDQ,v@35A8h6'
BOT_DIR="/root/bot_v9"
LOCAL_DIR="$DIR/bot_v9"

chmod 600 "$KEY"

# Извлекаем публичный ключ из приватного
PUB_KEY=$(ssh-keygen -y -f "$KEY" 2>/dev/null)

echo "=== ДЕПЛОЙ PDF-ПАРСЕРА ==="

# Шаг 0: Добавляем SSH-ключ в root (один раз, чтобы будущие деплои шли без пароля)
echo "🔑 Добавляю SSH-ключ Claude в root..."
expect -c "
  log_user 0
  spawn ssh -o StrictHostKeyChecking=no $VPS \
    \"mkdir -p ~/.ssh && echo '$PUB_KEY' >> ~/.ssh/authorized_keys && \
     sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys && \
     chmod 600 ~/.ssh/authorized_keys && echo OK\"
  expect {
    \"password:\" { send \"$PASS\r\"; exp_continue }
    \"OK\"        { }
    timeout      { puts \"⚠️  Таймаут при добавлении ключа\"; exit 1 }
  }
  expect eof
" && echo "  ✅ Ключ добавлен (теперь без пароля)" || echo "  ⚠️  Ключ уже был или ошибка — продолжаем"

echo ""

# Шаг 1: Копируем файлы через SSH-ключ
echo "📤 Копируем файлы..."
scp -i "$KEY" -o StrictHostKeyChecking=no \
  "$LOCAL_DIR/pdf_parser.py" \
  "$LOCAL_DIR/main.py" \
  "$LOCAL_DIR/requirements.txt" \
  $VPS:$BOT_DIR/ && echo "  ✅ Файлы скопированы" || {
    echo "  ⚠️  Ключ не сработал, пробую через пароль..."
    expect -c "
      log_user 1
      spawn scp -o StrictHostKeyChecking=no \
        $LOCAL_DIR/pdf_parser.py $LOCAL_DIR/main.py $LOCAL_DIR/requirements.txt \
        $VPS:$BOT_DIR/
      expect \"password:\" { send \"$PASS\r\" }
      expect eof
    "
  }

# Шаг 2: Устанавливаем pdfplumber
echo ""
echo "📦 Устанавливаем pdfplumber..."
ssh -i "$KEY" -o StrictHostKeyChecking=no $VPS \
  "pip install pdfplumber -q && echo OK" 2>/dev/null | grep -q OK && \
  echo "  ✅ pdfplumber установлен" || \
  echo "  ℹ️  pdfplumber уже был установлен"

# Шаг 3: Перезапускаем бот
echo ""
echo "🔄 Перезапускаем бот..."
ssh -i "$KEY" -o StrictHostKeyChecking=no $VPS "systemctl restart bot_v9"
sleep 3

# Шаг 4: Статус
echo ""
echo "=== СТАТУС ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no $VPS \
  "systemctl status bot_v9 --no-pager | head -15"
echo ""
echo "✅ Готово! Отправь PDF-выписку боту @atelie_finance_bot в Telegram."
