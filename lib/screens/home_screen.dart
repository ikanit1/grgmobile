import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../models/auth_user.dart';
import '../models/device_settings.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';
import 'add_device_screen.dart';
import 'applications_screen.dart';
import 'door_control_backend_screen.dart';
import 'door_control_screen.dart';
import 'door_log_screen.dart';
import 'settings_screen.dart';
import 'system_info_screen.dart';

class HomeScreen extends StatefulWidget {
  final DeviceSettings? settings;
  final bool settingsLoading;
  final BackendClient? backendClient;
  final AuthUser? authUser;
  final VoidCallback? onOpenSettingsTab;

  const HomeScreen({
    super.key,
    required this.settings,
    this.settingsLoading = false,
    this.backendClient,
    this.authUser,
    this.onOpenSettingsTab,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    if (widget.backendClient != null) {
      return _BackendHomeContent(
        client: widget.backendClient!,
        authUser: widget.authUser!,
        onOpenSettingsTab: widget.onOpenSettingsTab,
      );
    }

    if (widget.settingsLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.purple),
      );
    }

    if (widget.settings == null || widget.settings!.host.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Center(
          child: GlassCard(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    color: AppColors.purple.withValues(alpha: 0.3),
                  ),
                  child: const Icon(
                    Icons.door_front_door,
                    size: 40,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Настройте подключение к домофону',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Укажите IP-адрес вызывной панели и учётные данные',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () {
                    if (widget.onOpenSettingsTab != null) {
                      widget.onOpenSettingsTab!();
                    } else {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => SettingsScreen(settings: null),
                        ),
                      );
                    }
                  },
                  icon: const Icon(Icons.settings),
                  label: const Text('Настройки'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final s = widget.settings!;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: ListView(
        physics: const BouncingScrollPhysics(),
        children: [
          const Text(
            'Домофон',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 18,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            s.host,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 14),
          _buildCard(
            context,
            icon: Icons.door_front_door,
            title: 'Управление дверью',
            subtitle: 'Открыть дверь, просмотр камеры',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => DoorControlScreen(settings: s),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _buildCard(
            context,
            icon: Icons.history,
            title: 'Журнал открытий',
            subtitle: 'История событий двери',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => DoorLogScreen(settings: s),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _buildCard(
            context,
            icon: Icons.info_outline,
            title: 'Информация об устройстве',
            subtitle: 'Системные данные панели',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => SystemInfoScreen(settings: s),
              ),
            ),
          ),
          if (widget.onOpenSettingsTab != null) ...[
            const SizedBox(height: 12),
            _buildCard(
              context,
              icon: Icons.settings_outlined,
              title: 'Настройки подключения',
              subtitle: 'IP, логин, пароль, RTSP',
              onTap: widget.onOpenSettingsTab!,
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return GlassCard(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: AppColors.purple.withValues(alpha: 0.25),
              ),
              child: Icon(icon, color: AppColors.purple),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: AppColors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}

class _BackendHomeContent extends StatefulWidget {
  final BackendClient client;
  final AuthUser authUser;
  final VoidCallback? onOpenSettingsTab;

  const _BackendHomeContent({
    required this.client,
    required this.authUser,
    this.onOpenSettingsTab,
  });

  @override
  State<_BackendHomeContent> createState() => _BackendHomeContentState();
}

class _BackendHomeContentState extends State<_BackendHomeContent> {
  List<BuildingDto> _buildings = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBuildings();
  }

  Future<void> _loadBuildings() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.client.getBuildings();
      if (mounted) setState(() {
        _buildings = list;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.purple));
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, style: const TextStyle(color: AppColors.danger), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _loadBuildings, child: const Text('Повторить')),
            ],
          ),
        ),
      );
    }
    if (_buildings.isEmpty) {
      final isResident = widget.authUser.role == 'RESIDENT';
      final title = 'Нет доступных зданий';
      final subtitle = isResident
          ? 'Вы ещё не привязаны к квартире. Подайте заявку в УК или дождитесь одобрения привязки.'
          : 'В системе пока нет зданий по вашим правам доступа. Добавьте организацию, ЖК и здание в веб-админке.';
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _loadBuildings,
                icon: const Icon(Icons.refresh, size: 20),
                label: const Text('Обновить'),
              ),
              if (isResident) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ApplicationsScreen(client: widget.client),
                      ),
                    );
                  },
                  icon: const Icon(Icons.send),
                  label: const Text('Подать заявку'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.purple,
                    foregroundColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (widget.onOpenSettingsTab != null) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: widget.onOpenSettingsTab,
                  icon: const Icon(Icons.settings),
                  label: const Text('Настройки'),
                ),
              ],
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: RefreshIndicator(
        onRefresh: _loadBuildings,
        color: AppColors.purple,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          children: [
            Text(
              'Мои здания',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              widget.authUser.name ?? widget.authUser.id,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 14),
            ..._buildings.map((b) => _BuildingCard(
                  building: b,
                  client: widget.client,
                  authUser: widget.authUser,
                  onOpenSettingsTab: widget.onOpenSettingsTab,
                )),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _BuildingCard extends StatelessWidget {
  const _BuildingCard({
    required this.building,
    required this.client,
    required this.authUser,
    this.onOpenSettingsTab,
  });

  final BuildingDto building;
  final BackendClient client;
  final AuthUser authUser;
  final VoidCallback? onOpenSettingsTab;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => _BuildingDevicesScreen(
              building: building,
              client: client,
              authUser: authUser,
            ),
          ),
        ),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: AppColors.purple.withValues(alpha: 0.25),
                ),
                child: const Icon(Icons.apartment, color: AppColors.purple),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      building.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (building.address != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        building.address!,
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _BuildingDevicesScreen extends StatefulWidget {
  const _BuildingDevicesScreen({
    required this.building,
    required this.client,
    required this.authUser,
  });

  final BuildingDto building;
  final BackendClient client;
  final AuthUser authUser;

  @override
  State<_BuildingDevicesScreen> createState() => _BuildingDevicesScreenState();
}

class _BuildingDevicesScreenState extends State<_BuildingDevicesScreen> {
  List<DeviceDto> _devices = [];
  bool _loading = true;
  String? _error;

  bool get _isAdmin {
    final r = widget.authUser.role;
    return r == 'SUPER_ADMIN' || r == 'ORG_ADMIN' || r == 'COMPLEX_MANAGER';
  }

  @override
  void initState() {
    super.initState();
    _loadDevices();
  }

  Future<void> _loadDevices() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.client.getDevices(widget.building.id);
      if (mounted) {
        setState(() {
          _devices = list;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _openAddDevice() async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AddDeviceScreen(
          client: widget.client,
          buildingId: widget.building.id,
          buildingName: widget.building.name,
        ),
      ),
    );
    if (result == true) _loadDevices();
  }

  Future<void> _openEditDevice(DeviceDto d) async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AddDeviceScreen(
          client: widget.client,
          buildingId: widget.building.id,
          buildingName: widget.building.name,
          editDevice: d,
        ),
      ),
    );
    if (result == true) _loadDevices();
  }

  Future<void> _confirmDelete(DeviceDto d) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceStrong,
        title: const Text('Удалить устройство?', style: TextStyle(color: AppColors.textPrimary)),
        content: Text('«${d.name}» будет удалено без возможности восстановления.',
            style: const TextStyle(color: AppColors.textSecondary)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Удалить', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.client.deleteDevice(d.id);
      _loadDevices();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  void _showDeviceActions(DeviceDto d) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surfaceStrong,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 12),
            Text(d.name, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 16)),
            const SizedBox(height: 4),
            ListTile(
              leading: const Icon(Icons.edit, color: AppColors.textSecondary),
              title: const Text('Редактировать', style: TextStyle(color: AppColors.textPrimary)),
              onTap: () {
                Navigator.pop(ctx);
                _openEditDevice(d);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: AppColors.danger),
              title: const Text('Удалить', style: TextStyle(color: AppColors.danger)),
              onTap: () {
                Navigator.pop(ctx);
                _confirmDelete(d);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.building.name),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      floatingActionButton: _isAdmin
          ? FloatingActionButton(
              backgroundColor: AppColors.purple,
              onPressed: _openAddDevice,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.purple))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: const TextStyle(color: AppColors.danger)),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _loadDevices, child: const Text('Повторить')),
                    ],
                  ),
                )
              : _devices.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('Нет устройств', style: TextStyle(color: AppColors.textSecondary)),
                          if (_isAdmin) ...[
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: _openAddDevice,
                              icon: const Icon(Icons.add),
                              label: const Text('Добавить устройство'),
                            ),
                          ],
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _devices.length,
                      itemBuilder: (context, i) {
                        final d = _devices[i];
                        return GlassCard(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: ListTile(
                            leading: Icon(
                              d.role == 'DOORPHONE' ? Icons.door_front_door : Icons.videocam,
                              color: AppColors.purple,
                            ),
                            title: Text(d.name, style: const TextStyle(color: AppColors.textPrimary)),
                            subtitle: Text(
                              '${d.type} · ${d.role}${d.host != null ? ' · ${d.host}' : ''}',
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                            ),
                            trailing: _isAdmin
                                ? IconButton(
                                    icon: const Icon(Icons.more_vert, color: AppColors.textSecondary),
                                    onPressed: () => _showDeviceActions(d),
                                  )
                                : const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => DoorControlBackendScreen(
                                  client: widget.client,
                                  deviceId: d.id,
                                  deviceName: d.name,
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}

