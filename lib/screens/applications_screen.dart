import 'package:flutter/material.dart';

import '../api/backend_client.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_card.dart';

class ApplicationsScreen extends StatefulWidget {
  const ApplicationsScreen({
    super.key,
    required this.client,
  });

  final BackendClient client;

  static String statusLabel(String status) {
    switch (status) {
      case 'PENDING':
        return 'Ожидает';
      case 'APPROVED':
        return 'Одобрена';
      case 'REJECTED':
        return 'Отклонена';
      default:
        return status;
    }
  }

  @override
  State<ApplicationsScreen> createState() => _ApplicationsScreenState();
}

class _ApplicationsScreenState extends State<ApplicationsScreen> {
  List<ApplicationDto> _list = [];
  bool _loading = true;
  String? _error;
  bool _showNewFlow = false;
  List<BuildingWithApartmentsDto> _buildingsForApply = [];
  bool _loadingBuildings = false;
  BuildingWithApartmentsDto? _selectedBuilding;
  ApartmentDto? _selectedApartment;
  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.client.getMyApplications();
      if (mounted) {
        setState(() {
          _list = list;
          _loading = false;
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

  Future<void> _startNewApplication() async {
    setState(() {
      _showNewFlow = true;
      _buildingsForApply = [];
      _loadingBuildings = true;
      _selectedBuilding = null;
      _selectedApartment = null;
      _submitError = null;
    });
    try {
      final buildings = await widget.client.getBuildingsForApplication();
      if (mounted) {
        setState(() {
          _buildingsForApply = buildings;
          _loadingBuildings = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loadingBuildings = false;
        });
      }
    }
  }

  void _cancelNewFlow() {
    setState(() {
      _showNewFlow = false;
      _selectedBuilding = null;
      _selectedApartment = null;
      _submitError = null;
    });
  }

  Future<void> _submitApplication() async {
    final apt = _selectedApartment;
    if (apt == null) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      await widget.client.applyForApartment(apt.id);
      if (mounted) {
        _cancelNewFlow();
        setState(() => _submitting = false);
        _load();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Заявка подана. Ожидайте решения УК.')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _submitError = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showNewFlow) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          title: const Text('Подать заявку'),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: _cancelNewFlow,
          ),
        ),
        body: SafeArea(
          child: _loadingBuildings
              ? const Center(child: CircularProgressIndicator(color: AppColors.purple))
              : _buildingsForApply.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Нет зданий для подачи заявки',
                              style: const TextStyle(color: AppColors.textSecondary),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            TextButton.icon(
                              onPressed: _cancelNewFlow,
                              icon: const Icon(Icons.arrow_back),
                              label: const Text('Назад'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        if (_selectedBuilding == null) ...[
                          const Text(
                            'Выберите здание',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ..._buildingsForApply.map((b) => _BuildingTile(
                                building: b,
                                onTap: () => setState(() {
                                  _selectedBuilding = b;
                                  _selectedApartment = null;
                                }),
                              )),
                        ] else ...[
                          TextButton.icon(
                            onPressed: () => setState(() {
                              _selectedBuilding = null;
                              _selectedApartment = null;
                            }),
                            icon: const Icon(Icons.arrow_back, size: 18),
                            label: const Text('Другое здание'),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Выберите квартиру',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (_selectedBuilding!.apartments.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Text(
                                'В этом здании пока нет квартир. Обратитесь в УК, чтобы их добавили.',
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 14,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            )
                          else
                            ...(_selectedBuilding!.apartments.map((a) => _ApartmentTile(
                                apartment: a,
                                selected: _selectedApartment?.id == a.id,
                                onTap: () => setState(() => _selectedApartment = a),
                              ))),
                          const SizedBox(height: 24),
                          if (_selectedApartment != null) ...[
                            if (_submitError != null) ...[
                              Text(
                                _submitError!,
                                style: const TextStyle(color: AppColors.danger, fontSize: 13),
                              ),
                              const SizedBox(height: 8),
                            ],
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: _submitting ? null : _submitApplication,
                                child: _submitting
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                      )
                                    : const Text('Подать заявку'),
                              ),
                            ),
                          ],
                        ],
                      ],
                    ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Мои заявки'),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: AppColors.purple))
            : _error != null
                ? Padding(
                    padding: const EdgeInsets.all(16),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!, style: const TextStyle(color: AppColors.danger), textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _load, child: const Text('Повторить')),
                        ],
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    color: AppColors.purple,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        OutlinedButton.icon(
                          onPressed: _startNewApplication,
                          icon: const Icon(Icons.add),
                          label: const Text('Подать заявку на привязку к квартире'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.purple,
                            side: const BorderSide(color: AppColors.purple),
                          ),
                        ),
                        const SizedBox(height: 16),
                        if (_list.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(
                              child: Text(
                                'Нет заявок',
                                style: TextStyle(color: AppColors.textSecondary),
                              ),
                            ),
                          )
                        else
                          ..._list.map((a) => _ApplicationCard(application: a)),
                      ],
                    ),
                  ),
      ),
    );
  }
}

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({required this.application});

  final ApplicationDto application;

  @override
  Widget build(BuildContext context) {
    final status = application.status;
    final isPending = status == 'PENDING';
    final isRejected = status == 'REJECTED';
    return GlassCard(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  application.apartment?.number ?? 'Кв. —',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isPending
                      ? AppColors.warning.withValues(alpha: 0.3)
                      : isRejected
                          ? AppColors.danger.withValues(alpha: 0.3)
                          : AppColors.success.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  ApplicationsScreen.statusLabel(status),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isPending
                        ? AppColors.warning
                        : isRejected
                            ? AppColors.danger
                            : AppColors.success,
                  ),
                ),
              ),
            ],
          ),
          if (application.building != null) ...[
            const SizedBox(height: 4),
            Text(
              application.building!.name,
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            if (application.building!.address != null)
              Text(
                application.building!.address!,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
          ],
          if (application.requestedAt != null) ...[
            const SizedBox(height: 4),
            Text(
              'Подана: ${application.requestedAt}',
              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
            ),
          ],
          if (application.rejectReason != null && application.rejectReason!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Причина отклонения: ${application.rejectReason}',
              style: const TextStyle(fontSize: 12, color: AppColors.danger),
            ),
          ],
        ],
      ),
    );
  }
}

class _BuildingTile extends StatelessWidget {
  const _BuildingTile({required this.building, required this.onTap});

  final BuildingWithApartmentsDto building;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: GlassCard(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.apartment, color: AppColors.purple, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      building.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (building.address != null)
                      Text(
                        building.address!,
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    Text(
                      '${building.apartments.length} кв.',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _ApartmentTile extends StatelessWidget {
  const _ApartmentTile({required this.apartment, required this.selected, required this.onTap});

  final ApartmentDto apartment;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppColors.purple.withValues(alpha: 0.25) : AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? AppColors.purple : AppColors.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                selected ? Icons.check_circle : Icons.looks_one,
                color: selected ? AppColors.purple : AppColors.textSecondary,
                size: 22,
              ),
              const SizedBox(width: 10),
              Text(
                'Кв. ${apartment.number}',
                style: TextStyle(
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  fontSize: 15,
                  color: AppColors.textPrimary,
                ),
              ),
              if (apartment.floor != null)
                Text(
                  ' · ${apartment.floor} этаж',
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
