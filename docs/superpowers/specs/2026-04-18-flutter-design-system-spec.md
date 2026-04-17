# Flutter Design System — Spec
**Дата:** 2026-04-18
**Источники:** `docs/index (1).html`, `docs/tokens.css`, `design-critique.md`
**Платформа:** Flutter (мобильное приложение)

---

## Цель

Привести Flutter-приложение в соответствие с единой дизайн-системой GRG, описанной в `docs/tokens.css` и визуализированной в `docs/index (1).html`. Устранить 7 проблем из `design-critique.md` (приоритеты 1–10 для Flutter).

---

## 1. Навигация: 2 вкладки → 4 вкладки

**Файл:** `lib/screens/main_shell.dart`

### AppPage enum
```dart
enum AppPage { home, events, control, profile }
```

### Вкладки (иконки outlined/filled)
| Индекс | Лейбл | Outlined | Filled |
|--------|-------|----------|--------|
| 0 | Главная | `Icons.home_outlined` | `Icons.home` |
| 1 | События | `Icons.event_note_outlined` | `Icons.event_note` |
| 2 | Управление | `Icons.tune_outlined` | `Icons.tune` |
| 3 | Профиль | `Icons.person_outline` | `Icons.person` |

### IndexedStack — 4 дочерних виджета
- `HomeScreen` — без изменений (убрать секцию «Последние события» из него — она переезжает в tab Events)
- `EventsScreen` — **новый экран** (см. п. 1.1)
- `SettingsScreen` — существующий, без изменений
- `ProfileScreen` — существующий, переработанный (см. п. 2)

### Бейдж на вкладке «События»
- При старте и при получении WebSocket-события вызывать `GET /api/events/unread-count`
- Если `count > 0` — показывать красный `Badge` с числом на иконке
- Обновлять count при переключении на вкладку Events (сбрасывать badge)

### Callback onOpenSettingsTab
Заменить на `onOpenTab(AppPage page)` — более гибкий. Обновить все места вызова.

### 1.1 EventsScreen (новый)
**Файл:** `lib/screens/events_screen.dart`

- Загрузка: `GET /api/events?limit=50` через `BackendClient.getEvents(limit: 50)`
- Добавить метод `getEvents` в `BackendClient`
- Список событий с иконками по типу (см. п. 7)
- Skeleton-загрузка пока данные грузятся (см. п. 5)
- Реалтайм: подписка на `EventsSocketService.instance.events`, при событии перезагружать список
- Фильтры (чипы): Все / Двери / Звонки / Движение / Тревоги — аналогично `DeviceEventsScreen`
- Пустое состояние: иконка + текст «Нет событий»

---

## 2. ProfileScreen — приведение к дизайн-системе

**Файл:** `lib/screens/profile_screen.dart`

### Структура (точно по мокапу из index.html)

```
Scaffold(backgroundColor: transparent)
└─ SafeArea
   └─ CustomScrollView / SingleChildScrollView
      ├─ [Back row] — кнопка-круг с chevron_left + лейбл "ПРОФИЛЬ" uppercase
      │
      ├─ [Hero GlassCard] gradient(135deg, purple.30, ink.30)
      │   ├─ Аватар: CircleAvatar 66px, gradient #8A2BE2→#5FA8FF, инициалы
      │   ├─ Имя: Manrope 18/600
      │   └─ Роль + дата: 11px, AppColors.textSecondary
      │
      ├─ [Данные GlassCard] — ListTile-строки с разделителями
      │   ├─ Email icon + лейбл "Email" + значение + chevron_right
      │   ├─ Phone icon + лейбл "Телефон" + значение + chevron_right
      │   └─ Lock icon + лейбл "Пароль" + "Изменён N дней назад" + chevron_right
      │   (тап → bottom sheet с TextFields для редактирования)
      │
      └─ [Danger GlassCard] border: AppColors.danger.withOpacity(0.25)
          └─ logout icon (AppColors.danger) + "Выйти из аккаунта"
```

### Цвета — только AppColors
- Убрать все `Colors.red` → `AppColors.danger`
- Убрать все `Colors.green` → `AppColors.success`
- Сообщение об успехе/ошибке через `SnackBar`, не inline Text

### Bottom sheet для редактирования
При тапе на строку Email/Телефон открывается `showModalBottomSheet` с одним полем + кнопкой «Сохранить».
При тапе на «Пароль» — bottom sheet с двумя полями (текущий + новый).

---

## 3. IncomingCallScreen — приоритизация кнопок

**Файл:** `lib/screens/incoming_call_screen.dart`

### Новый layout кнопок (секция внизу экрана)
```
padding: EdgeInsets.fromLTRB(24, 16, 24, 24)
Row(mainAxisAlignment: spaceBetween)
├─ [Сбросить]   56×56  danger.withOpacity(0.20)  foreground: danger
├─ [ОТКРЫТЬ]    84×84  gradient(#52E5B8→#3DD598)  foreground: Color(0xFF06281D)
└─ [Ответить]   56×56  purple.withOpacity(0.25)   foreground: Color(0xFFC9A6FF)
```

### «Открыть» (primary)
```dart
BoxDecoration(
  gradient: LinearGradient(colors: [Color(0xFF52E5B8), AppColors.success]),
  borderRadius: BorderRadius.circular(42),
  boxShadow: [
    BoxShadow(color: AppColors.success.withOpacity(0.18), spreadRadius: 8),
    BoxShadow(color: AppColors.success.withOpacity(0.50), blurRadius: 30, offset: Offset(0,14)),
  ],
)
// иконка lock_open 36px, цвет Color(0xFF06281D)
// лейбл 'Открыть дверь', 12/700, Color(0xFFA7FFD6)
```

