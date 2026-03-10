import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const Color surface = Color(0x661A0B2E);
  static const Color surfaceStrong = Color(0x80260F3F);
  static const Color border = Color(0x4D8A2BE2);
  static const Color purple = Color(0xFF8A2BE2);
  static const Color purpleDark = Color(0xFF2A0F4C);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFDACBF5);
  static const Color success = Color(0xFF3DD598);
  static const Color warning = Color(0xFFF6C344);
  static const Color danger = Color(0xFFFF6B6B);
}

class AppTheme {
  const AppTheme._();

  static ThemeData light() {
    final base = ThemeData.dark(useMaterial3: true);
    const colorScheme = ColorScheme.dark(
      primary: AppColors.purple,
      secondary: AppColors.textSecondary,
      surface: AppColors.surface,
    );

    return base.copyWith(
      colorScheme: colorScheme,
      scaffoldBackgroundColor: Colors.transparent,
      textTheme: GoogleFonts.manropeTextTheme(base.textTheme).apply(
        bodyColor: AppColors.textPrimary,
        displayColor: AppColors.textPrimary,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Color(0xD91A0B2E),
        selectedItemColor: AppColors.purple,
        unselectedItemColor: Color(0x99DACBF5),
        type: BottomNavigationBarType.fixed,
        showSelectedLabels: true,
        showUnselectedLabels: true,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.purple
              : Colors.grey.shade400,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.purple.withValues(alpha: 0.5)
              : Colors.grey.shade700,
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.purpleDark.withValues(alpha: 0.35),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.purple),
        ),
        labelStyle: const TextStyle(color: AppColors.textSecondary),
        hintStyle: const TextStyle(color: AppColors.textSecondary),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
          backgroundColor: AppColors.purple,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
          side: const BorderSide(color: AppColors.border),
          foregroundColor: AppColors.textSecondary,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: AppColors.textSecondary,
        textColor: AppColors.textPrimary,
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      ),
    );
  }
}
