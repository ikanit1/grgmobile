// lib/screens/playback_screen.dart
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
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

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dateStr = _formatDate(_selectedDate);
      final startOfDay = '${dateStr}T00:00:00Z';
      final endOfDay = '${dateStr}T23:59:59Z';
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

  Future<void> _playRecording(String startTime, String endTime) async {
    try {
      final url = await widget.client.getPlaybackUrl(widget.deviceId, from: startTime, to: endTime);
      if (mounted && url.isNotEmpty) {
        setState(() => _playbackUrl = url);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
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
      });
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Записи: ${widget.deviceName}')),
      body: Column(
        children: [
          if (_playbackUrl != null)
            SizedBox(
              height: 240,
              child: RtspPlayerWidget(rtspUrl: _playbackUrl!),
            ),
          _buildDateSelector(),
          if (_loading) const Expanded(child: Center(child: CircularProgressIndicator())),
          if (_error != null)
            Expanded(child: Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))),
          if (!_loading && _error == null) _buildTimelineBar(),
          if (!_loading && _error == null) Expanded(child: _buildRecordingsList()),
        ],
      ),
    );
  }

  Widget _buildDateSelector() {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: OutlinedButton.icon(
        onPressed: _pickDate,
        icon: const Icon(Icons.calendar_today, size: 18),
        label: Text(_formatDate(_selectedDate)),
      ),
    );
  }

  Widget _buildTimelineBar() {
    if (_timeline.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(8),
        child: Text('Нет записей за этот день', style: TextStyle(color: Colors.grey)),
      );
    }
    return Container(
      height: 40,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      child: CustomPaint(
        painter: _TimelinePainter(_timeline),
        size: Size.infinite,
      ),
    );
  }

  Widget _buildRecordingsList() {
    if (_recordings.isEmpty) {
      return const Center(child: Text('Нет записей'));
    }
    return ListView.separated(
      itemCount: _recordings.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (ctx, i) {
        final r = _recordings[i];
        final start = r['StartTime'] as String? ?? '';
        final end = r['EndTime'] as String? ?? '';
        return ListTile(
          leading: const Icon(Icons.play_circle_outline),
          title: Text('${_timeOnly(start)} — ${_timeOnly(end)}'),
          subtitle: Text(_duration(start, end)),
          onTap: () => _playRecording(start, end),
        );
      },
    );
  }

  String _timeOnly(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  String _duration(String start, String end) {
    try {
      final d = DateTime.parse(end).difference(DateTime.parse(start));
      if (d.inHours > 0) return '${d.inHours}ч ${d.inMinutes % 60}мин';
      return '${d.inMinutes}мин';
    } catch (_) {
      return '';
    }
  }
}

class _TimelinePainter extends CustomPainter {
  final List<Map<String, dynamic>> segments;
  _TimelinePainter(this.segments);

  @override
  void paint(Canvas canvas, Size size) {
    final bgPaint = Paint()..color = Colors.grey.shade300;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    final segPaint = Paint()..color = Colors.blue;
    for (final seg in segments) {
      try {
        final start = DateTime.parse(seg['StartTime'] as String);
        final end = DateTime.parse(seg['EndTime'] as String);
        final startFrac = (start.hour * 60 + start.minute) / 1440;
        final endFrac = (end.hour * 60 + end.minute) / 1440;
        canvas.drawRect(
          Rect.fromLTWH(startFrac * size.width, 0, (endFrac - startFrac) * size.width, size.height),
          segPaint,
        );
      } catch (_) {}
    }

    final textPainter = TextPainter(textDirection: TextDirection.ltr);
    for (int h = 0; h <= 24; h += 6) {
      textPainter.text = TextSpan(
        text: '$h',
        style: const TextStyle(fontSize: 10, color: Colors.black54),
      );
      textPainter.layout();
      textPainter.paint(canvas, Offset((h / 24) * size.width, size.height - 12));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
