#!/bin/bash
# GRG Mobile — автоматический аудит изменений репозитория

set -euo pipefail

CHANGED_FILES="${CHANGED_FILES:-}"
EVENT="${GITHUB_EVENT_NAME:-unknown}"
REPO="${GITHUB_REPOSITORY:-unknown}"
REF="${GITHUB_REF_NAME:-unknown}"
SHA="${GITHUB_SHA:-unknown}"
ACTOR="${GITHUB_ACTOR:-unknown}"
PR_TITLE="${PR_TITLE:-}"
PR_NUMBER="${PR_NUMBER:-}"

BACKEND_ISSUES=0
FLUTTER_ISSUES=0
STREAMING_ISSUES=0
CRITICAL_ISSUES=0
REPORT=""

append() {
    REPORT="${REPORT}${1}"$'\n'
}

# --- Заголовок ---
append "\U0001F50D <b>АУДИТ: GRG Mobile</b>"
append "━━━━━━━━━━━━━━━━━━━━━━"
append "\U0001F4C5 $(date -u '+%Y-%m-%d %H:%M UTC')"
append "\U0001F514 Событие: <b>${EVENT}</b>"
if [ -n "$PR_NUMBER" ]; then
    append "\U0001F4CB PR #${PR_NUMBER}: ${PR_TITLE}"
fi
append "\U0001F33F Ветка: <b>${REF}</b>"
append "\U0001F464 Автор: ${ACTOR}"
append "\U0001F511 Коммит: <code>${SHA:0:8}</code>"
append ""

# --- Парсим изменённые файлы ---
BACKEND_FILES=$(echo "$CHANGED_FILES" | tr ',' '\n' | grep -E "^backend/" || true)
FLUTTER_FILES=$(echo "$CHANGED_FILES" | tr ',' '\n' | grep -E "\.(dart)$|pubspec\.yaml" || true)
STREAMING_FILES=$(echo "$CHANGED_FILES" | tr ',' '\n' | grep -iE "(stream|rtc|video|go2rtc|live)" || true)
ALL_FILES_COUNT=$(echo "$CHANGED_FILES" | tr ',' '\n' | grep -c "." || echo 0)

append "\U0001F4C1 Всего изменено файлов: <b>${ALL_FILES_COUNT}</b>"
append ""

