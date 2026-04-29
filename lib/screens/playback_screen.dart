import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/rtsp_player_widget.dart';

class PlaybackScreen extends StatefulWidget {
  final BackendClient client;
  final int deviceId;
  final String deviceName;

  const PlaybackScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  @override
  State<PlaybackScreen> createState() => _PlaybackScreenState();
}

class _PlaybackScreenState extends State<PlaybackScreen> {
  DateTime _selectedDate = DateTime.now();
  List<Map<String, dynamic>> _timeline = [];
  List<Map<String, dynamic>> _recordings = [];
  bool _loading = false;
  String? _error;
  String? _playbackUrl;
  DateTime? _playbackStart;
  DateTime? _playbackEnd;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dateStr = _formatDate(_selectedDate);
      // Uniview LiteAPI uses LOCAL time (no Z suffix)
      final startOfDay = '${dateStr}T00:00:00';
      final endOfDay = '${dateStr}T23:59:59';
      final results = await Future.wait<List<Map<String, dynamic>>>([
        widget.client.getRecordingTimeline(widget.deviceId, date: dateStr),
        widget.client.getRecordings(widget.deviceId, from: startOfDay, to: endOfDay),
      ]);
      if (mounted) {
        setState(() {
          _timeline = results[0];
          _recordings = results[1];
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _formatLocalTime(DateTime d) =>
      '${_formatDate(d)}T${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}:${d.second.toString().padLeft(2, '0')}';

  Future<void> _playRange(DateTime start, DateTime end) async {
    try {
      final url = await widget.client.getPlaybackUrl(
        widget.deviceId,
        from: _formatLocalTime(start),
        to: _formatLocalTime(end),
      );
      if (!mounted || url.isEmpty) return;
      setState(() {
        _playbackUrl = url;
        _playbackStart = start;
        _playbackEnd = end;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  Future<void> _playRecordingFromMap(Map<String, dynamic> r) async {
    final start = _parseLocal(r['StartTime'] as String?);
    final end = _parseLocal(r['EndTime'] as String?);
    if (start == null || end == null) return;
    await _playRange(start, end);
  }

  /// Tap on timeline — find segment containing tapped time and play it from that moment.
  Future<void> _onTimelineTap(double fraction) async {
    final tappedMin = (fraction * 1440).clamp(0, 1439).toInt();
    final tapped = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day,
        tappedMin ~/ 60, tappedMin % 60);

    Map<String, dynamic>? found;
    for (final seg in _timeline) {
      final s = _parseLocal(seg['StartTime'] as String?);
      final e = _parseLocal(seg['EndTime'] as String?);
      if (s != null && e != null && !tapped.isBefore(s) && tapped.isBefore(e)) {
        found = seg;
        break;
      }
    }
    if (found == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('На это время записи нет')),
        );
      }
      return;
    }
    final segEnd = _parseLocal(found['EndTime'] as String?);
    if (segEnd == null) return;
    await _playRange(tapped, segEnd);
  }

  DateTime? _parseLocal(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    try {
      // Strip Z if present — treat as local
      final clean = iso.endsWith('Z') ? iso.substring(0, iso.length - 1) : iso;
      return DateTime.parse(clean);
    } catch (_) {
      return null;
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 90)),
      lastDate: DateTime.now(),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
        _playbackUrl = null;
        _playbackStart = null;
        _playbackEnd = null;
      });
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text('Архив: ${widget.deviceName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_today),
            tooltip: 'Выбрать дату',
            onPressed: _pickDate,
          ),
        ],
      ),
      body: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Container(
              color: Colors.black,
              child: _playbackUrl != null
                  ? Stack(children: [
                      Positioned.fill(child: RtspPlayerWidget(rtspUrl: _playbackUrl!)),
                      if (_playbackStart != null)
                        Positioned(
                          left: 8, bottom: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.black54,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              '${_hhmmss(_playbackStart!)} → ${_hhmmss(_playbackEnd!)}',
                              style: const TextStyle(color: Colors.white, fontSize: 12),
                            ),
                          ),
                        ),
                    ])
                  : const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.play_circle_outline, color: Colors.white24, size: 56),
                          SizedBox(height: 8),
                          Text('Выберите запись', style: TextStyle(color: Colors.white54)),
                        ],
                      ),
                    ),
            ),
          ),
          Container(
            color: Theme.of(context).scaffoldBackgroundColor,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                const Icon(Icons.event, size: 18),
                const SizedBox(width: 6),
                Text(_formatDate(_selectedDate),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const Spacer(),
                Text('Сегментов: ${_timeline.length}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
          ),
          if (_loading) const Expanded(child: Center(child: CircularProgressIndicator())),
          if (_error != null)
            Expanded(child: Center(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
            ))),
          if (!_loading && _error == null) _buildTimelineBar(),
          if (!_loading && _error == null) Expanded(child: _buildRecordingsList()),
        ],
      ),
    );
  }

  Widget _buildTimelineBar() {
    if (_timeline.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text('Нет записей за этот день', style: TextStyle(color: Colors.grey)),
      );
    }
    return Container(
      height: 56,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: LayoutBuilder(
        builder: (ctx, constraints) {
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (d) => _onTimelineTap(d.localPosition.dx / constraints.maxWidth),
            child: CustomPaint(
              painter: _TimelinePainter(
                _timeline,
                playStart: _playbackStart,
                playEnd: _playbackEnd,
                date: _selectedDate,
                parser: _parseLocal,
              ),
              size: Size.infinite,
            ),
          );
        },
      ),
    );
  }

  Widget _buildRecordingsList() {
    if (_recordings.isEmpty) {
      return const Center(child: Text('Нет записей', style: TextStyle(color: Colors.grey)));
    }
    return ListView.separated(
      itemCount: _recordings.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (ctx, i) {
        final r = _recordings[i];
        final start = _parseLocal(r['StartTime'] as String?);
        final end = _parseLocal(r['EndTime'] as String?);
        final title = (start != null && end != null)
            ? '${_hhmm(start)} — ${_hhmm(end)}'
            : '${r['StartTime']}';
        final dur = (start != null && end != null) ? _humanDuration(end.difference(start)) : '';
        final isCurrent = _playbackStart != null && start != null && _playbackStart!.isAtSameMomentAs(start);
        return ListTile(
          leading: Icon(
            isCurrent ? Icons.play_circle : Icons.play_circle_outline,
            color: isCurrent ? AppColors.purple : null,
          ),
          title: Text(title),
          subtitle: Text(dur),
          onTap: () => _playRecordingFromMap(r),
        );
      },
    );
  }

  String _hhmm(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  String _hhmmss(DateTime d) =>
      '${_hhmm(d)}:${d.second.toString().padLeft(2, '0')}';

  String _humanDuration(Duration d) {
    if (d.inHours > 0) return '${d.inHours} ч ${d.inMinutes % 60} мин';
    if (d.inMinutes > 0) return '${d.inMinutes} мин';
    return '${d.inSeconds} с';
  }
}

