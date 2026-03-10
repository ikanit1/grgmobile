import 'package:flutter/material.dart';
import '../api/backend_client.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Инфо: ${widget.deviceName}')),
      body: _loading
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
    );
  }
}