# ============================================================
# БЛОК 1: БЭКЕНД (NestJS)
# ============================================================
if [ -n "$BACKEND_FILES" ]; then
    append "\U0001F3D7 <b>БЭКЕНД (NestJS)</b>"
    append "──────────────────────"

    MIGRATION_FILES=$(echo "$BACKEND_FILES" | grep -E "(migration|migrate)" || true)
    ENTITY_FILES=$(echo "$BACKEND_FILES" | grep -E "\.entity\.ts$" || true)
    MODULE_FILES=$(echo "$BACKEND_FILES" | grep -E "\.module\.ts$" || true)
    CONTROLLER_FILES=$(echo "$BACKEND_FILES" | grep -E "\.controller\.ts$" || true)
    SERVICE_FILES=$(echo "$BACKEND_FILES" | grep -E "\.service\.ts$" || true)
    CRED_FILES=$(echo "$BACKEND_FILES" | grep -iE "(credentials|password|secret|token|auth)" || true)

    if [ -n "$MIGRATION_FILES" ]; then
        append "\U0001F4CA Миграции:"
        while IFS= read -r f; do
            append "  • <code>$f</code>"
            if [ -f "$f" ]; then
                has_up=$(grep -cE "async up\b|up\(" "$f" 2>/dev/null || echo 0)
                has_down=$(grep -cE "async down\b|down\(" "$f" 2>/dev/null || echo 0)
                [ "$has_up" -eq 0 ] && append "    ⚠️ Отсутствует метод up()" && BACKEND_ISSUES=$((BACKEND_ISSUES+1))
                [ "$has_down" -eq 0 ] && append "    ⚠️ Отсутствует метод down() (откат невозможен)" && BACKEND_ISSUES=$((BACKEND_ISSUES+1))
            fi
        done <<< "$MIGRATION_FILES"
    fi

    if [ -n "$ENTITY_FILES" ]; then
        append "\U0001F4CB Сущности (entities):"
        while IFS= read -r f; do append "  • <code>$f</code>"; done <<< "$ENTITY_FILES"
        if [ -z "$MIGRATION_FILES" ]; then
            append "  \U0001F6A8 Изменены сущности без миграций — возможен рассинхрон схемы БД!"
            BACKEND_ISSUES=$((BACKEND_ISSUES+1))
            CRITICAL_ISSUES=$((CRITICAL_ISSUES+1))
        fi
    fi

    if [ -n "$MODULE_FILES" ]; then
        append "\U0001F4E6 Модули:"
        while IFS= read -r f; do
            append "  • <code>$f</code>"
            if [ -f "$f" ]; then
                providers=$(grep -cE "providers\s*:" "$f" 2>/dev/null || echo 0)
                imports_count=$(grep -cE "imports\s*:" "$f" 2>/dev/null || echo 0)
                [ "$providers" -eq 0 ] && [ "$imports_count" -gt 0 ] && \
                    append "    ⚠️ Нет секции providers в модуле" && BACKEND_ISSUES=$((BACKEND_ISSUES+1))
            fi
        done <<< "$MODULE_FILES"
    fi

    [ -n "$CONTROLLER_FILES" ] && append "\U0001F3AE Контроллеры: $(echo "$CONTROLLER_FILES" | wc -l) файл(ов)"
    [ -n "$SERVICE_FILES" ] && append "⚙️ Сервисы: $(echo "$SERVICE_FILES" | wc -l) файл(ов)"

    if [ -n "$CRED_FILES" ]; then
        append "\U0001F510 Файлы с учётными данными:"
        while IFS= read -r f; do
            append "  • <code>$f</code>"
            if [ -f "$f" ]; then
                plaintext=$(grep -nE "(password|secret|key)\s*=\s*['\"][A-Za-z0-9+/=]{8,}" "$f" 2>/dev/null | head -3 || true)
                if [ -n "$plaintext" ]; then
                    append "    \U0001F6A8 КРИТИЧНО: возможные незашифрованные учётные данные!"
                    CRITICAL_ISSUES=$((CRITICAL_ISSUES+1))
                fi
                uses_creds_service=$(grep -cE "CredentialsService|\.encrypt\(|\.decrypt\(" "$f" 2>/dev/null || echo 0)
                [ "$uses_creds_service" -eq 0 ] && \
                    append "    ⚠️ Не используется CredentialsService для шифрования" && \
                    BACKEND_ISSUES=$((BACKEND_ISSUES+1))
            fi
        done <<< "$CRED_FILES"
    fi

    if echo "$BACKEND_FILES" | grep -q "app.module.ts"; then
        append "⚠️ Изменён корневой модуль <code>app.module.ts</code> — проверьте зависимости модулей"
        BACKEND_ISSUES=$((BACKEND_ISSUES+1))
    fi

    append ""
fi

# ============================================================
# БЛОК 2: FLUTTER
# ============================================================
if [ -n "$FLUTTER_FILES" ]; then
    append "\U0001F4F1 <b>FLUTTER</b>"
    append "──────────────────"

    SCREEN_FILES=$(echo "$FLUTTER_FILES" | grep -E "screens/" || true)
    WIDGET_FILES=$(echo "$FLUTTER_FILES" | grep -E "widgets/" || true)
    SERVICE_DART=$(echo "$FLUTTER_FILES" | grep -E "services/" || true)
    API_FILES=$(echo "$FLUTTER_FILES" | grep -E "api/" || true)
    MODEL_FILES=$(echo "$FLUTTER_FILES" | grep -E "models/" || true)

    [ -n "$SCREEN_FILES" ] && append "\U0001F5A5 Экраны: $(echo "$SCREEN_FILES" | wc -l) файл(ов)"
    [ -n "$WIDGET_FILES" ] && append "\U0001F9E9 Виджеты: $(echo "$WIDGET_FILES" | wc -l) файл(ов)"
    [ -n "$SERVICE_DART" ] && append "⚙️ Сервисы: $(echo "$SERVICE_DART" | wc -l) файл(ов)"
    [ -n "$API_FILES" ] && append "\U0001F310 API клиент: $(echo "$API_FILES" | wc -l) файл(ов)"
    [ -n "$MODEL_FILES" ] && append "\U0001F4D0 Модели: $(echo "$MODEL_FILES" | wc -l) файл(ов)"

    while IFS= read -r f; do
        [ -z "$f" ] || [ ! -f "$f" ] && continue

        null_force=$(grep -oE '[^!=]![^=]' "$f" 2>/dev/null | wc -l || echo 0)
        if [ "$null_force" -gt 15 ]; then
            append "  ⚠️ <code>$f</code>: ${null_force} принудительных unwrap (!)"
            FLUTTER_ISSUES=$((FLUTTER_ISSUES+1))
        fi

        async_count=$(grep -cE "^\s+async " "$f" 2>/dev/null || echo 0)
        trycatch_count=$(grep -cE "try\s*\{|on\s+\w+Exception|catch\s*\(" "$f" 2>/dev/null || echo 0)
        if [ "$async_count" -gt 3 ] && [ "$trycatch_count" -eq 0 ]; then
            append "  ⚠️ <code>$f</code>: ${async_count} async-функций без try/catch"
            FLUTTER_ISSUES=$((FLUTTER_ISSUES+1))
        fi
    done <<< "$FLUTTER_FILES"

    if echo "$FLUTTER_FILES" | grep -q "pubspec.yaml"; then
        append "\U0001F4E6 Изменён <code>pubspec.yaml</code> — проверьте совместимость зависимостей"
        FLUTTER_ISSUES=$((FLUTTER_ISSUES+1))
    fi

    MISPLACED=$(echo "$FLUTTER_FILES" | grep -E "\.dart$" | grep -vE "screens/|widgets/|services/|models/|api/|theme/|main\.dart|test/" || true)
    if [ -n "$MISPLACED" ]; then
        append "⚠️ Файлы вне стандартной структуры проекта:"
        while IFS= read -r f; do append "  • <code>$f</code>"; done <<< "$MISPLACED"
        FLUTTER_ISSUES=$((FLUTTER_ISSUES+1))
    fi

    append ""
