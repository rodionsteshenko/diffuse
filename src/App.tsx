import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { editor } from 'monaco-editor';
import { DiffViewer } from './components/DiffViewer';
import { NavigationBar } from './components/NavigationBar';
import { useDiffNavigation } from './hooks/useDiffNavigation';
import { FileInfo } from './types';
import './App.css';

function App() {
  const [leftFile, setLeftFile] = useState<FileInfo | null>(null);
  const [rightFile, setRightFile] = useState<FileInfo | null>(null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const lastFocusedEditorRef = useRef<'original' | 'modified'>('modified');

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

  // Track which editor was last focused for undo/redo
  const handleEditorFocus = useCallback((side: 'original' | 'modified') => {
    lastFocusedEditorRef.current = side;
  }, []);

  // Update diff changes when editor mounts or content changes
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

  // Copy operations
  const copyLeftToRight = useCallback(() => {
    if (!editorRef.current || totalDiffs === 0) return;

    const changes = editorRef.current.getLineChanges();
    if (!changes || changes.length === 0) return;

    const currentChange = changes[currentDiffIndex];
    const originalEditor = editorRef.current.getOriginalEditor();
    const modifiedEditor = editorRef.current.getModifiedEditor();
    const modifiedModel = modifiedEditor.getModel();
    if (!modifiedModel) return;

    if (currentChange.originalEndLineNumber === 0) {
      // Deletion in original - remove from modified
      modifiedModel.pushEditOperations(
        [],
        [{
          range: {
            startLineNumber: currentChange.modifiedStartLineNumber,
            startColumn: 1,
            endLineNumber: currentChange.modifiedEndLineNumber,
            endColumn: modifiedModel.getLineMaxColumn(currentChange.modifiedEndLineNumber) || 1,
          },
          text: '',
        }],
        () => null
      );
    } else {
      // Get content from original
      const originalModel = originalEditor.getModel();
      if (!originalModel) return;

      const textToCopy = originalModel.getValueInRange({
        startLineNumber: currentChange.originalStartLineNumber,
        startColumn: 1,
        endLineNumber: currentChange.originalEndLineNumber,
        endColumn: originalModel.getLineMaxColumn(currentChange.originalEndLineNumber),
      });

      // Replace in modified
      if (currentChange.modifiedEndLineNumber === 0) {
        // Insertion - add to modified
        const lineNumber = currentChange.modifiedStartLineNumber;
        modifiedModel.pushEditOperations(
          [],
          [{
            range: {
              startLineNumber: lineNumber,
              startColumn: 1,
              endLineNumber: lineNumber,
              endColumn: 1,
            },
            text: textToCopy + '\n',
          }],
          () => null
        );
      } else {
        // Modification - replace in modified
        modifiedModel.pushEditOperations(
          [],
          [{
            range: {
              startLineNumber: currentChange.modifiedStartLineNumber,
              startColumn: 1,
              endLineNumber: currentChange.modifiedEndLineNumber,
              endColumn: modifiedModel.getLineMaxColumn(currentChange.modifiedEndLineNumber) || 1,
            },
            text: textToCopy,
          }],
          () => null
        );
      }
    }

    // Note: setRightContent is handled by the onDidChangeModelContent listener in DiffViewer
  }, [currentDiffIndex, totalDiffs]);

  const copyRightToLeft = useCallback(() => {
    if (!editorRef.current || totalDiffs === 0) return;

    const changes = editorRef.current.getLineChanges();
    if (!changes || changes.length === 0) return;

    const currentChange = changes[currentDiffIndex];
    const originalEditor = editorRef.current.getOriginalEditor();
    const modifiedEditor = editorRef.current.getModifiedEditor();
    const originalModel = originalEditor.getModel();
    if (!originalModel) return;

    if (currentChange.modifiedEndLineNumber === 0) {
      // Deletion in modified - remove from original
      originalModel.pushEditOperations(
        [],
        [{
          range: {
            startLineNumber: currentChange.originalStartLineNumber,
            startColumn: 1,
            endLineNumber: currentChange.originalEndLineNumber,
            endColumn: originalModel.getLineMaxColumn(currentChange.originalEndLineNumber) || 1,
          },
          text: '',
        }],
        () => null
      );
    } else {
      // Get content from modified
      const modifiedModel = modifiedEditor.getModel();
      if (!modifiedModel) return;

      const textToCopy = modifiedModel.getValueInRange({
        startLineNumber: currentChange.modifiedStartLineNumber,
        startColumn: 1,
        endLineNumber: currentChange.modifiedEndLineNumber,
        endColumn: modifiedModel.getLineMaxColumn(currentChange.modifiedEndLineNumber),
      });

      // Replace in original
      if (currentChange.originalEndLineNumber === 0) {
        // Insertion - add to original
        const lineNumber = currentChange.originalStartLineNumber;
        originalModel.pushEditOperations(
          [],
          [{
            range: {
              startLineNumber: lineNumber,
              startColumn: 1,
              endLineNumber: lineNumber,
              endColumn: 1,
            },
            text: textToCopy + '\n',
          }],
          () => null
        );
      } else {
        // Modification - replace in original
        originalModel.pushEditOperations(
          [],
          [{
            range: {
              startLineNumber: currentChange.originalStartLineNumber,
              startColumn: 1,
              endLineNumber: currentChange.originalEndLineNumber,
              endColumn: originalModel.getLineMaxColumn(currentChange.originalEndLineNumber) || 1,
            },
            text: textToCopy,
          }],
          () => null
        );
      }
    }

    // Note: setLeftContent is handled by the onDidChangeModelContent listener in DiffViewer
  }, [currentDiffIndex, totalDiffs]);

  // Undo/Redo operations
  const handleUndo = useCallback(() => {
    if (!editorRef.current) return;

    const originalEditor = editorRef.current.getOriginalEditor();
    const modifiedEditor = editorRef.current.getModifiedEditor();

    // Use the last focused editor (tracked via focus events)
    if (lastFocusedEditorRef.current === 'original') {
      const model = originalEditor.getModel();
      if (model) {
        originalEditor.focus();
        model.undo();
      }
    } else {
      const model = modifiedEditor.getModel();
      if (model) {
        modifiedEditor.focus();
        model.undo();
      }
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (!editorRef.current) return;

    const originalEditor = editorRef.current.getOriginalEditor();
    const modifiedEditor = editorRef.current.getModifiedEditor();

    // Use the last focused editor (tracked via focus events)
    if (lastFocusedEditorRef.current === 'original') {
      const model = originalEditor.getModel();
      if (model) {
        originalEditor.focus();
        model.redo();
      }
    } else {
      const model = modifiedEditor.getModel();
      if (model) {
        modifiedEditor.focus();
        model.redo();
      }
    }
  }, []);

  // Save operations
  const saveLeft = useCallback(async () => {
    if (!leftFile || !editorRef.current) return;

    setIsSaving(true);
    try {
      const content = editorRef.current.getOriginalEditor().getValue();
      await invoke('write_file', { path: leftFile.absolutePath, content });
      setLeftFile({ ...leftFile, content });
      setLeftContent(content);
    } catch (err) {
      alert(`Failed to save left file: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [leftFile]);

  const saveRight = useCallback(async () => {
    if (!rightFile || !editorRef.current) return;

    setIsSaving(true);
    try {
      const content = editorRef.current.getModifiedEditor().getValue();
      await invoke('write_file', { path: rightFile.absolutePath, content });
      setRightFile({ ...rightFile, content });
      setRightContent(content);
    } catch (err) {
      alert(`Failed to save right file: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [rightFile]);

  // Font size controls
  const increaseFontSize = useCallback(() => {
    setFontSize(prev => Math.min(prev + 2, 40));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => Math.max(prev - 2, 8));
  }, []);

  // Keyboard shortcuts for copy, save, zoom, and undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        copyLeftToRight();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        copyRightToLeft();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          saveLeft();
        } else {
          saveRight();
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        increaseFontSize();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        decreaseFontSize();
      }
      // Note: Undo/Redo (Cmd+Z/Cmd+Shift+Z) are handled natively by Monaco Editor
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyLeftToRight, copyRightToLeft, saveLeft, saveRight, increaseFontSize, decreaseFontSize]);

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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor, overflow: 'hidden' }}>
      <NavigationBar
        currentDiffIndex={currentDiffIndex}
        totalDiffs={totalDiffs}
        onPrevious={goToPreviousDiff}
        onNext={goToNextDiff}
        onCopyLeftToRight={copyLeftToRight}
        onCopyRightToLeft={copyRightToLeft}
        onSaveLeft={saveLeft}
        onSaveRight={saveRight}
        onUndo={handleUndo}
        onRedo={handleRedo}
        leftFile={leftFile}
        rightFile={rightFile}
        isSaving={isSaving}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
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
        onContentChange={setRightContent}
        onLeftContentChange={setLeftContent}
        onDiffClick={handleDiffClick}
        onEditorFocus={handleEditorFocus}
      />
    </div>
  );
}

export default App;
