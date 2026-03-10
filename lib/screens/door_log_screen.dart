import 'package:flutter/material.dart';

import '../api/akuvox_client.dart';
import '../models/device_settings.dart';

class DoorLogScreen extends StatefulWidget {
  final DeviceSettings settings;

  const DoorLogScreen({super.key, required this.settings});

  @override
  State<DoorLogScreen> createState() => _DoorLogScreenState();
}

class _DoorLogScreenState extends State<DoorLogScreen> {
  late final AkuvoxApiClient _api;
  List<dynamic> _logs = [];
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
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.getDoorLog();
      if (!mounted) return;
      if (response.isSuccess && response.data != null) {
        final data = response.data;
        if (data is Map && data['list'] != null) {
          setState(() => _logs = data['list'] as List<dynamic>);
        } else if (data is List) {
          setState(() => _logs = data);
        } else {
          setState(() => _logs = [data]);
        }
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
        title: const Text('Журнал открытий'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _loadLogs,
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
                onPressed: _loadLogs,
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }
    if (_logs.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'Записей нет',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadLogs,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _logs.length,
        itemBuilder: (context, i) {
          final item = _logs[i];
          final map = item is Map ? item : <String, dynamic>{};
          final time = map['time'] ?? map['Time'] ?? map['date'] ?? '-';
          final action = map['action'] ?? map['Action'] ?? map['type'] ?? 'Открытие';
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const CircleAvatar(
                child: Icon(Icons.door_front_door),
              ),
              title: Text(action.toString()),
              subtitle: Text(time.toString()),
            ),
          );
        },
      ),
    );
  }
}
