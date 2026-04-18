import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'glass_card.dart';

class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 8,
    this.widthFactor,
  });

  final double? width;
  final double height;
  final double radius;
  final double? widthFactor;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _animation = CurvedAnimation(parent: _controller, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, _) {
        return FractionallySizedBox(
          widthFactor: widget.widthFactor,
          child: Container(
            width: widget.widthFactor == null ? widget.width : null,
            height: widget.height,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.radius),
              gradient: LinearGradient(
                colors: [
                  AppColors.purple.withOpacity(0.08 + _animation.value * 0.14),
                  AppColors.purple.withOpacity(0.18 + _animation.value * 0.14),
                  AppColors.purple.withOpacity(0.08 + _animation.value * 0.14),
                ],
                stops: const [0.0, 0.5, 1.0],
              ),
            ),
          ),
        );
      },
    );
  }
}

class SkeletonBuildingCard extends StatelessWidget {
  const SkeletonBuildingCard({super.key});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          const SkeletonBox(width: 40, height: 40, radius: 12),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 13, widthFactor: 0.6),
                const SizedBox(height: 6),
                SkeletonBox(height: 10, widthFactor: 0.4),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SkeletonEventItem extends StatelessWidget {
  const SkeletonEventItem({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          const SkeletonBox(width: 28, height: 28, radius: 8),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 12, widthFactor: 0.55),
                const SizedBox(height: 5),
                SkeletonBox(height: 10, widthFactor: 0.40),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
