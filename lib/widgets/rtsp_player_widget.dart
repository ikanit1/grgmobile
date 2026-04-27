// lib/widgets/rtsp_player_widget.dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

class RtspPlayerWidget extends StatefulWidget {
  final String rtspUrl;
  final bool autoPlay;
  final bool showControls;
  final Widget? overlay;

  const RtspPlayerWidget({
    super.key,
    required this.rtspUrl,
    this.autoPlay = true,
    this.showControls = true,
    this.overlay,
  });

  @override
  State<RtspPlayerWidget> createState() => RtspPlayerWidgetState();
}

class RtspPlayerWidgetState extends State<RtspPlayerWidget> {
  late final Player _player;
  late final VideoController _controller;
  StreamSubscription<bool>? _playingSub;
  StreamSubscription<String>? _errorSub;
  Timer? _retryTimer;
  Timer? _timeoutTimer;

  bool _loading = true;
  String? _error;
  bool _muted = false;
  int _retryCount = 0;

  static const _maxRetries = 3;
  static const _retryDelay = Duration(seconds: 3);
  // go2rtc + FFmpeg может стартовать до 15 секунд при первом открытии
  static const _timeout = Duration(seconds: 18);

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    _setupListeners();
    _openStream();
    WakelockPlus.enable();
  }

  void _setupListeners() {
    _playingSub = _player.stream.playing.listen((playing) {
      if (!mounted || !playing) return;
      _timeoutTimer?.cancel();
      _retryTimer?.cancel();
      _retryCount = 0;
      if (_loading) setState(() { _loading = false; _error = null; });
    });

    _errorSub = _player.stream.error.listen((error) {
      if (!mounted || error.isEmpty) return;
      _timeoutTimer?.cancel();
      if (_retryCount < _maxRetries) {
        _retryCount++;
        _retryTimer?.cancel();
        _retryTimer = Timer(_retryDelay, _openStream);
      } else {
        if (mounted) setState(() { _error = error; _loading = false; });
      }
    });
  }

  Future<void> _openStream() async {
    if (!mounted) return;
    setState(() { _loading = true; _error = null; });

    if (!kIsWeb && _player.platform is NativePlayer) {
      final native = _player.platform as NativePlayer;
      await native.setProperty('rtsp-transport', 'tcp');
      await native.setProperty('network-timeout', '10');
      await native.setProperty('cache', 'no');
    }

    await _player.open(Media(widget.rtspUrl), play: widget.autoPlay);

    // Таймаут: если за N секунд воспроизведение не началось — считаем ошибкой
    _timeoutTimer?.cancel();
    _timeoutTimer = Timer(_timeout, () {
      if (!mounted || !_loading) return;
      if (_retryCount < _maxRetries) {
        _retryCount++;
        _openStream();
      } else {
        setState(() { _error = 'Не удалось открыть видеопоток'; _loading = false; });
      }
    });
  }

  @override
  void didUpdateWidget(RtspPlayerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rtspUrl != widget.rtspUrl) {
      _retryCount = 0;
      _openStream();
    }
  }

  void toggleMute() {
    setState(() {
      _muted = !_muted;
      _player.setVolume(_muted ? 0 : 100);
    });
  }

  bool get isMuted => _muted;

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    _retryTimer?.cancel();
    _playingSub?.cancel();
    _errorSub?.cancel();
    WakelockPlus.disable();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        if (_loading)
          const Center(child: CircularProgressIndicator())
        else if (_error != null)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Ошибка видеопотока: $_error',
                    style: const TextStyle(color: Colors.red),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: () { _retryCount = 0; _openStream(); },
                    icon: const Icon(Icons.refresh, color: Colors.white70),
                    label: const Text('Повторить', style: TextStyle(color: Colors.white70)),
                  ),
                ],
              ),
            ),
          )
        else
          Video(controller: _controller, fill: Colors.black),
        if (widget.overlay != null) widget.overlay!,
      ],
    );
  }
}
