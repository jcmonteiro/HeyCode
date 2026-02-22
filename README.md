# Speechd Prototype

Local speech daemon + CLI with Whisper.cpp, plus an OpenCode plugin to create new sessions from transcripts.

## Prerequisites

- Node.js (npm in PATH)
- OpenCode running with a server (TUI or `opencode serve`)
- macOS audio recording via `afrecord`

## Config

Create `~/.config/speechd/config.json`:

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
    "type": "openai",
    "openai": {
      "model": "whisper-1",
      "language": ""
    }
  }
}
```

Or use environment variables:

```
OPENAI_API_KEY=your-api-key
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
2. Transcribe the audio using OpenAI Whisper
3. Append the transcript to the **current session prompt**

You can also pass a file path to transcribe without recording:

```
/speech /path/to/audio.wav
```

Set `OPENCODE_SERVER_URL` if your OpenCode server runs on a custom URL.
```
OPENCODE_SERVER_URL=http://127.0.0.1:4096
```
