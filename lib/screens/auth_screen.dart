import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../models/api_config.dart';
import '../models/auth_user.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

class AuthScreen extends StatefulWidget {
  final ApiConfig config;
  final BackendClient client;
  final Future<void> Function(AuthUser user) onSuccess;

  const AuthScreen({
    super.key,
    required this.config,
    required this.client,
    required this.onSuccess,
  });

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isLogin = true;
  final _loginController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  bool _loading = false;
  bool _passwordVisible = false;
  String? _error;

  @override
  void dispose() {
    _loginController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      if (_isLogin) {
        final res = await widget.client.login(
          _loginController.text.trim(),
          _passwordController.text.trim(),
        );
        if (mounted) await widget.onSuccess(res.user);
      } else {
        final email = _emailController.text.trim();
        final phone = _phoneController.text.trim();
        if (email.isEmpty && phone.isEmpty) {
          setState(() {
            _error = 'Укажите email или телефон';
            _loading = false;
          });
          return;
        }
        if (_passwordController.text.length < 6) {
          setState(() {
            _error = 'Пароль не менее 6 символов';
            _loading = false;
          });
          return;
        }
        final res = await widget.client.register(
          email: email.isEmpty ? null : email,
          phone: phone.isEmpty ? null : phone,
          name: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
          password: _passwordController.text.trim(),
        );
        if (mounted) await widget.onSuccess(res.user);
      }
    } on BackendException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _isLoginMode => _isLogin;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
          child: GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _isLoginMode ? 'Вход' : 'Регистрация',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 22,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.config.baseUrl,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 24),
                if (_isLoginMode) ...[
                  TextField(
                    controller: _loginController,
                    decoration: const InputDecoration(
                      labelText: 'Email или телефон',
                      hintText: 'admin@example.com',
                    ),
                    style: const TextStyle(color: AppColors.textPrimary),
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                  ),
                ] else ...[
                  TextField(
                    controller: _emailController,
                    decoration: const InputDecoration(labelText: 'Email', hintText: 'user@example.com'),
                    style: const TextStyle(color: AppColors.textPrimary),
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _phoneController,
                    decoration: const InputDecoration(labelText: 'Телефон', hintText: '+79001234567'),
                    style: const TextStyle(color: AppColors.textPrimary),
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Имя (необязательно)'),
                    style: const TextStyle(color: AppColors.textPrimary),
                    textInputAction: TextInputAction.next,
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _passwordController,
                  decoration: InputDecoration(
                    labelText: 'Пароль',
                    hintText: _isLoginMode ? null : 'не менее 6 символов',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _passwordVisible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.textSecondary,
                        size: 20,
                      ),
                      onPressed: () => setState(() => _passwordVisible = !_passwordVisible),
                    ),
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                  obscureText: !_passwordVisible,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.danger, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(_isLoginMode ? 'Войти' : 'Зарегистрироваться'),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => setState(() {
                    _isLogin = !_isLogin;
                    _error = null;
                  }),
                  child: Text(_isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
