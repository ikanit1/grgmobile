import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../api/onvif_discovery.dart';
import '../models/api_config.dart';
import '../models/auth_user.dart';
import '../models/device_settings.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';
import 'add_resident_screen.dart';
import 'applications_screen.dart';

class SettingsScreen extends StatefulWidget {
  final DeviceSettings? settings;
  final ApiConfig? apiConfig;
  final bool backendMode;
  final BackendClient? backendClient;
  final AuthUser? authUser;
  final Future<void> Function()? onSaved;
  final Future<void> Function(ApiConfig config)? onConfigUpdated;
  final Future<void> Function()? onLogout;

  const SettingsScreen({
    super.key,
    this.settings,
    this.apiConfig,
    this.backendMode = false,
    this.backendClient,
    this.authUser,
    this.onSaved,
    this.onConfigUpdated,
    this.onLogout,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _hostController;
  late final TextEditingController _userController;
  late final TextEditingController _passController;
  late final TextEditingController _rtspController;
  late final TextEditingController _wsController;
  late final TextEditingController _apiUrlController;
  late final TextEditingController _dndFromController;
  late final TextEditingController _dndToController;
  bool _useHttps = false;
  bool _doNotDisturb = false;
  bool _dndSettingsLoading = true;
  bool _dndSaving = false;

  @override
  void initState() {
    super.initState();
    _hostController = TextEditingController();
    _userController = TextEditingController();
    _passController = TextEditingController();
    _rtspController = TextEditingController();
    _wsController = TextEditingController();
    _apiUrlController = TextEditingController(text: widget.apiConfig?.baseUrl ?? ApiConfig.defaultBaseUrl);
    _dndFromController = TextEditingController();
    _dndToController = TextEditingController();
    _applySettings(widget.settings);
    if (widget.backendMode && widget.backendClient != null && widget.authUser?.role == 'RESIDENT') {
      _loadDndSettings();
    } else {
      _dndSettingsLoading = false;
    }
  }

  Future<void> _loadDndSettings() async {
    if (widget.backendClient == null) return;
    try {
      final s = await widget.backendClient!.getMeSettings();
      if (mounted) {
        setState(() {
          _doNotDisturb = s.doNotDisturb;
          _dndFromController.text = s.doNotDisturbFrom ?? '';
          _dndToController.text = s.doNotDisturbTo ?? '';
          _dndSettingsLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _dndSettingsLoading = false);
    }
  }

  Future<void> _saveDndSettings() async {
    if (widget.backendClient == null) return;
    setState(() => _dndSaving = true);
    try {
      final from = _dndFromController.text.trim();
      final to = _dndToController.text.trim();
      await widget.backendClient!.updateMeSettings(
        doNotDisturb: _doNotDisturb,
        doNotDisturbFrom: from.isEmpty ? null : from,
        doNotDisturbTo: to.isEmpty ? null : to,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Настройки «Не беспокоить» сохранены')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _dndSaving = false);
    }
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.settings != widget.settings) _applySettings(widget.settings);
    if (oldWidget.apiConfig != widget.apiConfig && widget.apiConfig != null) {
      _apiUrlController.text = widget.apiConfig!.baseUrl;
    }
  }

  void _applySettings(DeviceSettings? s) {
    _hostController.text = s?.host ?? '192.168.0.100';
    _userController.text = s?.username ?? 'admin';
    _passController.text = s?.password ?? '';
    _rtspController.text = s?.rtspUrl ?? 'rtsp://admin:password@192.168.0.100:554/stream1';
    _wsController.text = s?.websocketPath ?? '';
    if (mounted) setState(() => _useHttps = s?.useHttps ?? false);
  }

  @override
  void dispose() {
    _hostController.dispose();
    _userController.dispose();
    _passController.dispose();
    _rtspController.dispose();
    _wsController.dispose();
    _apiUrlController.dispose();
    _dndFromController.dispose();
    _dndToController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final settings = DeviceSettings(
      host: _hostController.text.trim(),
      username: _userController.text.trim(),
      password: _passController.text.trim(),
      useHttps: _useHttps,
      rtspUrl: _rtspController.text.trim().isEmpty
          ? null
          : _rtspController.text.trim(),
      websocketPath: _wsController.text.trim().isEmpty
          ? null
          : _wsController.text.trim(),
    );
    await settings.save();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Настройки сохранены')),
      );
      if (widget.onSaved != null) {
        await widget.onSaved!();
      } else {
        Navigator.pop(context);
      }
    }
  }

  Future<void> _discoverOnvif() async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    List<DiscoveredOnvifDevice> devices = [];
    Object? error;

    try {
      devices = await discoverOnvifDevices();
    } catch (e) {
      error = e;
    } finally {
      if (mounted) {
        Navigator.of(context).pop(); // close progress
      }
    }

    if (!mounted) return;

    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка ONVIF: $error')),
      );
      return;
    }

