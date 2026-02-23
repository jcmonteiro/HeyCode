#!/usr/bin/env swift
// Global hotkey listener for speech-to-text.
//
// Monitors for a system-wide keyboard shortcut and writes a trigger file
// when pressed. The Node.js daemon watches this file to start/stop recording.
//
// Uses NSEvent.addGlobalMonitorForEvents (Cocoa) instead of the deprecated
// Carbon RegisterEventHotKey API, which fails silently on modern macOS.
//
// Usage:
//   hotkey                                    # Default: Cmd+Shift+Space
//   hotkey --key space --modifiers cmd,shift   # Custom hotkey
//   hotkey --trigger-path /tmp/heycode-trigger # Custom trigger file path
//
// Requires Accessibility permissions (System Settings → Privacy → Accessibility).
// The terminal app running this binary must be granted Accessibility access.
//
// Stdout protocol:
//   ready                — hotkey registered successfully
//   triggered            — hotkey was pressed
//   error:<message>      — something went wrong

import Cocoa

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

let args = CommandLine.arguments

func argValue(_ flag: String) -> String? {
    guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
    return args[idx + 1]
}

let triggerPath = argValue("--trigger-path")
    ?? (NSString("~/.cache/heycode/hotkey-trigger").expandingTildeInPath)

let modifiersStr = argValue("--modifiers") ?? "cmd,shift"
let keyStr = argValue("--key") ?? "space"

// ---------------------------------------------------------------------------
// Parse key code and modifier flags
// ---------------------------------------------------------------------------

func parseModifierFlags(_ str: String) -> NSEvent.ModifierFlags {
    var flags = NSEvent.ModifierFlags()
    for mod in str.split(separator: ",") {
        switch mod.lowercased().trimmingCharacters(in: .whitespaces) {
        case "cmd", "command":  flags.insert(.command)
        case "shift":           flags.insert(.shift)
        case "ctrl", "control": flags.insert(.control)
        case "alt", "option":   flags.insert(.option)
        default: break
        }
    }
    return flags
}

func parseKeyCode(_ str: String) -> UInt16 {
    // Common key codes (US keyboard layout)
    switch str.lowercased() {
    case "space":       return 49
    case "return":      return 36
    case "tab":         return 48
    case "escape", "esc": return 53
    case "f1":          return 122
    case "f2":          return 120
    case "f3":          return 99
    case "f4":          return 118
    case "f5":          return 96
    case "f6":          return 97
    case "f7":          return 98
    case "f8":          return 100
    case "f9":          return 101
    case "f10":         return 109
    case "f11":         return 103
    case "f12":         return 111
    case "a": return 0;  case "b": return 11; case "c": return 8;  case "d": return 2
    case "e": return 14; case "f": return 3;  case "g": return 5;  case "h": return 4
    case "i": return 34; case "j": return 38; case "k": return 40; case "l": return 37
    case "m": return 46; case "n": return 45; case "o": return 31; case "p": return 35
    case "q": return 12; case "r": return 15; case "s": return 1;  case "t": return 17
    case "u": return 32; case "v": return 9;  case "w": return 13; case "x": return 7
    case "y": return 16; case "z": return 6
    case "0": return 29; case "1": return 18; case "2": return 19; case "3": return 20
    case "4": return 21; case "5": return 23; case "6": return 22; case "7": return 26
    case "8": return 28; case "9": return 25
    default:
        fputs("error: unknown key '\(str)'\n", stderr)
        exit(1)
    }
}

let targetKeyCode = parseKeyCode(keyStr)
let targetModifiers = parseModifierFlags(modifiersStr)

// ---------------------------------------------------------------------------
// Accessibility check
// ---------------------------------------------------------------------------

if !AXIsProcessTrusted() {
    let opts = [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(opts)
    fputs("error:accessibility permission required. Grant access in System Settings → Privacy → Accessibility.\n", stderr)
    print("error:accessibility permission required")
    fflush(stdout)
    exit(1)
}

// ---------------------------------------------------------------------------
// Ensure trigger directory exists
// ---------------------------------------------------------------------------

let triggerURL = URL(fileURLWithPath: triggerPath)
let triggerDir = triggerURL.deletingLastPathComponent().path
try? FileManager.default.createDirectory(
    atPath: triggerDir, withIntermediateDirectories: true, attributes: nil
)

// ---------------------------------------------------------------------------
// NSApplication setup (required for global event monitoring)
// ---------------------------------------------------------------------------

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

// ---------------------------------------------------------------------------
// Global hotkey monitor
// ---------------------------------------------------------------------------

NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
    let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    if event.keyCode == targetKeyCode && mods.contains(targetModifiers) {
        // Write trigger file
        FileManager.default.createFile(atPath: triggerPath, contents: nil, attributes: nil)
        print("triggered")
        fflush(stdout)
    }
}

// ---------------------------------------------------------------------------
// Signal handling for clean shutdown
// ---------------------------------------------------------------------------

let sigSrc = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigSrc.setEventHandler {
    app.terminate(nil)
}
sigSrc.resume()
signal(SIGINT, SIG_IGN)

let sigTermSrc = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigTermSrc.setEventHandler {
    app.terminate(nil)
}
sigTermSrc.resume()
signal(SIGTERM, SIG_IGN)

// ---------------------------------------------------------------------------
// Ready
// ---------------------------------------------------------------------------

print("ready")
fflush(stdout)

// Run the Cocoa event loop
app.run()
