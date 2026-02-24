# AGENTS.md — Coding Agent Instructions

## Build & Test Commands

```bash
pnpm build               # Compile Swift binaries + TypeScript (swiftc + tsc)
pnpm test                 # Run all 107 tests once (vitest run)
pnpm run test:watch       # Watch mode (vitest)
pnpm exec vitest run src/__tests__/domain.test.ts          # Single test file
pnpm exec vitest run -t "starts recording when idle"       # Single test by name
pnpm exec tsc --noEmit    # Type-check without emitting
```

No linter or formatter is configured. TypeScript strict mode, ESM only.

## Architecture (Hexagonal / Ports & Adapters)

```
domain  ←  ports  ←  usecases  ←  adapters / factories / shells / plugin / CLI
```

### Dependency rule — strictly enforced

| Layer | May depend on | Must NOT depend on |
|-------|--------------|-------------------|
| `src/domain/` | nothing | ports, usecases, adapters |
| `src/ports/` | domain | usecases, adapters |
| `src/usecases/` | ports, domain | adapters, factories |
| `src/adapters/` | ports, domain, external libs | usecases |
| `src/factories/` | adapters, ports, config | usecases |
| `bin/`, plugin | factories, usecases, config | — |

Never import adapters from use cases. Never bypass ports.

### Key directories

| Path | Purpose |
|---|---|
| `src/domain/` | `Transcript`, `Recording` value objects; `SpeechError` hierarchy |
| `src/ports/` | `RecorderPort`, `TranscriberPort` contracts + assertion guards |
| `src/usecases/` | `toggleRecording`, `transcribeFile`, `recordAndTranscribe` |
| `src/adapters/` | `native-recorder`, `whisper-cpp-transcriber`, `openai-transcriber` |
| `src/factories/` | `createRecorder`, `createTranscriber` |
| `src/config/` | Config loading (file + env merge) |
| `src/__tests__/` | All tests (vitest) |
| `bin/heycode.ts` | CLI entry point (runs via `tsx`) |
| `.opencode/plugins/speech-plugin.js` | OpenCode plugin (plain JS — loaded externally) |
| `scripts/record.swift` | Native macOS recorder (AVFoundation + VAD) |
| `scripts/hotkey.swift` | Native macOS global hotkey listener |

## TypeScript Configuration

- `tsconfig.json`: `"module": "Node16"`, `"moduleResolution": "Node16"`, `"strict": true`, `"target": "ES2022"`, `outDir: "dist"`
- Import paths use `.js` extensions (Node16 resolution requires this even for `.ts` files)
- CLI entry point uses `#!/usr/bin/env tsx` shebang for direct execution
- vitest handles TypeScript natively — no compilation step for tests
- The OpenCode plugin stays plain JS (loaded by the OpenCode runtime)

## Code Style

### Module system
- ESM only (`"type": "module"`). All files use `import`/`export`.
- Always include `.js` extension in relative imports: `import { Foo } from "../domain/foo.js"`.

### Imports — ordering convention
1. External packages (`execa`, `commander`)
2. Node built-ins with `node:` prefix (`node:path`, `node:fs/promises`, `node:os`)
3. Internal domain/ports/usecases
4. Internal adapters/factories

### Formatting
- 2-space indentation, double quotes, no semicolons (ASI).
- Trailing commas in multiline argument lists.
- ~100 char line width (soft).

### Naming
- **Files**: kebab-case (`toggle-recording.ts`, `native-recorder.ts`).
- **Functions/variables**: camelCase (`createRecorder`, `toggleRecording`).
- **Classes**: PascalCase (`Transcript`, `Recording`, `SpeechError`).
- **Constants**: camelCase or UPPER_SNAKE for numeric constants (`START_TIMEOUT_MS`).
- **Factories**: `createXxx()` returning port-shaped plain objects.
- **Test files**: `<module-name>.test.ts` in `src/__tests__/`.

### Functions
- Prefer named `export function` for public API, `const fn = () =>` for private helpers.
- Use cases and adapters accept a destructured options object: `({ recorder, filePath })`.
- Factories accept a destructured config/opts object and return a port-shaped plain object.
- No classes for adapters — use factory functions returning object literals with methods.

### Types
- Use `interface` for port contracts and domain shapes.
- Use `type` for unions, intersections, and utility types.
- Avoid `any` except where truly necessary — add a comment explaining why.
- Prefer explicit return types on exported functions.

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
- **Location**: all tests in `src/__tests__/*.test.ts`.
- **Style**: behavior-driven — test names describe what the system does, not implementation.

### Mocking pattern for ports
```ts
const createMockRecorder = (overrides: Partial<RecorderPort> = {}): RecorderPort => ({
  start: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  stop: vi.fn().mockResolvedValue("/tmp/audio.wav"),
  status: vi.fn().mockResolvedValue(null),
  ...overrides,
})
```

### Mocking pattern for external modules
```ts
vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}))
const { createFoo } = await import("../adapters/foo.js")
const { execa } = await import("execa") as any   // as any: vi.mock replaces the module shape
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

## OpenCode Plugin

- The plugin file lives at `.opencode/plugins/speech-plugin.js` (plain JS — loaded by the OpenCode runtime).
- It is **symlinked** into the global OpenCode config: `~/.config/opencode/plugins/speech-plugin.js` → `.opencode/plugins/speech-plugin.js`.
- The plugin resolves the symlink at runtime via `fs.realpathSync(fileURLToPath(import.meta.url))` to find the real project root.
- Plugin dependency (`@opencode-ai/plugin`) is installed in `~/.config/opencode/` (global), not in the repo.
- Other deps (`execa`, etc.) resolve from the project's `node_modules/` via the symlink path.
- The `/speech` command is registered in `~/.config/opencode/opencode.json` (global config).
- Use `client.tui.showToast()` for all user-facing messages — never `console.error`.
- Must mutate existing `output.parts` in `command.execute.before` — never replace the array.

## Package Management

- **pnpm** (not npm) for all package management.
- `pnpm-lock.yaml` is committed; no `package-lock.json`.
- Plugin deps live in `~/.config/opencode/package.json` (global), not root `package.json`.

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.
- Don't commit compiled binaries (`scripts/record`, `scripts/hotkey` — gitignored).
- Don't commit `dist/`, `.opencode/node_modules/`, or `node_modules/`.
