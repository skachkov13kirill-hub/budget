#!/usr/bin/env python3
"""
📄 Парсер выписок Сбербанк ИП для Telegram-бота
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Формат выписки Сбер ИП (9 колонок):
  [0] Дата проводки
  [1] Счёт Дебет   (наш счёт = расход; чужой = доход-контрагент)
  [2] Счёт Кредит  (чужой = расход-контрагент; наш счёт = доход)
  [3] Сумма по дебету  (расход)
  [4] Сумма по кредиту (приход)
  [5] № документа
  [6] ВО (вид операции)
  [7] Банк (БИК)
  [8] Назначение платежа

v2.0: Переписан под реальный формат Сбер ИП.
  - Правильный маппинг колонок (приход/расход через дебет/кредит)
  - QR-мерчанты → привязка к филиалу
  - Аренда автоматически по ИНН арендодателя
  - Комиссии банка и абон.плата выделены отдельно
  - Скорость: только текстовый парсинг таблиц (быстрее в 4-5x)
"""

import re
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ════════════════════════════════════════
# НАШ СЧЁТ ИП
# ════════════════════════════════════════
MY_ACCOUNT_PREFIX = '40802810655000125630'

# ════════════════════════════════════════
# QR-МЕРЧАНТЫ → ФИЛИАЛЫ
# Заполни номера терминалов: бот автоматически
# подтянет из Google Sheets (НАСТРОЙКИ лист QR_MERCHANTS)
# Fallback-список ниже — на случай если Sheets недоступен
# ════════════════════════════════════════
DEFAULT_QR_MERCHANTS = {
    # Формат: 'номер_мерчанта': 'код_филиала'
    # Кирилл заполнит через бот командой /qr_setup
    # Пример: '551000509101': 'В22',
}

# ════════════════════════════════════════
# ИНН АРЕНДОДАТЕЛЕЙ → ФИЛИАЛЫ
# Из ЕДИНЫЙ_КОНТЕКСТ v4 (таблица аренды)
# ════════════════════════════════════════
RENT_INN_TO_BRANCH = {
    '780404257393': ('М16', 'Мазур А.И.'),
    '781419447705': ('В8',  'Бутин Н.Ю.'),
    '780624814875': ('П14', 'Красавина И.С.'),
    '781130892709': ('А6',  'Бурилова В.П.'),
    '4705080901':   ('Г4',  'ООО ФСК Вектор'),
    '660404859145': ('В22', 'Васильева Е.А.'),
    '4703121542':   ('А6',  'ТСЖ Девяткино'),  # коммуналка А6
    # В20, Е8, Е17, Г11 — переводы телефоном (Гасан, Надежда), добавить когда узнаем ИНН
}

