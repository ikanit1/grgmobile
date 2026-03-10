import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api/akuvox_client.dart';
import '../models/device_settings.dart';

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
      appBar: AppBar(title: const Text('Управление дверью')),
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
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.error_outline, color: Colors.red[700]),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _error!,
                              style: TextStyle(color: Colors.red[700]),
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
        color: Colors.grey[200],
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.videocam_off, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                'Камера не настроена',
                style: TextStyle(color: Colors.grey[600]),
              ),
              const SizedBox(height: 8),
              Text(
                'Укажите RTSP URL в настройках',
                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
              ),
            ],
          ),
        ),
      );
    }

    if (_videoController == null || !_videoController!.value.isInitialized) {
      return Container(
        color: Colors.black87,
        child: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: Colors.white),
              SizedBox(height: 16),
              Text('Загрузка видео...', style: TextStyle(color: Colors.white)),
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
