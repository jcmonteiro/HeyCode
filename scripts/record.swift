#!/usr/bin/env swift
// Minimal macOS microphone recorder using AVFoundation.
//
// Usage:
//   record <output.wav>                             # manual stop only
//   record <output.wav> --vad                       # auto-stop on silence (defaults)
//   record <output.wav> --vad --silence-duration 2.0 --silence-threshold -40
//
// Stops on SIGINT (Ctrl-C), SIGTERM, or (when --vad is enabled) after
// sustained silence. Flushes the file and exits 0.
//
// Stdout protocol:
//   recording:<path>   — emitted when recording starts
//   stopped:<path>     — emitted when recording stops (manual or auto)

import AVFoundation
import Foundation

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("usage: record <output.wav> [--vad] [--silence-duration N] [--silence-threshold N]\n", stderr)
    exit(1)
}

let outputPath = args[1]
let outputURL = URL(fileURLWithPath: outputPath)

func argValue(_ flag: String) -> String? {
    guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
    return args[idx + 1]
}

let vadEnabled = args.contains("--vad")
let silenceDuration = Double(argValue("--silence-duration") ?? "2.0") ?? 2.0
let silenceThreshold = Float(argValue("--silence-threshold") ?? "-40") ?? -40.0
// Grace period: don't trigger VAD auto-stop during the first N seconds
let vadGracePeriod = Double(argValue("--vad-grace") ?? "1.0") ?? 1.0

// ---------------------------------------------------------------------------
// Recorder setup
// ---------------------------------------------------------------------------

// whisper-cli requires 16kHz mono 16-bit PCM WAV
let settings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatLinearPCM),
    AVSampleRateKey: 16000.0,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
]

let recorder: AVAudioRecorder
do {
    recorder = try AVAudioRecorder(url: outputURL, settings: settings)
    recorder.isMeteringEnabled = vadEnabled
    recorder.prepareToRecord()
} catch {
    fputs("error: \(error.localizedDescription)\n", stderr)
    exit(1)
}

// Use a file marker to signal stop (more reliable than signals for detached processes)
let stopMarker = outputURL.deletingLastPathComponent()
    .appendingPathComponent(".stop-\(ProcessInfo.processInfo.processIdentifier)")

var running = true

func handleStop(_: Int32) {
    running = false
}

signal(SIGINT, handleStop)
signal(SIGTERM, handleStop)

guard recorder.record() else {
    fputs("error: failed to start recording\n", stderr)
    exit(1)
}

// Print to stdout so the parent process knows we're recording
print("recording:\(outputPath)")
fflush(stdout)

// ---------------------------------------------------------------------------
// Poll loop: stop signal / stop-marker / VAD silence detection
// ---------------------------------------------------------------------------

let startTime = Date()
var silentSince: Date? = nil

while running {
    // Check for stop-marker file (used by the Node.js process)
    if FileManager.default.fileExists(atPath: stopMarker.path) {
        try? FileManager.default.removeItem(at: stopMarker)
        break
    }

    // VAD silence detection (only after grace period)
    if vadEnabled {
        let elapsed = Date().timeIntervalSince(startTime)
        if elapsed >= vadGracePeriod {
            recorder.updateMeters()
            let power = recorder.averagePower(forChannel: 0)

            if power < silenceThreshold {
                // Below threshold — track silence start
                if silentSince == nil {
                    silentSince = Date()
                } else if let start = silentSince,
                          Date().timeIntervalSince(start) >= silenceDuration {
                    // Sustained silence — auto-stop
                    break
                }
            } else {
                // Speech detected — reset silence tracker
                silentSince = nil
            }
        }
    }

    Thread.sleep(forTimeInterval: 0.1)
}

recorder.stop()

// Give CoreAudio a moment to finalize the WAV header
Thread.sleep(forTimeInterval: 0.3)

print("stopped:\(outputPath)")
fflush(stdout)
