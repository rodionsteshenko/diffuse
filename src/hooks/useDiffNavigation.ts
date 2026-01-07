import { useState, useCallback, useRef, useEffect } from 'react';
import type { editor } from 'monaco-editor';
import { DiffChange } from '../types';

export const useDiffNavigation = () => {
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0);
  const [diffChanges, setDiffChanges] = useState<DiffChange[]>([]);
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const updateDiffChanges = useCallback((editor: editor.IStandaloneDiffEditor) => {
    // Give Monaco time to compute diffs
    setTimeout(() => {
      const changes = editor.getLineChanges() || [];
      console.log('Diff changes detected:', changes.length);
      setDiffChanges(changes);
      if (changes.length > 0 && currentDiffIndex >= changes.length) {
        setCurrentDiffIndex(0);
      }
    }, 100);
  }, [currentDiffIndex]);

  const highlightCurrentDiff = useCallback(() => {
    if (!editorRef.current || diffChanges.length === 0) return;

    const modifiedEditor = editorRef.current.getModifiedEditor();
    const change = diffChanges[currentDiffIndex];

    if (!change) return;

    // Clear previous decorations
    if (decorationsRef.current.length > 0) {
      decorationsRef.current = modifiedEditor.deltaDecorations(decorationsRef.current, []);
    }

    // Add new decoration for current diff
    const startLine = change.modifiedStartLineNumber || 1;
    const endLine = change.modifiedEndLineNumber || startLine;

    decorationsRef.current = modifiedEditor.deltaDecorations([], [
      {
        range: new (window as any).monaco.Range(startLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: 'current-diff-highlight',
          glyphMarginClassName: 'current-diff-glyph',
        },
      },
    ]);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextDiff();
      } else if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        goToPreviousDiff();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
