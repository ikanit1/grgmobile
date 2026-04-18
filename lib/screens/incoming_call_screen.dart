import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    HapticFeedback.mediumImpact();
    setState(() => _openDoorLoading = true);
    try {
      final result = await widget.client.openDoor(widget.deviceId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.success ? 'Дверь открыта' : result.message),
          backgroundColor: result.success ? AppColors.success : AppColors.danger,
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
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'ВХОДЯЩИЙ',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  if (subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
            ),
            Expanded(child: Center(child: _buildVideoArea())),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _secondaryButton(
                    icon: Icons.call_end_rounded,
                    label: 'Сбросить',
                    size: 56,
                    bg: AppColors.danger.withOpacity(0.20),
                    fg: AppColors.danger,
                    labelColor: const Color(0xFFFF9CB1),
                    onPressed: widget.onDismiss,
                  ),
                  _primaryOpenButton(),
                  _secondaryButton(
                    icon: Icons.videocam_rounded,
                    label: 'Ответить',
                    size: 56,
                    bg: AppColors.purple.withOpacity(0.25),
                    fg: const Color(0xFFC9A6FF),
                    labelColor: const Color(0xFFC9A6FF),
                    onPressed: _answer,
                  ),
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

  Widget _primaryOpenButton() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: _openDoorLoading ? null : _openDoor,
          child: Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [Color(0xFF52E5B8), Color(0xFF3DD598)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.success.withOpacity(0.18),
                  spreadRadius: 8,
                  blurRadius: 0,
                ),
                BoxShadow(
                  color: AppColors.success.withOpacity(0.50),
                  blurRadius: 30,
                  offset: const Offset(0, 14),
                ),
              ],
            ),
            child: _openDoorLoading
                ? const Center(
                    child: CircularProgressIndicator(
                      color: Color(0xFF06281D),
                      strokeWidth: 2.5,
                    ),
                  )
                : const Icon(Icons.lock_open_rounded, size: 36, color: Color(0xFF06281D)),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Открыть дверь',
          style: TextStyle(
            color: Color(0xFFA7FFD6),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _secondaryButton({
    required IconData icon,
    required String label,
    required double size,
    required Color bg,
    required Color fg,
    required Color labelColor,
    required VoidCallback? onPressed,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onPressed,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
            child: Icon(icon, size: size * 0.42, color: fg),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(color: labelColor, fontSize: 12, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }
}
