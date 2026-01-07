# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diffuse is a visual diff and merge tool built with Tauri 2.0, React 19, and Monaco Editor. It's a lightweight (~5-10 MB) alternative to Electron-based diff tools, designed to compare files side-by-side with syntax highlighting and merge capabilities.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (opens app with two files)
npm run tauri dev -- path/to/file1.txt path/to/file2.txt

# Build frontend only (TypeScript compilation + Vite)
npm run build

# Build production application (creates executable)
npm run tauri build

# Build artifacts are in: src-tauri/target/release/
# macOS: .app bundle and .dmg installer in src-tauri/target/release/bundle/
```

## Architecture

### Frontend-Backend Communication

The application uses a **Tauri command pattern** where the React frontend invokes Rust backend commands:

- `read_file(path)` - Read file contents from disk
- `write_file(path, content)` - Write content to disk
- `get_absolute_path(path)` - Resolve relative paths to absolute
- `get_cli_args()` - Retrieve command-line arguments (left and right file paths)
- `watch_files(left_path, right_path)` - Start file watchers for external changes

Commands are invoked from React using `@tauri-apps/api/core`:
```typescript
import { invoke } from '@tauri-apps/api/core';
const content = await invoke<string>('read_file', { path: filePath });
```

### State Management Pattern

The app uses **React refs alongside state** to handle file watching edge cases:

- State (`leftFile`, `rightFile`) is used for rendering
- Refs (`leftFileRef`, `rightFileRef`) are used in event listeners to avoid stale closures
- This pattern is critical in `App.tsx` where the file-changed event listener needs current file paths

### Diff Navigation System

The `useDiffNavigation` hook manages:
- Current diff index tracking
- Monaco's line change detection via `editor.getLineChanges()`
- Keyboard navigation (Alt+↑/↓)
- Visual highlighting of the current diff using Monaco decorations

The hook updates diff changes with a 100ms delay to ensure Monaco has computed diffs after content changes.

### Copy Operations

Left-to-right and right-to-left copy operations handle three diff types:
1. **Insertions** (`originalEndLineNumber === 0` or `modifiedEndLineNumber === 0`)
2. **Deletions** (opposite side has `EndLineNumber === 0`)
3. **Modifications** (both sides have content)

Copy logic uses Monaco's `pushEditOperations` API to programmatically modify editor content.

### File Watching

The Rust backend spawns a thread with the `notify` crate (v7.0) to watch both files. When changes are detected:
1. Backend emits `file-changed` event with canonicalized path
2. Frontend listener in `App.tsx` matches path and reloads content
3. Monaco editor automatically shows updated diff

## Key Files

- `src-tauri/src/commands.rs` - All file I/O and file watching commands
- `src-tauri/src/lib.rs` - Tauri app setup, CLI argument parsing, command registration
- `src/App.tsx` - Main application logic, keyboard shortcuts, copy/save operations
- `src/components/DiffViewer.tsx` - Monaco DiffEditor wrapper with language detection
- `src/hooks/useDiffNavigation.ts` - Diff navigation state and keyboard handling
- `src/types/index.ts` - TypeScript type definitions

## Language Detection

Monaco syntax highlighting is determined by file extension in `DiffViewer.tsx:getLanguageFromPath()`. Supported languages include JavaScript, TypeScript, Python, Rust, Go, Java, C++, and 20+ others.

## Keyboard Shortcuts

All keyboard shortcuts are handled in `App.tsx`:
- `Alt + ↓/↑` - Navigate between diffs (also in useDiffNavigation hook)
- `Alt + →/←` - Copy current diff left-to-right or right-to-left
- `Cmd/Ctrl + S` - Save right file
- `Cmd/Ctrl + Shift + S` - Save left file
- `Cmd/Ctrl + +/-` - Increase/decrease font size
- `Cmd/Ctrl + Z` - Undo (handled by Monaco)
- `Cmd/Ctrl + Shift + Z` - Redo (handled by Monaco)

## Testing

No automated tests are currently in the project. To manually test:

```bash
# Test with sample files
npm run tauri dev -- test-left.txt test-right.txt
npm run tauri dev -- test-left.py test-right.py

# Test file watching: modify test files in another editor while app is open
```

## Dependencies

**Frontend:**
- `react` ^19.1.0 - UI framework
- `@monaco-editor/react` ^4.6.0 - Monaco editor wrapper
- `@tauri-apps/api` ^2 - Tauri API bindings
- `vite` ^7.0.4 - Build tool
- `typescript` ~5.8.3

**Backend (Rust):**
- `tauri` 2 - Desktop app framework
- `notify` 7.0 - File system watching
- `serde` / `serde_json` - Serialization for Tauri commands

## Build Requirements

- Node.js (with npm) - Frontend build
- Rust (with cargo) - Backend build
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Microsoft Visual Studio C++ Build Tools
