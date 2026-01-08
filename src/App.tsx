import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
  const [editedBeforeContent, setEditedBeforeContent] = useState('');
  const [editedAfterContent, setEditedAfterContent] = useState('');
  const [leftFileSaved, setLeftFileSaved] = useState(true);
  const [rightFileSaved, setRightFileSaved] = useState(true);
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
    const size = saved ? parseInt(saved, 10) : 14;
    // Cap font size between 6 and 32
    return Math.max(6, Math.min(32, size));
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
    // Ensure font size is within valid range (6-32)
    const clampedSize = Math.max(6, Math.min(32, fontSize));
    localStorage.setItem('diffuse-fontSize', clampedSize.toString());
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
        
        // If LM Studio is not available, stop checking after first failure
        if (!available && lmStudioIntervalRef.current) {
          clearInterval(lmStudioIntervalRef.current);
          lmStudioIntervalRef.current = null;
        }
      } catch (error) {
        console.error('LM Studio check error:', error);
        setIsAIAvailable(false);
        // Stop checking on error
        if (lmStudioIntervalRef.current) {
          clearInterval(lmStudioIntervalRef.current);
          lmStudioIntervalRef.current = null;
        }
      }
    };
    
    // Check immediately
    checkLMStudio();
    
    // Set up interval to check every 30 seconds
    // Will stop automatically if LM Studio becomes available or fails
    lmStudioIntervalRef.current = setInterval(() => {
      checkLMStudio();
    }, 30000); // 30 seconds
    
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
        setEditedBeforeContent(beforeFileContent);
        setEditedAfterContent(afterFileContent);
        setLeftFileSaved(true);
        setRightFileSaved(true);
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
        // Only update if the file wasn't just saved by us (to avoid overwriting our edits)
        if (currentBeforeFile && changedPath === currentBeforeFile.absolutePath) {
          console.log('Updating BEFORE file');
          setBeforeFile({ ...currentBeforeFile, content: newContent });
          setBeforeContent(newContent);
          setEditedBeforeContent(newContent);
          setLeftFileSaved(true);
        } else if (currentAfterFile && changedPath === currentAfterFile.absolutePath) {
          console.log('Updating AFTER file');
          setAfterFile({ ...currentAfterFile, content: newContent });
          setAfterContent(newContent);
          setEditedAfterContent(newContent);
          setRightFileSaved(true);
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

  // Handle content changes from editors
  const handleLeftContentChange = useCallback((content: string) => {
    setEditedBeforeContent(content);
    // Compare with the last saved content (beforeContent)
    setLeftFileSaved(content === beforeContent);
  }, [beforeContent]);

  const handleRightContentChange = useCallback((content: string) => {
    setEditedAfterContent(content);
    // Compare with the last saved content (afterContent)
    setRightFileSaved(content === afterContent);
  }, [afterContent]);

  // Save files
  const saveFiles = useCallback(async () => {
    if (!beforeFile || !afterFile) return;

    try {
      // Save left file if it has unsaved changes
      if (!leftFileSaved && editedBeforeContent !== beforeContent) {
        await invoke('write_file', { 
          path: beforeFile.absolutePath, 
          content: editedBeforeContent 
        });
        setBeforeContent(editedBeforeContent);
        setBeforeFile({ ...beforeFile, content: editedBeforeContent });
        setLeftFileSaved(true);
      }

      // Save right file if it has unsaved changes
      if (!rightFileSaved && editedAfterContent !== afterContent) {
        await invoke('write_file', { 
          path: afterFile.absolutePath, 
          content: editedAfterContent 
        });
        setAfterContent(editedAfterContent);
        setAfterFile({ ...afterFile, content: editedAfterContent });
        setRightFileSaved(true);
      }
    } catch (err) {
      setError(`Error saving files: ${err}`);
      console.error('Error saving files:', err);
    }
  }, [beforeFile, afterFile, leftFileSaved, rightFileSaved, editedBeforeContent, editedAfterContent, beforeContent, afterContent]);

  // Font size controls (capped between 6 and 32)
  const increaseFontSize = useCallback(() => {
    setFontSize(prev => Math.min(prev + 1, 32));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => Math.max(prev - 1, 6));
  }, []);

  // Font family cycling (wraps around at ends)
  const cycleFontFamily = useCallback((direction: 'up' | 'down') => {
    const FONT_FAMILIES = ['Monaco', 'Menlo', 'PT Mono', 'Courier', 'Courier New'];
    const currentIndex = FONT_FAMILIES.indexOf(fontFamily);
    let newIndex: number;
    
    if (currentIndex === -1) {
      // Current font not in list, start from beginning
      newIndex = 0;
    } else {
      newIndex = currentIndex;
    }
    
    if (direction === 'up') {
      // Cycle forward, wrap to beginning if at end
      newIndex = (newIndex + 1) % FONT_FAMILIES.length;
    } else {
      // Cycle backward, wrap to end if at beginning
      newIndex = (newIndex - 1 + FONT_FAMILIES.length) % FONT_FAMILIES.length;
    }
    
    setFontFamily(FONT_FAMILIES[newIndex]);
  }, [fontFamily]);

  // Keyboard shortcuts for zoom, save, window closing, and font cycling
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Handle Escape key everywhere (even in Monaco editor)
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (isAIChatOpen) {
          setIsAIChatOpen(false);
        } else {
          try {
            await invoke('close_app');
          } catch (error) {
            console.error('Error closing app:', error);
          }
        }
        return;
      }

      // Handle font/zoom shortcuts even in Monaco editor (contentEditable)
      // Only skip for actual INPUT/TEXTAREA elements
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Handle font size and font family shortcuts everywhere (including Monaco editor)
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        increaseFontSize();
        return;
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        decreaseFontSize();
        return;
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '9' || e.code === 'Digit9')) {
        // Cmd+9: Cycle font family down
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        cycleFontFamily('down');
        return;
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '0' || e.code === 'Digit0')) {
        // Cmd+0: Cycle font family up
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        cycleFontFamily('up');
        return;
      }

      // Don't handle other shortcuts when typing in actual input fields
      if (isInputField) {
        // Allow Ctrl+S in input fields to save
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          await saveFiles();
        }
        return;
      }

      // Handle save shortcut
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        // Save files with Ctrl+S (or Cmd+S on Mac)
        e.preventDefault();
        e.stopPropagation();
        await saveFiles();
      }
    };

    // Use capture phase to catch shortcuts before Monaco Editor or other components handle them
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [increaseFontSize, decreaseFontSize, isAIChatOpen, saveFiles, cycleFontFamily]);

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
        leftFileSaved={leftFileSaved}
        rightFileSaved={rightFileSaved}
      />
      <DiffViewer
        leftContent={beforeContent}
        rightContent={afterContent}
        editedLeftContent={editedBeforeContent}
        editedRightContent={editedAfterContent}
        leftPath={beforeFile?.path || ''}
        rightPath={afterFile?.path || ''}
        leftFileName={beforeFile?.path || 'Before File'}
        rightFileName={afterFile?.path || 'After File'}
        fontSize={fontSize}
        fontFamily={fontFamily}
        onMount={handleEditorMount}
        onDiffClick={handleDiffClick}
        onLeftContentChange={handleLeftContentChange}
        onRightContentChange={handleRightContentChange}
        onNavigateNext={goToNextDiff}
        onNavigatePrevious={goToPreviousDiff}
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
