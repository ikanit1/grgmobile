import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

/// REST API клиент для устройств Akuvox (Linux-панели).
/// Документация: Akuvox Linux Api_20250530.html
class AkuvoxApiClient {
  final String baseUrl;
  final String username;
  final String password;

  AkuvoxApiClient({
    required this.baseUrl,
    required this.username,
    required this.password,
  });

  String get _authHeader =>
      'Basic ${base64Encode(utf8.encode('$username:$password'))}';

  Map<String, String> get _headers => {
        HttpHeaders.authorizationHeader: _authHeader,
        HttpHeaders.contentTypeHeader: 'application/json',
      };

  Future<http.Response> _get(String path) async {
    final uri = Uri.parse('$baseUrl$path');
    return http.get(uri, headers: _headers);
  }

  Future<http.Response> _post(String path, Map<String, dynamic> body) async {
    final uri = Uri.parse('$baseUrl$path');
    return http.post(
      uri,
      headers: _headers,
      body: jsonEncode(body),
    );
  }

  /// Открыть дверь (триггер реле).
  /// num: 1=Relay A, 2=Relay B, 3=Relay C, 11=Security A, 12=Security B
  /// mode: 0=Auto Close, 1=Manual
  /// delay: 0-65535 секунд
  Future<AkuvoxResponse> openDoor({
    int relayNum = 1,
    int mode = 1,
    int level = 1,
    int delay = 5,
  }) async {
    final body = {
      'target': 'relay',
      'action': 'trig',
      'data': {
        'mode': mode,
        'num': relayNum,
        'level': level,
        'delay': delay,
      },
    };
    final response = await _post('/api/relay/trig', body);
    return _parseResponse(response);
  }

  /// Получить статус реле (RelayA, RelayB, RelayC: 1=OPEN, 0=CLOSE)
  Future<AkuvoxResponse> getRelayStatus() async {
    final response = await _get('/api/relay/status');
    return _parseResponse(response);
  }

  /// Получить конфигурацию реле
  Future<AkuvoxResponse> getRelayConfig() async {
    final response = await _get('/api/relay/get');
    return _parseResponse(response);
  }

  /// Информация об устройстве
  Future<AkuvoxResponse> getSystemInfo() async {
    final response = await _get('/api/system/info');
    return _parseResponse(response);
  }

  /// Журнал открытий двери
  Future<AkuvoxResponse> getDoorLog() async {
    final response = await _get('/api/doorlog/get');
    return _parseResponse(response);
  }

  /// Статус звонка
  Future<AkuvoxResponse> getCallStatus() async {
    final response = await _get('/api/call/status');
    return _parseResponse(response);
  }

  AkuvoxResponse _parseResponse(http.Response response) {
    Map<String, dynamic>? data;
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>?;
    } catch (_) {
      data = null;
    }
    return AkuvoxResponse(
      statusCode: response.statusCode,
      body: data,
      retcode: data?['retcode'] as int? ?? -1,
      message: data?['message'] as String? ?? response.reasonPhrase ?? '',
    );
  }
}

class AkuvoxResponse {
  final int statusCode;
  final Map<String, dynamic>? body;
  final int retcode;
  final String message;

  AkuvoxResponse({
    required this.statusCode,
    this.body,
    required this.retcode,
    required this.message,
  });

  bool get isSuccess => statusCode == 200 && retcode == 0;
  dynamic get data => body?['data'];
}
