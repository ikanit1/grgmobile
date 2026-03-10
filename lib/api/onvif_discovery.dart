import 'package:easy_onvif/probe.dart';

class DiscoveredOnvifDevice {
  final String host;
  final String? name;
  final String? location;

  const DiscoveredOnvifDevice({
    required this.host,
    this.name,
    this.location,
  });
}

/// Поиск ONVIF-устройств (IPC/NVR) в локальной сети.
///
/// Использует WS-Discovery через пакет `easy_onvif`.
Future<List<DiscoveredOnvifDevice>> discoverOnvifDevices({
  int timeoutMs = 3000,
}) async {
  final probe = MulticastProbe(timeout: timeoutMs);
  await probe.probe();

  return probe.onvifDevices.map((match) {
    final xaddr = match.xAddr;
    final uri = Uri.tryParse(xaddr);
    final host = uri?.host.isNotEmpty == true ? uri!.host : xaddr;

    return DiscoveredOnvifDevice(
      host: host,
      name: match.name,
      location: match.location,
    );
  }).toList();
}

