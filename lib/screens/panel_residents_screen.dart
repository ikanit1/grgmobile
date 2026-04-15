import 'package:flutter/material.dart';
import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

class PanelResidentsScreen extends StatefulWidget {
  const PanelResidentsScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<PanelResidentsScreen> createState() => _PanelResidentsScreenState();
}

class _PanelResidentsScreenState extends State<PanelResidentsScreen> {
  PanelResidentsResponse? _data;
  ResidentsSyncStatus? _syncStatus;
  bool _loading = true;
  String? _error;
  String _search = '';
  String _syncFilter = '';

  @override
  void initState() {
    super.initState();
    _load();
    _loadSyncStatus();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await widget.client.getResidents(
        widget.deviceId,
        page: 1,
        limit: 50,
        search: _search.isEmpty ? null : _search,
        syncStatus: _syncFilter.isEmpty ? null : _syncFilter,
      );
      if (mounted) setState(() { _data = data; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _loadSyncStatus() async {
    try {
      final status = await widget.client.getResidentsSyncStatus(widget.deviceId);
      if (mounted) setState(() => _syncStatus = status);
    } catch (_) {}
  }

  List<PanelResident> get _filteredItems {
    if (_data == null) return [];
    if (_search.isEmpty) return _data!.items;
    return _data!.items
        .where((r) =>
            r.name.toLowerCase().contains(_search) ||
            r.panelUserId.toLowerCase().contains(_search))
        .toList();
  }

  Future<void> _sync() async {
    setState(() => _loading = true);
    try {
      await widget.client.syncResidents(widget.deviceId);
      if (mounted) {
        await _load();
        await _loadSyncStatus();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _importFromApartments() async {
    setState(() => _loading = true);
    try {
      await widget.client.importResidentsFromApartments(widget.deviceId);
      if (mounted) {
        await _load();
        await _loadSyncStatus();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Импорт выполнен')));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Жители: ${widget.deviceName}'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            onPressed: _loading ? null : _sync,
            tooltip: 'Синхронизировать',
          ),
        ],
      ),
      body: Column(
        children: [
          if (_syncStatus != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: InkWell(
                onTap: _openSyncStatus,
                child: Row(
                  children: [
                    Text(
                      '${_syncStatus!.total} жителей',
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(width: 12),
                    if (_syncStatus!.errors > 0)
                      Text('Ошибок: ${_syncStatus!.errors}', style: const TextStyle(color: AppColors.danger, fontSize: 12)),
                    const Spacer(),
                    const Icon(Icons.sync, size: 18, color: AppColors.textSecondary),
                  ],
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Поиск по имени или ID',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _chip('Все', _syncFilter == '', () => setState(() { _syncFilter = ''; _load(); })),
                _chip('Синхр.', _syncFilter == 'synced', () => setState(() { _syncFilter = 'synced'; _load(); })),
                _chip('Ожидание', _syncFilter == 'pending_add', () => setState(() { _syncFilter = 'pending_add'; _load(); })),
                _chip('Ошибка', _syncFilter == 'error', () => setState(() { _syncFilter = 'error'; _load(); })),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.purple))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, style: const TextStyle(color: AppColors.danger), textAlign: TextAlign.center),
                            const SizedBox(height: 16),
                            ElevatedButton(onPressed: _load, child: const Text('Повторить')),
                          ],
                        ),
                      )
                    : _data == null || _filteredItems.isEmpty
                        ? const Center(child: Text('Нет жителей', style: TextStyle(color: AppColors.textSecondary)))
                        : RefreshIndicator(
                            onRefresh: () async {
                              await _load();
                              await _loadSyncStatus();
                            },
                            color: AppColors.purple,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filteredItems.length,
                              itemBuilder: (context, i) {
                                final r = _filteredItems[i];
                                return Dismissible(
                                  key: Key('${r.id}_$i'),
                                  direction: DismissDirection.endToStart,
                                  background: Container(
                                    alignment: Alignment.centerRight,
                                    padding: const EdgeInsets.only(right: 20),
                                    color: AppColors.danger,
                                    child: const Icon(Icons.delete, color: Colors.white),
                                  ),
                                  confirmDismiss: (dir) async {
                                    return await showDialog<bool>(
                                      context: context,
                                      builder: (ctx) => AlertDialog(
                                        title: const Text('Удалить жителя?'),
                                        content: Text('«${r.name}» будет удалён с панели.'),
                                        actions: [
                                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
                                          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить', style: TextStyle(color: AppColors.danger))),
                                        ],
                                      ),
                                    );
                                  },
                                  onDismissed: (_) => _deleteResident(r),
                                  child: GlassCard(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    child: ListTile(
                                      title: Text(r.name, style: const TextStyle(color: AppColors.textPrimary)),
                                      subtitle: Text(
                                        'ID: ${r.panelUserId}${r.webRelay != null ? ' · Реле: ${r.webRelay}' : ''}',
                                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                                      ),
                                      trailing: r.syncStatus == 'error'
                                          ? const Icon(Icons.error_outline, color: AppColors.danger, size: 20)
                                          : const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                                      onTap: () => _openEdit(r),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          FloatingActionButton.extended(
            onPressed: _loading ? null : _openBulkImport,
            icon: const Icon(Icons.upload_file),
            label: const Text('Массовый импорт'),
            backgroundColor: AppColors.purple.withValues(alpha: 0.8),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.extended(
            onPressed: _loading ? null : _importFromApartments,
            icon: const Icon(Icons.upload),
            label: const Text('Импорт из квартир'),
            backgroundColor: AppColors.purple.withValues(alpha: 0.8),
          ),
          const SizedBox(height: 8),
          FloatingActionButton(
            onPressed: _loading ? null : _openAdd,
            backgroundColor: AppColors.purple,
            child: const Icon(Icons.add, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
      ),
    );
  }

  void _openAdd() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AddResidentToPanelScreen(
          client: widget.client,
          deviceId: widget.deviceId,
          deviceName: widget.deviceName,
        ),
      ),
    ).then((_) { _load(); _loadSyncStatus(); });
  }

  void _openEdit(PanelResident r) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EditResidentScreen(
          client: widget.client,
          deviceId: widget.deviceId,
          deviceName: widget.deviceName,
          resident: r,
        ),
      ),
    ).then((_) { _load(); _loadSyncStatus(); });
  }

  Future<void> _deleteResident(PanelResident r) async {
    try {
      await widget.client.deleteResident(widget.deviceId, r.panelUserId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Житель удалён')));
        _load();
        _loadSyncStatus();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  void _openSyncStatus() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SyncStatusScreen(
          client: widget.client,
          deviceId: widget.deviceId,
          deviceName: widget.deviceName,
        ),
      ),
    ).then((_) { _load(); _loadSyncStatus(); });
  }

  void _openBulkImport() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BulkImportScreen(
          client: widget.client,
          deviceId: widget.deviceId,
          deviceName: widget.deviceName,
        ),
      ),
    ).then((_) { _load(); _loadSyncStatus(); });
  }
}

class AddResidentToPanelScreen extends StatefulWidget {
  const AddResidentToPanelScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<AddResidentToPanelScreen> createState() => _AddResidentToPanelScreenState();
}

class _AddResidentToPanelScreenState extends State<AddResidentToPanelScreen> {
  final _formKey = GlobalKey<FormState>();
  final _panelUserIdCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _webRelayCtrl = TextEditingController();
  final _liftFloorCtrl = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _panelUserIdCtrl.dispose();
    _nameCtrl.dispose();
    _webRelayCtrl.dispose();
    _liftFloorCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await widget.client.createResident(
        widget.deviceId,
        CreatePanelResidentDto(
          panelUserId: _panelUserIdCtrl.text.trim(),
          name: _nameCtrl.text.trim(),
          webRelay: _webRelayCtrl.text.trim().isEmpty ? null : _webRelayCtrl.text.trim(),
          liftFloorNum: _liftFloorCtrl.text.trim().isEmpty ? null : _liftFloorCtrl.text.trim(),
        ),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Житель добавлен')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Добавить жителя'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _panelUserIdCtrl,
              decoration: const InputDecoration(
                labelText: 'ID жителя (номер квартиры или код)',
                border: OutlineInputBorder(),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Имя',
                border: OutlineInputBorder(),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _webRelayCtrl,
              decoration: const InputDecoration(
                labelText: 'Реле (замок)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _liftFloorCtrl,
              decoration: const InputDecoration(
                labelText: 'Этаж лифта',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
              child: _saving ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Сохранить'),
            ),
          ],
        ),
      ),
    );
  }
}