### Loading state
Заменить `'...'` → `CircularProgressIndicator(color: Color(0xFF06281D), strokeWidth: 2.5)` внутри кнопки 84×84.

### Заголовок
```
Строка 1: 'ВХОДЯЩИЙ'  — 11px, uppercase, letter-spacing 1.5, AppColors.textSecondary
Строка 2: buildingName · кв. X  — Manrope 18/600 (display font)
```

---

## 4. GlassCard — настоящий glassmorphism

**Файл:** `lib/widgets/glass_card.dart`

### Новая реализация
```dart
import 'dart:ui';

ClipRRect(
  borderRadius: BorderRadius.circular(16),
  child: BackdropFilter(
    filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
    child: Container(
      decoration: BoxDecoration(
        color: AppColors.surface,  // rgba(26,11,46, 0.40) — уже есть
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Stack(
        children: [
          // highlight-линия по верхнему краю (из мокапа)
          Positioned(
            top: 0, left: 20, right: 20,
            child: Container(height: 1, color: Colors.white.withOpacity(0.10)),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    ),
  ),
)
```

**Добавить** `import 'dart:ui';` в файл.
**Условие:** `BackdropFilter` работает только если все родители — прозрачный Scaffold. Это уже обеспечено.

---

## 5. Skeleton-загрузка

**Новый файл:** `lib/widgets/skeleton_card.dart`

### SkeletonBox — базовый блок
```dart
// AnimationController 0→1→0, duration 1.4s, repeat
// ShaderMask с LinearGradient: purple.08 → purple.22 → purple.08
// borderRadius: 8 (по умолчанию)
SkeletonBox({double width, double height, double radius = 8})
```

### SkeletonBuildingCard — скелетон карточки здания
```
GlassCard(padding: 12)
└─ Row
   ├─ SkeletonBox(40×40, radius:12)  // иконтайл
   └─ Column
      ├─ SkeletonBox(w: 60%, h: 13)
      └─ SkeletonBox(w: 40%, h: 10)
```

### SkeletonEventItem — скелетон строки события
```
Row
├─ SkeletonBox(28×28, radius:8)
└─ Column
   ├─ SkeletonBox(w: 55%, h: 12)
   └─ SkeletonBox(w: 40%, h: 10)
```

### Где использовать
- `_BackendHomeContent` — список зданий: показывать 3× `SkeletonBuildingCard`
- `EventsScreen` — список событий: показывать 5× `SkeletonEventItem`
- `DeviceEventsScreen` — список событий: аналогично

---

## 6. Padding в _BuildingCard

**Файл:** `lib/screens/home_screen.dart`

Найти `_BuildingCard` → `EdgeInsets.all(4)` → заменить на `EdgeInsets.all(16)`.

---

## 7. Иконки событий по типу

**Затрагивает:** `DeviceEventsScreen`, `EventsScreen`, `HomeScreen` (виджет предпросмотра событий)

### Маппинг типов → иконки → цвет фона тайла
| eventType | Icon | Цвет фона тайла |
|-----------|------|----------------|
| `door_open` | `Icons.lock_open_rounded` | `AppColors.success.withOpacity(0.18)` |
| `incoming_call` | `Icons.call_rounded` | `AppColors.purple.withOpacity(0.20)` |
| `motion` | `Icons.directions_run` | `AppColors.warning.withOpacity(0.18)` |
| `alarm` | `Icons.notifications_active` | `AppColors.danger.withOpacity(0.18)` |
| (default) | `Icons.sensors` | `AppColors.border` |

Убрать `Icons.circle, size: 8` везде.

---

## BackendClient — новые методы

**Файл:** `lib/api/backend_client.dart`

```dart
// Глобальная лента событий (все доступные устройства)
Future<List<DeviceEventDto>> getEvents({int limit = 50}) async {
  final r = await _get('/events?limit=$limit');
  return (r as List).map((e) => DeviceEventDto.fromJson(e)).toList();
}

// Счётчик непрочитанных
Future<int> getUnreadEventCount() async {
  final r = await _get('/events/unread-count');
  return r['count'] as int;
}
```

---

## Дополнительные требования

### BackdropFilter — производительность
`sigmaX/Y: 14` — стартовое значение. Если на слабом Android заметно падение FPS → снизить до `8`. Можно добавить `const bool kReducedMotion = bool.fromEnvironment('REDUCED_MOTION')` как fallback на solid-фон.

### SafeArea в ProfileScreen
Hero-карточка должна иметь `top`-отступ минимум 8px от статус-бара (notch). `SafeArea` уже обёртывает содержимое — убедиться, что аватар не прилипает к краю.

### HapticFeedback на «Открыть дверь»
В `IncomingCallScreen._openDoor()` добавить `HapticFeedback.mediumImpact()` перед API-вызовом — улучшает premium-feel.

---

## Порядок реализации

1. `GlassCard` — добавить BackdropFilter (изолированное изменение, проверяется сразу)
2. `SkeletonCard` — новый виджет
3. `BackendClient` — добавить `getEvents`, `getUnreadEventCount`
4. `EventsScreen` — новый экран
5. `MainShell` — расширить до 4 вкладок, подключить бейдж
6. `ProfileScreen` — полный редизайн
7. `IncomingCallScreen` — новые кнопки
8. `HomeScreen` — убрать секцию событий (теперь в Events tab), исправить padding
9. Иконки событий — в DeviceEventsScreen и EventsScreen
