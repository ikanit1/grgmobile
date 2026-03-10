import 'package:flutter/material.dart';

import '../api/akuvox_client.dart';
import '../models/device_settings.dart';

class SystemInfoScreen extends StatefulWidget {
  final DeviceSettings settings;

  const SystemInfoScreen({super.key, required this.settings});

  @override
  State<SystemInfoScreen> createState() => _SystemInfoScreenState();
}

class _SystemInfoScreenState extends State<SystemInfoScreen> {
  late final AkuvoxApiClient _api;
  Map<String, dynamic>? _info;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = AkuvoxApiClient(
      baseUrl: widget.settings.baseUrl,
      username: widget.settings.username,
      password: widget.settings.password,
    );
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.getSystemInfo();
      if (!mounted) return;
      if (response.isSuccess && response.data != null) {
        setState(() => _info = response.data as Map<String, dynamic>);
      } else {
        setState(() => _error = response.message);
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Ошибка: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Информация об устройстве'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _loadInfo,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
              const SizedBox(height: 16),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _loadInfo,
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }
    if (_info == null || _info!.isEmpty) {
      return const Center(child: Text('Нет данных'));
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _info!.entries.map((e) {
        final value = e.value;
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text(
              _formatKey(e.key),
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            subtitle: value is Map
                ? null
                : Text(value?.toString() ?? '-'),
            trailing: value is Map
                ? const Icon(Icons.chevron_right)
                : null,
            onTap: value is Map
                ? () => _showNested(context, e.key, value)
                : null,
          ),
        );
      }).toList(),
    );
  }

  String _formatKey(String key) {
    return key
        .replaceAll('Config.', '')
        .replaceAll('.', ' / ')
        .replaceAll('_', ' ');
  }

  void _showNested(BuildContext context, String parentKey, Map value) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        expand: false,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.all(16),
          children: [
            Text(parentKey, style: Theme.of(ctx).textTheme.titleMedium),
            const Divider(),
            ...value.entries.map((e) => ListTile(
                  title: Text(_formatKey(e.key.toString())),
                  subtitle: e.value is Map
                      ? null
                      : Text(e.value?.toString() ?? '-'),
                )),
          ],
        ),
      ),
    );
  }
}
