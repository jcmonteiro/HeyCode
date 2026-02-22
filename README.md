# Speechd Prototype

Local speech daemon + CLI with Whisper.cpp, plus an OpenCode plugin to create new sessions from transcripts.

## Prerequisites

- Node.js (npm in PATH)
- OpenCode running with a server (TUI or `opencode serve`)
- macOS audio recording via `afrecord`
- Whisper.cpp (via Homebrew)

## Config

Create `~/.config/speechd/config.json` (defaults include Homebrew whisper-cli + tiny model):

```json
{
  "server": { "host": "127.0.0.1", "port": 7331 },
  "capture": {
    "tool": "afrecord",
    "afrecord": {
      "bin": "afrecord",
      "format": "cd",
      "type": "wav"
    }
  },
  "provider": {
    "type": "whisper.cpp",
    "whisperCpp": {
      "bin": "whisper-cli",
      "model": "/opt/homebrew/share/whisper-cpp/for-tests-ggml-tiny.bin",
      "language": "auto"
    }
  }
}
```

Or use environment variables:

```
SPEECHD_WHISPER_BIN=whisper-cli
SPEECHD_WHISPER_MODEL=/opt/homebrew/share/whisper-cpp/for-tests-ggml-tiny.bin
```

## Run

```bash
npm run speechd
```

## CLI

```bash
npm run speechctl -- transcribe /path/to/audio.wav
```

## OpenCode plugin

The plugin is loaded from `.opencode/plugins/speech-plugin.js` and adds a `/speech` command.

Usage in the OpenCode TUI:

```
/speech
```

This will:
1. Toggle macOS recording with `afrecord`
2. Transcribe the audio using whisper.cpp
3. Append the transcript to the **current session prompt**

You can also pass a file path to transcribe without recording:

```
/speech /path/to/audio.wav
```

Set `OPENCODE_SERVER_URL` if your OpenCode server runs on a custom URL.
```
OPENCODE_SERVER_URL=http://127.0.0.1:4096
```

## Improvements / Next Steps

- Add VAD auto-stop and configurable silence threshold
- Add push-to-talk hotkey integration per terminal (WezTerm/Kitty/iTerm profiles)
- Support local Whisper.cpp model downloads and model selection
- Add streaming transcription feedback in the TUI
- Add permissions/consent prompts before microphone capture
- Add Windows/Linux capture adapters (ffmpeg/arecord/sox)
- Add transcription caching + metadata storage
