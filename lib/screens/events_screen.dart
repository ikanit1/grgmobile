import 'dart:async';
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../services/events_socket_service.dart';
import '../theme/app_theme.dart';
import '../widgets/skeleton_card.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, required this.client});
  final BackendClient client;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<RecentEventDto>? _events;
  bool _loading = true;
  String? _error;
  String _filter = 'all';
  StreamSubscription? _sub;

  static const _filters = {
    'all': 'Р’СЃРµ',
    'door_open': 'Р”РІРµСЂРё',
    'incoming_call': 'Р—РІРѕРЅРєРё',
    'motion': 'Р”РІРёР¶РµРЅРёРµ',
    'alarm': 'РўСЂРµРІРѕРіРё',
  };

  @override
  void initState() {
    super.initState();
    _load();
    _sub = EventsSocketService.instance.events.listen((_) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final events = await widget.client.getRecentEvents(limit: 50);
      if (mounted) setState(() { _events = events; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<RecentEventDto> get _filtered {
    if (_events == null) return [];
    if (_filter == 'all') return _events!;
    return _events!.where((e) {
      final t = e.eventType.toLowerCase();
      switch (_filter) {
        case 'door_open':      return t.contains('door_open');
        case 'incoming_call':  return t.contains('incoming_call') || t.contains('doorbell');
        case 'motion':         return t.contains('motion') || t.contains('vmd');
        case 'alarm':          return t.contains('alarm') || t.contains('io');
        default: return true;
      }
    }).toList();
  }

  IconData _icon(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open'))                          return Icons.lock_open_rounded;
    if (t.contains('incoming_call') || t.contains('doorbell')) return Icons.call_rounded;
    if (t.contains('motion') || t.contains('vmd'))        return Icons.directions_run;
    if (t.contains('alarm') || t.contains('io'))          return Icons.notifications_active;
    return Icons.sensors;
  }

  Color _iconBg(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open'))                          return AppColors.success.withValues(alpha: 0.18);
    if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.purple.withValues(alpha: 0.20);
    if (t.contains('motion') || t.contains('vmd'))        return AppColors.warning.withValues(alpha: 0.18);
    if (t.contains('alarm') || t.contains('io'))          return AppColors.danger.withValues(alpha: 0.18);
    return AppColors.border;
  }

  Color _iconColor(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open'))                          return AppColors.success;
    if (t.contains('incoming_call') || t.contains('doorbell')) return AppColors.textSecondary;
    if (t.contains('motion') || t.contains('vmd'))        return AppColors.warning;
    if (t.contains('alarm') || t.contains('io'))          return AppColors.danger;
    return AppColors.textSecondary;
  }

  String _label(String type) {
    final t = type.toLowerCase();
    if (t.contains('door_open'))                          return 'РћС‚РєСЂС‹С‚РёРµ РґРІРµСЂРё';
    if (t.contains('incoming_call') || t.contains('doorbell')) return 'Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРє';
    if (t.contains('motion') || t.contains('vmd'))        return 'Р”РІРёР¶РµРЅРёРµ';
    if (t.contains('alarm') || t.contains('io'))          return 'РўСЂРµРІРѕРіР°';
    return type;
  }

  String _formatTime(String iso) {
    if (iso.isEmpty) return 'вЂ”';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'С‚РѕР»СЊРєРѕ С‡С‚Рѕ';
      if (diff.inHours < 1)   return '${diff.inMinutes} РјРёРЅ РЅР°Р·Р°Рґ';
      if (diff.inDays < 1)    return '${diff.inHours} С‡ РЅР°Р·Р°Рґ';
      return '${dt.day}.${dt.month.toString().padLeft(2,'0')} ${dt.hour}:${dt.minute.toString().padLeft(2,'0')}';
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            'РЎРѕР±С‹С‚РёСЏ',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: _filters.entries.map((entry) {
              final selected = _filter == entry.key;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(entry.value),
                  selected: selected,
                  onSelected: (_) => setState(() => _filter = entry.key),
                  selectedColor: AppColors.purple.withValues(alpha: 0.25),
                  checkmarkColor: AppColors.textSecondary,
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _loading
              ? ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: List.generate(5, (_) => const SkeletonEventItem()),
                )
              : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.error_outline, color: AppColors.danger, size: 40),
                          const SizedBox(height: 12),
                          Text(_error!, style: const TextStyle(color: AppColors.danger)),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _load, child: const Text('РџРѕРІС‚РѕСЂРёС‚СЊ')),
                        ],
                      ),
                    )
                  : filtered.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.event_note_outlined, color: AppColors.textSecondary, size: 48),
                              const SizedBox(height: 12),
                              Text(
                                'РќРµС‚ СЃРѕР±С‹С‚РёР№',
                                style: TextStyle(color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => Divider(
                              height: 1,
                              color: AppColors.border,
                            ),
                            itemBuilder: (ctx, i) {
                              final e = filtered[i];
                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(vertical: 6),
                                leading: Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: _iconBg(e.eventType),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    _icon(e.eventType),
                                    size: 18,
                                    color: _iconColor(e.eventType),
                                  ),
                                ),
                                title: Text(
                                  _label(e.eventType),
                                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                                ),
                                subtitle: Text(
                                  'РЈСЃС‚СЂРѕР№СЃС‚РІРѕ #${e.deviceId ?? 'вЂ”'}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                                trailing: Text(
                                  _formatTime(e.createdAt),
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
        ),
      ],
    );
  }
}

