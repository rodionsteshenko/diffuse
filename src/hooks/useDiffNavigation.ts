import { useState, useCallback, useRef, useEffect } from 'react';
import type { editor } from 'monaco-editor';
import { DiffChange } from '../types';

export const useDiffNavigation = () => {
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0);
  const [diffChanges, setDiffChanges] = useState<DiffChange[]>([]);
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const originalDecorationsRef = useRef<string[]>([]);
  const modifiedDecorationsRef = useRef<string[]>([]);

  const updateDiffChanges = useCallback((editor: editor.IStandaloneDiffEditor) => {
    // Give Monaco time to compute diffs
    setTimeout(() => {
      const changes = editor.getLineChanges() || [];
      console.log('Diff changes detected:', changes.length);
      setDiffChanges(changes);
      // Only adjust index if it's out of bounds, but keep it as close as possible
      // instead of jumping to 0
      if (changes.length > 0 && currentDiffIndex >= changes.length) {
        setCurrentDiffIndex(changes.length - 1);
      } else if (changes.length === 0) {
        setCurrentDiffIndex(0);
      }
    }, 100);
  }, [currentDiffIndex]);

  const highlightCurrentDiff = useCallback(() => {
    if (!editorRef.current || diffChanges.length === 0) return;

    const originalEditor = editorRef.current.getOriginalEditor();
    const modifiedEditor = editorRef.current.getModifiedEditor();
    const change = diffChanges[currentDiffIndex];

    if (!change) return;

    // Clear previous decorations from both editors
    if (originalDecorationsRef.current.length > 0) {
      originalDecorationsRef.current = originalEditor.deltaDecorations(originalDecorationsRef.current, []);
    }
    if (modifiedDecorationsRef.current.length > 0) {
      modifiedDecorationsRef.current = modifiedEditor.deltaDecorations(modifiedDecorationsRef.current, []);
    }

    // Add decorations to both editors
    // Highlight original side (left)
    if (change.originalStartLineNumber > 0 && change.originalEndLineNumber > 0) {
      const originalStart = change.originalStartLineNumber;
      const originalEnd = change.originalEndLineNumber;
      originalDecorationsRef.current = originalEditor.deltaDecorations([], [
        {
          range: new (window as any).monaco.Range(originalStart, 1, originalEnd, 1),
          options: {
            isWholeLine: true,
            className: 'current-diff-highlight',
            glyphMarginClassName: 'current-diff-glyph',
          },
        },
      ]);
    } else {
      originalDecorationsRef.current = [];
    }

    // Highlight modified side (right)
    if (change.modifiedStartLineNumber > 0) {
      const modifiedStart = change.modifiedStartLineNumber;
      const modifiedEnd = change.modifiedEndLineNumber > 0 ? change.modifiedEndLineNumber : modifiedStart;
      modifiedDecorationsRef.current = modifiedEditor.deltaDecorations([], [
        {
          range: new (window as any).monaco.Range(modifiedStart, 1, modifiedEnd, 1),
          options: {
            isWholeLine: true,
            className: 'current-diff-highlight',
            glyphMarginClassName: 'current-diff-glyph',
          },
        },
      ]);
    } else {
      modifiedDecorationsRef.current = [];
    }
  }, [diffChanges, currentDiffIndex]);

  const goToNextDiff = useCallback(() => {
    if (diffChanges.length === 0) return;

    const nextIndex = (currentDiffIndex + 1) % diffChanges.length;
    setCurrentDiffIndex(nextIndex);

    if (editorRef.current) {
      const change = diffChanges[nextIndex];
      const lineNumber = change.modifiedStartLineNumber || change.originalStartLineNumber;
      editorRef.current.revealLineInCenter(lineNumber);
    }
  }, [currentDiffIndex, diffChanges]);

  const goToPreviousDiff = useCallback(() => {
    if (diffChanges.length === 0) return;

    const prevIndex = currentDiffIndex === 0 ? diffChanges.length - 1 : currentDiffIndex - 1;
    setCurrentDiffIndex(prevIndex);

    if (editorRef.current) {
      const change = diffChanges[prevIndex];
      const lineNumber = change.modifiedStartLineNumber || change.originalStartLineNumber;
      editorRef.current.revealLineInCenter(lineNumber);
    }
  }, [currentDiffIndex, diffChanges]);

  // Highlight current diff when it changes
  useEffect(() => {
    highlightCurrentDiff();
  }, [currentDiffIndex, diffChanges, highlightCurrentDiff]);

  useEffect(() => {
    let lastNavigationTime = 0;
    const NAVIGATION_THROTTLE = 30; // ms between navigations when holding key (reduced for better responsiveness)

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Alt/Option key (on Mac, Option key sets altKey to true)
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Throttle rapid key presses for smoother navigation when holding the key
        const now = Date.now();
        if (now - lastNavigationTime < NAVIGATION_THROTTLE) {
          return;
        }
        lastNavigationTime = now;

        if (e.key === 'ArrowDown') {
          goToNextDiff();
        } else if (e.key === 'ArrowUp') {
          goToPreviousDiff();
        }
      }
    };

    // Use capture phase to catch events before Monaco Editor processes them
    // This ensures our handler runs first, even when the editor is focused
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [goToNextDiff, goToPreviousDiff]);

  return {
    currentDiffIndex,
    diffChanges,
    totalDiffs: diffChanges.length,
    goToNextDiff,
    goToPreviousDiff,
    updateDiffChanges,
    setCurrentDiffIndex,
    setEditorRef: (editor: editor.IStandaloneDiffEditor | null) => {
      editorRef.current = editor;
    },
  };
};
