# speechctl

A macOS speech-to-text CLI powered by [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Records from your microphone via a native AVFoundation Swift binary, transcribes locally, and returns the text. Also ships an [OpenCode](https://opencode.ai) plugin for hands-free coding.

## Features

- **VAD auto-stop**: Recording stops automatically on silence (configurable threshold and duration)
- **Toggle mode**: Manually start/stop recording when VAD is disabled
- **Push-to-talk hotkey**: Global hotkey daemon (Cmd+Shift+Space) for continuous hands-free use
- **Streaming transcription**: Real-time feedback via `whisper-stream`
- **Multiple providers**: Local whisper.cpp (default) or OpenAI Whisper API
- **OpenCode plugin**: `/speech` command and `speech_record` tool for AI-assisted coding
- **Clean architecture**: Hexagonal (ports & adapters) with 107 tests

## Prerequisites

| Dependency | Install |
|---|---|
| Node.js >= 18 | `brew install node` |
| pnpm | `brew install pnpm` or `npm i -g pnpm` |
| whisper.cpp | `brew install whisper-cpp` |
| Whisper model | See [Model setup](#model-setup) below |
| macOS | Built-in AVFoundation, no extra install |

### Model setup

The default config uses `ggml-large-v3-turbo.bin` at `~/.local/share/whisper-cpp/models/`:

```bash
mkdir -p ~/.local/share/whisper-cpp/models
# Download the large-v3-turbo model (~1.5 GB, fast and accurate)
curl -L -o ~/.local/share/whisper-cpp/models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

> The Homebrew formula ships a test stub model at `/opt/homebrew/share/whisper-cpp/` that is too small to produce real transcriptions. Use a real model instead.

### Build the native recorder

The recorder is a Swift binary using AVFoundation. Compile it once:

```bash
swiftc scripts/record.swift -o scripts/record
```

For the hotkey daemon (optional, for push-to-talk):

```bash
swiftc scripts/hotkey.swift -o scripts/hotkey -framework Carbon
```

## Install

```bash
git clone <this-repo>
cd speechctl
pnpm install
```

### Link the CLI globally (optional)

```bash
pnpm link --global
# Now `speechctl` is available system-wide
```

## CLI usage

```bash
# Record with VAD auto-stop and transcribe
speechctl record --listen
speechctl record --listen --json

# Toggle recording (start/stop manually)
speechctl record
speechctl record          # call again to stop and transcribe

# Check recording status
speechctl record --status

# Transcribe an existing audio file
speechctl transcribe /path/to/audio.wav
speechctl transcribe --json /path/to/audio.wav

# Real-time streaming transcription
speechctl stream

# Push-to-talk hotkey daemon
speechctl daemon
speechctl daemon --key space --modifiers cmd,shift --clipboard
```

If you haven't linked the CLI, use `pnpm exec tsx bin/speechctl.ts` instead of `speechctl`.

## OpenCode plugin

The repo also provides an OpenCode plugin that exposes speechctl's capabilities inside OpenCode as a `/speech` slash command and a `speech_record` tool the LLM can invoke.

### Plugin installation

The plugin must be installed in OpenCode's **global** config directory (`~/.config/opencode/`), not in a project-local `.opencode/` folder. Three things need to happen:

#### 1. Copy the plugin file

```bash
mkdir -p ~/.config/opencode/plugins
cp .opencode/plugins/speech-plugin.js ~/.config/opencode/plugins/
```

The plugin uses absolute imports back into the speechctl repo, so the repo must stay in place (or you can update `projectRoot` in the plugin file).

#### 2. Add plugin dependencies

The plugin needs `@opencode-ai/sdk`, `@opencode-ai/plugin`, and `execa` in the global OpenCode `package.json`. Merge these into `~/.config/opencode/package.json`:

```jsonc
// ~/.config/opencode/package.json
{
  "type": "module",
  "dependencies": {
    "@opencode-ai/plugin": "1.2.10",
    "@opencode-ai/sdk": "^1.2.10",
    "execa": "^9.6.1"
  }
}
```

Then install:

```bash
cd ~/.config/opencode && npm install
```

#### 3. Register the `/speech` command

Add the `speech` command to `~/.config/opencode/opencode.json`:

```jsonc
{
  // ... existing config ...
  "command": {
    "speech": {
      "template": "",
      "description": "Toggle speech recording or transcribe an audio file"
    }
  }
}
```

### Using the plugin

#### /speech command

```
/speech              # VAD mode: start recording, auto-stops on silence
/speech              # Toggle mode (if VAD disabled): start/stop toggle
/speech path/to.wav  # Transcribe a file directly
```

With VAD enabled (default), a single `/speech` starts recording and auto-stops when you stop speaking. The transcript becomes the user message sent to the LLM. Without VAD, `/speech` toggles: first call starts, second call stops and transcribes.

#### speech_record tool

The LLM can invoke the `speech_record` tool to record and transcribe on your behalf. This enables voice-driven workflows where the AI asks you to speak.

## Configuration

Create `~/.config/speechd/config.json` to override defaults:

```json
{
  "capture": {
    "native": {
      "bin": "/path/to/record"
    },
    "vad": {
      "enabled": true,
      "silenceDuration": 1.0,
      "silenceThreshold": -40,
      "gracePeriod": 1.0
    },
    "hotkey": {
      "key": "space",
      "modifiers": "cmd,shift",
      "bin": "/path/to/hotkey"
    }
  },
  "provider": {
    "type": "whisper.cpp",
    "whisperCpp": {
      "bin": "whisper-cli",
      "model": "~/.local/share/whisper-cpp/models/ggml-large-v3-turbo.bin",
      "language": "auto",
      "threads": 8,
      "extraArgs": []
    },
    "openai": {
      "apiKey": "sk-...",
      "model": "whisper-1",
      "language": "en"
    },
    "streaming": {
      "bin": "whisper-stream",
      "stepMs": 3000,
      "lengthMs": 10000,
      "captureDevice": 0,
      "vadThreshold": 0.6
    }
  }
}
```

### Environment variables

| Variable | Description |
|---|---|
| `SPEECHD_CONFIG` | Path to config file (default: `~/.config/speechd/config.json`) |
| `SPEECHD_RECORDER_BIN` | Path to native recorder binary |
| `SPEECHD_VAD_ENABLED` | Enable/disable VAD (`true`/`false`) |
| `SPEECHD_VAD_SILENCE_DURATION` | Seconds of silence before auto-stop |
| `SPEECHD_VAD_SILENCE_THRESHOLD` | dB threshold for silence detection |
| `SPEECHD_VAD_GRACE_PERIOD` | Seconds before VAD activates |
| `SPEECHD_HOTKEY_KEY` | Hotkey key (default: `space`) |
| `SPEECHD_HOTKEY_MODIFIERS` | Hotkey modifiers (default: `cmd,shift`) |
| `SPEECHD_HOTKEY_BIN` | Path to hotkey daemon binary |
| `SPEECHD_PROVIDER` | Transcription provider (`whisper.cpp` or `openai`) |
| `SPEECHD_WHISPER_BIN` | Path to whisper-cli binary |
| `SPEECHD_WHISPER_MODEL` | Path to whisper model file |
| `SPEECHD_WHISPER_LANG` | Transcription language (`auto`, `en`, etc.) |
| `SPEECHD_WHISPER_THREADS` | Number of CPU threads |
| `SPEECHD_WHISPER_EXTRA_ARGS` | JSON array of extra args for whisper-cli |
| `OPENAI_API_KEY` | OpenAI API key (for openai provider) |
| `SPEECHD_STREAMING_BIN` | Path to whisper-stream binary |
| `SPEECHD_STREAMING_STEP_MS` | Streaming step interval (ms) |
| `SPEECHD_STREAMING_LENGTH_MS` | Streaming audio length (ms) |

### Configuration reference

| Key | Default | Description |
|---|---|---|
| `capture.native.bin` | `scripts/record` | Path to the compiled Swift recorder binary |
| `capture.vad.enabled` | `true` | Enable VAD silence-based auto-stop |
| `capture.vad.silenceDuration` | `1.0` | Seconds of silence before auto-stop |
| `capture.vad.silenceThreshold` | `-40` | dB threshold (more negative = more sensitive) |
| `capture.vad.gracePeriod` | `1.0` | Seconds before VAD activates (avoids false triggers) |
| `capture.hotkey.key` | `space` | Global hotkey key |
| `capture.hotkey.modifiers` | `cmd,shift` | Global hotkey modifiers |
| `capture.hotkey.bin` | `scripts/hotkey` | Path to the compiled Swift hotkey binary |
| `provider.type` | `whisper.cpp` | Transcription provider (`whisper.cpp` or `openai`) |
| `provider.whisperCpp.bin` | `whisper-cli` | whisper-cli binary name/path |
| `provider.whisperCpp.model` | `~/.local/share/.../ggml-large-v3-turbo.bin` | Path to whisper model |
| `provider.whisperCpp.language` | `auto` | Transcription language |
| `provider.whisperCpp.threads` | (system default) | CPU threads for transcription |
| `provider.whisperCpp.extraArgs` | `[]` | Extra CLI args for whisper-cli |
| `provider.openai.apiKey` | (none) | OpenAI API key |
| `provider.openai.model` | `whisper-1` | OpenAI Whisper model |
| `provider.openai.language` | (none) | Language hint for OpenAI |
| `provider.streaming.bin` | `whisper-stream` | whisper-stream binary name/path |
| `provider.streaming.stepMs` | `3000` | Streaming transcription step interval |
| `provider.streaming.lengthMs` | `10000` | Streaming audio buffer length |
| `provider.streaming.captureDevice` | (system default) | Audio capture device index |
| `provider.streaming.vadThreshold` | (system default) | Streaming VAD threshold |

## Architecture

Clean hexagonal architecture (ports & adapters) in TypeScript. Business logic has zero framework dependencies.

```
src/
  domain/              Value objects, error types (no dependencies)
    transcript.ts        Transcript value object (text + meta, immutable)
    recording.ts         Recording state value object (pid + path, immutable)
    errors.ts            Domain-specific error hierarchy (6 types)

  ports/               Interfaces (TypeScript contracts)
    recorder.ts          RecorderPort: start, stop, status, [waitForStop]
    transcriber.ts       TranscriberPort: transcribe(filePath) -> Transcript
    streaming-transcriber.ts  StreamingTranscriberPort: start, stop, isActive

  usecases/            Orchestration (depends only on ports + domain)
    toggle-recording.ts       Start if idle, stop if active
    transcribe-file.ts        Delegate to TranscriberPort
    record-and-transcribe.ts  Unified record+transcribe (VAD & toggle modes)
    start-and-wait-recording.ts  VAD-only record -> wait -> transcribe

  adapters/            Implementations of ports
    native-recorder.ts          macOS AVFoundation via Swift binary
    whisper-cpp-transcriber.ts  whisper-cli shell adapter
    openai-transcriber.ts       OpenAI Whisper API adapter
    whisper-stream-transcriber.ts  whisper-stream real-time adapter

  factories/           Wire config -> concrete adapters
    create-recorder.ts
    create-transcriber.ts
    create-streaming-transcriber.ts

  shells/              Integration orchestrators
    hotkey-daemon.ts     Global hotkey -> record -> transcribe daemon

  config/
    config.ts            Config loading (file + env merge)

  __tests__/           Tests (vitest, TypeScript)

bin/
  speechctl.ts         CLI entry point (thin shell, runs via tsx)

scripts/
  record.swift         Native macOS recorder source (AVFoundation + VAD)
  hotkey.swift         Native macOS global hotkey listener
  record               Compiled binary (gitignored)
  hotkey               Compiled binary (gitignored)
```

### Dependency rule

```
domain  <--  ports  <--  usecases  <--  adapters
                                    <--  factories
                                    <--  shells / plugin / CLI
```

- **Domain** depends on nothing.
- **Ports** depend only on domain types.
- **Use cases** depend only on ports and domain. Pure orchestration.
- **Adapters** implement ports, may depend on external libraries (execa, fs).
- **Factories** wire config to concrete adapters.
- **Shells, plugin, and CLI** are thin integration layers that wire factories and delegate to use cases.

## Tests

```bash
pnpm test              # Run once
pnpm run test:watch    # Watch mode
pnpm exec vitest run -t "test name"  # Single test
```

107 tests organized by behavior:

| File | Tests | What it covers |
|---|---|---|
| `domain.test.ts` | 15 | Transcript, Recording immutability & validation |
| `ports.test.ts` | 8 | Port assertion guards, supportsWaitForStop |
| `toggle-recording.test.ts` | 3 | Toggle use case with mocked RecorderPort |
| `transcribe-file.test.ts` | 3 | Transcribe use case with mocked TranscriberPort |
| `record-and-transcribe.test.ts` | 11 | Unified record+transcribe (VAD, toggle, callbacks) |
| `start-and-wait-recording.test.ts` | 8 | VAD record use case, waitForStop guard |
| `whisper-cpp-transcriber.test.ts` | 8 | Arg construction, text normalization, error wrapping |
| `openai-transcriber.test.ts` | 7 | API calls, normalization, error wrapping |
| `native-recorder.test.ts` | 12 | State persistence, start/stop, VAD flags |
| `streaming-transcriber.test.ts` | 13 | Port guard, args, onPartial, stop, isActive |
| `config.test.ts` | 8 | Config loading, merging, env override |
| `factories.test.ts` | 11 | Recorder, transcriber, streaming factory wiring |

## Future improvements

- Linux/Windows recorder adapters (PulseAudio, ffmpeg)
- Transcription caching and metadata storage
- Multi-language auto-detection
