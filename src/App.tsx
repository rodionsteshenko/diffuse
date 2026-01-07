import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { editor } from 'monaco-editor';
import { DiffViewer } from './components/DiffViewer';
import { NavigationBar } from './components/NavigationBar';
import { AIChatModal } from './components/AIChatModal';
import { useDiffNavigation } from './hooks/useDiffNavigation';
import { FileInfo } from './types';
import './App.css';

function App() {
  const [leftFile, setLeftFile] = useState<FileInfo | null>(null);
  const [rightFile, setRightFile] = useState<FileInfo | null>(null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isAIAvailable, setIsAIAvailable] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'ready'>('idle');

  // Debug logging for AI availability
  useEffect(() => {
    console.log('App - isAIAvailable state:', isAIAvailable);
  }, [isAIAvailable]);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('diffuse-fontSize');
    return saved ? parseInt(saved, 10) : 14;
  });
  const [fontFamily, setFontFamily] = useState(() => {
    const saved = localStorage.getItem('diffuse-fontFamily');
    return saved || 'Monaco';
  });

  // Detect system theme
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const leftFileRef = useRef<FileInfo | null>(null);
  const rightFileRef = useRef<FileInfo | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    leftFileRef.current = leftFile;
  }, [leftFile]);

  useEffect(() => {
    rightFileRef.current = rightFile;
  }, [rightFile]);

  const {
    currentDiffIndex,
    totalDiffs,
    goToNextDiff,
    goToPreviousDiff,
    updateDiffChanges,
    setCurrentDiffIndex,
    setEditorRef,
  } = useDiffNavigation();

  // Save font preferences to localStorage
  useEffect(() => {
    localStorage.setItem('diffuse-fontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('diffuse-fontFamily', fontFamily);
  }, [fontFamily]);

  // Clear AI messages when files change - always regenerate analysis
  useEffect(() => {
    // Clear messages whenever file content changes
    if (leftContent && rightContent) {
      setAiMessages([]);
      setAiStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftContent, rightContent, leftFile?.path, rightFile?.path]);

  // Generate initial AI summary when files are loaded and AI is available
  useEffect(() => {
    const generateInitialSummary = async () => {
      // Only generate if we have files, AI is available, and we don't already have messages
      if (!leftContent || !rightContent || !isAIAvailable || aiMessages.length > 0) {
        return;
      }

      const leftFileName = leftFile?.path || 'Left File';
      const rightFileName = rightFile?.path || 'Right File';

      // Generate the full prompt with complete file contents
      const diffPrompt = `I'm analyzing a git diff showing changes to a file. Please summarize the new changes being made.

**Before (${leftFileName}):**
\`\`\`
${leftContent}
\`\`\`

**After (${rightFileName}):**
\`\`\`
${rightContent}
\`\`\`

Please analyze this diff and summarize the changes using the following markdown template:

## Summary

Brief overview of what changed and why.

## Changes

### Additions
- List any new code, functions, or features added

### Deletions
- List any code, functions, or features removed

### Modifications
- List any existing code that was changed

## Patterns & Notable Differences

- Any patterns or notable differences observed

---

Focus on summarizing the new changes being made. Format your response exactly like this template, using proper markdown syntax.`;

      setAiStatus('thinking');
      const userMessage = { role: 'user' as const, content: diffPrompt };
      setAiMessages([userMessage]);

      try {
        const apiMessages = [{
          role: 'user',
          content: `You are a helpful assistant that analyzes code diffs and explains changes clearly.\n\n${diffPrompt}`,
        }];

        const response = await invoke<string>('send_lm_studio_message', { messages: apiMessages });
        const assistantMessage = { role: 'assistant' as const, content: response || 'No response received' };
        setAiMessages([userMessage, assistantMessage]);
        setAiStatus('ready');
      } catch (error) {
        const errorMessage = { 
          role: 'assistant' as const, 
          content: `Error: ${error instanceof Error ? error.message : String(error)}` 
        };
        setAiMessages([userMessage, errorMessage]);
        setAiStatus('ready');
      }
    };

    generateInitialSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftContent, rightContent, isAIAvailable, leftFile, rightFile]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Check if LM Studio is available using Rust command (logs to terminal)
  useEffect(() => {
    const checkLMStudio = async () => {
      try {
        const available = await invoke<boolean>('check_lm_studio_available');
        console.log('LM Studio available:', available);
        setIsAIAvailable(available);
      } catch (error) {
        console.error('LM Studio check error:', error);
        setIsAIAvailable(false);
      }
    };
    
    // Check immediately
    checkLMStudio();
    // Check every 5 seconds
    const interval = setInterval(checkLMStudio, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load files on mount
  useEffect(() => {
    const loadFiles = async () => {
      try {
        // Get CLI arguments
        const [leftPath, rightPath] = await invoke<[string | null, string | null]>('get_cli_args');

        if (!leftPath || !rightPath) {
          setError('Please provide two file paths as arguments.\nUsage: diffuse <left-file> <right-file>');
          setIsLoading(false);
          return;
        }

        // Resolve absolute paths (preserve original paths for display)
        const leftAbsPath = await invoke<string>('get_absolute_path', { path: leftPath });
        const rightAbsPath = await invoke<string>('get_absolute_path', { path: rightPath });

        // Read file contents using absolute paths
        const leftFileContent = await invoke<string>('read_file', { path: leftAbsPath });
        const rightFileContent = await invoke<string>('read_file', { path: rightAbsPath });

        // Store both original path (for display) and absolute path (for operations)
        setLeftFile({ path: leftPath, absolutePath: leftAbsPath, content: leftFileContent });
        setRightFile({ path: rightPath, absolutePath: rightAbsPath, content: rightFileContent });
        setLeftContent(leftFileContent);
        setRightContent(rightFileContent);
        setIsLoading(false);

        // Start watching files for changes (use absolute paths)
        await invoke('watch_files', {
          leftPath: leftAbsPath,
          rightPath: rightAbsPath
        });
      } catch (err) {
        setError(`Error loading files: ${err}`);
        setIsLoading(false);
      }
    };

    loadFiles();

    // Listen for file change events
    const unlisten = listen<string>('file-changed', async (event) => {
      const changedPath = event.payload;
      console.log('File changed event received:', changedPath);
      console.log('Current leftFile:', leftFileRef.current);
      console.log('Current rightFile:', rightFileRef.current);

      try {
        const newContent = await invoke<string>('read_file', { path: changedPath });
        console.log('Successfully read new content, length:', newContent.length);

        const currentLeftFile = leftFileRef.current;
        const currentRightFile = rightFileRef.current;

        // Compare with absolute paths for file watching
        if (currentLeftFile && changedPath === currentLeftFile.absolutePath) {
          console.log('Updating LEFT file');
          setLeftFile({ ...currentLeftFile, content: newContent });
          setLeftContent(newContent);
        } else if (currentRightFile && changedPath === currentRightFile.absolutePath) {
          console.log('Updating RIGHT file');
          setRightFile({ ...currentRightFile, content: newContent });
          setRightContent(newContent);
        } else {
          console.log('Path does not match either file. Changed:', changedPath, 'Left:', currentLeftFile?.absolutePath, 'Right:', currentRightFile?.absolutePath);
        }
      } catch (err) {
        console.error('Failed to reload file:', err);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Update diff changes when editor mounts
  const handleEditorMount = useCallback((editor: editor.IStandaloneDiffEditor) => {
    editorRef.current = editor;
    setEditorRef(editor);
    updateDiffChanges(editor);
  }, [setEditorRef, updateDiffChanges]);

  // Update diff changes when content changes
  useEffect(() => {
    if (editorRef.current) {
      // Small delay to ensure Monaco has processed the changes
      setTimeout(() => {
        if (editorRef.current) {
          updateDiffChanges(editorRef.current);
        }
      }, 100);
    }
  }, [leftContent, rightContent, updateDiffChanges]);

  // Handle click on a diff line to navigate to that diff
  const handleDiffClick = useCallback((lineNumber: number) => {
    if (!editorRef.current) return;

    const changes = editorRef.current.getLineChanges();
    if (!changes || changes.length === 0) return;

    // Find which diff contains the clicked line
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const inModified = lineNumber >= change.modifiedStartLineNumber &&
                        lineNumber <= change.modifiedEndLineNumber;
      const inOriginal = lineNumber >= change.originalStartLineNumber &&
                        lineNumber <= change.originalEndLineNumber;

      if (inModified || inOriginal) {
        // Navigate to this diff by setting the current index
        setCurrentDiffIndex(i);

        const modifiedEditor = editorRef.current.getModifiedEditor();
        const targetLine = change.modifiedStartLineNumber || change.modifiedEndLineNumber;
        if (targetLine > 0) {
          modifiedEditor.revealLineInCenter(targetLine);
        }
        break;
      }
    }
  }, [setCurrentDiffIndex]);

  // Font size controls
  const increaseFontSize = useCallback(() => {
    setFontSize(prev => Math.min(prev + 2, 40));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => Math.max(prev - 2, 8));
  }, []);

  // Keyboard shortcuts for zoom only (read-only mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        increaseFontSize();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        decreaseFontSize();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [increaseFontSize, decreaseFontSize]);

  const backgroundColor = isDarkMode ? '#1e1e1e' : '#ffffff';
  const textColor = isDarkMode ? '#cccccc' : '#333333';
  const errorColor = isDarkMode ? '#f48771' : '#d32f2f';

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor,
        color: textColor,
      }}>
        Loading files...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor,
        color: errorColor,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor, overflow: 'hidden', margin: 0, padding: 0 }}>
      <NavigationBar
        currentDiffIndex={currentDiffIndex}
        totalDiffs={totalDiffs}
        onPrevious={goToPreviousDiff}
        onNext={goToNextDiff}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
        onAIChatClick={() => setIsAIChatOpen(true)}
        isAIAvailable={isAIAvailable}
        aiStatus={aiStatus}
      />
      <DiffViewer
        leftContent={leftContent}
        rightContent={rightContent}
        leftPath={leftFile?.path || ''}
        rightPath={rightFile?.path || ''}
        leftFileName={leftFile?.path || 'Left File'}
        rightFileName={rightFile?.path || 'Right File'}
        fontSize={fontSize}
        fontFamily={fontFamily}
        onMount={handleEditorMount}
        onDiffClick={handleDiffClick}
      />
      <AIChatModal
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        leftContent={leftContent}
        rightContent={rightContent}
        leftFileName={leftFile?.path || 'Left File'}
        rightFileName={rightFile?.path || 'Right File'}
        isDarkMode={isDarkMode}
        isAIAvailable={isAIAvailable}
        initialMessages={aiMessages}
        onMessagesChange={setAiMessages}
        onStatusChange={setAiStatus}
      />
    </div>
  );
}

export default App;
