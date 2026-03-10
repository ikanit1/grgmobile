import 'dart:math';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AnimatedBackground extends StatefulWidget {
  const AnimatedBackground({super.key});

  @override
  State<AnimatedBackground> createState() => _AnimatedBackgroundState();
}

class _AnimatedBackgroundState extends State<AnimatedBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_Star> _stars;
  final _rng = Random();

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat();

    _stars = List.generate(70, (index) {
      return _Star(
        position: Offset(_rng.nextDouble(), _rng.nextDouble()),
        size: 1.5 + _rng.nextDouble() * 2.5,
        phase: _rng.nextDouble() * 2 * pi,
      );
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final progress = _controller.value;
          return Stack(
            children: [
              // Base gradient
              Container(
                decoration: const BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(0, -0.2),
                    radius: 1.1,
                    colors: [
                      Color(0xFF1A0B2E),
                      Color(0xFF0D0221),
                      Color(0xFF030014),
                    ],
                    stops: [0.0, 0.55, 1.0],
                  ),
                ),
              ),
              // Vertical glow
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      AppColors.purple.withValues(alpha: 0.07),
                      AppColors.purpleDark.withValues(alpha: 0.12),
                      AppColors.purple.withValues(alpha: 0.07),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.25, 0.5, 0.75, 1],
                  ),
                ),
              ),
              // Subtle diagonal glow
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withValues(alpha: 0.02),
                      Colors.transparent,
                      Colors.white.withValues(alpha: 0.03),
                    ],
                    stops: const [0.0, 0.45, 1.0],
                  ),
                ),
              ),
              // Twinkling stars
              CustomPaint(
                painter: _StarFieldPainter(
                  stars: _stars,
                  progress: progress,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _StarFieldPainter extends CustomPainter {
  const _StarFieldPainter({required this.stars, required this.progress});

  final List<_Star> stars;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.fill
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

    for (final star in stars) {
      final phase = (progress * 2 * pi + star.phase) % (2 * pi);
      final opacity = 0.3 + 0.7 * (0.5 + 0.5 * sin(phase));
      paint.color = Colors.white.withValues(alpha: opacity);
      final offset = Offset(star.position.dx * size.width,
          star.position.dy * size.height);
      canvas.drawCircle(offset, star.size, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StarFieldPainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.stars != stars;
  }
}

class _Star {
  _Star({required this.position, required this.size, required this.phase});

  final Offset position;
  final double size;
  final double phase;
}
