import 'dart:async';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../api/backend_client.dart';
import '../services/stream_quality_service.dart';
import '../theme/app_theme.dart';
import 'live_view_screen.dart';

class IncomingCallScreen extends StatefulWidget {
  final int deviceId;
  final String? buildingName;
  final String? apartmentNumber;
  final BackendClient client;
  final VoidCallback onDismiss;

  const IncomingCallScreen({
    super.key,
    required this.deviceId,
    required this.client,
    required this.onDismiss,
    this.buildingName,
    this.apartmentNumber,
  });

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  Player? _player;
  VideoController? _videoController;
  bool _loadingVideo = true;
  bool _openDoorLoading = false;
  Timer? _timeout;

  @override
  void initState() {
    super.initState();
    _loadPreview();
    _timeout = Timer(const Duration(seconds: 60), () {
      if (mounted) widget.onDismiss();
    });
  }

  Future<void> _loadPreview() async {
    try {
      final pref = await StreamQualityService.instance.getPreference();
      final liveUrl = await widget.client.getLiveUrl(
        widget.deviceId,
        stream: pref.streamType,
      );
      final url = (pref.preferHls && liveUrl.hlsUrl != null)
          ? liveUrl.hlsUrl!
          : liveUrl.rtspUrl;
      if (!mounted || url.trim().isEmpty) {
        setState(() => _loadingVideo = false);
        return;
      }
      _player = Player();
      _videoController = VideoController(_player!);
      _player!.stream.playing.listen((playing) {
        if (mounted && playing && _loadingVideo) {
          setState(() => _loadingVideo = false);
        }
      });
      await _player!.open(Media(url.trim()), play: true);
      _player!.setVolume(0); // muted preview
    } catch (_) {
      if (mounted) setState(() => _loadingVideo = false);
    }
  }

  @override
  void dispose() {
    _timeout?.cancel();
    _player?.dispose();
    super.dispose();
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
      if (result.success) widget.onDismiss();
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

  void _answer() {
    widget.onDismiss();
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => LiveViewScreen(
        client: widget.client,
        deviceId: widget.deviceId,
        deviceName: widget.buildingName ?? 'Домофон',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (widget.buildingName != null && widget.buildingName!.isNotEmpty) widget.buildingName,
      if (widget.apartmentNumber != null && widget.apartmentNumber!.isNotEmpty) 'кв. ${widget.apartmentNumber}',
    ].join(' · ');

    return Material(
      color: Colors.black87,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.door_front_door, color: AppColors.purple, size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Входящий звонок',
                          style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                        if (subtitle.isNotEmpty)
                          Text(subtitle, style: const TextStyle(color: Colors.white70, fontSize: 14)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: Center(child: _buildVideoArea())),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _actionButton(icon: Icons.call_end, label: 'Сбросить', color: AppColors.danger, onPressed: widget.onDismiss),
                  _actionButton(icon: Icons.lock_open, label: _openDoorLoading ? '...' : 'Открыть', color: AppColors.success, onPressed: _openDoorLoading ? null : _openDoor),
                  _actionButton(icon: Icons.videocam, label: 'Ответить', color: AppColors.purple, onPressed: _answer),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVideoArea() {
    if (_loadingVideo && _videoController == null) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: AppColors.purple),
          SizedBox(height: 16),
          Text('Загрузка видео...', style: TextStyle(color: Colors.white70)),
        ],
      );
    }
    if (_videoController != null) {
      return AspectRatio(aspectRatio: 16 / 9, child: Video(controller: _videoController!, fill: Colors.black));
    }
    return const Icon(Icons.videocam_off, size: 64, color: Colors.white38);
  }

  Widget _actionButton({required IconData icon, required String label, required Color color, required VoidCallback? onPressed}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton.filled(
          onPressed: onPressed,
          icon: Icon(icon),
          style: IconButton.styleFrom(
            backgroundColor: color.withValues(alpha: 0.3),
            foregroundColor: color,
            padding: const EdgeInsets.all(16),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}
