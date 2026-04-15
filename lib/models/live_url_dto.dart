/// Response from GET /devices/:id/live-url
/// Backend returns both direct RTSP (LAN) and go2rtc HLS (WAN) URLs.
class LiveUrlDto {
  /// Direct RTSP URL: rtsp://user:pass@host:554/...
  /// Works on LAN; may not be reachable over cellular/internet.
  final String rtspUrl;

  /// HLS URL via go2rtc proxy: http://server:1984/api/stream.m3u8?src=...
  /// Works over WAN; null if go2rtc not configured on server.
  final String? hlsUrl;

  const LiveUrlDto({required this.rtspUrl, this.hlsUrl});

  factory LiveUrlDto.fromJson(Map<String, dynamic> json) {
    return LiveUrlDto(
      rtspUrl: json['url'] as String? ?? '',
      hlsUrl: json['hlsUrl'] as String?,
    );
  }
}
