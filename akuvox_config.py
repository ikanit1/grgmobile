"""
Настройка панели Akuvox по JSON-конфигу: SIP, Action URL (события), API White List.
Конфиг — из файла (--config <path>) или из stdin.
Запуск: python akuvox_config.py
        python akuvox_config.py --config config.json
        cat config.json | python akuvox_config.py
Используется только stdlib (json, urllib, ssl). Зависимости не требуются.
"""
import argparse
import json
import base64
import sys
import urllib.request
import urllib.error
import ssl

_ssl_ctx = None


def _ssl_context():
    global _ssl_ctx
    if _ssl_ctx is None:
        _ssl_ctx = ssl.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = ssl.CERT_NONE
    return _ssl_ctx


def load_config(path: str | None) -> dict:
    if path and path != "-":
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    data = sys.stdin.read()
    return json.loads(data)


def panel_request(panel: dict, path: str, method: str = "GET", data: dict | None = None, content_type: str = "application/json") -> tuple:
    """GET/POST к панели. panel = { host, username, password }. Возвращает (status_code, body)."""
    host = panel.get("host", "").strip().rstrip("/")
    if "://" not in host:
        host = f"http://{host}"
    url = f"{host}{path}"
    user = panel.get("username", "admin")
    password = panel.get("password", "")
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    headers = {"Authorization": f"Basic {token}"}
    if data is not None:
        headers["Content-Type"] = content_type
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url=url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10, context=_ssl_context()) as r:
            raw = r.read().decode("utf-8", errors="ignore")
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        try:
            body_err = e.read().decode("utf-8", errors="ignore")
            return e.code, body_err
        except Exception:
            return e.code, str(e.reason)
    except urllib.error.URLError as e:
        return None, f"Панель недоступна: {e.reason}"


def apply_sip(panel: dict, sip_config: list | dict) -> bool:
    """Настройка SIP через /api/sip/set. sip_config — массив аккаунтов или один объект { server, user, password }."""
    accounts = sip_config if isinstance(sip_config, list) else [sip_config]
    payload = []
    for i, acc in enumerate(accounts):
        if not isinstance(acc, dict):
            print(f"  [SIP] Пропуск элемента {i}: не объект")
            continue
        payload.append({
            "server": acc.get("server", ""),
            "user": acc.get("user", ""),
            "password": acc.get("password", ""),
        })
    if not payload:
        print("  [SIP] Нет данных для настройки, пропуск.")
        return True
    # Akuvox Linux API: POST /api/sip/set — точный формат тела уточнить по документации для модели
    code, resp = panel_request(panel, "/api/sip/set", "POST", {"account": payload} if len(payload) == 1 else {"accounts": payload})
    if code == 200:
        print("  [SIP] Настройка применена.")
        return True
    print(f"  [SIP] Ошибка: {code} — {resp}")
    return False


def apply_action_urls(panel: dict, action_urls: dict) -> bool:
    """Прописать URL для событий (Open Door, Incoming Call, Call Finished).
    Точные ключи и путь API уточнить по Akuvox Linux Api для модели X912 (callback/event URL)."""
    if not action_urls:
        print("  [Action URLs] Нет данных, пропуск.")
        return True
    # Заглушка: в документации искать раздел callback / event URL / HTTP notify;
    # типично это может быть /api/config/set с полями типа openDoorUrl, incomingCallUrl, callFinishedUrl
    # или отдельные эндпоинты. Для X912 уточнить по Akuvox Linux Api_20250530.html.
    open_door = action_urls.get("openDoor") or action_urls.get("openDoorUrl")
    incoming = action_urls.get("incomingCall") or action_urls.get("incomingCallUrl")
    call_finished = action_urls.get("callFinished") or action_urls.get("callFinishedUrl")
    config_body = {}
    if open_door:
        config_body["openDoorUrl"] = open_door
    if incoming:
        config_body["incomingCallUrl"] = incoming
    if call_finished:
        config_body["callFinishedUrl"] = call_finished
    if not config_body:
        print("  [Action URLs] Нет URL в конфиге, пропуск.")
        return True
    code, resp = panel_request(panel, "/api/config/set", "POST", config_body)
    if code == 200:
        print("  [Action URLs] URL применены.")
        return True
    # Эндпоинт или ключи могут отличаться — не падать, только предупредить
    print(f"  [Action URLs] Предупреждение: /api/config/set вернул {code} — {resp}. Уточнить ключи по документации X912.")
    return True


