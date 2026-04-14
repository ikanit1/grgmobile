// lib/widgets/rtsp_player_widget.dart
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Reusable RTSP video player widget using media_kit.
/// Supports live view and playback RTSP streams.
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
  bool _loading = true;
  String? _error;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    _openStream();
    WakelockPlus.enable();
  }

  Future<void> _openStream() async {
    try {
      _player.stream.error.listen((error) {
        if (mounted) setState(() => _error = error);
      });
      _player.stream.playing.listen((playing) {
        if (mounted && playing && _loading) {
          setState(() => _loading = false);
        }
      });
      await _player.open(Media(widget.rtspUrl), play: widget.autoPlay);
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  void didUpdateWidget(RtspPlayerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.rtspUrl != widget.rtspUrl) {
      setState(() { _loading = true; _error = null; });
      _player.open(Media(widget.rtspUrl), play: widget.autoPlay);
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
              child: Text(
                'Ошибка видеопотока: $_error',
                style: const TextStyle(color: Colors.red),
                textAlign: TextAlign.center,
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
