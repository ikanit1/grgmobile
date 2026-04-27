import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

import '../api/backend_client.dart';

/// Obtains FCM token and sends it to the backend for push (incoming call).
/// Call when user is logged in via backend. Safe to call if Firebase is not configured.
Future<void> sendPushTokenToBackend(BackendClient client) async {
  try {
    final messaging = FirebaseMessaging.instance;
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;
    final token = await messaging.getToken();
    if (token == null || token.isEmpty) return;
    String? platform;
    if (!kIsWeb) {
      if (defaultTargetPlatform == TargetPlatform.android) {
        platform = 'android';
      } else if (defaultTargetPlatform == TargetPlatform.iOS) platform = 'ios';
    }
    await client.sendPushToken(token, platform: platform);
  } catch (_) {
    // Firebase not configured or no permission — ignore
  }
}
