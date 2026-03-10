import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api/backend_client.dart';
import '../theme/app_theme.dart';

/// Полноэкранный экран входящего звонка (по Push VOIP_CALL).
/// Кнопки: Принять (видео), Сбросить, Открыть дверь.
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
  String? _liveUrl;
  VideoPlayerController? _videoController;
  bool _loadingVideo = true;
  bool _openDoorLoading = false;

  @override
  void initState() {
    super.initState();
    _loadLiveUrl();
  }

  Future<void> _loadLiveUrl() async {
    try {
      final url = await widget.client.getLiveUrl(widget.deviceId);
      if (!mounted) return;
      if (url.isNotEmpty) {
        setState(() => _liveUrl = url);
        _videoController = VideoPlayerController.networkUrl(Uri.parse(url));
        _videoController!.initialize().then((_) {
          if (mounted) {
            setState(() {
              _loadingVideo = false;
              _videoController?.play();
            });
          }
        }).catchError((_) {
          if (mounted) setState(() => _loadingVideo = false);
        });
      } else {
        setState(() => _loadingVideo = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loadingVideo = false);
    }
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  Future<void> _openDoor() async {
    setState(() => _openDoorLoading = true);
    try {
      final result = await widget.client.openDoor(widget.deviceId);
      if (!mounted) return;
      if (result.success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Дверь открыта'), backgroundColor: Colors.green),
        );
        widget.onDismiss();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.message), backgroundColor: AppColors.danger),
        );
      }
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
                        const Text(
                          'Входящий звонок',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            style: const TextStyle(color: Colors.white70, fontSize: 14),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: _buildVideoArea(subtitle),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _actionButton(
                    icon: Icons.call_end,
                    label: 'Сбросить',
                    color: AppColors.danger,
                    onPressed: widget.onDismiss,
                  ),
                  _actionButton(
                    icon: Icons.lock_open,
                    label: _openDoorLoading ? '...' : 'Открыть дверь',
                    color: AppColors.success,
                    onPressed: _openDoorLoading ? null : _openDoor,
                  ),
                  _actionButton(
                    icon: Icons.videocam,
                    label: 'Принять',
                    color: AppColors.purple,
                    onPressed: () {
                      if (_videoController != null && _liveUrl != null) {
                        _videoController?.play();
                      }
                      widget.onDismiss();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVideoArea(String subtitle) {
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
    if (_videoController != null && _videoController!.value.isInitialized) {
      return AspectRatio(
        aspectRatio: _videoController!.value.aspectRatio,
        child: VideoPlayer(_videoController!),
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.videocam_off, size: 64, color: Colors.white38),
        const SizedBox(height: 8),
        Text(
          subtitle.isNotEmpty ? subtitle : 'Домофон',
          style: const TextStyle(color: Colors.white70, fontSize: 16),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback? onPressed,
  }) {
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
