enum FaceClass { yawn, noYawn, front, down }

enum EyeClass { closed, open }

enum AlertLevel { none, eyesClosing, drowsy, warning, critical, emergency }

enum EventType { yawn, headDown, drowsy, critical, emergency }

class FaceBox {
  final int x, y, w, h;
  const FaceBox(this.x, this.y, this.w, this.h);
}

class EyePrediction {
  final FaceBox box;
  final EyeClass eyeClass;
  final double conf;
  const EyePrediction(this.box, this.eyeClass, this.conf);
  EyePrediction copyWith({FaceBox? box, EyeClass? eyeClass, double? conf}) =>
      EyePrediction(box ?? this.box, eyeClass ?? this.eyeClass, conf ?? this.conf);
}

class FacePrediction {
  final FaceBox box;
  // Display-side single label (used by the overlay). The most "alarming"
  // signal wins (yawn > down > neutral), else falls back to noYawn/front.
  final FaceClass faceClass;
  final double conf;
  // Independent binary signals — yawn-vs-noYawn and front-vs-down are not
  // mutually exclusive (a face yawning while looking forward is both yawn=1
  // and down=0). The alert engine reads these directly.
  final bool isYawn;
  final double yawnConf;
  final bool isHeadDown;
  final double headPoseConf;
  final List<EyePrediction> eyes;
  const FacePrediction(
    this.box,
    this.faceClass,
    this.conf,
    this.eyes, {
    required this.isYawn,
    required this.yawnConf,
    required this.isHeadDown,
    required this.headPoseConf,
  });

  /// Used by drive_page to merge fresh-from-detect boxes onto the
  /// last-known classification labels. Pass only the fields you want to
  /// change; the rest carry over.
  FacePrediction copyWith({
    FaceBox? box,
    List<EyePrediction>? eyes,
  }) =>
      FacePrediction(
        box ?? this.box,
        faceClass,
        conf,
        eyes ?? this.eyes,
        isYawn: isYawn,
        yawnConf: yawnConf,
        isHeadDown: isHeadDown,
        headPoseConf: headPoseConf,
      );
}

class DetectionResult {
  final List<FacePrediction> faces;
  final int frameWidth;
  final int frameHeight;
  final int tsMs;
  // True when a face was found inside the on-screen guide circle. When false
  // the model was NOT run for this frame and `faces` is empty.
  final bool aligned;
  bool get faceLost => faces.isEmpty;
  const DetectionResult({
    required this.faces,
    required this.frameWidth,
    required this.frameHeight,
    required this.tsMs,
    this.aligned = false,
  });
}

class TripEvent {
  final int ts;
  final EventType type;
  const TripEvent(this.ts, this.type);
  Map<String, dynamic> toJson() => {'ts': ts, 'type': type.name};
  static TripEvent fromJson(Map<String, dynamic> j) =>
      TripEvent(j['ts'] as int, EventType.values.byName(j['type'] as String));
}

class Trip {
  final String id;
  final int startedAt;
  final int endedAt;
  final List<TripEvent> events;
  final int longestClosedMs;
  const Trip({
    required this.id,
    required this.startedAt,
    required this.endedAt,
    required this.events,
    required this.longestClosedMs,
  });
}

class AppSettings {
  final double confidenceThreshold;
  final String emergencyNumber;
  final double alarmVolume;
  final bool keepScreenOn;
  const AppSettings({
    this.confidenceThreshold = 0.6,
    this.emergencyNumber = '112',
    this.alarmVolume = 1.0,
    this.keepScreenOn = true,
  });
  AppSettings copyWith({
    double? confidenceThreshold,
    String? emergencyNumber,
    double? alarmVolume,
    bool? keepScreenOn,
  }) =>
      AppSettings(
        confidenceThreshold: confidenceThreshold ?? this.confidenceThreshold,
        emergencyNumber: emergencyNumber ?? this.emergencyNumber,
        alarmVolume: alarmVolume ?? this.alarmVolume,
        keepScreenOn: keepScreenOn ?? this.keepScreenOn,
      );
}
