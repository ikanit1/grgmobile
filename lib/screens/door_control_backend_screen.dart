import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart'
    show VideoFormat, VideoPlayer, VideoPlayerController;

import '../api/backend_client.dart';
import '../models/live_url_dto.dart';
import '../theme/app_theme.dart';

class DoorControlBackendScreen extends StatefulWidget {
  final BackendClient client;
  final int deviceId;
  final String deviceName;

  const DoorControlBackendScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  @override
  State<DoorControlBackendScreen> createState() => _DoorControlBackendScreenState();
}

class _DoorControlBackendScreenState extends State<DoorControlBackendScreen> {
  bool _loading = false;
  String? _error;
  String? _liveUrl;
  VideoPlayerController? _videoController;

  @override
  void initState() {
    super.initState();
    _loadLiveUrl();
  }

  static const _videoErrorUserMessage =
      'Не удалось подключиться к видеопотоку. Убедитесь, что телефон в той же Wi‑Fi сети, что и панель, или используйте VPN к сети дома/офиса.';

  Future<void> _loadLiveUrl() async {
    try {
      final LiveUrlDto dto = await widget.client.getLiveUrl(widget.deviceId);
      if (!mounted) return;
      final trimmed = dto.rtspUrl.trim();
      if (trimmed.isEmpty ||
          (!trimmed.toLowerCase().startsWith('rtsp://') &&
              !trimmed.toLowerCase().startsWith('http://') &&
              !trimmed.toLowerCase().startsWith('https://'))) {
        setState(() => _error =
            'Не получен адрес видеопотока. Проверьте настройки устройства в админке.');
        return;
      }
      setState(() => _liveUrl = trimmed);
      final uri = Uri.parse(trimmed);
      _videoController = VideoPlayerController.networkUrl(
        uri,
        formatHint: uri.scheme.toLowerCase() == 'rtsp'
            ? VideoFormat.other
            : null,
      );
      _videoController!.initialize().then((_) {
        if (mounted) {
          setState(() {});
          _videoController!.play();
        }
      }).catchError((e) {
        if (mounted) setState(() => _error = _videoErrorUserMessage);
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
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
      final result = await widget.client.openDoor(widget.deviceId);
      if (!mounted) return;
      if (result.success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Дверь открыта'), backgroundColor: Colors.green),
        );
      } else {
        setState(() => _error = result.message);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.deviceName),
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
                    Text(_error!, style: const TextStyle(color: AppColors.danger)),
                    const SizedBox(height: 12),
                  ],
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _loading ? null : _openDoor,
                      icon: _loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.lock_open),
                      label: Text(_loading ? 'Открываю...' : 'Открыть дверь'),
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
    if (_videoController != null && _videoController!.value.isInitialized) {
      return AspectRatio(
        aspectRatio: _videoController!.value.aspectRatio,
        child: VideoPlayer(_videoController!),
      );
    }
    if (_error != null && _liveUrl == null) {
      return Center(child: Text(_error!, style: const TextStyle(color: AppColors.textSecondary)));
    }
    return const Center(
      child: CircularProgressIndicator(color: AppColors.purple),
    );
  }
}
