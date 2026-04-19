import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

typedef EventStyle = ({IconData icon, Color tileColor, Color iconColor});

EventStyle eventStyle(String eventType) {
  final t = eventType.toLowerCase();
  if (t.contains('door_open')) {
    return (
      icon: Icons.lock_open_rounded,
      tileColor: AppColors.success.withValues(alpha: .18),
      iconColor: AppColors.success,
    );
  }
  if (t.contains('incoming_call') || t.contains('doorbell') || t.contains('doorcall')) {
    return (
      icon: Icons.call_rounded,
      tileColor: AppColors.purple.withValues(alpha: .20),
      iconColor: AppColors.purple,
    );
  }
  if (t.contains('motion') || t.contains('vmd')) {
    return (
      icon: Icons.directions_run,
      tileColor: AppColors.warning.withValues(alpha: .18),
      iconColor: AppColors.warning,
    );
  }
  if (t.contains('alarm') || t.contains('io')) {
    return (
      icon: Icons.notifications_active,
      tileColor: AppColors.danger.withValues(alpha: .18),
      iconColor: AppColors.danger,
    );
  }
  if (t.contains('tamper')) {
    return (
      icon: Icons.security,
      tileColor: AppColors.border,
      iconColor: AppColors.textSecondary,
    );
  }
  return (
    icon: Icons.sensors,
    tileColor: AppColors.border,
    iconColor: AppColors.textSecondary,
  );
}
