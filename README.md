# OpenCode Speech Plugin

Speech-to-text for [OpenCode](https://opencode.ai): record from your macOS microphone, transcribe locally with [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and append the transcript to your current prompt.

## Features

- **VAD auto-stop**: Recording auto-stops on silence (configurable threshold and duration)
- **Toggle mode**: Manually start/stop recording with `/speech` or the `speech_record` tool
- **Push-to-talk hotkey**: Global hotkey daemon (Cmd+Shift+Space) for hands-free recording
- **Streaming transcription**: Real-time feedback via `whisper-stream`
- **Dual interface**: `/speech` slash command + `speech_record` tool for LLM-initiated recording
- **Clean architecture**: Hexagonal (ports & adapters) with full test coverage

## Prerequisites

| Dependency | Install |
|---|---|
| Node.js >= 18 | `brew install node` |
| whisper.cpp | `brew install whisper-cpp` |
| Whisper model | See [Model setup](#model-setup) below |
| macOS (for native recorder) | Built-in AVFoundation, no extra install |

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

## Quick start

```bash
npm install

# Install plugin dependencies
cd .opencode && npm install && cd ..

# Run tests
npm test
```

## Usage in OpenCode

The plugin is auto-discovered from `.opencode/plugins/speech-plugin.js`.

### /speech command

```
/speech              # VAD mode: start recording, auto-stops on silence
/speech              # Toggle mode (if VAD disabled): start/stop toggle
/speech path/to.wav  # Transcribe a file directly
```

With VAD enabled (default), a single `/speech` starts recording and auto-stops when you stop speaking. Without VAD, `/speech` toggles: first call starts, second call stops and transcribes.

### speech_record tool

The LLM can invoke the `speech_record` tool to record and transcribe on your behalf.

## CLI

```bash
# Toggle recording (start/stop)
node bin/speechctl.js record

# Check recording status
node bin/speechctl.js record --status

# Record with VAD auto-stop and transcribe
node bin/speechctl.js record --listen
node bin/speechctl.js record --listen --json

# Transcribe a file
node bin/speechctl.js transcribe /path/to/audio.wav
node bin/speechctl.js transcribe --json /path/to/audio.wav

# Real-time streaming transcription
node bin/speechctl.js stream

# Push-to-talk hotkey daemon
node bin/speechctl.js daemon
node bin/speechctl.js daemon --key space --modifiers cmd,shift --clipboard
```

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
      "silenceDuration": 2.0,
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

### Configuration keys

| Key | Default | Description |
|---|---|---|
| `capture.native.bin` | `scripts/record` | Path to the compiled Swift recorder binary |
| `capture.vad.enabled` | `true` | Enable VAD silence-based auto-stop |
| `capture.vad.silenceDuration` | `2.0` | Seconds of silence before auto-stop |
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

Clean architecture with ports & adapters (hexagonal). Business logic has zero framework dependencies.

```
src/
  domain/              Value objects, error types (no dependencies)
    transcript.js        Transcript value object (text + meta, immutable)
    recording.js         Recording state value object (pid + path, immutable)
    errors.js            Domain-specific error hierarchy (6 types)

  ports/               Interfaces (contracts)
    recorder.js          RecorderPort: start, stop, status, [waitForStop]
    transcriber.js       TranscriberPort: transcribe(filePath) -> Transcript
    streaming-transcriber.js  StreamingTranscriberPort: start, stop, isActive

  usecases/            Orchestration (depends only on ports + domain)
    toggle-recording.js       Start if idle, stop if active
    transcribe-file.js        Delegate to TranscriberPort
    record-and-transcribe.js  Unified record+transcribe (VAD & toggle modes)
    start-and-wait-recording.js  VAD-only record → wait → transcribe

  adapters/            Implementations of ports
    native-recorder.js          macOS AVFoundation via Swift binary
    whisper-cpp-transcriber.js  whisper-cli shell adapter
    openai-transcriber.js       OpenAI Whisper API adapter
    whisper-stream-transcriber.js  whisper-stream real-time adapter

  factories/           Wire config -> concrete adapters
    create-recorder.js
    create-transcriber.js
    create-streaming-transcriber.js

  shells/              Integration orchestrators
    hotkey-daemon.js     Global hotkey → record → transcribe daemon

  config/
    config.js            Config loading (file + env merge)

  __tests__/           Tests (vitest)

bin/
  speechctl.js         CLI entry point (thin shell)

scripts/
  record.swift         Native macOS recorder source (AVFoundation + VAD)
  hotkey.swift         Native macOS global hotkey listener
  record               Compiled binary (gitignored)
  hotkey               Compiled binary (gitignored)

.opencode/
  plugins/
    speech-plugin.js   OpenCode plugin (thin integration shell)
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
npm test              # Run once
npm run test:watch    # Watch mode
npx vitest run -t "test name"  # Single test
```

Tests are organized by behavior:

| File | Tests | What it covers |
|---|---|---|
| `domain.test.js` | 15 | Transcript, Recording immutability & validation |
| `ports.test.js` | 8 | Port assertion guards, supportsWaitForStop |
| `toggle-recording.test.js` | 3 | Toggle use case with mocked RecorderPort |
| `transcribe-file.test.js` | 3 | Transcribe use case with mocked TranscriberPort |
| `record-and-transcribe.test.js` | 11 | Unified record+transcribe (VAD, toggle, callbacks) |
| `start-and-wait-recording.test.js` | 8 | VAD record use case, waitForStop guard |
| `whisper-cpp-transcriber.test.js` | 8 | Arg construction, text normalization, error wrapping |
| `openai-transcriber.test.js` | 7 | API calls, normalization, error wrapping |
| `native-recorder.test.js` | 10 | State persistence, start/stop, VAD flags |
| `streaming-transcriber.test.js` | 13 | Port guard, args, onPartial, stop, isActive |
| `config.test.js` | 8 | Config loading, merging, env override |
| `factories.test.js` | 11 | Recorder, transcriber, streaming factory wiring |

## Future improvements

- Linux/Windows recorder adapters (PulseAudio, ffmpeg)
- Transcription caching and metadata storage
- Multi-language auto-detection
