import 'dart:async';
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../services/events_socket_service.dart';

class DeviceEventsScreen extends StatefulWidget {
  const DeviceEventsScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

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
  String _filter = 'all';
  StreamSubscription? _eventsSub;

  static const _filters = {
    'all': 'Все',
    'door_open': 'Двери',
    'incoming_call': 'Звонки',
    'motion': 'Движение',
    'alarm': 'Тревоги',
  };

  @override
  void initState() {
    super.initState();
    _load();
    _eventsSub = EventsSocketService.instance.events.listen((event) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    _eventsSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final events = await widget.client.getDeviceEvents(widget.deviceId, limit: 200);
      if (mounted) setState(() { _events = events; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<DeviceEventDto> get _filteredEvents {
    if (_events == null) return [];
    if (_filter == 'all') return _events!;
    return _events!.where((e) {
      switch (_filter) {
        case 'door_open': return e.type.contains('door_open') || e.type.contains('DOOR_OPEN');
        case 'incoming_call': return e.type.contains('incoming_call') || e.type.contains('doorbell') || e.type.contains('DoorBell');
        case 'motion': return e.type.contains('motion') || e.type.contains('Motion') || e.type.contains('VMD');
        case 'alarm': return e.type.contains('alarm') || e.type.contains('Alarm') || e.type.contains('IO');
        default: return true;
      }
    }).toList();
  }

  String _eventTypeLabel(String type) {
    final lower = type.toLowerCase();
    if (lower.contains('door_open')) return 'Открытие двери';
    if (lower.contains('incoming_call') || lower.contains('doorbell') || lower.contains('doorcall')) return 'Входящий звонок';
    if (lower.contains('motion') || lower.contains('vmd')) return 'Движение';
    if (lower.contains('alarm') || lower.contains('io')) return 'Тревога';
    if (lower.contains('tamper')) return 'Вскрытие';
    return type;
  }

  IconData _eventIcon(String type) {
    final lower = type.toLowerCase();
    if (lower.contains('door_open')) return Icons.door_front_door;
    if (lower.contains('incoming_call') || lower.contains('doorbell')) return Icons.phone_callback;
    if (lower.contains('motion') || lower.contains('vmd')) return Icons.directions_run;
    if (lower.contains('alarm') || lower.contains('io')) return Icons.warning_amber;
    if (lower.contains('tamper')) return Icons.security;
    return Icons.event_note;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredEvents;
    return Scaffold(
      appBar: AppBar(title: Text('События: ${widget.deviceName}')),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(8),
            child: Row(
              children: _filters.entries.map((entry) {
                final selected = _filter == entry.key;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(entry.value),
                    selected: selected,
                    onSelected: (_) => setState(() => _filter = entry.key),
                  ),
                );
              }).toList(),
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
                    : filtered.isEmpty
                        ? const Center(child: Text('Нет событий'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              itemCount: filtered.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (ctx, i) {
                                final e = filtered[i];
                                return ListTile(
                                  leading: Icon(_eventIcon(e.type)),
                                  title: Text(_eventTypeLabel(e.type)),
                                  subtitle: Text(e.time.isNotEmpty ? e.time : '—'),
                                  trailing: Text(e.source, style: Theme.of(context).textTheme.bodySmall),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
