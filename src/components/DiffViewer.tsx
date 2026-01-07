import { useEffect, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface DiffViewerProps {
  leftContent: string;
  rightContent: string;
  leftPath: string;
  rightPath: string;
  fontSize: number;
  fontFamily: string;
  onMount?: (editor: editor.IStandaloneDiffEditor) => void;
  onContentChange?: (modifiedContent: string) => void;
  onLeftContentChange?: (originalContent: string) => void;
  onDiffClick?: (lineNumber: number) => void;
}

const getLanguageFromPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'json': 'json',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'cpp',
    'hpp': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'shell',
    'bash': 'shell',
    'sql': 'sql',
  };
  return languageMap[ext] || 'plaintext';
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
  leftContent,
  rightContent,
  leftPath: _leftPath,
  rightPath,
  fontSize,
  fontFamily,
  onMount,
  onContentChange,
  onLeftContentChange,
  onDiffClick,
}) => {
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const language = getLanguageFromPath(rightPath);

  // Detect system theme
  const [theme, setTheme] = useState<'vs-dark' | 'vs-light'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs-light';
    }
    return 'vs-dark';
  });

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'vs-dark' : 'vs-light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleEditorMount = (editor: editor.IStandaloneDiffEditor) => {
    editorRef.current = editor;

    // Listen for content changes in the modified (right) editor
    const modifiedEditor = editor.getModifiedEditor();
    modifiedEditor.onDidChangeModelContent(() => {
      const newContent = modifiedEditor.getValue();
      onContentChange?.(newContent);
    });

    // Listen for content changes in the original (left) editor
    const originalEditor = editor.getOriginalEditor();
    originalEditor.onDidChangeModelContent(() => {
      const newContent = originalEditor.getValue();
      onLeftContentChange?.(newContent);
    });

    // Listen for clicks to detect which diff was clicked
    modifiedEditor.onMouseDown((e) => {
      if (e.target.position) {
        onDiffClick?.(e.target.position.lineNumber);
      }
    });

    originalEditor.onMouseDown((e) => {
      if (e.target.position) {
        onDiffClick?.(e.target.position.lineNumber);
      }
    });

    onMount?.(editor);
  };

  useEffect(() => {
    // Update diff changes when content changes
    if (editorRef.current) {
      const changes = editorRef.current.getLineChanges();
      if (changes) {
        // Trigger a re-render of diff decorations
        editorRef.current.updateOptions({});
      }
    }
  }, [leftContent, rightContent]);

  return (
    <div style={{ height: 'calc(100vh - 100px)', width: '100%' }}>
      <DiffEditor
        original={leftContent}
        modified={rightContent}
        language={language}
        theme={theme}
        options={{
          renderSideBySide: true,
          readOnly: false,
          originalEditable: true, // Make the original (left) editor editable!
          scrollBeyondLastLine: false,
          minimap: { enabled: true },
          fontSize,
          fontFamily,
          lineNumbers: 'on',
          folding: true,
          wordWrap: 'off',
          automaticLayout: true,
          renderMarginRevertIcon: true, // Show revert icons in gutter (left→right only, by design)
        }}
        onMount={handleEditorMount}
      />
    </div>
  );
};
