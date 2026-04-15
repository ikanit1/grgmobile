import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

/// Экран удалённой настройки панели Akuvox (SIP, сеть).
/// Полноценная работа — после реализации GET/PATCH /api/devices/:id/sip-config и network-config на backend.
class DevicePanelSettingsScreen extends StatefulWidget {
  const DevicePanelSettingsScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<DevicePanelSettingsScreen> createState() => _DevicePanelSettingsScreenState();
}

class _DevicePanelSettingsScreenState extends State<DevicePanelSettingsScreen> {
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Настройки панели: ${widget.deviceName}'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('SIP', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 8),
                const Text(
                  'Сервер, порт, учётная запись и пароль для регистрации панели на SIP-сервере.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'SIP Server',
                    border: OutlineInputBorder(),
                    hintText: 'После реализации API',
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'SIP Port',
                    border: OutlineInputBorder(),
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Username',
                    border: OutlineInputBorder(),
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                  readOnly: true,
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: null,
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
                  child: const Text('Применить настройки SIP'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Сеть', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 8),
                const Text(
                  'IP, маска, шлюз, DNS. Изменение IP может отключить устройство от сети.',
                  style: TextStyle(color: AppColors.warning, fontSize: 12),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'IP',
                    border: OutlineInputBorder(),
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Маска',
                    border: OutlineInputBorder(),
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Шлюз',
                    border: OutlineInputBorder(),
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'DNS',
                    border: OutlineInputBorder(),
                  ),
                  readOnly: true,
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: null,
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
                  child: const Text('Применить сетевые настройки'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              'Удалённая настройка панели будет доступна после реализации API на backend (GET/PATCH devices/:id/sip-config, network-config).',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}
