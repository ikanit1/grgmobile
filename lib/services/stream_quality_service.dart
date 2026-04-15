import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Detects network connectivity type and returns stream quality preferences.
///
/// Usage:
///   final pref = await StreamQualityService.instance.getPreference();
///   // pref.streamType == 'sub'  → pass stream='sub' to getLiveUrl
///   // pref.preferHls == true    → use hlsUrl if available
class StreamQualityService {
  StreamQualityService._();
  static final StreamQualityService instance = StreamQualityService._();

  final _connectivity = Connectivity();
  final _controller = StreamController<StreamPreference>.broadcast();

  StreamSubscription? _sub;

  /// Broadcast stream — emits when connectivity changes.
  Stream<StreamPreference> get onChanged => _controller.stream;

  /// Start listening for connectivity changes (call once from main.dart or app init).
  void startListening() {
    _sub ??= _connectivity.onConnectivityChanged.listen((results) {
      _controller.add(_fromResults(results));
    });
  }

  void dispose() {
    _sub?.cancel();
    _controller.close();
  }

  /// Returns current network-based stream preference (async, one-time check).
  Future<StreamPreference> getPreference() async {
    final results = await _connectivity.checkConnectivity();
    return _fromResults(results);
  }

  StreamPreference _fromResults(List<ConnectivityResult> results) {
    final isCellular = results.contains(ConnectivityResult.mobile) &&
        !results.contains(ConnectivityResult.wifi) &&
        !results.contains(ConnectivityResult.ethernet);
    return StreamPreference(
      streamType: isCellular ? 'sub' : 'main',
      preferHls: isCellular,
    );
  }
}

class StreamPreference {
  final String streamType; // 'main' or 'sub'
  final bool preferHls;    // true → use hlsUrl when available

  const StreamPreference({required this.streamType, required this.preferHls});
}
