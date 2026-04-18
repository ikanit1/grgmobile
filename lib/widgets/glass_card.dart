import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets? margin;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Colors.black54,
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: borderColor ?? AppColors.border),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: 0,
                  left: 20,
                  right: 20,
                  child: Container(
                    height: 1,
                    color: Colors.white.withOpacity(0.10),
                  ),
                ),
                Padding(padding: padding, child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
