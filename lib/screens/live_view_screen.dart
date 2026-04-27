import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  bool _controlsVisible = true;
  final _playerKey = GlobalKey<RtspPlayerWidgetState>();
  StreamSubscription? _connectivitySub;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    _loadLiveUrl();
    _checkPtz();
    _connectivitySub = StreamQualityService.instance.onChanged.listen((_) {
      if (mounted) _loadLiveUrl();
    });
    _scheduleHide();
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    _hideTimer?.cancel();
    super.dispose();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _controlsVisible = false);
    });
  }

  void _onTapVideo() {
    setState(() => _controlsVisible = !_controlsVisible);
    if (_controlsVisible) _scheduleHide();
  }

  Future<void> _loadLiveUrl() async {
    try {
      final pref = await StreamQualityService.instance.getPreference();
      final liveUrl = await widget.client.getLiveUrl(
        widget.deviceId,
        stream: pref.streamType,
      );
      if (!mounted) return;

      final String url;
      if (!kIsWeb && liveUrl.rtspProxyUrl != null && liveUrl.rtspProxyUrl!.isNotEmpty) {
        url = liveUrl.rtspProxyUrl!;
      } else if (liveUrl.hlsUrl != null && liveUrl.hlsUrl!.isNotEmpty) {
        url = liveUrl.hlsUrl!;
      } else {
        url = liveUrl.rtspUrl;
      }

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
      if (mounted) setState(() => _ptzSupported = caps['Supported'] == true);
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

  void _openFullscreen() {
    if (_streamUrl == null) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _FullscreenVideoPage(
          streamUrl: _streamUrl!,
          deviceName: widget.deviceName,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _onTapVideo,
        child: Stack(
          children: [
            // Video area
            Positioned.fill(
              child: _streamUrl != null
                  ? RtspPlayerWidget(key: _playerKey, rtspUrl: _streamUrl!)
                  : _error != null
                      ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                      : const Center(child: CircularProgressIndicator()),
            ),

            // PTZ overlay
            if (_showPtz && _ptzSupported)
              Positioned(
                left: 0, right: 0, bottom: 80,
                child: _buildPtzControls(),
              ),

            // Top app bar (auto-hide)
            AnimatedSlide(
              offset: _controlsVisible ? Offset.zero : const Offset(0, -1),
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeInOut,
              child: _buildTopBar(),
            ),

            // Bottom bar (auto-hide)
            Positioned(
              left: 0, right: 0, bottom: 0,
              child: AnimatedSlide(
                offset: _controlsVisible ? Offset.zero : const Offset(0, 1),
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeInOut,
                child: _buildBottomBar(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    final isMuted = _playerKey.currentState?.isMuted == true;
    return SafeArea(
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
          Expanded(
            child: Text(
              widget.deviceName,
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (_ptzSupported)
            IconButton(
              icon: Icon(_showPtz ? Icons.gamepad : Icons.gamepad_outlined, color: Colors.white),
              onPressed: () => setState(() => _showPtz = !_showPtz),
              tooltip: 'PTZ',
            ),
          IconButton(
            icon: Icon(isMuted ? Icons.volume_off : Icons.volume_up, color: Colors.white),
            onPressed: () { _playerKey.currentState?.toggleMute(); setState(() {}); },
            tooltip: 'Звук',
          ),
          IconButton(
            icon: const Icon(Icons.camera_alt_outlined, color: Colors.white),
            onPressed: () => _playerKey.currentState?.takeSnapshot(context),
            tooltip: 'Снимок',
          ),
          IconButton(
            icon: const Icon(Icons.fullscreen, color: Colors.white),
            onPressed: _openFullscreen,
            tooltip: 'Полный экран',
          ),
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
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Colors.black87, Colors.transparent],
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              ElevatedButton.icon(
                onPressed: _openDoorLoading ? null : _openDoor,
                icon: _openDoorLoading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.lock_open),
                label: Text(_openDoorLoading ? 'Открываю...' : 'Открыть дверь'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.purple,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Fullscreen route — landscape + immersive mode
class _FullscreenVideoPage extends StatefulWidget {
  final String streamUrl;
  final String deviceName;

  const _FullscreenVideoPage({required this.streamUrl, required this.deviceName});

  @override
  State<_FullscreenVideoPage> createState() => _FullscreenVideoPageState();
}

class _FullscreenVideoPageState extends State<_FullscreenVideoPage> {
  final _playerKey = GlobalKey<RtspPlayerWidgetState>();
  bool _controlsVisible = true;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersive);
    _scheduleHide();
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _controlsVisible = false);
    });
  }

  void _onTap() {
    setState(() => _controlsVisible = !_controlsVisible);
    if (_controlsVisible) _scheduleHide();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _onTap,
        child: Stack(
          children: [
            Positioned.fill(
              child: RtspPlayerWidget(key: _playerKey, rtspUrl: widget.streamUrl),
            ),
            AnimatedOpacity(
              opacity: _controlsVisible ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 200),
              child: SafeArea(
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.fullscreen_exit, color: Colors.white, size: 28),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    Expanded(
                      child: Text(
                        widget.deviceName,
                        style: const TextStyle(color: Colors.white, fontSize: 16),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      icon: Icon(
                        _playerKey.currentState?.isMuted == true ? Icons.volume_off : Icons.volume_up,
                        color: Colors.white,
                      ),
                      onPressed: () { _playerKey.currentState?.toggleMute(); setState(() {}); },
                    ),
                    IconButton(
                      icon: const Icon(Icons.camera_alt_outlined, color: Colors.white),
                      onPressed: () => _playerKey.currentState?.takeSnapshot(context),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