def apply_api_whitelist(panel: dict, api_whitelist: list) -> bool:
    """Режим API White List — разрешённые IP. Параметр уточнить по документации (whitelist / trusted IP)."""
    if not api_whitelist:
        print("  [API Whitelist] Список пуст, пропуск.")
        return True
    # Заглушка: в документации искать параметры доступа к API (whitelist, trusted IP)
    body = {"apiWhitelist": api_whitelist} if isinstance(api_whitelist, list) else {"apiWhitelist": [str(api_whitelist)]}
    code, resp = panel_request(panel, "/api/config/set", "POST", body)
    if code == 200:
        print("  [API Whitelist] Список IP применён.")
        return True
    print(f"  [API Whitelist] Предупреждение: /api/config/set вернул {code} — {resp}. Уточнить ключ по документации X912.")
    return True


def _normalize_apartment_contacts(config: dict) -> list[tuple[str, str]]:
    """Возвращает список (number, phone) для контактов. Предпочитает apartmentContacts, иначе apartmentNumbers с пустым Phone."""
    contacts = config.get("apartmentContacts")
    if contacts and isinstance(contacts, list):
        return [
            (str(c.get("number", "")), str(c.get("extension") or ""))
            for c in contacts
            if isinstance(c, dict) and c.get("number") is not None
        ]
    numbers = config.get("apartmentNumbers")
    if numbers and isinstance(numbers, list):
        return [(str(n), "") for n in numbers]
    return []


def apply_contacts(panel: dict, contact_list: list[tuple[str, str]] | None = None, config: dict | None = None) -> bool:
    """Синхронизация контактов (квартир) на панели Akuvox: contact/clear + contact/add.
    contact_list: [(number, phone), ...] или берётся из config (apartmentContacts или apartmentNumbers).
    API по Akuvox Linux Api: /api/contact/clear, /api/contact/add (Only support R20 and R25; X912/S532 используют user)."""
    if config is not None:
        contact_list = _normalize_apartment_contacts(config)
    if not contact_list:
        print("  [Контакты] Список квартир пуст, пропуск.")
        return True
    code, resp = panel_request(
        panel, "/api/contact/clear", "POST",
        {"target": "contact", "action": "clear"},
        content_type="text/plain",
    )
    if code != 200:
        print(f"  [Контакты] Ошибка clear: {code} — {resp}. Модель может не поддерживать contact API (R20/R25). X912/S532/S562 используют user API — SIP и вебхуки применены.")
        return False  # вызывающий вызовет apply_users для X912
    print("  [Контакты] Список контактов очищен.")
    batch_size = 50
    for i in range(0, len(contact_list), batch_size):
        batch = contact_list[i : i + batch_size]
        items = [
            {"Account": "1", "Group": "Default", "ID": "", "Name": num, "Phone": (phone or "").strip()}
            for num, phone in batch
        ]
        body = {
            "target": "contact",
            "action": "add",
            "data": {"num": len(items), "item": items},
        }
        code, resp = panel_request(
            panel, "/api/contact/add", "POST",
            body,
            content_type="text/plain",
        )
        if code != 200:
            print(f"  [Контакты] Ошибка add (batch {i // batch_size + 1}): {code} — {resp}. На X912/S532/S562 справочник настраивается вручную или через user API.")
            return False
    print(f"  [Контакты] Загружено квартир: {len(contact_list)}.")
    return True


