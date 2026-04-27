import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

/// 3-step wizard for adding (or editing) a device via backend API.
///
/// Step 0: Choose method (manual / ONVIF discovery)
/// Step 1: Device parameters + test connection
/// Step 2: Confirmation + save
class AddDeviceScreen extends StatefulWidget {
  const AddDeviceScreen({
    super.key,
    required this.client,
    required this.buildingId,
    required this.buildingName,
    this.editDevice,
  });

  final BackendClient client;
  final int buildingId;
  final String buildingName;

  /// If set, the wizard opens in edit mode (steps 1-2 only, pre-filled).
  final DeviceDto? editDevice;

  @override
  State<AddDeviceScreen> createState() => _AddDeviceScreenState();
}

class _AddDeviceScreenState extends State<AddDeviceScreen> {
  late int _step;
  bool get _isEdit => widget.editDevice != null;

  // Step 0 results
  List<DiscoveredDevice> _discovered = [];
  bool _discovering = false;

  // Step 1 fields
  final _nameCtrl = TextEditingController();
  final _hostCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _httpPortCtrl = TextEditingController(text: '80');
  final _rtspPortCtrl = TextEditingController(text: '554');
  final _channelCtrl = TextEditingController();
  final _streamCtrl = TextEditingController();
  String _type = 'UNIVIEW_IPC';
  String _role = 'DOORPHONE';
  bool _showAdvanced = false;

  // Test connection
  bool _testing = false;
  TestConnectionResult? _testResult;

