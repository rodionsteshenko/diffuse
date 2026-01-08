import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { editor } from 'monaco-editor';
import { DiffViewer } from './components/DiffViewer';
import { NavigationBar } from './components/NavigationBar';
import { AIChatModal } from './components/AIChatModal';
import { useDiffNavigation } from './hooks/useDiffNavigation';
import { FileInfo } from './types';
import { generateDiff } from './utils/diff';
import './App.css';

function App() {
  const [beforeFile, setBeforeFile] = useState<FileInfo | null>(null);
  const [afterFile, setAfterFile] = useState<FileInfo | null>(null);
  const [beforeContent, setBeforeContent] = useState('');
  const [afterContent, setAfterContent] = useState('');
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
  const beforeFileRef = useRef<FileInfo | null>(null);
  const afterFileRef = useRef<FileInfo | null>(null);
  const lmStudioIntervalRef = useRef<number | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    beforeFileRef.current = beforeFile;
  }, [beforeFile]);

  useEffect(() => {
    afterFileRef.current = afterFile;
  }, [afterFile]);

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
    if (beforeContent && afterContent) {
      setAiMessages([]);
      setAiStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeContent, afterContent, beforeFile?.path, afterFile?.path]);

  // Generate initial AI summary when files are loaded and AI is available
  useEffect(() => {
    const generateInitialSummary = async () => {
      // Only generate if we have files, AI is available, and we don't already have messages
      if (!beforeContent || !afterContent || !isAIAvailable || aiMessages.length > 0) {
        return;
      }

      const beforeFileName = beforeFile?.path || 'Before File';
      const afterFileName = afterFile?.path || 'After File';

      // Generate diff and create prompt
      const diffText = generateDiff(beforeContent, afterContent, beforeFileName, afterFileName);
      const diffPrompt = `I'm analyzing a git diff showing changes to a file. Please provide a clear, concise summary.

**Diff:**
\`\`\`
${diffText}
\`\`\`

Analyze this diff and provide a summary. Start with a high-level overview of what functionality changed, was added, or removed. Then provide specific details.

## Summary

Start here with a concise 2-3 sentence overview: What overall functionality changed? What was added or removed at a high level? What's the purpose of these changes?

## Changes

### Additions
- New functionality, classes, functions, or features added

### Deletions  
- Functionality, classes, functions, or features removed

### Modifications
- Existing code that was changed or refactored

## Details

- Specific new classes, functions, or patterns introduced
- Notable implementation details or patterns

Keep it concise and focused. Write naturally, not mechanically. Format using proper markdown syntax.`;

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorMsg = { 
          role: 'assistant' as const, 
          content: `Error: ${errorMessage}` 
        };
        setAiMessages([userMessage, errorMsg]);
        setAiStatus('ready');
      }
    };

    generateInitialSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeContent, afterContent, isAIAvailable, beforeFile, afterFile]);

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
        
        // If LM Studio becomes available, stop checking
        if (available && lmStudioIntervalRef.current) {
          clearInterval(lmStudioIntervalRef.current);
          lmStudioIntervalRef.current = null;
        }
      } catch (error) {
        console.error('LM Studio check error:', error);
        setIsAIAvailable(false);
      }
    };
    
    // Check immediately
    checkLMStudio();
    
    // Only set up interval if LM Studio is not available
    // We'll check periodically until it becomes available
    lmStudioIntervalRef.current = setInterval(() => {
      checkLMStudio();
    }, 5000);
    
    return () => {
      if (lmStudioIntervalRef.current) {
        clearInterval(lmStudioIntervalRef.current);
        lmStudioIntervalRef.current = null;
      }
    };
  }, []);

  // Load files on mount
  useEffect(() => {
    const loadFiles = async () => {
      try {
        // Get CLI arguments
        const [beforePath, afterPath] = await invoke<[string | null, string | null]>('get_cli_args');

        if (!beforePath || !afterPath) {
          setError('Please provide two file paths as arguments.\nUsage: diffuse <before-file> <after-file>');
          setIsLoading(false);
          return;
        }

        // Resolve absolute paths (preserve original paths for display)
        const beforeAbsPath = await invoke<string>('get_absolute_path', { path: beforePath });
        const afterAbsPath = await invoke<string>('get_absolute_path', { path: afterPath });

        // Read file contents using absolute paths
        const beforeFileContent = await invoke<string>('read_file', { path: beforeAbsPath });
        const afterFileContent = await invoke<string>('read_file', { path: afterAbsPath });

        // Store both original path (for display) and absolute path (for operations)
        setBeforeFile({ path: beforePath, absolutePath: beforeAbsPath, content: beforeFileContent });
        setAfterFile({ path: afterPath, absolutePath: afterAbsPath, content: afterFileContent });
        setBeforeContent(beforeFileContent);
        setAfterContent(afterFileContent);
        setIsLoading(false);

        // Start watching files for changes (use absolute paths)
        await invoke('watch_files', {
          leftPath: beforeAbsPath,
          rightPath: afterAbsPath
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
      console.log('Current beforeFile:', beforeFileRef.current);
      console.log('Current afterFile:', afterFileRef.current);

      try {
        const newContent = await invoke<string>('read_file', { path: changedPath });
        console.log('Successfully read new content, length:', newContent.length);

        const currentBeforeFile = beforeFileRef.current;
        const currentAfterFile = afterFileRef.current;

        // Compare with absolute paths for file watching
        if (currentBeforeFile && changedPath === currentBeforeFile.absolutePath) {
          console.log('Updating BEFORE file');
          setBeforeFile({ ...currentBeforeFile, content: newContent });
          setBeforeContent(newContent);
        } else if (currentAfterFile && changedPath === currentAfterFile.absolutePath) {
          console.log('Updating AFTER file');
          setAfterFile({ ...currentAfterFile, content: newContent });
          setAfterContent(newContent);
        } else {
          console.log('Path does not match either file. Changed:', changedPath, 'Before:', currentBeforeFile?.absolutePath, 'After:', currentAfterFile?.absolutePath);
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
      // Longer delay to ensure Monaco has fully processed the changes and computed diffs
      // Monaco needs time to parse the content and compute the diff
      const timeoutId = setTimeout(() => {
        if (editorRef.current) {
          updateDiffChanges(editorRef.current);
        }
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [beforeContent, afterContent, updateDiffChanges]);

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

  // Keyboard shortcuts for zoom and window closing
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        increaseFontSize();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        decreaseFontSize();
      } else if (e.key === 'Escape') {
        // Close AI chat modal if open, otherwise close window
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (isAIChatOpen) {
          setIsAIChatOpen(false);
        } else {
          try {
            const appWindow = getCurrentWindow();
            await appWindow.close();
          } catch (error) {
            console.error('Error closing window:', error);
          }
        }
      }
    };

    // Use capture phase to catch Escape before Monaco Editor or other components handle it
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [increaseFontSize, decreaseFontSize, isAIChatOpen]);

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
        leftContent={beforeContent}
        rightContent={afterContent}
        leftPath={beforeFile?.path || ''}
        rightPath={afterFile?.path || ''}
        leftFileName={beforeFile?.path || 'Before File'}
        rightFileName={afterFile?.path || 'After File'}
        fontSize={fontSize}
        fontFamily={fontFamily}
        onMount={handleEditorMount}
        onDiffClick={handleDiffClick}
      />
      <AIChatModal
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        leftContent={beforeContent}
        rightContent={afterContent}
        leftFileName={beforeFile?.path || 'Before File'}
        rightFileName={afterFile?.path || 'After File'}
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
