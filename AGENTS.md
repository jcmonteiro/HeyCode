# AGENTS.md — Coding Agent Instructions

## Build & Test Commands

```bash
npm test                 # Run all tests once (vitest run)
npm run test:watch       # Watch mode (vitest)
npx vitest run src/__tests__/domain.test.js          # Single test file
npx vitest run -t "starts recording when idle"       # Single test by name
```

No linter or formatter is configured. No TypeScript — plain ESM JavaScript only.

## Architecture (Hexagonal / Ports & Adapters)

```
domain  ←  ports  ←  usecases  ←  adapters / factories / plugin / CLI
```

### Dependency rule — strictly enforced

- **`src/domain/`** depends on nothing. Value objects, error types only.
- **`src/ports/`** depends only on domain types. Defines contracts (interfaces via JSDoc `@typedef`).
- **`src/usecases/`** depends only on ports and domain. Pure orchestration — never imports adapters.
- **`src/adapters/`** implements ports. May depend on external libs (`execa`, `node:fs`).
- **`src/factories/`** wires config → concrete adapters. Only place that knows which adapter to instantiate.
- **`bin/`** and **`.opencode/plugins/`** are thin shells: load config, call factories, delegate to use cases.

Never import adapters from use cases. Never import use cases from domain. Never bypass ports.

### Key directories

| Path | Purpose |
|---|---|
| `src/domain/` | `Transcript`, `Recording` value objects; `SpeechError` hierarchy |
| `src/ports/` | `RecorderPort`, `TranscriberPort` contracts + assertion guards |
| `src/usecases/` | `toggleRecording`, `transcribeFile` |
| `src/adapters/` | `native-recorder`, `whisper-cpp-transcriber`, `openai-transcriber` |
| `src/factories/` | `createRecorder`, `createTranscriber` |
| `src/config/` | Config loading (file + env merge) |
| `src/__tests__/` | All tests |
| `bin/speechctl.js` | CLI entry point |
| `.opencode/plugins/speech-plugin.js` | OpenCode plugin (thin shell) |
| `scripts/record.swift` | Native macOS recorder source |

## Code Style

### Module system
- ESM only (`"type": "module"` in package.json). All files use `import`/`export`.
- Always include `.js` extension in relative imports: `import { Foo } from "../domain/foo.js"`.

### Imports — ordering convention
1. External packages (`execa`, `commander`, `@opencode-ai/plugin`)
2. Node built-ins with `node:` prefix (`node:path`, `node:fs/promises`, `node:os`)
3. Internal domain/ports/usecases
4. Internal adapters/factories

### Formatting
- 2-space indentation.
- Double quotes for strings.
- No semicolons (ASI).
- Trailing commas in multiline argument lists.
- ~100 char line width (soft).

### Naming
- **Files**: kebab-case (`toggle-recording.js`, `native-recorder.js`).
- **Functions/variables**: camelCase (`createRecorder`, `toggleRecording`).
- **Classes**: PascalCase (`Transcript`, `Recording`, `SpeechError`).
- **Constants**: camelCase or UPPER_SNAKE for numeric constants (`START_TIMEOUT_MS`).
- **Factories**: `createXxx()` functions that return port-shaped plain objects.
- **Test files**: `<module-name>.test.js` in `src/__tests__/`.

### Functions
- Prefer named `export function` for public API, `const fn = () =>` for private helpers.
- Use cases and adapters accept a destructured options object: `({ recorder, filePath })`.
- Factories accept a destructured config/opts object and return a port-shaped plain object.
- No classes for adapters — use factory functions returning object literals with methods.

### Types
- Plain JavaScript with JSDoc annotations for type documentation.
- Use `@typedef` for port interfaces (in port files).
- Use `@param`, `@returns`, `@readonly` on constructors and public functions.
- Reference types cross-file via `import()` syntax: `@returns {import('../ports/recorder.js').RecorderPort}`.

### Domain objects
- Value objects are frozen (`Object.freeze(this)`) and validate in the constructor.
- Throw `TypeError` for invalid construction args.
- Use getters for derived properties (e.g. `get isEmpty()`).
- Represent absent state as `null`, not a special "empty" instance.

### Error handling
- All domain errors extend `SpeechError` (which extends `Error`).
- Set `this.name` to the class name in every error constructor.
- Adapters wrap external failures in domain errors (`TranscriptionFailedError`).
- Plugin toast helpers silently catch — TUI may not be ready. Use `try { } catch { }`.
- CLI uses `process.stdout.write()`, not `console.log()`.

## Testing Conventions

- **Framework**: vitest (v4+). Import `{ describe, it, expect, vi }` from `"vitest"`.
- **Location**: all tests in `src/__tests__/*.test.js`.
- **Style**: behavior-driven — test names describe what the system does, not implementation.

### Mocking pattern for ports
```js
const createMockRecorder = (overrides = {}) => ({
  start: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  stop: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  status: vi.fn().mockResolvedValue(null),
  ...overrides,
})
```

### Mocking pattern for external modules
```js
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}))
const { createFoo } = await import("../adapters/foo.js")
const { execa } = await import("execa")
```

Use `vi.spyOn(fs, "readFile")` for node:fs mocks. Call `vi.restoreAllMocks()` in `beforeEach`.

### What to test
- Domain: immutability, validation, derived properties.
- Ports: assertion guards accept/reject shapes.
- Use cases: behavior with mocked ports (start/stop/error propagation).
- Adapters: argument construction, output normalization, error wrapping (mock externals).
- Factories: correct adapter selection from config, config validation errors.

### What NOT to test
- Don't integration-test the actual recorder binary or whisper-cli in unit tests.
- Don't test the OpenCode plugin directly (depends on `@opencode-ai/plugin` runtime).

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.
- Don't commit `scripts/record` (compiled binary — gitignored).
- Don't commit `.opencode/node_modules/`.
- Plugin deps live in `.opencode/package.json`, not root `package.json`.
