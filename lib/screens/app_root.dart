import 'package:flutter/material.dart';

import '../api/auth_storage.dart';
import '../api/backend_client.dart';
import '../models/api_config.dart';
import '../models/auth_user.dart';
import '../services/push_token_service.dart';
import '../theme/app_theme.dart';
import '../widgets/animated_background.dart';
import '../widgets/fcm_listener.dart';
import 'auth_screen.dart';
import 'incoming_call_screen.dart';
import 'main_shell.dart';

class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  ApiConfig _apiConfig = const ApiConfig(baseUrl: ApiConfig.defaultBaseUrl, useBackend: ApiConfig.defaultUseBackend);
  bool _configLoading = true;
  BackendClient? _backendClient;
  AuthUser? _authUser;
  bool _authCheckDone = false;
  IncomingCallPayload? _incomingCallPayload;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    final config = await ApiConfig.load();
    if (mounted) {
      setState(() {
        _apiConfig = config;
        _configLoading = false;
      if (config.useBackend) {
        _backendClient = BackendClient(config, AuthStorage());
      } else {
        _authCheckDone = true;
      }
    });
    if (config.useBackend && _backendClient != null) {
      _checkAuth();
    }
  }
  }

  Future<void> _checkAuth() async {
    final token = await _backendClient!.getToken();
    if (token == null) {
      if (mounted) {
        setState(() => _authCheckDone = true);
      }
      return;
    }
    final user = await _backendClient!.getUser();
    if (mounted) {
      setState(() {
        _authUser = user;
        _authCheckDone = true;
      });
      sendPushTokenToBackend(_backendClient!);
    }
  }

  Future<void> _onAuthSuccess(AuthUser user) async {
    setState(() => _authUser = user);
    if (_backendClient != null) {
      sendPushTokenToBackend(_backendClient!);
    }
  }

  Future<void> _onLogout() async {
    await _backendClient?.logout();
    setState(() => _authUser = null);
  }

  Future<void> _onConfigUpdated(ApiConfig config) async {
    await config.save();
    setState(() {
      _apiConfig = config;
      if (config.useBackend) {
        _backendClient = BackendClient(config, AuthStorage());
        _authUser = null;
        _authCheckDone = false;
      } else {
        _backendClient = null;
        _authUser = null;
        _authCheckDone = true;
      }
    });
    if (config.useBackend && _backendClient != null) {
      _checkAuth();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const AnimatedBackground(),
        if (_configLoading)
          const Center(child: CircularProgressIndicator(color: AppColors.purple))
        else if (_apiConfig.useBackend && !_authCheckDone)
          const Center(child: CircularProgressIndicator(color: AppColors.purple))
        else if (_apiConfig.useBackend && _authUser == null)
          AuthScreen(
            config: _apiConfig,
            client: _backendClient!,
            onSuccess: _onAuthSuccess,
          )
        else
          Stack(
            children: [
              FcmListener(
                client: _backendClient,
                onIncomingCall: _apiConfig.useBackend && _backendClient != null
                    ? (p) => setState(() => _incomingCallPayload = p)
                    : null,
                child: MainShell(
                  apiConfig: _apiConfig,
                  backendClient: _apiConfig.useBackend ? _backendClient : null,
                  authUser: _authUser,
                  onConfigUpdated: _onConfigUpdated,
                  onLogout: _onLogout,
                ),
              ),
              if (_incomingCallPayload != null && _backendClient != null)
                IncomingCallScreen(
                  deviceId: _incomingCallPayload!.deviceId,
                  buildingName: _incomingCallPayload!.buildingName,
                  apartmentNumber: _incomingCallPayload!.apartmentNumber,
                  client: _backendClient!,
                  onDismiss: () => setState(() => _incomingCallPayload = null),
                ),
            ],
          ),
      ],
    );
  }
}
