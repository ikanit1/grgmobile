import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class DeviceSettings {
  final String host;
  final String username;
  final String password;
  final bool useHttps;
  final String? rtspUrl;
  final String? websocketPath;

  const DeviceSettings({
    required this.host,
    required this.username,
    required this.password,
    this.useHttps = false,
    this.rtspUrl,
    this.websocketPath,
  });

  String get baseUrl => '${useHttps ? 'https' : 'http'}://$host';
  String get wsUrl =>
      '${useHttps ? 'wss' : 'ws'}://$host${websocketPath ?? ''}';

  DeviceSettings copyWith({
    String? host,
    String? username,
    String? password,
    bool? useHttps,
    String? rtspUrl,
    String? websocketPath,
  }) =>
      DeviceSettings(
        host: host ?? this.host,
        username: username ?? this.username,
        password: password ?? this.password,
        useHttps: useHttps ?? this.useHttps,
        rtspUrl: rtspUrl ?? this.rtspUrl,
        websocketPath: websocketPath ?? this.websocketPath,
      );

  Map<String, dynamic> toJson() => {
        'host': host,
        'username': username,
        'password': password,
        'useHttps': useHttps,
        'rtspUrl': rtspUrl,
        'websocketPath': websocketPath,
      };

  factory DeviceSettings.fromJson(Map<String, dynamic> json) => DeviceSettings(
        host: json['host'] as String? ?? '192.168.0.100',
        username: json['username'] as String? ?? 'admin',
        password: json['password'] as String? ?? '',
        useHttps: json['useHttps'] as bool? ?? false,
        rtspUrl: json['rtspUrl'] as String?,
        websocketPath: json['websocketPath'] as String?,
      );

  static const String _key = 'device_settings';

  static Future<DeviceSettings?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_key);
    if (json == null) return null;
    try {
      return DeviceSettings.fromJson(
        jsonDecode(json) as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(toJson()));
  }
}