# ════════════════════════════════════════
# ПРАВИЛА АВТОКАТЕГОРИЗАЦИИ
# Порядок важен — первое совпадение побеждает
# ════════════════════════════════════════
CATEGORY_RULES = [
    # Аренда (по ключевым словам — как запасной вариант, основное через ИНН)
    {
        'category': 'Аренда',
        'keywords': [
            'арендная плата', 'аренда помещения', 'оплата аренды',
            'арендный платеж', 'аренда и коммунальные',
        ],
    },
    # Коммуналка
    {
        'category': 'Коммуналка',
        'keywords': [
            'переменная часть', 'оплата переменной', 'электроэнергия',
            'водоснабжение', 'теплоснабжение', 'жкх',
            'коммунальные платежи', 'коммунальные услуги',
            'компенсация за коммунальные',
        ],
    },
    # Налоги
    {
        'category': 'Налоги',
        'keywords': [
            'единый налоговый платеж', 'единый налоговый', 'налог усн',
            'страховые взносы', 'пенсионный фонд', 'фнс', 'ифнс', 'фомс',
        ],
    },
    # Переводы себе (Т-Банк, между счетами)
    {
        'category': 'Переводы себе',
        'keywords': [
            'тбанк', 'т-банк', 'тинькофф', 'tinkoff',
            'перевод средств между счетами', 'перевод собственных средств',
            'перевод денежных средств на нужды', 'собственные нужды',
            'перевод средств на нужды', 'нужды ип',
        ],
    },
    # Погашение кредитов
    {
        'category': 'Погашение кредитов',
        'keywords': [
            'погашение задолженности по договору', 'погашение кредита',
            'ежемесячный платеж по кредиту', 'возврат кредита',
        ],
    },
    # Подрядчики химчистка
    {
        'category': 'Подрядчики (химчистка)',
        'keywords': ['химчистка', 'хим.чистка', 'хим чистка', 'химическая чистка'],
    },
    # Подрядчики ателье
    {
        'category': 'Подрядчики (ателье)',
        'keywords': ['ателье', 'портной', 'пошив', 'ремонт одежды'],
    },
    # Реклама
    {
        'category': 'Реклама',
        'keywords': [
            'яндекс', 'yandex', 'google ads', 'реклама',
            'рекламные услуги', 'продвижение', 'вконтакте', 'vk ads', 'таргет',
        ],
    },
    # Расходники (фурнитура, материалы)
    {
        'category': 'Расходники',
        'keywords': [
            'материалы', 'фурнитура', 'нитки', 'ткань',
            'запчасти', 'расходные материалы',
        ],
    },
    # Ремонт оборудования
    {
        'category': 'Ремонт оборудования',
        'keywords': [
            'ремонт швейн', 'ремонт машин', 'запчасти швейн',
            'техобслуживание',
        ],
    },
    # Оплата по счетам
    {
        'category': 'Оплата по счетам',
        'keywords': [
            'оплата по счету', 'оплата по дог', 'по счёту №', 'по счету №',
            'оплата услуг',
        ],
    },
]


def _parse_amount(s: str) -> Optional[float]:
    """'1 234 567,89' → 1234567.89"""
    if not s:
        return None
    s = str(s).strip().replace('\xa0', '').replace(' ', '')
    s = re.sub(r',(\d{2})$', r'.\1', s)
    s = s.replace(',', '')
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


def _get_month_key(date_str: str) -> str:
    """'15.07.2025' → '2025-07'"""
    try:
        dt = datetime.strptime(date_str, '%d.%m.%Y')
        return dt.strftime('%Y-%m')
    except ValueError:
        return ''


def _extract_inn_and_name(account_block: str) -> tuple:
    """
    Из блока счёта вида:
      40802810655000125630
      623411828814
      ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ СКАЧКОВ ...
    Возвращает (inn, name)
    """
    lines = [l.strip() for l in (account_block or '').split('\n') if l.strip()]
    inn = ''
    name = ''
    for i, line in enumerate(lines):
        # ИНН = 10-12 цифр
        if re.match(r'^\d{10,12}$', line):
            inn = line
            # Имя — следующая строка
            if i + 1 < len(lines):
                name = lines[i + 1]
            break
        # Если вторая строка тоже цифровая (расч.счёт потом ИНН)
    if not inn and len(lines) >= 2 and re.match(r'^\d{10,12}$', lines[1]):
        inn = lines[1]
        name = lines[2] if len(lines) > 2 else ''
    return inn, name


def categorize(purpose: str, contragent: str, inn: str = '',
               cloud_rules: dict = None, qr_merchants: dict = None) -> str:
    """
    Определяет категорию транзакции.
    Приоритет:
      1. Облачные правила (из Google Sheets БИЗ_ПРАВИЛА)
      2. ИНН арендодателя → Аренда
      3. QR-эквайринг → Выручка (входящий платёж)
      4. Ключевые слова
    """
    p = (purpose or '').lower()
    c = (contragent or '').lower()

    # 1. Облачные правила
    if cloud_rules:
        for pattern, category in cloud_rules.items():
            pat = pattern.lower()
            if pat and (pat in c or pat in p):
                return category

    # 2. Аренда по ИНН
    if inn and inn in RENT_INN_TO_BRANCH:
        return 'Аренда'

    # 3. QR-эквайринг (входящий)
    merchants = qr_merchants or DEFAULT_QR_MERCHANTS
    m = re.search(r'[Мм]ерчант\s*[№#]?(\d+)', purpose)
    if m:
        return 'Выручка QR'

    # 4. Комиссия эквайринга в назначении
    if 'комиссия' in p and ('эквайр' in p or 'мерчант' in p):
        return 'Комиссии банка'

    # 5. СберБизнес Прайм / обслуживание
    if 'сберби' in p or 'прайм' in p or ('обслужив' in p and 'счет' in p):
        return 'Комиссии банка'

    # 6. Ключевые слова
    for rule in CATEGORY_RULES:
        for kw in rule.get('keywords', []):
            if kw.lower() in p or kw.lower() in c:
                return rule['category']

    return 'Прочее'


