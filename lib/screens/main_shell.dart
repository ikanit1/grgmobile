import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../models/api_config.dart';
import '../models/auth_user.dart';
import '../models/device_settings.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';
import 'home_screen.dart';
import 'settings_screen.dart';

enum AppPage { home, settings }

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

  static const _navItems = [
    (AppPage.home, Icons.home_outlined, 'Домофон'),
    (AppPage.settings, Icons.settings_outlined, 'Настройки'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.backendClient == null) _loadSettings();
    else setState(() => _settingsLoading = false);
  }

  Future<void> _loadSettings() async {
    final s = await DeviceSettings.load();
    if (mounted) {
      setState(() {
        _settings = s;
        _settingsLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
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
                    settings: widget.backendClient == null ? _settings : null,
                    settingsLoading: widget.backendClient == null && _settingsLoading,
                    backendClient: widget.backendClient,
                    authUser: widget.authUser,
                    onOpenSettingsTab: () => setState(() => _currentIndex = 1),
                  ),
                  SettingsScreen(
                    settings: _settings,
                    apiConfig: widget.apiConfig,
                    backendMode: widget.backendClient != null,
                    backendClient: widget.backendClient,
                    authUser: widget.authUser,
                    onSaved: _loadSettings,
                    onConfigUpdated: widget.onConfigUpdated,
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
                        label: _navItems[i].$3,
                        isActive: i == _currentIndex,
                        onTap: () => setState(() => _currentIndex = i),
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
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? AppColors.purple : AppColors.textSecondary;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 22, color: color),
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
