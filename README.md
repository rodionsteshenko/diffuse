# DiffTool - Visual Diff & Merge Tool

A fast, modern visual diff tool built with Tauri, React, and Monaco Editor. Compare files side-by-side with syntax highlighting and merge changes with ease.

![DiffTool](https://img.shields.io/badge/Tauri-2.0-blue) ![React](https://img.shields.io/badge/React-19-blue) ![Monaco](https://img.shields.io/badge/Monaco-VS%20Code%20Editor-blue)

## Features

- **Side-by-side diff view** with Monaco Editor (same editor as VS Code)
- **Syntax highlighting** for 30+ programming languages
- **Navigate between changes** with Previous/Next buttons
- **Copy changes** from left to right or right to left
- **Save files** directly from the editor
- **Keyboard shortcuts** for efficient workflow
- **Command-line driven** - easy to integrate with git or other tools
- **Lightweight** - Small bundle size (~5-10 MB) thanks to Tauri

## Prerequisites

This guide assumes you have **Homebrew** installed. If you don't have Homebrew, install it from [brew.sh](https://brew.sh).

## Installation

### Step 1: Install Node.js and npm

Node.js includes npm (Node Package Manager):

```bash
brew install node
```

Verify the installation:
```bash
node --version
npm --version
```

### Step 2: Install Rust

Rust is required for building the Tauri backend:

```bash
brew install rust
```

Verify the installation:
```bash
rustc --version
cargo --version
```

### Step 3: Install macOS Prerequisites

Install Xcode Command Line Tools (required for building Rust projects):

```bash
xcode-select --install
```

### Step 4: Install Project Dependencies

Clone the repository (if you haven't already) and install npm dependencies:

```bash
cd difftool
npm install
```

This will install:
- React and React DOM
- Tauri CLI and API
- Monaco Editor
- TypeScript and Vite
- All other project dependencies

### Step 5: Build the Application

Build the application:

```bash
npm run tauri build
```

This creates a standalone executable in `src-tauri/target/release/`.

On macOS, you'll also find a `.app` bundle and `.dmg` installer in `src-tauri/target/release/bundle/`.

## Development

Run the app in development mode:

```bash
npm run tauri dev -- path/to/file1.txt path/to/file2.txt
```

The app will open with both files loaded in the diff viewer.

## Usage

### Command Line

```bash
# Development
npm run tauri dev -- file1.txt file2.txt

# Production (after building)
./difftool file1.txt file2.txt
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + ↓` | Navigate to next diff |
| `Alt + ↑` | Navigate to previous diff |
| `Alt + →` | Copy current diff from left to right |
| `Alt + ←` | Copy current diff from right to left |
| `Cmd/Ctrl + S` | Save right file |
| `Cmd/Ctrl + Shift + S` | Save left file |

### UI Controls

- **Previous/Next buttons**: Jump between diff regions
- **Left → Right**: Copy the current diff from the left file to the right file
- **Left ← Right**: Copy the current diff from the right file to the left file
- **Save Left/Right**: Save changes to the respective file

## Integration with Git

You can use DiffTool as a git difftool:

```bash
git config --global diff.tool difftool
git config --global difftool.difftool.cmd 'path/to/difftool "$LOCAL" "$REMOTE"'
git config --global difftool.prompt false

# Then use it:
git difftool file.txt
```

Or as a merge tool:

```bash
git config --global merge.tool difftool
git config --global mergetool.difftool.cmd 'path/to/difftool "$LOCAL" "$REMOTE"'
git config --global mergetool.prompt false
```

## Architecture

- **Backend**: Rust (Tauri) for native file system access
- **Frontend**: React 19 + TypeScript
- **Editor**: Monaco Editor (VS Code's editor)
- **Build tool**: Vite
- **Bundle size**: ~5-10 MB (vs 150+ MB for Electron)

## Project Structure

```
difftool/
├── src/                     # React frontend
│   ├── components/          # React components
│   │   ├── DiffViewer.tsx   # Monaco diff editor wrapper
│   │   └── NavigationBar.tsx # Toolbar with controls
│   ├── hooks/
│   │   └── useDiffNavigation.ts  # Navigation logic
│   ├── types/
│   │   └── index.ts         # TypeScript definitions
│   └── App.tsx              # Main application
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── commands.rs      # File I/O commands
│   │   ├── lib.rs           # App setup & CLI handling
│   │   └── main.rs          # Entry point
│   └── tauri.conf.json      # Tauri configuration
└── package.json
```

## Development Notes

### File System Access

The app uses Tauri commands to access the file system:
- `read_file(path)` - Read file contents
- `write_file(path, content)` - Write file contents
- `get_absolute_path(path)` - Resolve relative paths
- `get_cli_args()` - Get command-line arguments

### Monaco Editor API

The app uses Monaco's DiffEditor component with these key features:
- `getLineChanges()` - Get all diff regions
- `executeEdits()` - Programmatically edit content
- `revealLineInCenter()` - Scroll to a specific line

## Troubleshooting

**Monaco Editor not loading?**
- Run `npm install` to ensure @monaco-editor/react is installed
- Clear browser cache if running in dev mode

**Rust not found?**
- Install Rust with Homebrew: `brew install rust`
- Verify installation: `rustc --version`
- Restart your terminal after installation if needed

**Build fails on macOS?**
- Install Xcode Command Line Tools: `xcode-select --install`

**Build fails on Windows?**
- Install Microsoft Visual Studio C++ Build Tools

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Credits

Built with:
- [Tauri](https://tauri.app) - Lightweight desktop app framework
- [React](https://react.dev) - UI framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's editor
- [Vite](https://vite.dev) - Build tool
