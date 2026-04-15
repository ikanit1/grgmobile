import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// A single real-time event received from the backend Socket.IO gateway.
class RealtimeEvent {
  final String type;
  final Map<String, dynamic> data;
  final DateTime receivedAt;

  RealtimeEvent({required this.type, required this.data})
      : receivedAt = DateTime.now();

  /// Convenience: convert to RecentEventDto-compatible map for UI.
  Map<String, dynamic> toEventMap() => {
        'id': data['id'] ?? 0,
        'deviceId': data['deviceId'],
        'eventType': type,
        'data': data,
        'snapshotUrl': data['snapshotUrl'],
        'createdAt': receivedAt.toIso8601String(),
      };
}

/// Singleton WebSocket service that connects to the NestJS Socket.IO gateway.
///
/// Protocol: Engine.IO v4 over raw WebSocket.
///   - After WS handshake, server sends `0{...}` (EIO open) → we send `40` (SIO connect)
///   - Server sends `40` (SIO connected) → ready
///   - Events arrive as `42["event", {...}]`
///   - Server pings with `2` → we pong with `3`
class EventsSocketService {
  EventsSocketService._();
  static final EventsSocketService instance = EventsSocketService._();

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  final StreamController<RealtimeEvent> _controller =
      StreamController<RealtimeEvent>.broadcast();

  Timer? _reconnectTimer;
  bool _disposed = false;
  String? _wsUrl;
  int _retryDelaySec = 2;

  /// Broadcast stream of incoming real-time events.
  Stream<RealtimeEvent> get events => _controller.stream;

  bool get isConnected => _channel != null;

  /// Connect to the backend events gateway.
  /// [baseUrl] — backend HTTP base URL (e.g. `http://192.168.1.1:3000/api`)
  /// [token]   — JWT access token
  void connect(String baseUrl, String token) {
    if (_disposed) _disposed = false;
    _wsUrl = _buildWsUrl(baseUrl, token);
    _doConnect();
  }

  /// Disconnect and stop reconnection attempts.
  void disconnect() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _closeChannel();
  }

  String _buildWsUrl(String baseUrl, String token) {
    // Convert http/https → ws/wss
    var ws = baseUrl
        .replaceFirst('https://', 'wss://')
        .replaceFirst('http://', 'ws://');
    // Strip trailing /api segment — the gateway is mounted separately
    if (ws.endsWith('/api')) ws = ws.substring(0, ws.length - 4);
    final enc = Uri.encodeComponent(token);
    return '$ws/api/ws/events/?EIO=4&transport=websocket&token=$enc';
  }

  void _doConnect() {
    if (_disposed || _wsUrl == null) return;
    try {
      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl!));
      _sub = _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );
    } catch (e) {
      debugPrint('[EventsSocket] connect error: $e');
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic raw) {
    final msg = raw.toString();

    // Engine.IO ping → pong
    if (msg == '2') {
      _channel?.sink.add('3');
      return;
    }

    // Engine.IO open → send Socket.IO namespace connect
    if (msg.startsWith('0')) {
      _retryDelaySec = 2; // reset backoff on successful open
      _channel?.sink.add('40');
      return;
    }

    // Socket.IO connected ack
    if (msg.startsWith('40')) return;

    // Socket.IO event: 42["eventName", {...}]
    if (msg.startsWith('42')) {
      try {
        final list = jsonDecode(msg.substring(2)) as List<dynamic>;
        if (list.length >= 2) {
          final data = Map<String, dynamic>.from(list[1] as Map);
          final type = data['type'] as String? ??
              data['eventType'] as String? ??
              list[0].toString();
          _controller.add(RealtimeEvent(type: type, data: data));
        }
      } catch (e) {
        debugPrint('[EventsSocket] parse error: $e  raw=$msg');
      }
    }
  }

  void _onError(dynamic error) {
    debugPrint('[EventsSocket] error: $error');
    _closeChannel();
    _scheduleReconnect();
  }

  void _onDone() {
    debugPrint('[EventsSocket] connection closed');
    _closeChannel();
    if (!_disposed) _scheduleReconnect();
  }

  void _closeChannel() {
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    _reconnectTimer?.cancel();
    final delay = _retryDelaySec;
    _retryDelaySec = (_retryDelaySec * 2).clamp(2, 30);
    debugPrint('[EventsSocket] reconnecting in ${delay}s');
    _reconnectTimer = Timer(Duration(seconds: delay), () {
      if (!_disposed) _doConnect();
    });
  }
}
