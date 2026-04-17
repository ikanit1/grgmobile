# Flutter Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести Flutter-приложение в соответствие с дизайн-системой GRG из `docs/tokens.css` и `docs/index (1).html` — 8 файлов, 9 задач.

**Architecture:** Атомарные изменения снизу вверх: сначала GlassCard и Skeleton (компоненты), затем BackendClient (данные), экраны (EventsScreen, ProfileScreen, IncomingCall), потом навигация (MainShell), финально — HomeScreen и DeviceEventsScreen.

**Tech Stack:** Flutter / Dart, dart:ui (BackdropFilter), существующий BackendClient (getRecentEvents, getUnreadEventsCount), EventsSocketService (WebSocket), google_fonts/Manrope.

**Spec:** `docs/superpowers/specs/2026-04-18-flutter-design-system-spec.md`

---

## Файловая карта

| Действие | Файл | Ответственность |
|----------|------|----------------|
| Modify | `lib/widgets/glass_card.dart` | Добавить BackdropFilter + highlight |
| Create | `lib/widgets/skeleton_card.dart` | SkeletonBox, SkeletonBuildingCard, SkeletonEventItem |
| Create | `lib/screens/events_screen.dart` | Глобальная лента событий (новая вкладка) |
| Modify | `lib/screens/main_shell.dart` | 4 вкладки + бейдж непрочитанных |
| Modify | `lib/screens/profile_screen.dart` | Hero + ListTile rows + bottom sheets + danger zone |
| Modify | `lib/screens/incoming_call_screen.dart` | Primary 84×84 + secondary 56×56 + HapticFeedback |
| Modify | `lib/screens/home_screen.dart` | Skeleton, padding fix, event icons, убрать onOpenSettingsTab |
| Modify | `lib/screens/device_events_screen.dart` | Event icons, skeleton, AppColors вместо Colors.red |

---

## Task 1: GlassCard — настоящий glassmorphism

**Files:**
- Modify: `lib/widgets/glass_card.dart`

- [ ] **Step 1: Заменить содержимое glass_card.dart**

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
  });

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x730A001E),
                  blurRadius: 24,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Stack(
              children: [
                Positioned(
                  top: 0,
                  left: 20,
                  right: 20,
                  child: Container(
                    height: 1,
                    color: Colors.white.withValues(alpha: 0.10),
                  ),
                ),
                Padding(padding: padding, child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Проверить компиляцию**

```bash
cd d:/grgmobileapp && flutter analyze lib/widgets/glass_card.dart
```
Ожидание: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add lib/widgets/glass_card.dart
git commit -m "feat: add BackdropFilter + top highlight to GlassCard"
```

---

## Task 2: SkeletonCard — shimmer-компоненты

**Files:**
- Create: `lib/widgets/skeleton_card.dart`

- [ ] **Step 1: Создать файл skeleton_card.dart**

```dart
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'glass_card.dart';

class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    required this.width,
    required this.height,
    this.radius = 8,
  });

  final double width;
  final double height;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.radius),
          gradient: LinearGradient(
            colors: [
              AppColors.purple.withValues(alpha: 0.08 + _anim.value * 0.14),
              AppColors.purple.withValues(alpha: 0.22 + _anim.value * 0.08),
              AppColors.purple.withValues(alpha: 0.08 + _anim.value * 0.14),
            ],
            stops: const [0.0, 0.5, 1.0],
          ),
        ),
      ),
    );
  }
}

class SkeletonBuildingCard extends StatelessWidget {
  const SkeletonBuildingCard({super.key});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          SkeletonBox(width: 48, height: 48, radius: 14),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBox(width: 140, height: 13),
              const SizedBox(height: 6),
              SkeletonBox(width: 100, height: 10),
            ],
          ),
        ],
      ),
    );
  }
}

