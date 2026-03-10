import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:grgmobileapp/main.dart';
import 'package:grgmobileapp/screens/auth_screen.dart';
import 'package:grgmobileapp/api/backend_client.dart';
import 'package:grgmobileapp/api/auth_storage.dart';
import 'package:grgmobileapp/models/api_config.dart';
import 'package:grgmobileapp/models/auth_user.dart';

void main() {
  testWidgets('App loads and shows MaterialApp', (WidgetTester tester) async {
    await tester.pumpWidget(const DoorPhoneApp());
    await tester.pump();

    expect(find.byType(MaterialApp), findsOneWidget);
  });

  testWidgets('AuthScreen shows login form', (WidgetTester tester) async {
    final config = const ApiConfig(baseUrl: 'http://test', useBackend: true);
    final client = BackendClient(config, AuthStorage());

    await tester.pumpWidget(
      MaterialApp(
        home: AuthScreen(
          config: config,
          client: client,
          onSuccess: (_) async {},
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(TextField), findsWidgets);
    expect(find.text('Войти'), findsOneWidget);
  });
}
