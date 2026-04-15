// lib/screens/live_view_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../services/stream_quality_service.dart';
import '../widgets/rtsp_player_widget.dart';
import '../theme/app_theme.dart';

class LiveViewScreen extends StatefulWidget {
  final BackendClient client;
  final int deviceId;
  final String deviceName;

  const LiveViewScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  @override
  State<LiveViewScreen> createState() => _LiveViewScreenState();
}

class _LiveViewScreenState extends State<LiveViewScreen> {
  String? _streamUrl;
  String? _error;
  bool _openDoorLoading = false;
  bool _ptzSupported = false;
  bool _showPtz = false;
  final _playerKey = GlobalKey<RtspPlayerWidgetState>();
  StreamSubscription? _connectivitySub;

  @override
  void initState() {
    super.initState();
    _loadLiveUrl();
    _checkPtz();
    // Restart stream automatically on network type change
    _connectivitySub = StreamQualityService.instance.onChanged.listen((_) {
      if (mounted) _loadLiveUrl();
    });
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    super.dispose();
  }

  Future<void> _loadLiveUrl() async {
    try {
      final pref = await StreamQualityService.instance.getPreference();
      final liveUrl = await widget.client.getLiveUrl(
        widget.deviceId,
        stream: pref.streamType,
      );
      if (!mounted) return;

      // Pick HLS on cellular (WAN), direct RTSP on WiFi (LAN)
      final url = (pref.preferHls && liveUrl.hlsUrl != null)
          ? liveUrl.hlsUrl!
          : liveUrl.rtspUrl;

      if (url.trim().isEmpty) {
        setState(() => _error = 'Не получен адрес видеопотока');
        return;
      }
      setState(() { _streamUrl = url.trim(); _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _checkPtz() async {
    try {
      final caps = await widget.client.getPtzCapabilities(widget.deviceId);
      if (mounted) {
        setState(() => _ptzSupported = caps['Supported'] == true);
      }
    } catch (_) {}
  }

  Future<void> _openDoor() async {
    setState(() => _openDoorLoading = true);
    try {
      final result = await widget.client.openDoor(widget.deviceId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.success ? 'Дверь открыта' : result.message),
          backgroundColor: result.success ? Colors.green : AppColors.danger,
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _openDoorLoading = false);
    }
  }

  Future<void> _ptzMove(String direction) async {
    try { await widget.client.ptzMove(widget.deviceId, direction); } catch (_) {}
  }

  Future<void> _ptzStop() async {
    try { await widget.client.ptzStop(widget.deviceId); } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.deviceName),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        actions: [
          if (_ptzSupported)
            IconButton(
              icon: Icon(_showPtz ? Icons.gamepad : Icons.gamepad_outlined),
              onPressed: () => setState(() => _showPtz = !_showPtz),
              tooltip: 'PTZ',
            ),
          IconButton(
            icon: Icon(
              _playerKey.currentState?.isMuted == true ? Icons.volume_off : Icons.volume_up,
            ),
            onPressed: () {
              _playerKey.currentState?.toggleMute();
              setState(() {});
            },
            tooltip: 'Звук',
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            flex: 3,
            child: _streamUrl != null
                ? RtspPlayerWidget(key: _playerKey, rtspUrl: _streamUrl!)
                : _error != null
                    ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                    : const Center(child: CircularProgressIndicator()),
          ),
          if (_showPtz && _ptzSupported) _buildPtzControls(),
          _buildBottomBar(),
        ],
      ),
    );
  }

  Widget _buildPtzControls() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      color: Colors.black54,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ptzButton(Icons.arrow_upward, 'up'),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _ptzButton(Icons.arrow_back, 'left'),
              const SizedBox(width: 48),
              _ptzButton(Icons.arrow_forward, 'right'),
            ],
          ),
          _ptzButton(Icons.arrow_downward, 'down'),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _ptzButton(Icons.zoom_in, 'zoomin'),
              const SizedBox(width: 16),
              _ptzButton(Icons.zoom_out, 'zoomout'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _ptzButton(IconData icon, String direction) {
    return GestureDetector(
      onTapDown: (_) => _ptzMove(direction),
      onTapUp: (_) => _ptzStop(),
      onTapCancel: _ptzStop,
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Icon(icon, color: Colors.white, size: 32),
      ),
    );
  }

  Widget _buildBottomBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            ElevatedButton.icon(
              onPressed: _openDoorLoading ? null : _openDoor,
              icon: _openDoorLoading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.lock_open),
              label: Text(_openDoorLoading ? 'Открываю...' : 'Открыть дверь'),
            ),
          ],
        ),
      ),
    );
  }
}
