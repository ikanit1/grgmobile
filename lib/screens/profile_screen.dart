import 'package:flutter/material.dart';
import '../api/backend_client.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.client});

  final BackendClient client;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _curPassCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();

  bool _loading = true;
  String? _error;
  String? _saveMsg;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _curPassCtrl.dispose();
    _newPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final p = await widget.client.getProfile();
      if (mounted) {
        _nameCtrl.text = p['name'] as String? ?? '';
        _emailCtrl.text = p['email'] as String? ?? '';
        _phoneCtrl.text = p['phone'] as String? ?? '';
        setState(() { _loading = false; });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _save() async {
    setState(() { _saveMsg = null; });
    try {
      await widget.client.updateProfile(
        name: _nameCtrl.text.trim(),
        email: _emailCtrl.text.trim(),
        phone: _phoneCtrl.text.trim(),
      );
      if (mounted) setState(() { _saveMsg = 'Профиль обновлён'; });
    } catch (e) {
      if (mounted) setState(() { _saveMsg = 'Ошибка: $e'; });
    }
  }

  Future<void> _changePassword() async {
    if (_curPassCtrl.text.isEmpty || _newPassCtrl.text.isEmpty) {
      setState(() { _saveMsg = 'Заполните оба поля пароля'; });
      return;
    }
    try {
      await widget.client.changePassword(_curPassCtrl.text, _newPassCtrl.text);
      if (mounted) {
        _curPassCtrl.clear();
        _newPassCtrl.clear();
        setState(() { _saveMsg = 'Пароль изменён'; });
      }
    } catch (e) {
      if (mounted) setState(() { _saveMsg = 'Ошибка: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return Scaffold(appBar: AppBar(title: const Text('Профиль')), body: const Center(child: CircularProgressIndicator()));
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Профиль')),
        body: Center(child: Text(_error!, style: const TextStyle(color: Colors.red))),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Имя')),
          const SizedBox(height: 12),
          TextField(controller: _emailCtrl, decoration: const InputDecoration(labelText: 'Email')),
          const SizedBox(height: 12),
          TextField(controller: _phoneCtrl, decoration: const InputDecoration(labelText: 'Телефон')),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _save, child: const Text('Сохранить профиль')),
          const Divider(height: 32),
          const Text('Сменить пароль', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          TextField(controller: _curPassCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Текущий пароль')),
          const SizedBox(height: 12),
          TextField(controller: _newPassCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Новый пароль')),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _changePassword, child: const Text('Сменить пароль')),
          if (_saveMsg != null) ...[
            const SizedBox(height: 16),
            Text(_saveMsg!, style: TextStyle(color: _saveMsg!.startsWith('Ошибка') ? Colors.red : Colors.green)),
          ],
        ],
      ),
    );
  }
}
