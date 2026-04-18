import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../models/auth_user.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.client,
    required this.authUser,
    required this.onLogout,
  });

  final BackendClient? client;
  final AuthUser? authUser;
  final Future<void> Function() onLogout;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.client == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final p = await widget.client!.getProfile();
      if (mounted) setState(() { _profile = p; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _initials() {
    final name = _profile?['name'] as String? ?? widget.authUser?.name ?? '';
    final email = _profile?['email'] as String? ?? '';
    if (name.isNotEmpty) {
      final parts = name.trim().split(' ');
      if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      return name[0].toUpperCase();
    }
    if (email.isNotEmpty) return email[0].toUpperCase();
    return '?';
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'SUPER_ADMIN':     return 'Супер-администратор';
      case 'ORG_ADMIN':       return 'Администратор УК';
      case 'COMPLEX_MANAGER': return 'Менеджер ЖК';
      case 'RESIDENT':        return 'Житель';
      default:                return role;
    }
  }

  void _openEditField(String title, String hint, String current, bool obscure, Future<void> Function(String) onSave) {
    final ctrl = TextEditingController(text: current);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1A0B2E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 24, right: 24, top: 24,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              TextField(
                controller: ctrl,
                autofocus: true,
                obscureText: obscure,
                decoration: InputDecoration(hintText: hint),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    Navigator.pop(ctx);
                    try {
                      await onSave(ctrl.text.trim());
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: const Text('Сохранено'),
                            backgroundColor: AppColors.success.withOpacity(0.9),
                          ),
                        );
                        _load();
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Ошибка: $e'),
                            backgroundColor: AppColors.danger.withOpacity(0.9),
                          ),
                        );
                      }
                    }
                  },
                  child: const Text('Сохранить'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _openPasswordChange() {
    final curCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1A0B2E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 24, right: 24, top: 24,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Сменить пароль', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              TextField(controller: curCtrl, obscureText: true, decoration: const InputDecoration(hintText: 'Текущий пароль')),
              const SizedBox(height: 12),
              TextField(controller: newCtrl, obscureText: true, decoration: const InputDecoration(hintText: 'Новый пароль')),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    if (curCtrl.text.isEmpty || newCtrl.text.isEmpty) return;
                    Navigator.pop(ctx);
                    try {
                      await widget.client!.changePassword(curCtrl.text, newCtrl.text);
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: const Text('Пароль изменён'),
                            backgroundColor: AppColors.success.withOpacity(0.9),
                          ),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Ошибка: $e'),
                            backgroundColor: AppColors.danger.withOpacity(0.9),
                          ),
                        );
                      }
                    }
                  },
                  child: const Text('Сохранить'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final role = widget.authUser?.role ?? 'RESIDENT';
    final name = _profile?['name'] as String? ?? widget.authUser?.name ?? '—';
    final email = _profile?['email'] as String? ?? '—';
    final phone = _profile?['phone'] as String? ?? '—';
    final hasClient = widget.client != null;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              'Профиль',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),

          // ── Hero card ──
          GlassCard(
            margin: const EdgeInsets.only(bottom: 16),
            child: Row(
              children: [
                Container(
                  width: 66,
                  height: 66,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [Color(0xFF8A2BE2), Color(0xFF5FA8FF)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.purple.withOpacity(0.4),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      _loading ? '?' : _initials(),
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _loading ? '...' : name,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _roleLabel(role),
                        style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_error != null)
            Center(
              child: Column(
                children: [
                  Text(_error!, style: const TextStyle(color: AppColors.danger)),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: _load, child: const Text('Повторить')),
                ],
              ),
            )
          else if (hasClient) ...[
            // ── Данные ──
            GlassCard(
              padding: EdgeInsets.zero,
              margin: const EdgeInsets.only(bottom: 16),
              child: Column(
                children: [
                  _ProfileRow(
                    icon: Icons.email_outlined,
                    label: 'Email',
                    value: email,
                    onTap: () => _openEditField(
                      'Изменить email', 'Email',
                      _profile?['email'] as String? ?? '',
                      false,
                      (v) => widget.client!.updateProfile(email: v),
                    ),
                  ),
                  Divider(height: 1, color: AppColors.border),
                  _ProfileRow(
                    icon: Icons.phone_outlined,
                    label: 'Телефон',
                    value: phone,
                    onTap: () => _openEditField(
                      'Изменить телефон', 'Телефон',
                      _profile?['phone'] as String? ?? '',
                      false,
                      (v) => widget.client!.updateProfile(phone: v),
                    ),
                  ),
                  Divider(height: 1, color: AppColors.border),
                  _ProfileRow(
                    icon: Icons.lock_outline,
                    label: 'Пароль',
                    value: '••••••••',
                    onTap: _openPasswordChange,
                  ),
                ],
              ),
            ),
          ],

          // ── Выход ──
          GlassCard(
            padding: EdgeInsets.zero,
            borderColor: AppColors.danger.withOpacity(0.25),
            child: InkWell(
              onTap: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: const Color(0xFF1A0B2E),
                    title: const Text('Выйти из аккаунта?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: Text('Выйти', style: TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  ),
                );
                if (ok == true) await widget.onLogout();
              },
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  children: [
                    Icon(Icons.logout, color: AppColors.danger, size: 20),
                    const SizedBox(width: 12),
                    Text(
                      'Выйти из аккаунта',
                      style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.textSecondary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  const SizedBox(height: 2),
                  Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.textSecondary, size: 18),
          ],
        ),
      ),
    );
  }
}
