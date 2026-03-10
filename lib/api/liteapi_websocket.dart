import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// WebSocket клиент для LiteAPI (IPC/NVR) Uniview.
///
/// Формат сообщений соответствует документам
/// LiteAPI Over Websocket Document for IPC/NVR.
class LiteApiWebSocket {
  final Uri uri;
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;

  int _cseq = 0;
  final Map<int, Completer<Map<String, dynamic>>> _pending = {};

  LiteApiWebSocket(this.uri);

  bool get isConnected => _channel != null;

  void connect({
    void Function(Map<String, dynamic> data)? onMessage,
    void Function()? onDone,
    void Function(Object error)? onError,
    void Function()? onConnected,
  }) {
    _channel = WebSocketChannel.connect(uri);

    _subscription = _channel!.stream.listen(
      (event) {
        Map<String, dynamic>? data;
        try {
          data = jsonDecode(event as String) as Map<String, dynamic>;
        } catch (_) {
          onMessage?.call({'raw': event});
          return;
        }

        final cseq = data['Cseq'];
        if (cseq is int && _pending.containsKey(cseq)) {
          _pending.remove(cseq)?.complete(data);
        }

        if (onMessage != null) {
          onMessage(data);
        }
      },
      onDone: () {
        _failPending(StateError('WebSocket closed'));
        _channel = null;
        _subscription = null;
        onDone?.call();
      },
      onError: (e) {
        _failPending(e);
        onError?.call(e);
      },
      cancelOnError: false,
    );

    onConnected?.call();
  }

  /// Отправка произвольного JSON-сообщения.
  void send(Map<String, dynamic> message) {
    _channel?.sink.add(jsonEncode(message));
  }

  /// Вызов LiteAPI по WebSocket в формате Uniview.
  ///
  /// [requestUrl] — полный LiteAPI URL вида `/LAPI/V1.0/...`.
  Future<Map<String, dynamic>> callLiteApi({
    required String requestUrl,
    String method = 'GET',
    Map<String, dynamic>? data,
  }) {
    if (_channel == null) {
      throw StateError('WebSocket is not connected');
    }

    final cseq = ++_cseq;
    final message = <String, dynamic>{
      'RequestURL': requestUrl,
      'Method': method,
      'Cseq': cseq,
      'Data': data ?? <String, dynamic>{},
    };

    final completer = Completer<Map<String, dynamic>>();
    _pending[cseq] = completer;
    _channel!.sink.add(jsonEncode(message));
    return completer.future;
  }

  void dispose() {
    _failPending(StateError('WebSocket disposed'));
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    _subscription = null;
  }

  void _failPending(Object error) {
    for (final completer in _pending.values) {
      if (!completer.isCompleted) {
        completer.completeError(error);
      }
    }
    _pending.clear();
  }
}
