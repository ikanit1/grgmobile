# Flutter Design System — Remaining Work Spec
**Дата:** 2026-04-19
**Источники:** `docs/tokens.css`, `docs/index (1).html`, `docs/superpowers/specs/2026-04-18-flutter-design-system-spec.md`
**Платформа:** Flutter

---

## Контекст

Из плана `2026-04-18-flutter-design-system.md` уже реализовано:
- ✅ `GlassCard` — BackdropFilter glassmorphism + highlight-линия
- ✅ `SkeletonBox`, `SkeletonBuildingCard`, `SkeletonEventItem`
- ✅ `MainShell` — 4 вкладки (Главная, События, Управление, Профиль) + badge непрочитанных
- ✅ `EventsScreen` — фильтры, skeleton, socket-обновление

Остаётся реализовать 4 задачи.

---

## 1. ProfileScreen — полный редизайн

**Файл:** `lib/screens/profile_screen.dart`

### Layout (SingleChildScrollView внутри SafeArea)

```
SafeArea
└─ SingleChildScrollView
   ├─ [Hero GlassCard]
   │   gradient(135deg, AppColors.purple.withOpacity(.30), AppColors.surface)
   │   border: AppColors.border
   │   ├─ CircleAvatar(66px)
   │   │   gradient #8A2BE2 → #5FA8FF, инициалы белым
   │   ├─ Text(name, 18/600, Manrope)
   │   └─ Text(role + дата, 11px, AppColors.textSecondary)
   │
   ├─ [Данные GlassCard]  padding: EdgeInsets.zero
   │   ├─ _ProfileRow(icon: email, label:'Email', value: ...) → bottom sheet
   │   ├─ Divider(color: AppColors.border, height:1)
   │   ├─ _ProfileRow(icon: phone, label:'Телефон', value: ...)
   │   ├─ Divider
   │   └─ _ProfileRow(icon: lock, label:'Пароль', value:'Изменить')
   │
   └─ [Danger GlassCard]
       border: AppColors.danger.withOpacity(.25)
       └─ InkWell → onLogout()
           Row: Icon(logout, AppColors.danger) + Text('Выйти из аккаунта', AppColors.danger)
```

### _ProfileRow widget (приватный)
```dart
// ListTile-подобная строка с иконкой, лейблом и chevron_right
// Тап → колбэк onTap
// padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14)
```

### Bottom sheets

**Email / Телефон** — `showModalBottomSheet`:
```
Column
├─ Text(лейбл, 13px uppercase)
├─ TextField (prefilled текущим значением)
└─ FilledButton('Сохранить') → PATCH /api/users/profile
    onSuccess: SnackBar('Сохранено'), setState
    onError: SnackBar(error)
```

**Пароль** — два поля: «Текущий пароль» + «Новый пароль».
→ `POST /api/auth/change-password`

### Цвета — только AppColors
- Убрать `Colors.red` → `AppColors.danger`
- Убрать `Colors.green` → `AppColors.success`
- Inline текстовые сообщения об ошибке → `ScaffoldMessenger.of(context).showSnackBar`

---

## 2. IncomingCallScreen — новые кнопки

**Файл:** `lib/screens/incoming_call_screen.dart`

### Layout кнопок (нижняя часть экрана)
```dart
Padding(
  padding: EdgeInsets.fromLTRB(24, 16, 24, 24),
  child: Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      _CallButton(size: 56, /* Сбросить */),
      _CallButton(size: 84, /* ОТКРЫТЬ — primary */),
      _CallButton(size: 56, /* Ответить */),
    ],
  ),
)
```

### Параметры каждой кнопки

| Кнопка | size | background | foreground |
|--------|------|-----------|------------|
| Сбросить | 56 | `AppColors.danger.withOpacity(.20)` | `AppColors.danger` |
| **ОТКРЫТЬ** | 84 | `LinearGradient([Color(0xFF52E5B8), AppColors.success])` | `Color(0xFF06281D)` |
| Ответить | 56 | `AppColors.purple.withOpacity(.25)` | `Color(0xFFC9A6FF)` |