class _TimelinePainter extends CustomPainter {
  final List<Map<String, dynamic>> segments;
  final DateTime? playStart;
  final DateTime? playEnd;
  final DateTime date;
  final DateTime? Function(String?) parser;

  _TimelinePainter(this.segments, {this.playStart, this.playEnd, required this.date, required this.parser});

  @override
  void paint(Canvas canvas, Size size) {
    final barTop = 8.0;
    final barHeight = size.height - 24;

    // Background
    final bg = Paint()..color = Colors.grey.shade800;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(0, barTop, size.width, barHeight), const Radius.circular(4)),
      bg,
    );

    // Recording segments
    final segPaint = Paint()..color = AppColors.purple.withValues(alpha: 0.85);
    for (final seg in segments) {
      final s = parser(seg['StartTime'] as String?);
      final e = parser(seg['EndTime'] as String?);
      if (s == null || e == null) continue;
      final startFrac = ((s.hour * 60 + s.minute) / 1440).clamp(0.0, 1.0);
      final endFrac = ((e.hour * 60 + e.minute) / 1440).clamp(0.0, 1.0);
      final w = ((endFrac - startFrac) * size.width).clamp(2.0, size.width);
      canvas.drawRect(
        Rect.fromLTWH(startFrac * size.width, barTop, w, barHeight),
        segPaint,
      );
    }

    // Current playback marker
    if (playStart != null) {
      final pFrac = ((playStart!.hour * 60 + playStart!.minute) / 1440).clamp(0.0, 1.0);
      final markerX = pFrac * size.width;
      final markerPaint = Paint()
        ..color = Colors.amber
        ..strokeWidth = 2;
      canvas.drawLine(Offset(markerX, barTop - 2), Offset(markerX, barTop + barHeight + 2), markerPaint);
    }

    // Hour ticks + labels
    final tickPaint = Paint()..color = Colors.white24..strokeWidth = 1;
    final tp = TextPainter(textDirection: TextDirection.ltr);
    for (int h = 0; h <= 24; h += 3) {
      final x = (h / 24) * size.width;
      canvas.drawLine(Offset(x, barTop + barHeight), Offset(x, barTop + barHeight + 4), tickPaint);
      tp.text = TextSpan(
        text: '$h',
        style: const TextStyle(fontSize: 10, color: Colors.white60),
      );
      tp.layout();
      tp.paint(canvas, Offset(x - tp.width / 2, barTop + barHeight + 5));
    }
  }

  @override
  bool shouldRepaint(covariant _TimelinePainter old) =>
      old.segments != segments || old.playStart != playStart;
}
