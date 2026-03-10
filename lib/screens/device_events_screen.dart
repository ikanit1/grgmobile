import 'package:flutter/material.dart';
import '../api/backend_client.dart';

class DeviceEventsScreen extends StatefulWidget {
  const DeviceEventsScreen({super.key, required this.client, required this.deviceId, required this.deviceName});

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<DeviceEventsScreen> createState() => _DeviceEventsScreenState();
}

class _DeviceEventsScreenState extends State<DeviceEventsScreen> {
  List<DeviceEventDto>? _events;
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
      final events = await widget.client.getDeviceEvents(widget.deviceId, limit: 100);
      if (mounted) setState(() { _events = events; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _eventTypeLabel(String type) {
    switch (type) {
      case 'door_open': return 'Открытие двери';
      case 'incoming_call': return 'Входящий звонок';
      case 'DOOR_OPEN': return 'Открытие двери';
      default: return type;
    }
  }

  IconData _eventIcon(String type) {
    switch (type) {
      case 'door_open':
      case 'DOOR_OPEN':
        return Icons.door_front_door;
      case 'incoming_call':
        return Icons.phone_callback;
      default:
        return Icons.event_note;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Журнал: ${widget.deviceName}')),
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
              : _events == null || _events!.isEmpty
                  ? const Center(child: Text('Нет событий'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        itemCount: _events!.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (ctx, i) {
                          final e = _events![i];
                          return ListTile(
                            leading: Icon(_eventIcon(e.type)),
                            title: Text(_eventTypeLabel(e.type)),
                            subtitle: Text(e.time.isNotEmpty ? e.time : '—'),
                            trailing: Text(e.source, style: Theme.of(context).textTheme.bodySmall),
                          );
                        },
                      ),
                    ),
    );
  }
}