### Кнопка «ОТКРЫТЬ» (primary)
```dart
BoxDecoration(
  gradient: LinearGradient(colors: [Color(0xFF52E5B8), AppColors.success]),
  borderRadius: BorderRadius.circular(42),
  boxShadow: [
    BoxShadow(color: AppColors.success.withOpacity(.18), spreadRadius: 8),
    BoxShadow(color: AppColors.success.withOpacity(.50), blurRadius: 30, offset: Offset(0, 14)),
  ],
)
// иконка: Icons.lock_open, size: 36, color: Color(0xFF06281D)
// лейбл: 'Открыть', 12/700, Color(0xFFA7FFD6)
```

### Loading state внутри кнопки «ОТКРЫТЬ»
```dart
// вместо иконки при _openDoorLoading == true
CircularProgressIndicator(color: Color(0xFF06281D), strokeWidth: 2.5)
```

### HapticFeedback
```dart
// В _openDoor() перед вызовом API:
HapticFeedback.mediumImpact();
```

### Заголовок
```
Text('ВХОДЯЩИЙ', style: TextStyle(fontSize: 11, letterSpacing: 1.5, color: AppColors.textSecondary))
Text('$buildingName · кв. $apartmentNumber', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600))
```

---

## 3. Иконки событий — HomeScreen

**Файл:** `lib/screens/home_screen.dart`

Найти виджет предпросмотра событий (секция «Последние события»).
Заменить `Icons.circle, size: 8` на тайл с иконкой по типу события.

### Вспомогательная функция (добавить в файл или в отдельный хелпер)

```dart
({IconData icon, Color tileColor, Color iconColor}) eventStyle(String eventType) {
  switch (eventType.toLowerCase()) {
    case 'door_open':
      return (icon: Icons.lock_open_rounded,
              tileColor: AppColors.success.withOpacity(.18),
              iconColor: AppColors.success);
    case 'incoming_call':
      return (icon: Icons.call_rounded,
              tileColor: AppColors.purple.withOpacity(.20),
              iconColor: AppColors.purple);
    case 'motion':
      return (icon: Icons.directions_run,
              tileColor: AppColors.warning.withOpacity(.18),
              iconColor: AppColors.warning);
    case 'alarm':
      return (icon: Icons.notifications_active,
              tileColor: AppColors.danger.withOpacity(.18),
              iconColor: AppColors.danger);
    default:
      return (icon: Icons.sensors,
              tileColor: AppColors.border.withOpacity(.18),
              iconColor: AppColors.textSecondary);
  }
}
```

### Маппинг foreground-цвета иконки

| eventType | foreground |
|-----------|-----------|
| `door_open` | `AppColors.success` |
| `incoming_call` | `AppColors.purple` |
| `motion` | `AppColors.warning` |
| `alarm` | `AppColors.danger` |
| default | `AppColors.textSecondary` |

### Тайл иконки
```dart
final style = eventStyle(eventType);
Container(
  width: 28, height: 28,
  decoration: BoxDecoration(
    color: style.tileColor,
    borderRadius: BorderRadius.circular(8),
  ),
  child: Icon(style.icon, size: 15, color: style.iconColor),
)
```

Добавить `iconColor` в возвращаемый record функции `eventStyle`.

---

## 4. Иконки событий — DeviceEventsScreen

**Файл:** `lib/screens/device_events_screen.dart`

Применить ту же функцию `_eventStyle` (вынести в `lib/utils/event_style.dart` если используется в обоих файлах).

- Убрать `Icons.circle, size: 8` везде
- Убрать `Colors.red` / `Colors.green` → `AppColors.danger` / `AppColors.success`
- Skeleton при загрузке: показывать 5× `SkeletonEventItem` (уже есть в `skeleton_card.dart`)

---

## Порядок реализации

1. Создать `lib/utils/event_style.dart` — единая функция `eventStyle(String type)` (избегаем дублирования в HomeScreen и DeviceEventsScreen)
2. `HomeScreen` — заменить иконки событий
3. `DeviceEventsScreen` — заменить иконки, убрать Colors.red/green, добавить skeleton
4. `IncomingCallScreen` — новые кнопки + HapticFeedback
5. `ProfileScreen` — полный редизайн (hero, rows, bottom sheets, danger zone)
