import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api/akuvox_client.dart';
import '../models/device_settings.dart';
import '../theme/app_theme.dart';

class DoorControlScreen extends StatefulWidget {
  final DeviceSettings settings;

  const DoorControlScreen({super.key, required this.settings});

  @override
  State<DoorControlScreen> createState() => _DoorControlScreenState();
}

class _DoorControlScreenState extends State<DoorControlScreen> {
  late final AkuvoxApiClient _api;
  VideoPlayerController? _videoController;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = AkuvoxApiClient(
      baseUrl: widget.settings.baseUrl,
      username: widget.settings.username,
      password: widget.settings.password,
    );
    _initVideo();
  }

  void _initVideo() {
    final rtspUrl = widget.settings.rtspUrl;
    if (rtspUrl != null && rtspUrl.isNotEmpty) {
      _videoController = VideoPlayerController.networkUrl(
        Uri.parse(rtspUrl),
      );
      _videoController!.initialize().then((_) {
        if (mounted) {
          setState(() {});
          _videoController!.play();
        }
      }).catchError((e) {
        if (mounted) setState(() => _error = 'Ошибка видео: $e');
      });
    }
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  Future<void> _openDoor() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.openDoor();
      if (!mounted) return;
      if (response.isSuccess) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Дверь открыта'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        setState(() => _error = response.message);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Ошибка: $e');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Управление дверью'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: Column(
        children: [
          Expanded(
            flex: 2,
            child: _buildVideoSection(),
          ),
          Expanded(
            flex: 1,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0x33FF6B6B),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0x66FF6B6B)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: Color(0xFFFF6B6B)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _error!,
                              style: const TextStyle(color: Color(0xFFFF6B6B)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  FilledButton.icon(
                    onPressed: _loading ? null : _openDoor,
                    icon: _loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.lock_open),
                    label: Text(_loading ? 'Открываю...' : 'Открыть дверь'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 32,
                        vertical: 16,
                      ),
                      textStyle: const TextStyle(fontSize: 18),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVideoSection() {
    if (widget.settings.rtspUrl == null || widget.settings.rtspUrl!.isEmpty) {
      return Container(
        color: const Color(0xFF0D0717),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  color: const Color(0x338A2BE2),
                ),
                child: const Icon(Icons.videocam_off, size: 36, color: Color(0xFFDACBF5)),
              ),
              const SizedBox(height: 16),
              const Text(
                'Камера не настроена',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              const Text(
                'Укажите RTSP URL в настройках',
                style: TextStyle(fontSize: 12, color: Color(0xFFDACBF5)),
              ),
            ],
          ),
        ),
      );
    }

    if (_videoController == null || !_videoController!.value.isInitialized) {
      return Container(
        color: Colors.black,
        child: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: Color(0xFF8A2BE2)),
              SizedBox(height: 16),
              Text('Загрузка видео...', style: TextStyle(color: Color(0xFFDACBF5))),
            ],
          ),
        ),
      );
    }

    return AspectRatio(
      aspectRatio: _videoController!.value.aspectRatio,
      child: VideoPlayer(_videoController!),
    );
  }
}
