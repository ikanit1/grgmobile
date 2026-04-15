import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import 'device_events_screen.dart';
import 'live_view_screen.dart';
import 'panel_residents_screen.dart';
import 'device_panel_settings_screen.dart';
import 'playback_screen.dart';

class DeviceInfoBackendScreen extends StatefulWidget {
  const DeviceInfoBackendScreen({super.key, required this.client, required this.deviceId, required this.deviceName});

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<DeviceInfoBackendScreen> createState() => _DeviceInfoBackendScreenState();
}

class _DeviceInfoBackendScreenState extends State<DeviceInfoBackendScreen> {
  Map<String, dynamic>? _info;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final info = await widget.client.getDeviceInfo(widget.deviceId);
      if (mounted) setState(() { _info = info; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _openPanelResidents() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PanelResidentsScreen(
          client: widget.client,
          deviceId: widget.deviceId,
          deviceName: widget.deviceName,
        ),
      ),
    );
  }

  void _openPanelSettings() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => DevicePanelSettingsScreen(
          client: widget.client,
          deviceId: widget.deviceId,
          deviceName: widget.deviceName,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Инфо: ${widget.deviceName}'),
        actions: [
          TextButton.icon(
            onPressed: _openPanelResidents,
            icon: const Icon(Icons.people_outline, size: 20),
            label: const Text('Жители панели'),
          ),
          TextButton.icon(
            onPressed: _openPanelSettings,
            icon: const Icon(Icons.settings, size: 20),
            label: const Text('Настройки панели'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ActionChip(
                  avatar: const Icon(Icons.videocam, size: 18),
                  label: const Text('Видео'),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => LiveViewScreen(
                      client: widget.client,
                      deviceId: widget.deviceId,
                      deviceName: widget.deviceName,
                    ),
                  )),
                ),
                ActionChip(
                  avatar: const Icon(Icons.history, size: 18),
                  label: const Text('Записи'),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => PlaybackScreen(
                      client: widget.client,
                      deviceId: widget.deviceId,
                      deviceName: widget.deviceName,
                    ),
                  )),
                ),
                ActionChip(
                  avatar: const Icon(Icons.event_note, size: 18),
                  label: const Text('События'),
                  onPressed: () => Navigator.push(context, MaterialPageRoute(
                    builder: (_) => DeviceEventsScreen(
                      client: widget.client,
                      deviceId: widget.deviceId,
                      deviceName: widget.deviceName,
                    ),
                  )),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!, style: const TextStyle(color: Colors.red)),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _load, child: const Text('Повторить')),
                        ],
                      ))
                    : _info == null || _info!.isEmpty
                        ? const Center(child: Text('Нет данных'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView(
                              children: _info!.entries.map((e) {
                                return ListTile(
                                  title: Text(e.key),
                                  subtitle: Text('${e.value ?? '—'}'),
                                );
                              }).toList(),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