def _get_branch_by_merchant(merchant_id: str, qr_merchants: dict = None) -> str:
    """Возвращает код филиала по ID мерчанта или пустую строку"""
    merchants = qr_merchants or DEFAULT_QR_MERCHANTS
    return merchants.get(merchant_id, '')


# ════════════════════════════════════════
# ОСНОВНОЙ ПАРСИНГ
# ════════════════════════════════════════

def parse_sber_pdf(file_path: str, cloud_rules: dict = None,
                   qr_merchants: dict = None) -> list:
    """
    Парсит PDF-выписку Сбербанк ИП (9-колоночный формат).
    Возвращает список транзакций:
      { date, amount, direction, purpose, contragent, contragent_inn,
        commission, category, branch, merchantId, monthKey }
    """
    try:
        import pdfplumber
    except ImportError:
        raise ImportError("Требуется pdfplumber: pip install pdfplumber")

    transactions = []

    try:
        with pdfplumber.open(file_path) as pdf:
            logger.info(f"PDF открыт: {len(pdf.pages)} страниц")

            for page in pdf.pages:
                # Используем extract_tables с настройками для скорости
                tables = page.extract_tables({
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                })
                for table in (tables or []):
                    for row in (table or []):
                        if not row or len(row) < 9:
                            continue
                        tx = _parse_row(row, cloud_rules, qr_merchants)
                        if tx:
                            transactions.append(tx)

    except Exception as e:
        logger.error(f"Ошибка парсинга PDF: {e}")
        raise

    logger.info(f"Найдено транзакций: {len(transactions)}")
    return transactions


def _parse_row(row: list, cloud_rules: dict = None,
               qr_merchants: dict = None) -> Optional[dict]:
    """
    Парсит одну строку 9-колоночной таблицы Сбер ИП.
    Колонки: Дата | ДебетСчёт | КредитСчёт | СуммаДебет | СуммаКредит
             | №Документа | ВО | Банк | Назначение
    """
    date_str = str(row[0] or '').strip().split('\n')[0].strip()
    if not re.match(r'^\d{2}\.\d{2}\.\d{4}$', date_str):
        return None

    debit_acc  = str(row[1] or '')   # Счёт дебета
    credit_acc = str(row[2] or '')   # Счёт кредита
    debit_sum  = _parse_amount(row[3])   # Расход
    credit_sum = _parse_amount(row[4])   # Приход
    purpose    = str(row[8] or '').strip().replace('\n', ' ')

    # Определяем направление по тому, чей счёт в дебете/кредите
    is_our_debit  = MY_ACCOUNT_PREFIX in debit_acc
    is_our_credit = MY_ACCOUNT_PREFIX in credit_acc

    if is_our_debit and debit_sum:
        # Наш счёт списан → РАСХОД
        amount = debit_sum
        direction = 'out'
        counterpart_block = credit_acc  # кому платим
    elif is_our_credit and credit_sum:
        # На наш счёт зачислено → ПРИХОД
        amount = credit_sum
        direction = 'in'
        counterpart_block = debit_acc   # кто платит
    else:
        # Нет ясности — пропускаем
        return None

    # Извлекаем контрагента и ИНН
    inn, name = _extract_inn_and_name(counterpart_block)
    if not name:
        # Запасной вариант: первая строка блока
        lines = [l.strip() for l in counterpart_block.split('\n') if l.strip()]
        name = lines[-1] if lines else ''

    # QR-эквайринг: извлекаем мерчант и комиссию
    merchant_id = ''
    qr_commission = 0.0
    m_merchant = re.search(r'[Мм]ерчант\s*[№#]?\s*(\d+)', purpose)
    if m_merchant:
        merchant_id = m_merchant.group(1)
    m_comm = re.search(r'[Кк]омиссия\s*([\d.,]+)', purpose)
    if m_comm:
        try:
            qr_commission = float(m_comm.group(1).replace(',', '.'))
        except ValueError:
            pass

    # Определяем филиал
    branch = ''
    if merchant_id:
        branch = _get_branch_by_merchant(merchant_id, qr_merchants)
    elif inn in RENT_INN_TO_BRANCH:
        branch = RENT_INN_TO_BRANCH[inn][0]

    # Категория
    category = categorize(purpose, name, inn, cloud_rules, qr_merchants)

    return {
        'date':          date_str,
        'amount':        amount,
        'direction':     direction,
        'purpose':       purpose,
        'contragent':    name[:80],
        'contragent_inn': inn,
        'commission':    str(qr_commission) if qr_commission else '',
        'category':      category,
        'branch':        branch,
        'merchantId':    merchant_id,
        'monthKey':      _get_month_key(date_str),
    }


