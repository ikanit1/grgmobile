import 'dart:convert';

import 'package:http/http.dart' as http;

import 'auth_storage.dart';
import '../models/api_config.dart';
import '../models/auth_user.dart';

class BackendClient {
  BackendClient(this._config, this._authStorage);

  final ApiConfig _config;
  final AuthStorage _authStorage;

  String? _token;

  String get baseUrl => _config.apiUrl;

  Future<String?> getToken() async {
    _token ??= await _authStorage.getToken();
    return _token;
  }

  Future<AuthUser?> getUser() async {
    return _authStorage.getUser();
  }

  Future<void> setToken(String? token) async {
    _token = token;
    if (token == null) {
      await _authStorage.clear();
    }
  }

  Future<Map<String, String>> _headers({bool withAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (withAuth) {
      final t = await getToken();
      if (t != null) headers['Authorization'] = 'Bearer $t';
    }
    return headers;
  }

  Future<http.Response> _get(String path, {bool withAuth = true}) async {
    final uri = Uri.parse('$baseUrl$path');
    return http.get(uri, headers: await _headers(withAuth: withAuth));
  }

  Future<http.Response> _post(
    String path, {
    Map<String, dynamic>? body,
    bool withAuth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    return http.post(
      uri,
      headers: await _headers(withAuth: withAuth),
      body: body != null ? jsonEncode(body) : null,
    );
  }

  Future<http.Response> _patch(
    String path, {
    Map<String, dynamic>? body,
    bool withAuth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    return http.patch(
      uri,
      headers: await _headers(withAuth: withAuth),
      body: body != null ? jsonEncode(body) : null,
    );
  }

  Future<http.Response> _delete(String path, {bool withAuth = true}) async {
    final uri = Uri.parse('$baseUrl$path');
    return http.delete(uri, headers: await _headers(withAuth: withAuth));
  }

  bool _refreshing = false;

  Future<bool> _tryRefresh() async {
    if (_refreshing) return false;
    _refreshing = true;
    try {
      final rt = await _authStorage.getRefreshToken();
      if (rt == null || rt.isEmpty) return false;
      final res = await _post('auth/refresh', body: {'refreshToken': rt}, withAuth: false);
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final newToken = data['token'] as String;
        final newRefresh = data['refreshToken'] as String?;
        _token = newToken;
        await _authStorage.saveToken(newToken);
        if (newRefresh != null) await _authStorage.saveRefreshToken(newRefresh);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    } finally {
      _refreshing = false;
    }
  }

  Future<http.Response> _getWithRetry(String path) async {
    var res = await _get(path);
    if (res.statusCode == 401 && await _tryRefresh()) {
      res = await _get(path);
    }
    return res;
  }

  Future<http.Response> _postWithRetry(String path, {Map<String, dynamic>? body}) async {
    var res = await _post(path, body: body);
    if (res.statusCode == 401 && await _tryRefresh()) {
      res = await _post(path, body: body);
    }
    return res;
  }

  Future<http.Response> _patchWithRetry(String path, {Map<String, dynamic>? body}) async {
    var res = await _patch(path, body: body);
    if (res.statusCode == 401 && await _tryRefresh()) {
      res = await _patch(path, body: body);
    }
    return res;
  }

  Future<http.Response> _deleteWithRetry(String path) async {
    var res = await _delete(path);
    if (res.statusCode == 401 && await _tryRefresh()) {
      res = await _delete(path);
    }
    return res;
  }

  Future<void> _saveAuthResponse(Map<String, dynamic> data) async {
    final token = data['token'] as String;
    final refreshToken = data['refreshToken'] as String?;
    _token = token;
    await _authStorage.saveToken(token);
    if (refreshToken != null) await _authStorage.saveRefreshToken(refreshToken);
    final userJson = data['user'] as Map<String, dynamic>;
    final user = AuthUser.fromJson(userJson);
    await _authStorage.saveUser(user);
  }

  // --- Auth ---

  Future<LoginResult> login(String login, String password) async {
    final res = await _post('auth/login', body: {'login': login, 'password': password}, withAuth: false);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await _saveAuthResponse(data);
    return LoginResult(token: data['token'] as String, user: AuthUser.fromJson(data['user'] as Map<String, dynamic>));
  }

  Future<LoginResult> register({
    String? email,
    String? phone,
    String? name,
    required String password,
  }) async {
    final body = <String, dynamic>{'password': password};
    if (email != null && email.isNotEmpty) body['email'] = email;
    if (phone != null && phone.isNotEmpty) body['phone'] = phone;
    if (name != null && name.isNotEmpty) body['name'] = name;
    final res = await _post('auth/register', body: body, withAuth: false);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await _saveAuthResponse(data);
    return LoginResult(token: data['token'] as String, user: AuthUser.fromJson(data['user'] as Map<String, dynamic>));
  }

  Future<void> logout() async {
    await setToken(null);
    await _authStorage.clear();
  }

  // --- Profile ---

  Future<Map<String, dynamic>> getProfile() async {
    final res = await _getWithRetry('users/me');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProfile({String? name, String? email, String? phone}) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (email != null) body['email'] = email;
    if (phone != null) body['phone'] = phone;
    final res = await _patchWithRetry('users/me', body: body);
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    final res = await _patchWithRetry('users/me/password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
  }

  // --- Device info (backend) ---

  Future<Map<String, dynamic>> getDeviceInfo(int deviceId) async {
    final res = await _getWithRetry('devices/$deviceId/info');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  /// Send FCM/APNs token to backend for push (incoming call). Platform: 'android' | 'ios'.
  Future<void> sendPushToken(String token, {String? platform}) async {
    final body = <String, dynamic>{'token': token};
    if (platform != null && platform.isNotEmpty) body['platform'] = platform;
    final res = await _postWithRetry('users/me/push-token', body: body);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
  }

  // --- Buildings & Devices ---

  Future<List<BuildingDto>> getBuildings() async {
    final res = await _getWithRetry('buildings');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => BuildingDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<DeviceDto>> getDevices(int buildingId) async {
    final res = await _getWithRetry('buildings/$buildingId/devices');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => DeviceDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<OpenDoorResult> openDoor(int deviceId, {int relayId = 1}) async {
    final res = await _postWithRetry('devices/$deviceId/open-door', body: {'relayId': relayId});
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return OpenDoorResult(
      success: data['success'] as bool? ?? false,
      message: data['message'] as String? ?? '',
    );
  }

  Future<String> getLiveUrl(int deviceId, {int? channel, String? stream}) async {
    var path = 'devices/$deviceId/live-url';
    final q = <String>[];
    if (channel != null) q.add('channel=$channel');
    if (stream != null) q.add('stream=${Uri.encodeComponent(stream)}');
    if (q.isNotEmpty) path += '?${q.join('&')}';
    final res = await _getWithRetry(path);
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final url = data['url'] as String? ?? data['liveUrl'] as String? ?? '';
    return url;
  }

  Future<List<DeviceEventDto>> getDeviceEvents(int deviceId, {String? from, String? to, int? limit}) async {
    var path = 'devices/$deviceId/events?limit=${limit ?? 50}';
    if (from != null) path += '&from=${Uri.encodeComponent(from)}';
    if (to != null) path += '&to=${Uri.encodeComponent(to)}';
    final res = await _getWithRetry(path);
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => DeviceEventDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  // --- Device CRUD ---

  Future<DeviceDto> addDevice(int buildingId, {
    required String name,
    required String host,
    required String type,
    required String role,
    String? username,
    String? password,
    int? httpPort,
    int? rtspPort,
    int? defaultChannel,
    String? defaultStream,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'host': host,
      'type': type,
      'role': role,
    };
    if (username != null && username.isNotEmpty) body['username'] = username;
    if (password != null && password.isNotEmpty) body['password'] = password;
    if (httpPort != null) body['httpPort'] = httpPort;
    if (rtspPort != null) body['rtspPort'] = rtspPort;
    if (defaultChannel != null) body['defaultChannel'] = defaultChannel;
    if (defaultStream != null && defaultStream.isNotEmpty) body['defaultStream'] = defaultStream;
    final res = await _postWithRetry('buildings/$buildingId/devices', body: body);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    return DeviceDto.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<DeviceDto> updateDevice(int deviceId, Map<String, dynamic> fields) async {
    final res = await _patchWithRetry('devices/$deviceId', body: fields);
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    return DeviceDto.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> deleteDevice(int deviceId) async {
    final res = await _deleteWithRetry('devices/$deviceId');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
  }

  Future<TestConnectionResult> testConnection({
    required String host,
    required String type,
    String? username,
    String? password,
    int? httpPort,
  }) async {
    final body = <String, dynamic>{'host': host, 'type': type};
    if (username != null && username.isNotEmpty) body['username'] = username;
    if (password != null && password.isNotEmpty) body['password'] = password;
    if (httpPort != null) body['httpPort'] = httpPort;
    final res = await _postWithRetry('devices/test-connection', body: body);
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return TestConnectionResult(
      reachable: data['reachable'] as bool? ?? false,
      info: data['info'] as Map<String, dynamic>?,
      error: data['error'] as String?,
    );
  }

  Future<List<DiscoveredDevice>> discoverOnvif(int buildingId) async {
    final res = await _postWithRetry('buildings/$buildingId/discover-onvif');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => DiscoveredDevice.fromJson(e as Map<String, dynamic>)).toList();
  }

  // --- Applications (resident) ---

  Future<List<ApplicationDto>> getMyApplications() async {
    final res = await _getWithRetry('users/me/applications');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => ApplicationDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<BuildingWithApartmentsDto>> getBuildingsForApplication() async {
    final res = await _getWithRetry('buildings/for-application');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => BuildingWithApartmentsDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ApplicationDto> applyForApartment(int apartmentId) async {
    final res = await _postWithRetry('apartments/$apartmentId/apply');
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw BackendException(_errorMessage(res), res.statusCode);
    }
    return ApplicationDto.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  // --- Me settings (Do not disturb) ---

  Future<MeSettingsDto> getMeSettings() async {
    final res = await _getWithRetry('users/me/settings');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    return MeSettingsDto.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<void> updateMeSettings({
    bool? doNotDisturb,
    String? doNotDisturbFrom,
    String? doNotDisturbTo,
  }) async {
    final body = <String, dynamic>{};
    if (doNotDisturb != null) body['doNotDisturb'] = doNotDisturb;
    if (doNotDisturbFrom != null) body['doNotDisturbFrom'] = doNotDisturbFrom;
    if (doNotDisturbTo != null) body['doNotDisturbTo'] = doNotDisturbTo;
    final res = await _patchWithRetry('users/me/settings', body: body.isEmpty ? null : body);
    if (res.statusCode != 200 && res.statusCode != 204) throw BackendException(_errorMessage(res), res.statusCode);
  }

  // --- Add resident to my apartment (resident invites family/guest) ---

  Future<List<MyApartmentDto>> getMyApartments() async {
    final res = await _getWithRetry('users/me/apartments');
    if (res.statusCode != 200) throw BackendException(_errorMessage(res), res.statusCode);
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => MyApartmentDto.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addResidentToApartment(int apartmentId, {String? email, String? phone, String role = 'resident'}) async {
    final body = <String, dynamic>{'role': role};
    if (email != null && email.isNotEmpty) body['email'] = email;
    if (phone != null && phone.isNotEmpty) body['phone'] = phone;
    final res = await _postWithRetry('apartments/$apartmentId/residents', body: body);
    if (res.statusCode != 200 && res.statusCode != 201) throw BackendException(_errorMessage(res), res.statusCode);
  }

  static String _errorMessage(http.Response res) {
    try {
      final data = jsonDecode(res.body);
      if (data is Map && data['message'] != null) {
        final msg = data['message'];
        if (msg is String) return msg;
        if (msg is List) return msg.isNotEmpty ? msg.first.toString() : res.body;
      }
    } catch (_) {}
    return res.body.isNotEmpty ? res.body : 'HTTP ${res.statusCode}';
  }
}

class LoginResult {
  final String token;
  final AuthUser user;

  LoginResult({required this.token, required this.user});
}

class BackendException implements Exception {
  BackendException(this.message, this.statusCode);
  final String message;
  final int statusCode;
  @override
  String toString() => message;
}

class BuildingDto {
  final int id;
  final String name;
  final String? address;
  final String complexId;

  BuildingDto({required this.id, required this.name, this.address, required this.complexId});

  factory BuildingDto.fromJson(Map<String, dynamic> json) => BuildingDto(
        id: json['id'] as int,
        name: json['name'] as String? ?? '',
        address: json['address'] as String?,
        complexId: json['complexId'] as String? ?? '',
      );
}

class ApartmentDto {
  final int id;
  final String number;
  final int? floor;

  ApartmentDto({required this.id, required this.number, this.floor});

  factory ApartmentDto.fromJson(Map<String, dynamic> json) => ApartmentDto(
        id: json['id'] as int,
        number: json['number'] as String? ?? '',
        floor: json['floor'] as int?,
      );
}

class BuildingWithApartmentsDto {
  final int id;
  final String name;
  final String? address;
  final List<ApartmentDto> apartments;

  BuildingWithApartmentsDto({required this.id, required this.name, this.address, required this.apartments});

  factory BuildingWithApartmentsDto.fromJson(Map<String, dynamic> json) {
    final apts = json['apartments'];
    return BuildingWithApartmentsDto(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      address: json['address'] as String?,
      apartments: apts is List
          ? (apts as List<dynamic>).map((e) => ApartmentDto.fromJson(e as Map<String, dynamic>)).toList()
          : [],
    );
  }
}

class ApplicationDto {
  final int id;
  final String status;
  final String? requestedAt;
  final String? decidedAt;
  final String? rejectReason;
  final ApartmentDto? apartment;
  final BuildingDto? building;

  ApplicationDto({
    required this.id,
    required this.status,
    this.requestedAt,
    this.decidedAt,
    this.rejectReason,
    this.apartment,
    this.building,
  });

  factory ApplicationDto.fromJson(Map<String, dynamic> json) {
    final apt = json['apartment'];
    final b = json['apartment'] is Map ? (json['apartment'] as Map<String, dynamic>)['building'] : null;
    return ApplicationDto(
      id: json['id'] as int,
      status: json['status'] as String? ?? 'PENDING',
      requestedAt: json['requestedAt'] as String?,
      decidedAt: json['decidedAt'] as String?,
      rejectReason: json['rejectReason'] as String?,
      apartment: apt is Map ? ApartmentDto.fromJson(apt as Map<String, dynamic>) : null,
      building: b is Map ? BuildingDto.fromJson(b as Map<String, dynamic>) : null,
    );
  }
}

class DeviceDto {
  final int id;
  final String name;
  final String type;
  final String role;
  final int buildingId;
  final String? host;

  DeviceDto({required this.id, required this.name, required this.type, required this.role, required this.buildingId, this.host});

  factory DeviceDto.fromJson(Map<String, dynamic> json) => DeviceDto(
        id: json['id'] as int,
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? 'OTHER',
        role: json['role'] as String? ?? 'DOORPHONE',
        buildingId: json['buildingId'] as int? ?? 0,
        host: json['host'] as String?,
      );
}

class OpenDoorResult {
  final bool success;
  final String message;

  OpenDoorResult({required this.success, required this.message});
}

class DeviceEventDto {
  final String time;
  final String type;
  final String source;
  final dynamic details;

  DeviceEventDto({required this.time, required this.type, required this.source, this.details});

  factory DeviceEventDto.fromJson(Map<String, dynamic> json) => DeviceEventDto(
        time: json['time'] as String? ?? '',
        type: json['type'] as String? ?? '',
        source: json['source'] as String? ?? '',
        details: json['details'],
      );
}

class TestConnectionResult {
  final bool reachable;
  final Map<String, dynamic>? info;
  final String? error;

  TestConnectionResult({required this.reachable, this.info, this.error});
}

class DiscoveredDevice {
  final String host;
  final String? name;
  final String? location;
  final String? xAddr;

  DiscoveredDevice({required this.host, this.name, this.location, this.xAddr});

  factory DiscoveredDevice.fromJson(Map<String, dynamic> json) => DiscoveredDevice(
        host: json['host'] as String? ?? '',
        name: json['name'] as String?,
        location: json['location'] as String?,
        xAddr: json['xAddr'] as String?,
      );
}

class MeSettingsDto {
  final bool doNotDisturb;
  final String? doNotDisturbFrom;
  final String? doNotDisturbTo;

  MeSettingsDto({required this.doNotDisturb, this.doNotDisturbFrom, this.doNotDisturbTo});

  factory MeSettingsDto.fromJson(Map<String, dynamic> json) => MeSettingsDto(
        doNotDisturb: json['doNotDisturb'] as bool? ?? false,
        doNotDisturbFrom: json['doNotDisturbFrom'] as String?,
        doNotDisturbTo: json['doNotDisturbTo'] as String?,
      );
}

class MyApartmentDto {
  final int apartmentId;
  final ApartmentDto apartment;
  final BuildingDto building;

  MyApartmentDto({required this.apartmentId, required this.apartment, required this.building});

  factory MyApartmentDto.fromJson(Map<String, dynamic> json) => MyApartmentDto(
        apartmentId: json['apartmentId'] as int,
        apartment: ApartmentDto.fromJson(json['apartment'] as Map<String, dynamic>),
        building: BuildingDto.fromJson(json['building'] as Map<String, dynamic>),
      );
}
