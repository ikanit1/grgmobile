import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class ApiConfig {
  final String baseUrl;
  final bool useBackend;

  const ApiConfig({
    required this.baseUrl,
    this.useBackend = false,
  });

  String get apiBase => baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
  String get apiUrl => '${apiBase}api/';

  ApiConfig copyWith({String? baseUrl, bool? useBackend}) => ApiConfig(
        baseUrl: baseUrl ?? this.baseUrl,
        useBackend: useBackend ?? this.useBackend,
      );

  Map<String, dynamic> toJson() => {
        'baseUrl': baseUrl,
        'useBackend': useBackend,
      };

  /// URL бэкенда по умолчанию. В настройках приложения (Настройки → URL API) можно указать другой адрес (например IP ПК в Wi‑Fi).
  static const String defaultBaseUrl = 'http://localhost:3000';
  /// По умолчанию включён бэкенд (приложение ходит в API).
  static const bool defaultUseBackend = true;

  factory ApiConfig.fromJson(Map<String, dynamic> json) => ApiConfig(
        baseUrl: json['baseUrl'] as String? ?? defaultBaseUrl,
        useBackend: json['useBackend'] as bool? ?? defaultUseBackend,
      );

  static const String _key = 'api_config';

  static Future<ApiConfig> load() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_key);
    if (json == null) return const ApiConfig(baseUrl: defaultBaseUrl, useBackend: defaultUseBackend);
    try {
      return ApiConfig.fromJson(jsonDecode(json) as Map<String, dynamic>);
    } catch (_) {
      return const ApiConfig(baseUrl: defaultBaseUrl, useBackend: defaultUseBackend);
    }
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(toJson()));
  }
}