class EditResidentScreen extends StatefulWidget {
  const EditResidentScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
    required this.resident,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;
  final PanelResident resident;

  @override
  State<EditResidentScreen> createState() => _EditResidentScreenState();
}

class _EditResidentScreenState extends State<EditResidentScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameCtrl;
  late final TextEditingController _webRelayCtrl;
  late final TextEditingController _liftFloorCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.resident.name);
    _webRelayCtrl = TextEditingController(text: widget.resident.webRelay ?? '');
    _liftFloorCtrl = TextEditingController(text: widget.resident.liftFloorNum ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _webRelayCtrl.dispose();
    _liftFloorCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await widget.client.updateResident(
        widget.deviceId,
        widget.resident.panelUserId,
        {
          'name': _nameCtrl.text.trim(),
          'webRelay': _webRelayCtrl.text.trim().isEmpty ? null : _webRelayCtrl.text.trim(),
          'liftFloorNum': _liftFloorCtrl.text.trim().isEmpty ? null : _liftFloorCtrl.text.trim(),
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Сохранено')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Удалить жителя?'),
        content: Text('«${widget.resident.name}» будет удалён с панели.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _saving = true);
    try {
      await widget.client.deleteResident(widget.deviceId, widget.resident.panelUserId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Удалено')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Редактировать: ${widget.resident.panelUserId}'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              readOnly: true,
              initialValue: widget.resident.panelUserId,
              decoration: const InputDecoration(
                labelText: 'ID жителя',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Имя',
                border: OutlineInputBorder(),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _webRelayCtrl,
              decoration: const InputDecoration(
                labelText: 'Реле (замок)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _liftFloorCtrl,
              decoration: const InputDecoration(
                labelText: 'Этаж лифта',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
              child: _saving ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Сохранить'),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _saving ? null : _delete,
              icon: const Icon(Icons.delete_outline, color: AppColors.danger),
              label: const Text('Удалить жителя', style: TextStyle(color: AppColors.danger)),
            ),
          ],
        ),
      ),
    );
  }
}

class SyncStatusScreen extends StatefulWidget {
  const SyncStatusScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<SyncStatusScreen> createState() => _SyncStatusScreenState();
}

class _SyncStatusScreenState extends State<SyncStatusScreen> {
  ResidentsSyncStatus? _status;
  List<PanelResident> _errorResidents = [];
  bool _loading = true;
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final status = await widget.client.getResidentsSyncStatus(widget.deviceId);
      final errorList = await widget.client.getResidents(widget.deviceId, syncStatus: 'error', limit: 100);
      if (mounted) {
        setState(() {
          _status = status;
          _errorResidents = errorList.items;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  Future<void> _syncAll() async {
    setState(() => _syncing = true);
    try {
      await widget.client.syncResidents(widget.deviceId);
      if (mounted) await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  String _formatLastSynced(String? iso) {
    if (iso == null) return 'Никогда';
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Только что';
      if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
      if (diff.inHours < 24) return '${diff.inHours} ч назад';
      return '${diff.inDays} дн. назад';
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Статус синхронизации'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.purple))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_status != null) ...[
                  Row(
                    children: [
                      _tile('Всего', _status!.total, AppColors.textSecondary),
                      const SizedBox(width: 8),
                      _tile('Синхр.', _status!.synced, AppColors.success),
                      const SizedBox(width: 8),
                      _tile('Ожидание', _status!.pending, AppColors.warning),
                      const SizedBox(width: 8),
                      _tile('Ошибки', _status!.errors, AppColors.danger),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Последняя синхронизация: ${_formatLastSynced(_status!.lastSyncedAt)}',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _syncing ? null : _syncAll,
                      icon: _syncing ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.sync),
                      label: Text(_syncing ? 'Синхронизация...' : 'Синхронизировать всё'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                const Text('Записи с ошибками', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (_errorResidents.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Нет записей с ошибками', style: TextStyle(color: AppColors.textSecondary)),
                  )
                else
                  ..._errorResidents.map((r) => GlassCard(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          title: Text(r.name, style: const TextStyle(color: AppColors.textPrimary)),
                          subtitle: Text(
                            '${r.panelUserId} — ${r.syncError ?? "ошибка"}',
                            style: const TextStyle(color: AppColors.danger, fontSize: 12),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.refresh, color: AppColors.purple),
                            onPressed: _syncing ? null : () async { await _syncAll(); },
                            tooltip: 'Повторить',
                          ),
                        ),
                      )),
              ],
            ),
    );
  }

  Widget _tile(String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: Column(
          children: [
            Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}

class BulkImportScreen extends StatefulWidget {
  const BulkImportScreen({
    super.key,
    required this.client,
    required this.deviceId,
    required this.deviceName,
  });

  final BackendClient client;
  final int deviceId;
  final String deviceName;

  @override
  State<BulkImportScreen> createState() => _BulkImportScreenState();
}

class _BulkImportScreenState extends State<BulkImportScreen> {
  bool _fromApartments = true;
  bool _loading = false;
  double _progress = 0;
  String _progressText = '';
  final List<(TextEditingController, TextEditingController)> _manualRows = [];

  Future<void> _runImportFromApartments() async {
    setState(() { _loading = true; _progressText = 'Импорт из квартир...'; });
    try {
      await widget.client.importResidentsFromApartments(widget.deviceId);
      if (mounted) {
        setState(() { _loading = false; _progress = 1; _progressText = 'Готово'; });
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Импорт завершён'),
            content: const Text('Жильцы квартир здания добавлены на панель.'),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('OK'))],
          ),
        );
        if (ok == true) Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _runManualImport() async {
    final list = _manualRows
        .map((pair) => CreatePanelResidentDto(
              panelUserId: pair.$1.text.trim(),
              name: pair.$2.text.trim(),
            ))
        .where((d) => d.panelUserId.isNotEmpty && d.name.isNotEmpty)
        .toList();
    if (list.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Добавьте хотя бы одного жителя (ID и имя)')));
      return;
    }
    setState(() { _loading = true; _progress = 0; _progressText = 'Добавление...'; });
    try {
      final result = await widget.client.bulkImportResidents(widget.deviceId, list);
      final added = result['added'] as int? ?? 0;
      final errors = result['errors'] as List<dynamic>? ?? [];
      if (mounted) {
        setState(() { _loading = false; _progress = 1; });
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Итог импорта'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Добавлено: $added'),
                  if (errors.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const Text('Ошибки:', style: TextStyle(color: AppColors.danger)),
                    ...errors.take(10).map((e) => Text(e is Map ? (e['name'] ?? e['message'] ?? e.toString()).toString() : e.toString(), style: const TextStyle(fontSize: 12))),
                    if (errors.length > 10) Text('... и ещё ${errors.length - 10}', style: const TextStyle(fontSize: 12)),
                  ],
                ],
              ),
            ),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  @override
  void dispose() {
    for (final pair in _manualRows) {
      pair.$1.dispose();
      pair.$2.dispose();
    }
    super.dispose();
  }

  void _addManualRow() {
    setState(() {
      _manualRows.add((TextEditingController(), TextEditingController()));
    });
  }

  void _removeManualRow(int i) {
    _manualRows[i].$1.dispose();
    _manualRows[i].$2.dispose();
    setState(() => _manualRows.removeAt(i));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Массовый импорт'),
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.textPrimary,
      ),
      body: _loading
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  LinearProgressIndicator(value: _progress > 0 ? _progress : null, color: AppColors.purple),
                  const SizedBox(height: 16),
                  Text(_progressText, style: const TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Режим', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold)),
                  Row(
                    children: [
                      Radio<bool>(value: true, groupValue: _fromApartments, onChanged: (v) => setState(() => _fromApartments = true), activeColor: AppColors.purple),
                      const Text('Импорт из квартир ЖК'),
                      Radio<bool>(value: false, groupValue: _fromApartments, onChanged: (v) => setState(() => _fromApartments = false), activeColor: AppColors.purple),
                      const Text('Ручной список'),
                    ],
                  ),
                  const SizedBox(height: 24),
                  if (_fromApartments) ...[
                    const Text('Жильцы квартир здания будут добавлены на панель.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _runImportFromApartments,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
                        child: const Text('Запустить импорт из квартир'),
                      ),
                    ),
                  ] else ...[
                    const Text('Добавьте жителей вручную (до 200).', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    const SizedBox(height: 8),
                    ..._manualRows.asMap().entries.map((entry) {
                      final i = entry.key;
                      final idCtrl = entry.value.$1;
                      final nameCtrl = entry.value.$2;
                      return GlassCard(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: idCtrl,
                                decoration: const InputDecoration(labelText: 'ID', isDense: true),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              flex: 2,
                              child: TextFormField(
                                controller: nameCtrl,
                                decoration: const InputDecoration(labelText: 'Имя', isDense: true),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.remove_circle_outline, color: AppColors.danger),
                              onPressed: () => _removeManualRow(i),
                            ),
                          ],
                        ),
                      );
                    }),
                    TextButton.icon(
                      onPressed: _manualRows.length >= 200 ? null : _addManualRow,
                      icon: const Icon(Icons.add),
                      label: const Text('Добавить строку'),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _runManualImport,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.purple),
                        child: const Text('Импортировать список'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