fi

# ============================================================
# БЛОК 3: ВИДЕОСТРИМИНГ (go2rtc / RTSP)
# ============================================================
if [ -n "$STREAMING_FILES" ]; then
    append "\U0001F3A5 <b>ВИДЕОСТРИМИНГ</b>"
    append "──────────────────────"

    while IFS= read -r f; do
        [ -z "$f" ] && continue
        append "  \U0001F4C4 <code>$f</code>"

        if [ -f "$f" ]; then
            has_error_handling=$(grep -cE "try|catch|\.catch\(|onError|handleError|error\b" "$f" 2>/dev/null || echo 0)
            if [ "$has_error_handling" -eq 0 ]; then
                append "    \U0001F6A8 Отсутствует обработка ошибок!"
                STREAMING_ISSUES=$((STREAMING_ISSUES+1))
                CRITICAL_ISSUES=$((CRITICAL_ISSUES+1))
            fi

            has_timeout=$(grep -cE "timeout|Timeout|setTimeout" "$f" 2>/dev/null || echo 0)
            if [ "$has_timeout" -eq 0 ]; then
                append "    ⚠️ Нет обработки таймаутов подключения"
                STREAMING_ISSUES=$((STREAMING_ISSUES+1))
            fi

            has_auth=$(grep -cE "auth|token|jwt|JWT|Authorization" "$f" 2>/dev/null || echo 0)
            if [ "$has_auth" -eq 0 ]; then
                append "    ⚠️ Нет проверки авторизации для доступа к стриму"
                STREAMING_ISSUES=$((STREAMING_ISSUES+1))
            fi

            if grep -qiE "go2rtc|rtc" "$f" 2>/dev/null; then
                rtsp_with_creds=$(grep -cE "rtsp://[^@]+:[^@]+@" "$f" 2>/dev/null || echo 0)
                if [ "$rtsp_with_creds" -gt 0 ]; then
                    append "    \U0001F6A8 RTSP URL с учётными данными в открытом виде!"
                    CRITICAL_ISSUES=$((CRITICAL_ISSUES+1))
                fi
            fi
        fi
    done <<< "$STREAMING_FILES"

    append ""
fi

# ============================================================
# ИТОГОВЫЙ СТАТУС
# ============================================================
append "\U0001F4CA <b>ИТОГ</b>"
append "━━━━━━━━━━━━━━━━━━━━━━"
append "\U0001F3D7 Бэкенд: ${BACKEND_ISSUES} проблем"
append "\U0001F4F1 Flutter: ${FLUTTER_ISSUES} проблем"
append "\U0001F3A5 Стриминг: ${STREAMING_ISSUES} проблем"
append "\U0001F6A8 Критических: ${CRITICAL_ISSUES}"
append ""

if [ "$CRITICAL_ISSUES" -gt 0 ]; then
    append "\U0001F6A8 <b>СТАТУС: КРИТИЧЕСКИЕ ПРОБЛЕМЫ — ТРЕБУЕТСЯ ПРОВЕРКА</b>"
elif [ $((BACKEND_ISSUES + FLUTTER_ISSUES + STREAMING_ISSUES)) -gt 0 ]; then
    append "⚠️ <b>СТАТУС: ЕСТЬ ПРЕДУПРЕЖДЕНИЯ</b>"
else
    append "✅ <b>СТАТУС: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ</b>"
fi

echo "$REPORT"