    if (devices.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ONVIF-устройства не найдены')),
      );
      return;
    }

    final selected = await showModalBottomSheet<DiscoveredOnvifDevice>(
      context: context,
      builder: (ctx) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: devices.length,
        separatorBuilder: (_, __) => const Divider(),
        itemBuilder: (ctx, index) {
          final d = devices[index];
          return ListTile(
            leading: const Icon(Icons.devices),
            title: Text(d.name?.isNotEmpty == true ? d.name! : d.host),
            subtitle: d.location != null && d.location!.isNotEmpty
                ? Text('${d.host} · ${d.location}')
                : Text(d.host),
            onTap: () => Navigator.of(ctx).pop(d),
          );
        },
      ),
    );

    if (selected != null) {
      setState(() {
        _hostController.text = selected.host;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: ListView(
        physics: const BouncingScrollPhysics(),
        children: [
          const Text(
            'Настройки',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 18,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Режим и подключение',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 14),
          GlassCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'РЕЖИМ РАБОТЫ',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12, letterSpacing: 0.4),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.backendMode ? 'Через backend (API)' : 'Прямо на устройство',
                        style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
                      ),
                    ),
                    Switch(
                      value: widget.backendMode,
                      onChanged: widget.onConfigUpdated == null
                          ? null
                          : (v) async {
                              final url = _apiUrlController.text.trim();
                              await widget.onConfigUpdated!(ApiConfig(
                                baseUrl: url.isEmpty ? ApiConfig.defaultBaseUrl : url,
                                useBackend: v,
                              ));
                            },
                    ),
                  ],
                ),
                if (widget.backendMode) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _apiUrlController,
                    decoration: const InputDecoration(
                      labelText: 'URL API',
                      hintText: ApiConfig.defaultBaseUrl,
                    ),
                    style: const TextStyle(color: AppColors.textPrimary),
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () async {
                        final url = _apiUrlController.text.trim();
                        if (url.isEmpty) return;
                        await widget.onConfigUpdated?.call(ApiConfig(baseUrl: url, useBackend: true));
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('URL сохранён')));
                        }
                      },
                      child: const Text('Сохранить URL'),
                    ),
                  ),
                  if (widget.authUser?.role == 'RESIDENT' && widget.backendClient != null) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ApplicationsScreen(client: widget.backendClient!),
                            ),
                          );
                        },
                        icon: const Icon(Icons.assignment),
                        label: const Text('Мои заявки'),
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.purple),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AddResidentScreen(client: widget.backendClient!),
                            ),
                          );
                        },
                        icon: const Icon(Icons.person_add),
                        label: const Text('Добавить в квартиру'),
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.purple),
                      ),
                    ),
                  ],
                  if (widget.authUser?.role == 'RESIDENT' && widget.backendClient != null) ...[
                    const SizedBox(height: 16),
                    const Text(
                      'НЕ БЕСПОКОИТЬ',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 12, letterSpacing: 0.4),
                    ),
                    const SizedBox(height: 8),
                    GlassCard(
                      margin: EdgeInsets.zero,
                      child: _dndSettingsLoading
                          ? const Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(child: CircularProgressIndicator(color: AppColors.purple)),
                            )
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SwitchListTile(
                                  title: const Text(
                                    'Не беспокоить',
                                    style: TextStyle(color: AppColors.textPrimary),
                                  ),
                                  subtitle: const Text(
                                    'Не присылать push о звонках в указанное время',
                                    style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                                  ),
                                  value: _doNotDisturb,
                                  onChanged: (v) => setState(() => _doNotDisturb = v),
                                ),
                                if (_doNotDisturb) ...[
                                  TextField(
                                    controller: _dndFromController,
                                    decoration: const InputDecoration(
                                      labelText: 'С (например 22:00)',
                                      hintText: '22:00',
                                    ),
                                    style: const TextStyle(color: AppColors.textPrimary),
                                    keyboardType: TextInputType.datetime,
                                  ),
                                  TextField(
                                    controller: _dndToController,
                                    decoration: const InputDecoration(
                                      labelText: 'До (например 08:00)',
                                      hintText: '08:00',
                                    ),
                                    style: const TextStyle(color: AppColors.textPrimary),
                                    keyboardType: TextInputType.datetime,
                                  ),
                                  const SizedBox(height: 8),
                                  SizedBox(
                                    width: double.infinity,
                                    child: ElevatedButton(
                                      onPressed: _dndSaving ? null : _saveDndSettings,
                                      child: Text(_dndSaving ? 'Сохранение…' : 'Сохранить'),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                    ),
                  ],
                  if (widget.onLogout != null) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          await widget.onLogout?.call();
                        },
                        icon: const Icon(Icons.logout),
                        label: const Text('Выйти из аккаунта'),
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
          if (!widget.backendMode) ...[
            const SizedBox(height: 16),
            const Text(
              'ПОДКЛЮЧЕНИЕ К УСТРОЙСТВУ (Akuvox)',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12, letterSpacing: 0.4),
            ),
            const SizedBox(height: 10),
            GlassCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ПОДКЛЮЧЕНИЕ',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _hostController,
                  decoration: const InputDecoration(
                    labelText: 'IP-адрес или хост',
                    hintText: '192.168.0.100',
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: _discoverOnvif,
                    icon: const Icon(Icons.search, size: 18, color: AppColors.purple),
                    label: const Text('Найти по ONVIF'),
                  ),
                ),
                SwitchListTile(
                  title: const Text('HTTPS', style: TextStyle(color: AppColors.textPrimary)),
                  value: _useHttps,
                  onChanged: (v) => setState(() => _useHttps = v),
                ),
                TextField(
                  controller: _userController,
                  decoration: const InputDecoration(
                    labelText: 'Логин',
                    hintText: 'admin',
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                  autocorrect: false,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passController,
                  decoration: const InputDecoration(
                    labelText: 'Пароль',
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                  obscureText: true,
                  autocorrect: false,
                ),
              ],
            ),
          ),
            const SizedBox(height: 16),
            GlassCard(
              margin: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'ВИДЕОПОТОК (RTSP)',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _rtspController,
                  decoration: const InputDecoration(
                    labelText: 'RTSP URL камеры',
                    hintText: 'rtsp://user:pass@IP:554/stream1',
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                  maxLines: 2,
                  autocorrect: false,
                ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            GlassCard(
              margin: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'WEBSOCKET (LiteAPI, опционально)',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _wsController,
                  decoration: const InputDecoration(
                    labelText: 'Путь WebSocket',
                    hintText: '/ws или пусто',
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                  autocorrect: false,
                ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _save,
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('Сохранить'),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }
}
