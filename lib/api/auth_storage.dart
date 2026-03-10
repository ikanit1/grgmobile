import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/auth_user.dart';

class AuthStorage {
  static const _tokenKey = 'jwt_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userKey = 'auth_user';

  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<String?> getToken() async {
    return _storage.read(key: _tokenKey);
  }

  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: _refreshTokenKey, value: token);
  }

  Future<String?> getRefreshToken() async {
    return _storage.read(key: _refreshTokenKey);
  }

  Future<void> saveUser(AuthUser user) async {
    await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
  }

  Future<AuthUser?> getUser() async {
    final json = await _storage.read(key: _userKey);
    if (json == null) return null;
    try {
      return AuthUser.fromJson(jsonDecode(json) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
    await _storage.delete(key: _userKey);
  }
}
