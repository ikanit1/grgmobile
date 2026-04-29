import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:gal/gal.dart';
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

class RtspPlayerWidgetState extends State<RtspPlayerWidget>
    with WidgetsBindingObserver {
  late final Player _player;
  late final VideoController _controller;
  final _transformController = TransformationController();

  StreamSubscription<bool>? _playingSub;
  StreamSubscription<String>? _errorSub;
  Timer? _retryTimer;
  Timer? _timeoutTimer;

  bool _loading = true;
  String? _error;
  bool _muted = false;
  int _retryCount = 0;
  bool _wasPlayingBeforeBackground = false;

  static const _maxRetries = 3;
  static const _retryDelay = Duration(seconds: 3);
  static const _timeout = Duration(seconds: 18);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _player = Player();
    _controller = VideoController(_player);
    _setupListeners();
    _openStream();
    WakelockPlus.enable();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
        _wasPlayingBeforeBackground = _player.state.playing;
        if (_wasPlayingBeforeBackground) _player.pause();
      case AppLifecycleState.resumed:
        if (_wasPlayingBeforeBackground && !_player.state.playing) {
          _player.play();
        }
      default:
        break;
    }
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
      await native.setProperty('profile', 'low-latency');
      await native.setProperty('rtsp-transport', 'tcp');
      await native.setProperty('network-timeout', '10');
      await native.setProperty('cache', 'no');
      await native.setProperty('demuxer-lavf-o-set', 'fflags=nobuffer');
      await native.setProperty('vd-lavc-threads', '1');
    }

    await _player.open(Media(widget.rtspUrl), play: widget.autoPlay);

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
  bool get isLoading => _loading;

  void resetZoom() => _transformController.value = Matrix4.identity();

  Future<void> takeSnapshot(BuildContext context) async {
    if (_loading || _error != null) return;
    try {
      final bytes = await _player.screenshot();
      if (bytes == null || bytes.isEmpty) return;
      if (!context.mounted) return;

      final hasAccess = await Gal.hasAccess(toAlbum: true);
      if (!hasAccess) {
        await Gal.requestAccess(toAlbum: true);
      }
      await Gal.putImageBytes(bytes, album: 'GRG');

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Снимок сохранён в галерею'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось сохранить: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timeoutTimer?.cancel();
    _retryTimer?.cancel();
    _playingSub?.cancel();
    _errorSub?.cancel();
    _transformController.dispose();
    WakelockPlus.disable();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      child: Stack(
        children: [
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_error != null)
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_off, color: Colors.white38, size: 32),
                    const SizedBox(height: 8),
                    const Text(
                      'Ошибка видеопотока',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _error!,
                      style: const TextStyle(color: Colors.white54, fontSize: 11),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 12),
                    TextButton.icon(
                      onPressed: () { _retryCount = 0; _openStream(); },
                      icon: const Icon(Icons.refresh, color: Colors.white70, size: 18),
                      label: const Text('Повторить', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    ),
                  ],
                ),
              ),
            )
          else
            InteractiveViewer(
              transformationController: _transformController,
              minScale: 1.0,
              maxScale: 5.0,
              child: Video(controller: _controller, fill: Colors.black),
            ),
          if (widget.overlay != null) widget.overlay!,
        ],
      ),
    );
  }
}