# ════════════════════════════════════════
# ФОРМАТИРОВАНИЕ ОТЧЁТА
# ════════════════════════════════════════

def format_summary(transactions: list, qr_merchants: dict = None) -> str:
    """Формирует текстовый отчёт по распарсенным транзакциям"""
    if not transactions:
        return "❌ Транзакций не найдено"

    total_in  = sum(t['amount'] for t in transactions if t['direction'] == 'in')
    total_out = sum(t['amount'] for t in transactions if t['direction'] == 'out')
    months = sorted(set(t.get('monthKey', '') for t in transactions if t.get('monthKey')))

    lines = [f"📄 *Выписка обработана* — {len(transactions)} операций\n"]
    if months:
        lines.append(f"📅 Период: {months[0]} — {months[-1]}\n")
    lines.append(f"📥 Приход: *{fmt(total_in)}*")
    lines.append(f"📤 Расход: *{fmt(total_out)}*\n")

    # QR по филиалам
    qr_by_branch = {}
    qr_unknown = 0.0
    for t in transactions:
        if t['direction'] == 'in' and t.get('merchantId'):
            br = t.get('branch') or '?'
            qr_by_branch[br] = qr_by_branch.get(br, 0) + t['amount']
        elif t['direction'] == 'in' and 'Выручка' in t.get('category', ''):
            qr_unknown += t['amount']

    if qr_by_branch or qr_unknown:
        lines.append("*QR-эквайринг по филиалам:*")
        for br, amt in sorted(qr_by_branch.items(), key=lambda x: -x[1]):
            label = br if br != '?' else '❓ не привязан'
            lines.append(f"  • {label}: {fmt(amt)}")
        if qr_unknown:
            lines.append(f"  • ❓ не привязан: {fmt(qr_unknown)}")
        if '?' in qr_by_branch:
            lines.append("\n⚠️ Часть QR-терминалов не привязана к филиалам.")
            lines.append("Используй /qr_setup чтобы настроить.")
        lines.append('')

    # Расходы по категориям
    cats = {}
    for t in transactions:
        if t['direction'] == 'out':
            cat = t.get('category', 'Прочее')
            cats[cat] = cats.get(cat, 0) + t['amount']

    if cats:
        lines.append("*Расходы по категориям:*")
        for cat, amt in sorted(cats.items(), key=lambda x: -x[1]):
            lines.append(f"  • {cat}: {fmt(amt)}")

    # Банковские комиссии отдельно
    bank_fees = sum(t['amount'] for t in transactions
                    if t['direction'] == 'out' and t['category'] == 'Комиссии банка')
    if bank_fees:
        lines.append(f"\n🏦 Итого комиссии банка: *{fmt(bank_fees)}*")

    return '\n'.join(lines)


def fmt(n: float) -> str:
    """1234567.5 → '1 234 568₽'"""
    return f"{int(round(n)):,}₽".replace(',', ' ')