def apply_users(panel: dict, contact_list: list[tuple[str, str]] | None = None, config: dict | None = None) -> bool:
    """Синхронизация пользователей (квартир) на панели X912/S532/S562: user/clear + user/add.
    Список квартир — как в apply_contacts (apartmentContacts или apartmentNumbers).
    По Akuvox Linux Api обязательные поля item: Name, UserID, LiftFloorNum, WebRelay, Schedule-Relay."""
    if config is not None:
        contact_list = _normalize_apartment_contacts(config)
    if not contact_list:
        print("  [Пользователь] Список квартир пуст, пропуск.")
        return True
    code, resp = panel_request(
        panel, "/api/user/clear", "POST",
        {"target": "user", "action": "clear"},
        content_type="text/plain",
    )
    if code != 200:
        print(f"  [Пользователь] Ошибка clear: {code} — {resp}")
        return False
    print("  [Пользователь] Список пользователей очищен.")
    # Обязательные поля по Akuvox: Name, UserID, LiftFloorNum, WebRelay, Schedule-Relay
    batch_size = 50
    for i in range(0, len(contact_list), batch_size):
        batch = contact_list[i : i + batch_size]
        items = []
        for num, _phone in batch:
            # Имя как в каталоге панели: "кв1", "кв2", "кв101" для колонки «Имя»
            display_name = f"кв{num}" if num and not str(num).lower().startswith("кв") else str(num)
            items.append({
                "Name": display_name,
                "UserID": num,
                "LiftFloorNum": 0,
                "WebRelay": 0,
                "Schedule-Relay": "1001-12;",
            })
        body = {
            "target": "user",
            "action": "add",
            "data": {"num": len(items), "item": items},
        }
        code, resp = panel_request(
            panel, "/api/user/add", "POST",
            body,
            content_type="text/plain",
        )
        if code != 200:
            print(f"  [Пользователь] Ошибка add (batch {i // batch_size + 1}): {code} — {resp}")
            return False
    print(f"  [Пользователь] Загружено квартир: {len(contact_list)}.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Akuvox: применить конфиг из JSON (SIP, Action URL, Whitelist)")
    parser.add_argument("--config", "-c", type=str, default=None, help="Путь к JSON-файлу конфига; иначе читать stdin")
    args = parser.parse_args()

    try:
        config = load_config(args.config)
    except FileNotFoundError as e:
        print(f"Ошибка: файл не найден — {e.filename}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Ошибка: неверный JSON — {e}", file=sys.stderr)
        return 1

    panel = config.get("panel")
    if not panel or not panel.get("host"):
        print("Ошибка: в конфиге должен быть объект panel с полем host (и username, password).", file=sys.stderr)
        return 1

    print("=== Проверка панели ===")
    code, data = panel_request(panel, "/api/system/info")
    if code == 200 and isinstance(data, dict):
        print("  Панель отвечает:", data.get("data") or data)
    elif code is None:
        print("  ", data)
        print("  Дальнейшие шаги могут не выполниться.")
    else:
        print(f"  Панель вернула {code}. Продолжаем.")

    ok = True
    sip = config.get("sip")
    if sip is not None:
        print("\n=== SIP ===")
        ok = apply_sip(panel, sip) and ok

    action_urls = config.get("actionUrls") or config.get("action_urls")
    if action_urls is not None:
        print("\n=== Action URL (события) ===")
        ok = apply_action_urls(panel, action_urls) and ok

    api_whitelist = config.get("apiWhitelist") or config.get("api_whitelist")
    if api_whitelist is not None:
        print("\n=== API White List ===")
        ok = apply_api_whitelist(panel, api_whitelist) and ok

    if config.get("apartmentContacts") is not None or config.get("apartmentNumbers") is not None:
        print("\n=== Контакты (квартиры) ===")
        contact_ok = apply_contacts(panel, config=config)
        if not contact_ok:
            print("  Пробуем user API (X912/S532/S562)...")
            apply_users(panel, config=config)  # не влияет на ok

    backend = config.get("backend", {})
    if backend.get("baseUrl"):
        print("\n=== Справка ===")
        print(f"  Backend: {backend.get('baseUrl')}")
        print("  Вебхук событий панели: POST <baseUrl>/api/webhooks/akuvox")
        print("  Заголовок X-Webhook-Secret = webhookSecret из конфига / .env")

    print("\n=== Готово ===")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
