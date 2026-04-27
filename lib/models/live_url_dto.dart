/// Response from GET /devices/:id/live-url
class LiveUrlDto {
  /// Direct RTSP URL (camera credentials, LAN-only).
  final String rtspUrl;

  /// HLS URL via go2rtc (for web/browser).
  final String? hlsUrl;

  /// RTSP proxy URL via go2rtc (rtsp://server:8554/stream_name).
  /// Mobile clients prefer this: mpv handles RTSP startup delay gracefully,
  /// while HLS returns empty m3u8 while FFmpeg is starting.
  final String? rtspProxyUrl;

  const LiveUrlDto({required this.rtspUrl, this.hlsUrl, this.rtspProxyUrl});

  factory LiveUrlDto.fromJson(Map<String, dynamic> json) {
    return LiveUrlDto(
      rtspUrl: json['url'] as String? ?? '',
      hlsUrl: json['hlsUrl'] as String?,
      rtspProxyUrl: json['rtspProxyUrl'] as String?,
    );
  }
}
