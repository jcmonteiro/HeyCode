# Speechd Prototype

Local speech daemon + CLI with Whisper.cpp, plus an OpenCode plugin to create new sessions from transcripts.

## Prerequisites

- Node.js (npm in PATH)
- Whisper.cpp binary and model
- OpenCode running with a server (TUI or `opencode serve`)

## Config

Create `~/.config/speechd/config.json`:

```json
{
  "server": { "host": "127.0.0.1", "port": 7331 },
  "provider": {
    "type": "whisper.cpp",
    "whisperCpp": {
      "bin": "/path/to/whisper.cpp/main",
      "model": "/path/to/ggml-base.bin",
      "language": "auto",
      "threads": 4,
      "extraArgs": []
    }
  }
}
```

Or use environment variables:

```
SPEECHD_WHISPER_BIN=/path/to/whisper.cpp/main
SPEECHD_WHISPER_MODEL=/path/to/ggml-base.bin
```

## Run

```bash
npm run speechd
```

## CLI

```bash
npm run speechctl -- transcribe /path/to/audio.wav
```

To create a new OpenCode session from an audio file:

```bash
npm run speechctl -- opencode /path/to/audio.wav
```

## OpenCode plugin

The plugin is loaded from `.opencode/plugins/speech-plugin.js` and adds a `/speech` command.

Usage in the OpenCode TUI:

```
/speech /path/to/audio.wav
```

This will:
1. Run `speechctl transcribe <file>`
2. Create a **new OpenCode session** with the transcription as the prompt

Set `OPENCODE_SERVER_URL` if your OpenCode server runs on a custom URL.
```
OPENCODE_SERVER_URL=http://127.0.0.1:4096
```
