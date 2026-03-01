#!/bin/bash
# Деплой бота v9 на VPS
# Запускать с локальной машины: bash deploy_v9.sh
# Предварительно: добавь свои API ключи в config.py

VPS="root@176.124.208.212"
BOT_DIR="/root/bot_v9"

echo "=== ДЕПЛОЙ БОТА v9 ==="

# 1. Создаём директорию на VPS
ssh $VPS "mkdir -p $BOT_DIR"

# 2. Копируем файлы
scp main.py $VPS:$BOT_DIR/
scp config.py $VPS:$BOT_DIR/
scp sheets_direct.py $VPS:$BOT_DIR/
scp pdf_parser.py $VPS:$BOT_DIR/
scp requirements.txt $VPS:$BOT_DIR/

# 2b. Проверяем наличие service_account.json на VPS
echo "Проверяю service_account.json на VPS..."
ssh $VPS "test -f $BOT_DIR/service_account.json && echo '✅ service_account.json найден' || echo '⚠️  service_account.json НЕ НАЙДЕН! Загрузите его: scp service_account.json $VPS:$BOT_DIR/'"

# 3. Устанавливаем зависимости
ssh $VPS "cd $BOT_DIR && pip install -r requirements.txt -q --break-system-packages"

# 4. Останавливаем текущий бот
ssh $VPS "systemctl stop bot_v9 2>/dev/null || pkill -f 'python.*bot_v9' || true"

# 6. Создаём systemd сервис
ssh $VPS "cat > /etc/systemd/system/bot_v9.service << 'EOF'
[Unit]
Description=Kirill Finance Bot v9
After=network.target

[Service]
WorkingDirectory=/root/bot_v9
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF"

# 7. Запускаем новый бот
ssh $VPS "systemctl daemon-reload && systemctl enable bot_v9 && systemctl start bot_v9"

echo ""
echo "=== СТАТУС ==="
ssh $VPS "systemctl status bot_v9 --no-pager | head -20"

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "📋 Команды на VPS:"
echo "  journalctl -u bot_v9 -f     # логи в реальном времени"
echo "  systemctl restart bot_v9     # перезапуск"
echo "  systemctl stop bot_v9        # остановка"
