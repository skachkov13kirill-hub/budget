#!/bin/bash
# Деплой дашборда на GitHub Pages
# Запускать с Mac: bash deploy_dashboard.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN=$(cat "$DIR/github_token.txt" | tr -d '\n')
REPO="skachkov13kirill-hub/-"
BRANCH="основной"

echo "=== ДЕПЛОЙ ДАШБОРДА НА GITHUB PAGES ==="
echo ""

# Создаём временную папку
TMP_DIR=$(mktemp -d)
echo "📁 Временная папка: $TMP_DIR"

# Клонируем репо с токеном
echo "📥 Клонируем репо..."
git clone "https://$TOKEN@github.com/$REPO.git" "$TMP_DIR/repo" --quiet

if [ $? -ne 0 ]; then
  echo "❌ Ошибка клонирования"
  rm -rf "$TMP_DIR"
  exit 1
fi

cd "$TMP_DIR/repo"

# Копируем файлы из локальной папки
echo "📋 Копируем обновлённые файлы..."
cp "$DIR/index.html"     "$TMP_DIR/repo/index.html"
cp "$DIR/manifest.json"  "$TMP_DIR/repo/manifest.json" 2>/dev/null || true
cp "$DIR/sw.js"          "$TMP_DIR/repo/sw.js"         2>/dev/null || true

# Git конфиг
git config user.email "deploy@atelie.bot"
git config user.name "Ателье Бот"

# Коммит и пуш
git add index.html manifest.json sw.js 2>/dev/null
git add index.html

CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
  echo "ℹ️  Нет изменений — файлы уже актуальны"
else
  git commit -m "fix: EGM dashboard update $(date '+%d.%m.%Y %H:%M')" --quiet
  git push origin HEAD --quiet
  echo "✅ Задеплоено!"
fi

# Чистим временную папку
rm -rf "$TMP_DIR"

echo ""
echo "🌐 Дашборд: https://skachkov13kirill-hub.github.io/-/"
echo "✅ Готово!"
