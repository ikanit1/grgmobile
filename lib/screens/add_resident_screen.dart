import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

/// Screen for resident to add a family member or guest to their apartment.
class AddResidentScreen extends StatefulWidget {
  const AddResidentScreen({super.key, required this.client});

  final BackendClient client;

  @override
  State<AddResidentScreen> createState() => _AddResidentScreenState();
}

class _AddResidentScreenState extends State<AddResidentScreen> {
  List<MyApartmentDto> _apartments = [];
  bool _loading = true;
  String? _error;
  int? _selectedApartmentId;
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  String _role = 'resident';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadApartments();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadApartments() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.client.getMyApartments();
      if (mounted) {
        setState(() {
          _apartments = list;
          _loading = false;
          if (list.isNotEmpty && _selectedApartmentId == null) {
            _selectedApartmentId = list.first.apartmentId;
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim();
    if (email.isEmpty && phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Укажите email или телефон')),
      );
      return;
    }
    if (_selectedApartmentId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Выберите квартиру')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.client.addResidentToApartment(
        _selectedApartmentId!,
        email: email.isEmpty ? null : email,
        phone: phone.isEmpty ? null : phone,
        role: _role,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Человек добавлен в квартиру')),
        );
        _emailController.clear();
        _phoneController.clear();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Добавить в квартиру'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.purple))
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, style: const TextStyle(color: AppColors.danger), textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        ElevatedButton(onPressed: _loadApartments, child: const Text('Повторить')),
                      ],
                    ),
                  )
                : _apartments.isEmpty
                    ? const Center(
                        child: Text(
                          'У вас пока нет привязанных квартир.',
                          style: TextStyle(color: AppColors.textSecondary),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : ListView(
                        physics: const BouncingScrollPhysics(),
                        children: [
                          const Text(
                            'Выберите квартиру и укажите email или телефон человека, которого хотите добавить (семья или гость).',
                            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                          ),
                          const SizedBox(height: 16),
                          GlassCard(
                            margin: EdgeInsets.zero,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Квартира',
                                  style: TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 12,
                                    letterSpacing: 0.4,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<int>(
                                  value: _selectedApartmentId,
                                  decoration: const InputDecoration(
                                    border: OutlineInputBorder(),
                                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  ),
                                  dropdownColor: AppColors.surfaceStrong,
                                  style: const TextStyle(color: AppColors.textPrimary),
                                  items: _apartments.map((a) {
                                    return DropdownMenuItem<int>(
                                      value: a.apartmentId,
                                      child: Text(
                                        '${a.building.name}, кв. ${a.apartment.number}',
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    );
                                  }).toList(),
                                  onChanged: (v) => setState(() => _selectedApartmentId = v),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          GlassCard(
                            margin: EdgeInsets.zero,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                TextField(
                                  controller: _emailController,
                                  decoration: const InputDecoration(
                                    labelText: 'Email',
                                    hintText: 'example@mail.ru',
                                  ),
                                  style: const TextStyle(color: AppColors.textPrimary),
                                  keyboardType: TextInputType.emailAddress,
                                  autocorrect: false,
                                ),
                                const SizedBox(height: 12),
                                TextField(
                                  controller: _phoneController,
                                  decoration: const InputDecoration(
                                    labelText: 'Телефон',
                                    hintText: '+79001234567',
                                  ),
                                  style: const TextStyle(color: AppColors.textPrimary),
                                  keyboardType: TextInputType.phone,
                                  autocorrect: false,
                                ),
                                const SizedBox(height: 12),
                                const Text(
                                  'Роль',
                                  style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                                ),
                                const SizedBox(height: 4),
                                DropdownButtonFormField<String>(
                                  value: _role,
                                  decoration: const InputDecoration(
                                    border: OutlineInputBorder(),
                                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  ),
                                  dropdownColor: AppColors.surfaceStrong,
                                  style: const TextStyle(color: AppColors.textPrimary),
                                  items: const [
                                    DropdownMenuItem(value: 'resident', child: Text('Житель')),
                                    DropdownMenuItem(value: 'guest', child: Text('Гость')),
                                  ],
                                  onChanged: (v) => setState(() => _role = v ?? 'resident'),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _saving ? null : _submit,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                child: Text(_saving ? 'Добавление…' : 'Добавить'),
                              ),
                            ),
                          ),
                        ],
                      ),
      ),
    );
  }
}
