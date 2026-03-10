import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../api/backend_client.dart';

/// Payload for incoming call overlay (from FCM data).
class IncomingCallPayload {
  final int deviceId;
  final String? buildingName;
  final String? apartmentNumber;

  IncomingCallPayload({
    required this.deviceId,
    this.buildingName,
    this.apartmentNumber,
  });
}

/// Subscribes to FCM foreground messages and notifies on VOIP_CALL.
/// Only active when [client] is non-null (user logged in).
class FcmListener extends StatefulWidget {
  final Widget child;
  final void Function(IncomingCallPayload payload)? onIncomingCall;
  final BackendClient? client;

  const FcmListener({
    super.key,
    required this.child,
    required this.onIncomingCall,
    this.client,
  });

  @override
  State<FcmListener> createState() => _FcmListenerState();
}

class _FcmListenerState extends State<FcmListener> {
  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  void _subscribe() {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final data = message.data;
      final type = data['type'] as String?;
      if (type != 'VOIP_CALL' && type != 'incoming_call') return;
      final deviceId = int.tryParse((data['deviceId'] ?? '').toString());
      if (deviceId == null) return;
      widget.onIncomingCall?.call(IncomingCallPayload(
        deviceId: deviceId,
        buildingName: data['buildingName'] as String?,
        apartmentNumber: data['apartmentNumber'] as String?,
      ));
    });

    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      final data = message.data;
      final type = data['type'] as String?;
      if (type != 'VOIP_CALL' && type != 'incoming_call') return;
      final deviceId = int.tryParse((data['deviceId'] ?? '').toString());
      if (deviceId == null) return;
      widget.onIncomingCall?.call(IncomingCallPayload(
        deviceId: deviceId,
        buildingName: data['buildingName'] as String?,
        apartmentNumber: data['apartmentNumber'] as String?,
      ));
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
