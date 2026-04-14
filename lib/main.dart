import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'screens/app_root.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Firebase not configured (no google-services.json / GoogleService-Info.plist)
  }
  runApp(const DoorPhoneApp());
}

class DoorPhoneApp extends StatelessWidget {
  const DoorPhoneApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Домофон',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const AppRoot(),
    );
  }
}