class SkeletonEventItem extends StatelessWidget {
  const SkeletonEventItem({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      child: Row(
        children: [
          SkeletonBox(width: 36, height: 36, radius: 10),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBox(width: 150, height: 12),
              const SizedBox(height: 5),
              SkeletonBox(width: 100, height: 10),
            ],
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Проверить компиляцию**

```bash
flutter analyze lib/widgets/skeleton_card.dart
```
Ожидание: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add lib/widgets/skeleton_card.dart
git commit -m "feat: add SkeletonBox, SkeletonBuildingCard, SkeletonEventItem widgets"
```

---

## Task 3: EventsScreen — глобальная лента событий

**Files:**
- Create: `lib/screens/events_screen.dart`

Примечание: `BackendClient` уже имеет `getRecentEvents(limit)` и `getUnreadEventsCount()` — новые методы не нужны.

- [ ] **Step 1: Создать events_screen.dart**

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../services/events_socket_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';
import '../widgets/skeleton_card.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, required this.client});
  final BackendClient client;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<RecentEventDto>? _events;
  bool _loading = true;
  String? _error;
  String _filter = 'all';
  StreamSubscription? _wsSub;

  static const _filters = {
    'all': 'Все',
    'door_open': 'Двери',
    'incoming_call': 'Звонки',
    'motion': 'Движение',
    'alarm': 'Тревоги',
  };

  @override
  void initState() {
    super.initState();
    _load();
    _wsSub = EventsSocketService.instance.events.listen((_) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await widget.client.getRecentEvents(limit: 50);
      if (mounted) setState(() { _events = list; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<RecentEventDto> get _filtered {
    if (_events == null) return [];
    if (_filter == 'all') return _events!;
    return _events!.where((e) {
      final t = e.eventType.toLowerCase();
      switch (_filter) {
        case 'door_open': return t.contains('door_open');
        case 'incoming_call': return t.contains('incoming_call') || t.contains('doorbell');
        case 'motion': return t.contains('motion') || t.contains('vmd');
        case 'alarm': return t.contains('alarm') || t.contains('io');
        default: return true;
      }
    }).toList();
  }

  static IconData _iconFor(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open')) return Icons.lock_open_rounded;
    if (t.contains('incoming_call') || t.contains('doorbell')) return Icons.call_rounded;
    if (t.contains('motion') || t.contains('vmd')) return Icons.directions_run;
    if (t.contains('alarm') || t.contains('io')) return Icons.notifications_active;
    return Icons.sensors;
  }

  static Color _iconBgFor(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open')) return AppColors.success.withValues(alpha: 0.18);
    if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple.withValues(alpha: 0.20);
    if (t.contains('motion') || t.contains('vmd')) return AppColors.warning.withValues(alpha: 0.18);
    if (t.contains('alarm') || t.contains('io')) return AppColors.danger.withValues(alpha: 0.18);
    return AppColors.border;
  }

  static Color _iconColorFor(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open')) return AppColors.success;
    if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple;
    if (t.contains('motion') || t.contains('vmd')) return AppColors.warning;
    if (t.contains('alarm') || t.contains('io')) return AppColors.danger;
    return AppColors.textSecondary;
  }

  static String _labelFor(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open')) return 'Открытие двери';
    if (t.contains('incoming_call') || t.contains('doorbell') || t.contains('doorcall')) return 'Входящий звонок';
    if (t.contains('motion') || t.contains('vmd')) return 'Движение';
    if (t.contains('alarm') || t.contains('io')) return 'Тревога';
    if (t.contains('tamper')) return 'Вскрытие';
    return type;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: const Text(
                'События',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 22,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: _filters.entries.map((entry) {
                  final selected = _filter == entry.key;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(entry.value),
                      selected: selected,
                      onSelected: (_) => setState(() => _filter = entry.key),
                      selectedColor: AppColors.purple.withValues(alpha: 0.25),
                      checkmarkColor: AppColors.purple,
                      labelStyle: TextStyle(
                        color: selected ? AppColors.textPrimary : AppColors.textSecondary,
                        fontSize: 13,
                      ),
                      backgroundColor: AppColors.surface,
                      side: BorderSide(color: selected ? AppColors.purple : AppColors.border),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: List.generate(5, (_) => const SkeletonEventItem()),
      );
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: AppColors.danger), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _load, child: const Text('Повторить')),
          ],
        ),
      );
    }
    final filtered = _filtered;
    if (filtered.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_note, size: 48, color: AppColors.textSecondary.withValues(alpha: 0.5)),
            const SizedBox(height: 12),
            const Text('Нет событий', style: TextStyle(color: AppColors.textSecondary, fontSize: 15)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.purple,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: filtered.length,
        itemBuilder: (ctx, i) {
          final e = filtered[i];
          final date = e.createdAt.length >= 16
              ? e.createdAt.substring(0, 16).replaceFirst('T', ' ')
              : e.createdAt;
          final bgColor = _iconBgFor(e.eventType);
          final iconColor = _iconColorFor(e.eventType);
          return GlassCard(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: bgColor,
                  ),
                  child: Icon(_iconFor(e.eventType), size: 18, color: iconColor),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _labelFor(e.eventType),
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(date, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                    ],
                  ),
                ),
                if (e.snapshotUrl != null && e.snapshotUrl!.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Image.network(e.snapshotUrl!, width: 48, height: 36, fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink()),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Проверить компиляцию**

```bash
flutter analyze lib/screens/events_screen.dart
```
Ожидание: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add lib/screens/events_screen.dart
git commit -m "feat: add EventsScreen — global events feed with filters and skeleton"
```

---

## Task 4: MainShell — 4 вкладки + бейдж

**Files:**
- Modify: `lib/screens/main_shell.dart`

- [ ] **Step 1: Заменить содержимое main_shell.dart**

```dart
import 'dart:async';
import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../models/api_config.dart';
import '../models/auth_user.dart';
import '../models/device_settings.dart';
import '../services/events_socket_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';
import 'events_screen.dart';
import 'home_screen.dart';
import 'profile_screen.dart';
import 'settings_screen.dart';

enum AppPage { home, events, control, profile }

class MainShell extends StatefulWidget {
  final ApiConfig apiConfig;
  final BackendClient? backendClient;
  final AuthUser? authUser;
  final Future<void> Function(ApiConfig config) onConfigUpdated;
  final Future<void> Function() onLogout;

  const MainShell({
    super.key,
    required this.apiConfig,
    this.backendClient,
    this.authUser,
    required this.onConfigUpdated,
    required this.onLogout,
  });

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;
  DeviceSettings? _settings;
  bool _settingsLoading = true;
  int _unreadCount = 0;
  StreamSubscription? _wsSub;

  static const _navItems = [
    (AppPage.home,    Icons.home_outlined,        Icons.home,        'Главная'),
    (AppPage.events,  Icons.event_note_outlined,  Icons.event_note,  'События'),
    (AppPage.control, Icons.tune_outlined,         Icons.tune,        'Управление'),
    (AppPage.profile, Icons.person_outline,        Icons.person,      'Профиль'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.backendClient == null) {
      _loadSettings();
    } else {
      setState(() => _settingsLoading = false);
      _loadUnread();
      _wsSub = EventsSocketService.instance.events.listen((_) => _loadUnread());
    }
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final s = await DeviceSettings.load();
    if (mounted) setState(() { _settings = s; _settingsLoading = false; });
  }

  Future<void> _loadUnread() async {
    try {
      final count = await widget.backendClient!.getUnreadEventsCount();
      if (mounted) setState(() => _unreadCount = count);
    } catch (_) {}
  }

  void _onTabTap(int index) {
    setState(() {
      _currentIndex = index;
      if (index == 1) _unreadCount = 0; // clear badge when entering Events
    });
  }

  @override
  Widget build(BuildContext context) {
    final isBackend = widget.backendClient != null;

    final pages = <Widget>[
      HomeScreen(
        settings: isBackend ? null : _settings,
        settingsLoading: !isBackend && _settingsLoading,
        backendClient: widget.backendClient,
        authUser: widget.authUser,
        onOpenSettingsTab: () => _onTabTap(2),
      ),
      if (isBackend)
        EventsScreen(client: widget.backendClient!)
      else
        const Center(child: Text('События доступны в режиме Backend', style: TextStyle(color: AppColors.textSecondary))),
      SettingsScreen(
        settings: _settings,
        apiConfig: widget.apiConfig,
        backendMode: isBackend,
        backendClient: widget.backendClient,
        authUser: widget.authUser,
        onSaved: _loadSettings,
        onConfigUpdated: widget.onConfigUpdated,
        onLogout: widget.onLogout,
      ),
      if (isBackend)
        ProfileScreen(client: widget.backendClient!)
      else
        const Center(child: Text('Профиль доступен в режиме Backend', style: TextStyle(color: AppColors.textSecondary))),
    ];

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: IndexedStack(
                index: _currentIndex,
                children: pages,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: GlassCard(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    for (var i = 0; i < _navItems.length; i++)
                      _NavItem(
                        icon: _navItems[i].$2,
                        activeIcon: _navItems[i].$3,
                        label: _navItems[i].$4,
                        isActive: i == _currentIndex,
                        badge: i == 1 && _unreadCount > 0 ? _unreadCount : null,
                        onTap: () => _onTabTap(i),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isActive,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? AppColors.purple : AppColors.textSecondary;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: isActive ? AppColors.purple.withValues(alpha: 0.15) : Colors.transparent,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      isActive ? activeIcon : icon,
                      key: ValueKey(isActive),
                      size: 22,
                      color: color,
                    ),
                  ),
                  if (badge != null)
                    Positioned(
                      top: -4,
                      right: -8,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 16),
                        height: 16,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          color: AppColors.danger,
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Center(
                          child: Text(
                            badge! > 99 ? '99+' : '$badge',
                            style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10.5,
                  color: color,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Проверить компиляцию**

```bash
flutter analyze lib/screens/main_shell.dart
```
Ожидание: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add lib/screens/main_shell.dart
git commit -m "feat: expand MainShell to 4 tabs with unread badge on Events"
```

---

## Task 5: ProfileScreen — hero + ListTile + bottom sheets

**Files:**
- Modify: `lib/screens/profile_screen.dart`

- [ ] **Step 1: Заменить содержимое profile_screen.dart**

```dart
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.client});
  final BackendClient client;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _loading = true;
  String? _error;
  String _name = '';
  String _email = '';
  String _phone = '';
  String _role = '';
  DateTime? _createdAt;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final p = await widget.client.getProfile();
      if (mounted) {
        setState(() {
          _name  = p['name']  as String? ?? '';
          _email = p['email'] as String? ?? '';
          _phone = p['phone'] as String? ?? '';
          _role  = p['role']  as String? ?? 'RESIDENT';
          final raw = p['createdAt'] as String?;
          _createdAt = raw != null ? DateTime.tryParse(raw) : null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String get _initials {
    final parts = _name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty && parts[0].isNotEmpty) return parts[0][0].toUpperCase();
    return '?';
  }

  String get _createdAtLabel {
    if (_createdAt == null) return '';
    final months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    return 'с ${_createdAt!.day} ${months[_createdAt!.month - 1]} ${_createdAt!.year}';
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'SUPER_ADMIN': return 'Супер-администратор';
      case 'ORG_ADMIN':   return 'Администратор УК';
      case 'COMPLEX_MANAGER': return 'Менеджер ЖК';
      default:            return 'Резидент';
    }
  }

  void _editField({
    required String title,
    required String initialValue,
    required Future<void> Function(String value) onSave,
    bool obscure = false,
    String? secondLabel,
    String? secondInitial,
    Future<void> Function(String cur, String nw)? onSavePair,
  }) {
    final ctrl1 = TextEditingController(text: initialValue);
    final ctrl2 = secondLabel != null ? TextEditingController(text: secondInitial ?? '') : null;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: GlassCard(
          margin: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
              const SizedBox(height: 16),
              TextField(
                controller: ctrl1,
                obscureText: obscure && secondLabel == null,
                decoration: InputDecoration(labelText: title),
                autofocus: true,
              ),
              if (secondLabel != null) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: ctrl2!,
                  obscureText: true,
                  decoration: InputDecoration(labelText: secondLabel),
                ),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    Navigator.pop(ctx);
                    try {
                      if (onSavePair != null && ctrl2 != null) {
                        await onSavePair(ctrl1.text.trim(), ctrl2.text.trim());
                      } else {
                        await onSave(ctrl1.text.trim());
                      }
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Сохранено'), backgroundColor: AppColors.success),
                        );
                        _load();
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Ошибка: $e'), backgroundColor: AppColors.danger),
                        );
                      }
                    }
                  },
                  child: const Text('Сохранить'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.purple));
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: AppColors.danger), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _load, child: const Text('Повторить')),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          physics: const BouncingScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Back row header
              Row(
                children: [
                  Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.purple.withValues(alpha: 0.18),
                    ),
                    child: const Icon(Icons.chevron_left, color: AppColors.textSecondary, size: 20),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'ПРОФИЛЬ',
                    style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Hero card
              GlassCard(
                padding: const EdgeInsets.all(18),
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        AppColors.purple.withValues(alpha: 0.18),
                        AppColors.surface,
                      ],
                    ),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 66, height: 66,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [AppColors.purple, Color(0xFF5FA8FF)],
                          ),
                        ),
                        child: Center(
                          child: Text(
                            _initials,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _name.isNotEmpty ? _name : _email,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        [_roleLabel(_role), if (_createdAtLabel.isNotEmpty) _createdAtLabel].join(' · '),
                        style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),

              // Data card
              GlassCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _infoTile(
                      icon: Icons.email_outlined,
                      label: 'Email',
                      value: _email,
                      onTap: () => _editField(
                        title: 'Email',
                        initialValue: _email,
                        onSave: (v) => widget.client.updateProfile(email: v, name: _name, phone: _phone),
                      ),
                    ),
                    Divider(height: 1, color: AppColors.border.withValues(alpha: 0.6)),
                    _infoTile(
                      icon: Icons.phone_outlined,
                      label: 'Телефон',
                      value: _phone.isNotEmpty ? _phone : '—',
                      onTap: () => _editField(
                        title: 'Телефон',
                        initialValue: _phone,
                        onSave: (v) => widget.client.updateProfile(phone: v, name: _name, email: _email),
                      ),
                    ),
                    Divider(height: 1, color: AppColors.border.withValues(alpha: 0.6)),
                    _infoTile(
                      icon: Icons.lock_outline,
                      label: 'Пароль',
                      value: 'Изменить пароль',
                      onTap: () => _editField(
                        title: 'Текущий пароль',
                        initialValue: '',
                        obscure: true,
                        secondLabel: 'Новый пароль',
                        onSave: (_) async {},
                        onSavePair: (cur, nw) => widget.client.changePassword(cur, nw),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // Danger zone
              GlassCard(
                padding: EdgeInsets.zero,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (_) => AlertDialog(
                            backgroundColor: const Color(0xFF1A0B2E),
                            title: const Text('Выйти из аккаунта?'),
                            actions: [
                              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
                              TextButton(
                                onPressed: () => Navigator.pop(context, true),
                                child: Text('Выйти', style: TextStyle(color: AppColors.danger)),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true && mounted) {
                          await widget.client.logout();
                        }
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        child: Row(
                          children: [
                            Icon(Icons.logout, color: AppColors.danger, size: 18),
                            const SizedBox(width: 12),
                            Text(
                              'Выйти из аккаунта',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.danger.withValues(alpha: 0.9),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoTile({
    required IconData icon,
    required String label,
    required String value,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(icon, size: 16, color: AppColors.textSecondary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: const TextStyle(fontSize: 10.5, color: AppColors.textSecondary)),
                    const SizedBox(height: 2),
                    Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 16, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Проверить компиляцию**

```bash
flutter analyze lib/screens/profile_screen.dart
```
Ожидание: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add lib/screens/profile_screen.dart
git commit -m "feat: redesign ProfileScreen with hero, ListTile rows, bottom sheet editing"
```

---

## Task 6: IncomingCallScreen — приоритизация кнопок

**Files:**
- Modify: `lib/screens/incoming_call_screen.dart`

- [ ] **Step 1: Заменить метод `build` и `_actionButton` в incoming_call_screen.dart**

Заменить участок от строки 117 (`@override Widget build`) до конца файла:

```dart
  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (widget.buildingName != null && widget.buildingName!.isNotEmpty) widget.buildingName,
      if (widget.apartmentNumber != null && widget.apartmentNumber!.isNotEmpty) 'кв. ${widget.apartmentNumber}',
    ].join(' · ');

    return Material(
      color: Colors.black87,
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      gradient: const LinearGradient(
                        colors: [AppColors.purple, Color(0xFF5FA8FF)],
                      ),
                    ),
                    child: const Icon(Icons.door_front_door, size: 22, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ВХОДЯЩИЙ',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.white70,
                            letterSpacing: 1.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: Center(child: _buildVideoArea())),
            // Action row
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _secondaryButton(
                    icon: Icons.call_end,
                    label: 'Сбросить',
                    color: AppColors.danger,
                    labelColor: const Color(0xFFFF9CB1),
                    onPressed: widget.onDismiss,
                  ),
                  _primaryButton(),
                  _secondaryButton(
                    icon: Icons.videocam,
                    label: 'Ответить',
                    color: AppColors.purple,
                    labelColor: const Color(0xFFC9A6FF),
                    onPressed: _answer,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _primaryButton() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: _openDoorLoading ? null : _openDoor,
          child: Container(
            width: 84, height: 84,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF52E5B8), AppColors.success],
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.success.withValues(alpha: 0.18),
                  spreadRadius: 8,
                  blurRadius: 0,
                ),
                BoxShadow(
                  color: AppColors.success.withValues(alpha: 0.50),
                  blurRadius: 30,
                  offset: const Offset(0, 14),
                ),
              ],
            ),
            child: Center(
              child: _openDoorLoading
                  ? const CircularProgressIndicator(
                      color: Color(0xFF06281D),
                      strokeWidth: 2.5,
                    )
                  : const Icon(Icons.lock_open_rounded, size: 36, color: Color(0xFF06281D)),
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Открыть дверь',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Color(0xFFA7FFD6),
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }

  Widget _secondaryButton({
    required IconData icon,
    required String label,
    required Color color,
    required Color labelColor,
    required VoidCallback? onPressed,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton.filled(
          onPressed: onPressed,
          icon: Icon(icon),
          style: IconButton.styleFrom(
            backgroundColor: color.withValues(alpha: 0.20),
            foregroundColor: color,
            padding: const EdgeInsets.all(16),
            minimumSize: const Size(56, 56),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(color: labelColor, fontSize: 10.5)),
      ],
    );
  }

  Widget _buildVideoArea() {
    if (_loadingVideo && _videoController == null) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: AppColors.purple),
          SizedBox(height: 16),
          Text('Загрузка видео...', style: TextStyle(color: Colors.white70)),
        ],
      );
    }
    if (_videoController != null) {
      return AspectRatio(aspectRatio: 16 / 9, child: Video(controller: _videoController!, fill: Colors.black));
    }
    return const Icon(Icons.videocam_off, size: 64, color: Colors.white38);
  }
}
```

- [ ] **Step 2: Добавить HapticFeedback в метод `_openDoor`**

В начало метода `_openDoor` (сразу после `setState(() => _openDoorLoading = true);`) добавить:
```dart
HapticFeedback.mediumImpact();
```
Убедиться что `import 'package:flutter/services.dart';` есть в начале файла.

- [ ] **Step 3: Проверить компиляцию**

```bash
flutter analyze lib/screens/incoming_call_screen.dart
```
Ожидание: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add lib/screens/incoming_call_screen.dart
git commit -m "feat: prioritize Open Door button 84px + haptic feedback in IncomingCallScreen"
```

---

## Task 7: HomeScreen — skeleton, padding, event icons

**Files:**
- Modify: `lib/screens/home_screen.dart`

- [ ] **Step 1: Добавить импорт skeleton_card.dart**

В начало файла после существующих импортов добавить:
```dart
import '../widgets/skeleton_card.dart';
```

- [ ] **Step 2: Заменить спиннер на skeleton в `_BackendHomeContentState.build`**

Найти в `_BackendHomeContentState.build`:
```dart
if (_loading) {
  return const Center(child: CircularProgressIndicator(color: AppColors.purple));
}
```
Заменить на:
```dart
if (_loading) {
  return Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
    child: ListView(
      physics: const NeverScrollableScrollPhysics(),
      children: [
        const SkeletonBuildingCard(),
        const SkeletonBuildingCard(),
        const SkeletonBuildingCard(),
      ],
    ),
  );
}
```

- [ ] **Step 3: Исправить padding в `_BuildingCard`**

Найти в классе `_BuildingCard` метод `build`:
```dart
padding: const EdgeInsets.all(4),
```
Заменить на:
```dart
padding: const EdgeInsets.all(16),
```

- [ ] **Step 4: Заменить Icons.circle на иконки событий в `_RecentEventsBlock`**

Найти в `_RecentEventsBlock.build`:
```dart
else
  const SizedBox(width: 40, height: 30, child: Icon(Icons.circle, size: 8, color: AppColors.textSecondary)),
```
Заменить на:
```dart
else
  SizedBox(
    width: 40, height: 30,
    child: Center(
      child: Container(
        width: 28, height: 28,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: _eventIconBg(e.eventType),
        ),
        child: Icon(_eventIconData(e.eventType), size: 15, color: _eventIconColor(e.eventType)),
      ),
    ),
  ),
```

Добавить три статических метода в `_RecentEventsBlock`:
```dart
static IconData _eventIconData(String type) {
  final t = type.toLowerCase();
  if (t.contains('door_open')) return Icons.lock_open_rounded;
  if (t.contains('incoming_call') || t.contains('doorbell')) return Icons.call_rounded;
  if (t.contains('motion') || t.contains('vmd')) return Icons.directions_run;
  if (t.contains('alarm') || t.contains('io')) return Icons.notifications_active;
  return Icons.sensors;
}

static Color _eventIconBg(String type) {
  final t = type.toLowerCase();
  if (t.contains('door_open')) return AppColors.success.withValues(alpha: 0.18);
  if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple.withValues(alpha: 0.20);
  if (t.contains('motion') || t.contains('vmd')) return AppColors.warning.withValues(alpha: 0.18);
  if (t.contains('alarm') || t.contains('io')) return AppColors.danger.withValues(alpha: 0.18);
  return AppColors.border;
}

static Color _eventIconColor(String type) {
  final t = type.toLowerCase();
  if (t.contains('door_open')) return AppColors.success;
  if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple;
  if (t.contains('motion') || t.contains('vmd')) return AppColors.warning;
  if (t.contains('alarm') || t.contains('io')) return AppColors.danger;
  return AppColors.textSecondary;
}
```

- [ ] **Step 5: Проверить компиляцию**

```bash
flutter analyze lib/screens/home_screen.dart
```
Ожидание: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add lib/screens/home_screen.dart
git commit -m "fix: skeleton loading, BuildingCard padding 4→16, event type icons in HomeScreen"
```

---

## Task 8: DeviceEventsScreen — дизайн-система

**Files:**
- Modify: `lib/screens/device_events_screen.dart`

- [ ] **Step 1: Добавить импорт skeleton_card.dart и glass_card.dart**

В начало файла добавить:
```dart
import '../widgets/glass_card.dart';
import '../widgets/skeleton_card.dart';
```

- [ ] **Step 2: Заменить спиннер на skeleton**

Найти в `build`:
```dart
child: _loading
    ? const Center(child: CircularProgressIndicator())
```
Заменить на:
```dart
child: _loading
    ? ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: List.generate(5, (_) => const SkeletonEventItem()),
      )
```

- [ ] **Step 3: Заменить Colors.red на AppColors.danger**

Найти:
```dart
Text(_error!, style: const TextStyle(color: Colors.red)),
```
Заменить на:
```dart
Text(_error!, style: const TextStyle(color: AppColors.danger)),
```

- [ ] **Step 4: Заменить plain ListTile на GlassCard с иконтайлом**

Найти itemBuilder в `ListView.separated`:
```dart
itemBuilder: (ctx, i) {
  final e = filtered[i];
  return ListTile(
    leading: Icon(_eventIcon(e.type)),
    title: Text(_eventTypeLabel(e.type)),
    subtitle: Text(e.time.isNotEmpty ? e.time : '—'),
    trailing: Text(e.source, style: Theme.of(context).textTheme.bodySmall),
  );
},
```
Заменить на:
```dart
itemBuilder: (ctx, i) {
  final e = filtered[i];
  final bgColor = _iconBg(e.type);
  final iconColor = _iconColor(e.type);
  return GlassCard(
    margin: const EdgeInsets.fromLTRB(8, 4, 8, 4),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    child: Row(
      children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: bgColor),
          child: Icon(_eventIcon(e.type), size: 18, color: iconColor),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_eventTypeLabel(e.type), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              const SizedBox(height: 2),
              Text(e.time.isNotEmpty ? e.time : '—', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
            ],
          ),
        ),
        if (e.source.isNotEmpty)
          Text(e.source, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
      ],
    ),
  );
},
```

- [ ] **Step 5: Обновить иконки и добавить методы _iconBg / _iconColor**

Найти метод `_eventIcon` и заменить иконки, затем добавить два новых метода:

```dart
IconData _eventIcon(String type) {
  final lower = type.toLowerCase();
  if (lower.contains('door_open')) return Icons.lock_open_rounded;
  if (lower.contains('incoming_call') || lower.contains('doorbell')) return Icons.call_rounded;
  if (lower.contains('motion') || lower.contains('vmd')) return Icons.directions_run;
  if (lower.contains('alarm') || lower.contains('io')) return Icons.notifications_active;
  if (lower.contains('tamper')) return Icons.security;
  return Icons.sensors;
}

Color _iconBg(String type) {
  final t = type.toLowerCase();
  if (t.contains('door_open')) return AppColors.success.withValues(alpha: 0.18);
  if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple.withValues(alpha: 0.20);
  if (t.contains('motion') || t.contains('vmd')) return AppColors.warning.withValues(alpha: 0.18);
  if (t.contains('alarm') || t.contains('io')) return AppColors.danger.withValues(alpha: 0.18);
  return AppColors.border;
}

Color _iconColor(String type) {
  final t = type.toLowerCase();
  if (t.contains('door_open')) return AppColors.success;
  if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple;
  if (t.contains('motion') || t.contains('vmd')) return AppColors.warning;
  if (t.contains('alarm') || t.contains('io')) return AppColors.danger;
  return AppColors.textSecondary;
}
```

- [ ] **Step 6: Проверить компиляцию**

```bash
flutter analyze lib/screens/device_events_screen.dart
```
Ожидание: `No issues found!`

- [ ] **Step 7: Commit**

```bash
git add lib/screens/device_events_screen.dart
git commit -m "feat: apply design system to DeviceEventsScreen — skeleton, glass cards, event icons"
```

---

## Task 9: Финальная проверка

- [ ] **Step 1: Полный анализ**

```bash
flutter analyze
```
Ожидание: `No issues found!` (или только warnings, не errors)

- [ ] **Step 2: Запуск на устройстве**

```bash
flutter run -d chrome
# или: flutter run -d windows
```
Проверить визуально:
- [ ] GlassCard показывает blur через фоновый градиент
- [ ] Навбар имеет 4 вкладки: Главная / События / Управление / Профиль
- [ ] Бейдж отображается на вкладке «События» при наличии непрочитанных
- [ ] ProfileScreen: hero с аватаром, строки данных, bottom sheet при тапе, danger zone
- [ ] IncomingCall: кнопка «Открыть» большая по центру (симулировать через direct call)
- [ ] Карточки зданий имеют padding 16px
- [ ] В списке событий — иконки по типу, не точки

- [ ] **Step 3: Финальный коммит**

```bash
git add -A
git commit -m "chore: final design system pass — all 8 tasks complete"
```
