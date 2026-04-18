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
  StreamSubscription? _unreadSub;

  static const _navItems = [
    (AppPage.home,    Icons.home_outlined,       Icons.home,       'Главная'),
    (AppPage.events,  Icons.event_note_outlined,  Icons.event_note, 'События'),
    (AppPage.control, Icons.tune_outlined,        Icons.tune,       'Управление'),
    (AppPage.profile, Icons.person_outline,       Icons.person,     'Профиль'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.backendClient == null) _loadSettings();
    else setState(() => _settingsLoading = false);
    _loadUnreadCount();
    _unreadSub = EventsSocketService.instance.events.listen((_) {
      _loadUnreadCount();
    });
  }

  @override
  void dispose() {
    _unreadSub?.cancel();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final s = await DeviceSettings.load();
    if (mounted) setState(() { _settings = s; _settingsLoading = false; });
  }

  Future<void> _loadUnreadCount() async {
    if (widget.backendClient == null) return;
    try {
      final count = await widget.backendClient!.getUnreadEventsCount();
      if (mounted) setState(() => _unreadCount = count);
    } catch (_) {}
  }

  void _onTabTap(int index) {
    setState(() => _currentIndex = index);
    // Clear badge when switching to Events tab
    if (index == 1 && _unreadCount > 0) {
      setState(() => _unreadCount = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final client = widget.backendClient;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: IndexedStack(
                index: _currentIndex,
                children: [
                  HomeScreen(
                    settings: client == null ? _settings : null,
                    settingsLoading: client == null && _settingsLoading,
                    backendClient: client,
                    authUser: widget.authUser,
                    onOpenSettingsTab: () => _onTabTap(2),
                  ),
                  if (client != null)
                    EventsScreen(client: client)
                  else
                    const Center(child: Text('Войдите для просмотра событий')),
                  SettingsScreen(
                    settings: _settings,
                    apiConfig: widget.apiConfig,
                    backendMode: client != null,
                    backendClient: client,
                    authUser: widget.authUser,
                    onSaved: _loadSettings,
                    onConfigUpdated: widget.onConfigUpdated,
                    onLogout: widget.onLogout,
                  ),
                  ProfileScreen(
                    client: client,
                    authUser: widget.authUser,
                    onLogout: widget.onLogout,
                  ),
                ],
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
                        badge: (i == 1 && _unreadCount > 0) ? _unreadCount : null,
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
                  if (badge != null && badge! > 0)
                    Positioned(
                      top: -4,
                      right: -6,
                      child: Container(
                        padding: const EdgeInsets.all(3),
                        decoration: const BoxDecoration(
                          color: AppColors.danger,
                          shape: BoxShape.circle,
                        ),
                        constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                        child: Text(
                          badge! > 99 ? '99+' : '$badge',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
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