  // Step 2 save
  bool _saving = false;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _step = 1;
      final d = widget.editDevice!;
      _nameCtrl.text = d.name;
      _hostCtrl.text = d.host ?? '';
      _type = d.type;
      _role = d.role;
    } else {
      _step = 0;
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _hostCtrl.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    _httpPortCtrl.dispose();
    _rtspPortCtrl.dispose();
    _channelCtrl.dispose();
    _streamCtrl.dispose();
    super.dispose();
  }

  // --- ONVIF ---
  Future<void> _runDiscovery() async {
    setState(() {
      _discovering = true;
      _discovered = [];
    });
    try {
      final list = await widget.client.discoverOnvif(widget.buildingId);
      if (mounted) setState(() => _discovered = list);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('ONVIF: ${e.toString()}')),
        );
      }
    } finally {
      if (mounted) setState(() => _discovering = false);
    }
  }

  void _selectDiscovered(DiscoveredDevice d) {
    _hostCtrl.text = d.host;
    if (d.name != null && d.name!.isNotEmpty) _nameCtrl.text = d.name!;
    setState(() => _step = 1);
  }

  // --- Test Connection ---
  Future<void> _testConnection() async {
    if (_hostCtrl.text.trim().isEmpty) return;
    setState(() {
      _testing = true;
      _testResult = null;
    });
    try {
      final res = await widget.client.testConnection(
        host: _hostCtrl.text.trim(),
        type: _type,
        username: _userCtrl.text.trim().isEmpty ? null : _userCtrl.text.trim(),
        password: _passCtrl.text.isEmpty ? null : _passCtrl.text,
        httpPort: int.tryParse(_httpPortCtrl.text),
      );
      if (mounted) setState(() => _testResult = res);
    } catch (e) {
      if (mounted) {
        setState(() => _testResult = TestConnectionResult(reachable: false, error: e.toString()));
      }
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  // --- Save ---
  Future<void> _save() async {
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      if (_isEdit) {
        await widget.client.updateDevice(widget.editDevice!.id, {
          'name': _nameCtrl.text.trim(),
          'host': _hostCtrl.text.trim(),
          'type': _type,
          'role': _role,
          if (_userCtrl.text.trim().isNotEmpty) 'username': _userCtrl.text.trim(),
          if (_passCtrl.text.isNotEmpty) 'password': _passCtrl.text,
          if (int.tryParse(_httpPortCtrl.text) != null) 'httpPort': int.parse(_httpPortCtrl.text),
          if (int.tryParse(_rtspPortCtrl.text) != null) 'rtspPort': int.parse(_rtspPortCtrl.text),
          if (int.tryParse(_channelCtrl.text) != null) 'defaultChannel': int.parse(_channelCtrl.text),
          if (_streamCtrl.text.trim().isNotEmpty) 'defaultStream': _streamCtrl.text.trim(),
        });
      } else {
        await widget.client.addDevice(
          widget.buildingId,
          name: _nameCtrl.text.trim(),
          host: _hostCtrl.text.trim(),
          type: _type,
          role: _role,
          username: _userCtrl.text.trim().isEmpty ? null : _userCtrl.text.trim(),
          password: _passCtrl.text.isEmpty ? null : _passCtrl.text,
          httpPort: int.tryParse(_httpPortCtrl.text),
          rtspPort: int.tryParse(_rtspPortCtrl.text),
          defaultChannel: int.tryParse(_channelCtrl.text),
          defaultStream: _streamCtrl.text.trim().isEmpty ? null : _streamCtrl.text.trim(),
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _saveError = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  bool get _canProceedToConfirm =>
      _nameCtrl.text.trim().isNotEmpty && _hostCtrl.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(_isEdit ? 'Редактировать устройство' : 'Добавить устройство'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: Column(
        children: [
          _buildStepIndicator(),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: _step == 0
                  ? _buildStep0()
                  : _step == 1
                      ? _buildStep1()
                      : _buildStep2(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepIndicator() {
    final total = _isEdit ? 2 : 3;
    final current = _isEdit ? _step - 1 : _step;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(total, (i) {
          final active = i <= current;
          return Container(
            width: active ? 28 : 10,
            height: 10,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: active ? AppColors.purple : AppColors.border,
              borderRadius: BorderRadius.circular(5),
            ),
          );
        }),
      ),
    );
  }

  // --------------- Step 0: Method ---------------
  Widget _buildStep0() {
    return SingleChildScrollView(
      key: const ValueKey(0),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Как подключить устройство?',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(widget.buildingName, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 20),
          _MethodCard(
            icon: Icons.edit_outlined,
            title: 'Ввести вручную',
            subtitle: 'Указать IP, тип и учётные данные',
            onTap: () => setState(() => _step = 1),
          ),
          const SizedBox(height: 12),
          _MethodCard(
            icon: Icons.wifi_find,
            title: 'Найти по сети (ONVIF)',
            subtitle: 'Автоматический поиск устройств в локальной сети',
            onTap: _runDiscovery,
            trailing: _discovering
                ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.purple))
                : null,
          ),
          if (_discovered.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('Найдено устройств: ${_discovered.length}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 8),
            ..._discovered.map((d) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: GlassCard(
                    padding: const EdgeInsets.all(12),
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.videocam, color: AppColors.purple),
                      title: Text(d.name ?? d.host, style: const TextStyle(color: AppColors.textPrimary)),
                      subtitle: Text(d.host, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                      trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: AppColors.textSecondary),
                      onTap: () => _selectDiscovered(d),
                    ),
                  ),
                )),
          ],
          if (_discovering && _discovered.isEmpty) ...[
            const SizedBox(height: 32),
            const Center(child: Text('Поиск устройств...', style: TextStyle(color: AppColors.textSecondary))),
          ],
        ],
      ),
    );
  }

  // --------------- Step 1: Parameters ---------------
  Widget _buildStep1() {
    return SingleChildScrollView(
      key: const ValueKey(1),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Тип устройства', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, letterSpacing: 0.4)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _buildTypeChip('UNIVIEW_IPC', 'Uniview IPC', Icons.videocam),
              _buildTypeChip('UNIVIEW_NVR', 'Uniview NVR', Icons.dns),
              _buildTypeChip('OTHER', 'Другое', Icons.device_unknown),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Роль', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, letterSpacing: 0.4)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              _buildRoleChip('DOORPHONE', 'Домофон', Icons.door_front_door),
              _buildRoleChip('CAMERA', 'Камера', Icons.videocam),
              _buildRoleChip('NVR', 'NVR', Icons.storage),
            ],
          ),
          const SizedBox(height: 16),
          GlassCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _hostCtrl,
                  decoration: const InputDecoration(labelText: 'IP-адрес / хост', hintText: '192.168.1.100'),
                  style: const TextStyle(color: AppColors.textPrimary),
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(labelText: 'Название устройства', hintText: 'Домофон подъезд 1'),
                  style: const TextStyle(color: AppColors.textPrimary),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _userCtrl,
                  decoration: const InputDecoration(labelText: 'Логин', hintText: 'admin'),
                  style: const TextStyle(color: AppColors.textPrimary),
                  autocorrect: false,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passCtrl,
                  decoration: const InputDecoration(labelText: 'Пароль'),
                  style: const TextStyle(color: AppColors.textPrimary),
                  obscureText: true,
                  autocorrect: false,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => setState(() => _showAdvanced = !_showAdvanced),
            child: Row(
              children: [
                Icon(_showAdvanced ? Icons.expand_less : Icons.expand_more, color: AppColors.textSecondary),
                const SizedBox(width: 6),
                Text('Дополнительные параметры', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          if (_showAdvanced) ...[
            const SizedBox(height: 8),
            GlassCard(
              margin: EdgeInsets.zero,
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _httpPortCtrl,
                          decoration: const InputDecoration(labelText: 'HTTP порт'),
                          style: const TextStyle(color: AppColors.textPrimary),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _rtspPortCtrl,
                          decoration: const InputDecoration(labelText: 'RTSP порт'),
                          style: const TextStyle(color: AppColors.textPrimary),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _channelCtrl,
                          decoration: const InputDecoration(labelText: 'Канал'),
                          style: const TextStyle(color: AppColors.textPrimary),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _streamCtrl,
                          decoration: const InputDecoration(labelText: 'Поток', hintText: 'main'),
                          style: const TextStyle(color: AppColors.textPrimary),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          // Test connection button
          OutlinedButton.icon(
            onPressed: _testing ? null : _testConnection,
            icon: _testing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.purple))
                : const Icon(Icons.wifi_tethering),
            label: Text(_testing ? 'Проверка...' : 'Проверить связь'),
          ),
          if (_testResult != null) ...[
            const SizedBox(height: 8),
            _TestResultBanner(result: _testResult!),
          ],
          const SizedBox(height: 20),
          Row(
            children: [
              if (!_isEdit)
                TextButton(
                  onPressed: () => setState(() => _step = 0),
                  child: const Text('Назад'),
                ),
              const Spacer(),
              ElevatedButton(
                onPressed: _canProceedToConfirm ? () => setState(() => _step = 2) : null,
                child: const Text('Далее'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTypeChip(String value, String label, IconData icon) {
    final selected = _type == value;
    return ChoiceChip(
      avatar: Icon(icon, size: 18, color: selected ? Colors.white : AppColors.textSecondary),
      label: Text(label),
      selected: selected,
      selectedColor: AppColors.purple,
      backgroundColor: AppColors.surface,
      labelStyle: TextStyle(color: selected ? Colors.white : AppColors.textPrimary, fontSize: 13),
      side: BorderSide(color: selected ? AppColors.purple : AppColors.border),
      onSelected: (_) => setState(() => _type = value),
    );
  }

  Widget _buildRoleChip(String value, String label, IconData icon) {
    final selected = _role == value;
    return ChoiceChip(
      avatar: Icon(icon, size: 18, color: selected ? Colors.white : AppColors.textSecondary),
      label: Text(label),
      selected: selected,
      selectedColor: AppColors.purple,
      backgroundColor: AppColors.surface,
      labelStyle: TextStyle(color: selected ? Colors.white : AppColors.textPrimary, fontSize: 13),
      side: BorderSide(color: selected ? AppColors.purple : AppColors.border),
      onSelected: (_) => setState(() => _role = value),
    );
  }

  // --------------- Step 2: Confirmation ---------------
  Widget _buildStep2() {
    return SingleChildScrollView(
      key: const ValueKey(2),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _isEdit ? 'Подтвердите изменения' : 'Подтвердите добавление',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 16),
          GlassCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SummaryRow('Здание', widget.buildingName),
                _SummaryRow('Название', _nameCtrl.text.trim()),
                _SummaryRow('Host / IP', _hostCtrl.text.trim()),
                _SummaryRow('Тип', _type),
                _SummaryRow('Роль', _role),
                if (_userCtrl.text.trim().isNotEmpty) _SummaryRow('Логин', _userCtrl.text.trim()),
                if (_testResult != null)
                  _SummaryRow('Связь', _testResult!.reachable ? 'OK' : 'Не удалось'),
              ],
            ),
          ),
          if (_saveError != null) ...[
            const SizedBox(height: 12),
            Text(_saveError!, style: const TextStyle(color: AppColors.danger)),
          ],
          const SizedBox(height: 24),
          Row(
            children: [
              TextButton(
                onPressed: () => setState(() => _step = 1),
                child: const Text('Назад'),
              ),
              const Spacer(),
              ElevatedButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Icon(_isEdit ? Icons.save : Icons.add),
                label: Text(_isEdit ? 'Сохранить' : 'Добавить'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// --------------- Small helper widgets ---------------

class _MethodCard extends StatelessWidget {
  const _MethodCard({required this.icon, required this.title, required this.subtitle, required this.onTap, this.trailing});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: AppColors.purple.withValues(alpha: 0.25),
              ),
              child: Icon(icon, color: AppColors.purple),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
            if (trailing != null) trailing! else const Icon(Icons.chevron_right, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _TestResultBanner extends StatelessWidget {
  const _TestResultBanner({required this.result});
  final TestConnectionResult result;

  @override
  Widget build(BuildContext context) {
    final ok = result.reachable;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok ? AppColors.success.withValues(alpha: 0.15) : AppColors.danger.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ok ? AppColors.success : AppColors.danger, width: 0.5),
      ),
      child: Row(
        children: [
          Icon(ok ? Icons.check_circle : Icons.error_outline, color: ok ? AppColors.success : AppColors.danger),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ok ? 'Устройство доступно' : 'Не удалось подключиться',
                    style: TextStyle(color: ok ? AppColors.success : AppColors.danger, fontWeight: FontWeight.w600)),
                if (!ok && result.error != null)
                  Text(result.error!, style: TextStyle(color: AppColors.danger.withValues(alpha: 0.8), fontSize: 12)),
                if (ok && result.info != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    result.info!.entries.take(3).map((e) => '${e.key}: ${e.value}').join(', '),
                    style: TextStyle(color: AppColors.success.withValues(alpha: 0.8), fontSize: 11),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          ),
          Expanded(child: Text(value, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13))),
        ],
      ),
    );
  }
}
