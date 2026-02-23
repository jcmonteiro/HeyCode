#!/usr/bin/env swift
// Minimal macOS microphone recorder using AVFoundation.
// Usage: record <output.wav>
// Stops on SIGINT (Ctrl-C) or SIGTERM, flushes the file, and exits 0.

import AVFoundation
import Foundation

guard CommandLine.arguments.count == 2 else {
    fputs("usage: record <output.wav>\n", stderr)
    exit(1)
}

let outputPath = CommandLine.arguments[1]
let outputURL = URL(fileURLWithPath: outputPath)

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

// Poll for stop signal OR stop-marker file
while running {
    // Also check for a stop-marker file (used by the Node.js process)
    if FileManager.default.fileExists(atPath: stopMarker.path) {
        try? FileManager.default.removeItem(at: stopMarker)
        break
    }
    Thread.sleep(forTimeInterval: 0.1)
}

recorder.stop()

// Give CoreAudio a moment to finalize the WAV header
Thread.sleep(forTimeInterval: 0.3)

print("stopped:\(outputPath)")
fflush(stdout)
