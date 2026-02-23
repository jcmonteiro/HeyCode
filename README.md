# OpenCode Speech Plugin

Speech-to-text for [OpenCode](https://opencode.ai): record from your macOS microphone, transcribe locally with [whisper.cpp](https://github.com/ggerganov/whisper.cpp), and append the transcript to your current prompt.

## Prerequisites

| Dependency | Install |
|---|---|
| Node.js >= 18 | `brew install node` |
| whisper.cpp | `brew install whisper-cpp` |
| Whisper model | See [Model setup](#model-setup) below |
| macOS (for native recorder) | Built-in AVFoundation, no extra install |

### Model setup

The default config expects `ggml-tiny.en.bin` at `~/.local/share/whisper-cpp/models/`:

```bash
mkdir -p ~/.local/share/whisper-cpp/models
curl -L -o ~/.local/share/whisper-cpp/models/ggml-tiny.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin
```

> The Homebrew formula ships a test stub model at `/opt/homebrew/share/whisper-cpp/` that is too small to produce real transcriptions. Use a real model instead.

### Build the native recorder

The recorder is a Swift binary using AVFoundation. Compile it once:

```bash
swiftc scripts/record.swift -o scripts/record
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
/speech              # Start recording (toggle)
/speech              # Stop, transcribe, append to prompt
/speech path/to.wav  # Transcribe a file directly
```

### speech_record tool

The LLM can invoke the `speech_record` tool to record and transcribe on your behalf.

## CLI

```bash
# Check recording status
node bin/speechctl.js record --status

# Toggle recording (start/stop)
node bin/speechctl.js record

# Transcribe a file
node bin/speechctl.js transcribe /path/to/audio.wav
node bin/speechctl.js transcribe --json /path/to/audio.wav
```

## Configuration

Create `~/.config/speechd/config.json` to override defaults:

```json
{
  "capture": {
    "tool": "native"
  },
  "provider": {
    "type": "whisper.cpp",
    "whisperCpp": {
      "bin": "whisper-cli",
      "model": "~/.local/share/whisper-cpp/models/ggml-tiny.en.bin",
      "language": "auto"
    }
  }
}
```

Or use environment variables:

```bash
SPEECHD_WHISPER_BIN=whisper-cli
SPEECHD_WHISPER_MODEL=/path/to/model.bin
SPEECHD_WHISPER_LANG=en
SPEECHD_PROVIDER=openai          # switch to OpenAI Whisper API
OPENAI_API_KEY=sk-...
```

## Architecture

Clean architecture with ports & adapters (hexagonal). Business logic has zero framework dependencies.

```
src/
  domain/              Value objects, error types (no dependencies)
    transcript.js        Transcript value object (text + meta, immutable)
    recording.js         Recording state value object (pid + path, immutable)
    errors.js            Domain-specific error hierarchy

  ports/               Interfaces (contracts)
    recorder.js          RecorderPort: start, stop, status
    transcriber.js       TranscriberPort: transcribe(filePath) -> Transcript

  usecases/            Orchestration (depends only on ports + domain)
    toggle-recording.js  Start if idle, stop if active
    transcribe-file.js   Delegate to TranscriberPort

  adapters/            Implementations of ports
    native-recorder.js          macOS AVFoundation via Swift binary
    whisper-cpp-transcriber.js  whisper-cli shell adapter
    openai-transcriber.js       OpenAI Whisper API adapter

  factories/           Wire config -> concrete adapters
    create-recorder.js
    create-transcriber.js

  __tests__/           Tests (vitest)

bin/
  speechctl.js         CLI entry point (thin shell)

scripts/
  record.swift         Native macOS recorder source (AVFoundation)
  record               Compiled binary (gitignored)

.opencode/
  plugins/
    speech-plugin.js   OpenCode plugin (thin integration shell)
```

### Dependency rule

```
domain  <--  ports  <--  usecases  <--  adapters
                                    <--  factories
                                    <--  plugin / CLI
```

- **Domain** depends on nothing.
- **Ports** depend only on domain types.
- **Use cases** depend only on ports and domain.
- **Adapters** implement ports, may depend on external libraries (execa, fs).
- **Plugin and CLI** are thin shells that wire factories and delegate to use cases.

## Tests

```bash
npm test          # Run once
npm run test:watch  # Watch mode
```

Tests are organized by behavior:

| File | Tests | What it covers |
|---|---|---|
| `domain.test.js` | 15 | Transcript, Recording immutability & validation |
| `ports.test.js` | 5 | Port assertion guards |
| `toggle-recording.test.js` | 3 | Toggle use case with mocked RecorderPort |
| `transcribe-file.test.js` | 3 | Transcribe use case with mocked TranscriberPort |
| `whisper-cpp-transcriber.test.js` | 8 | Arg construction, text normalization, error wrapping |
| `factories.test.js` | 5 | Config-to-adapter wiring, validation |

## Future improvements

- VAD (voice activity detection) auto-stop with configurable silence threshold
- Push-to-talk hotkey integration (WezTerm/Kitty/iTerm profiles)
- Streaming transcription feedback in the TUI
- Linux/Windows recorder adapters (PulseAudio, ffmpeg)
- Larger whisper models (small, medium) with model selection
- Transcription caching and metadata storage
