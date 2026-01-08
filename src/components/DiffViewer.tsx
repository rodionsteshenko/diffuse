import { useEffect, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface DiffViewerProps {
  leftContent: string;
  rightContent: string;
  leftPath: string;
  rightPath: string;
  leftFileName?: string; // Display name for left file
  rightFileName?: string; // Display name for right file
  fontSize: number;
  fontFamily: string;
  onMount?: (editor: editor.IStandaloneDiffEditor) => void;
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
  leftFileName,
  rightFileName,
  fontSize,
  fontFamily,
  onMount,
  onDiffClick,
}) => {
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const language = getLanguageFromPath(rightPath);

  // Detect system theme for file headers
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Detect system theme
  const [theme, setTheme] = useState<'vs-dark-custom' | 'vs-light-custom'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark-custom' : 'vs-light-custom';
    }
    return 'vs-dark-custom';
  });

  // Define custom themes with improved diff colors when Monaco loads
  useEffect(() => {
    const defineThemes = () => {
      if ((window as any).monaco && (window as any).monaco.editor) {
        // Dark theme with better diff colors - darker shades
        (window as any).monaco.editor.defineTheme('vs-dark-custom', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'diffEditor.insertedTextBackground': '#1e5a1e', // Darker green for additions
            'diffEditor.removedTextBackground': '#5a1e1e', // Darker red for deletions
            'diffEditor.insertedTextBorder': '#2d7a2d',
            'diffEditor.removedTextBorder': '#7a2d2d',
          },
        });
        
        // Light theme with better diff colors - lighter shades
        (window as any).monaco.editor.defineTheme('vs-light-custom', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: {
            'diffEditor.insertedTextBackground': '#d4edda', // Lighter green for additions
            'diffEditor.removedTextBackground': '#f8d7da', // Lighter red for deletions
            'diffEditor.insertedTextBorder': '#c3e6cb',
            'diffEditor.removedTextBorder': '#f5c6cb',
          },
        });
        return true;
      }
      return false;
    };

    // Try to define themes immediately
    if (defineThemes()) {
      return;
    }

    // If Monaco isn't loaded yet, wait for it
    const checkInterval = setInterval(() => {
      if (defineThemes()) {
        clearInterval(checkInterval);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'vs-dark-custom' : 'vs-light-custom');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleEditorMount = (editor: editor.IStandaloneDiffEditor) => {
    editorRef.current = editor;

    // Ensure themes are defined when editor mounts
    if ((window as any).monaco && (window as any).monaco.editor) {
      // Dark theme with better diff colors - darker shades
      (window as any).monaco.editor.defineTheme('vs-dark-custom', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'diffEditor.insertedTextBackground': '#1e5a1e', // Darker green for additions
          'diffEditor.removedTextBackground': '#5a1e1e', // Darker red for deletions
          'diffEditor.insertedTextBorder': '#2d7a2d',
          'diffEditor.removedTextBorder': '#7a2d2d',
        },
      });
      
      // Light theme with better diff colors - lighter shades
      (window as any).monaco.editor.defineTheme('vs-light-custom', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'diffEditor.insertedTextBackground': '#d4edda', // Lighter green for additions
          'diffEditor.removedTextBackground': '#f8d7da', // Lighter red for deletions
          'diffEditor.insertedTextBorder': '#c3e6cb',
          'diffEditor.removedTextBorder': '#f5c6cb',
        },
      });
    }

    // Listen for clicks to detect which diff was clicked (read-only mode)
    const modifiedEditor = editor.getModifiedEditor();
    const originalEditor = editor.getOriginalEditor();

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
    // The DiffEditor component automatically handles content updates
    // Monaco will recompute diffs when the original/modified props change
    // No additional action needed here - the parent component will call updateDiffChanges
  }, [leftContent, rightContent]);

  const headerBg = isDarkMode ? '#252526' : '#f3f3f3';
  const headerBorder = isDarkMode ? '#3e3e42' : '#e1e1e1';
  const headerText = isDarkMode ? '#cccccc' : '#333333';
  const leftHeaderBg = isDarkMode ? '#1e1e1e' : '#ffffff';
  const rightHeaderBg = isDarkMode ? '#1e1e1e' : '#ffffff';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', margin: 0, padding: 0 }}>
      {/* File name headers */}
      <div style={{
        display: 'flex',
        height: '40px',
        backgroundColor: headerBg,
        borderBottom: `1px solid ${headerBorder}`,
        fontSize: '14px',
        fontWeight: '600',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          backgroundColor: leftHeaderBg,
          borderRight: `1px solid ${headerBorder}`,
          color: headerText,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ marginRight: '8px', color: isDarkMode ? '#569cd6' : '#0066cc' }}>◀</span>
          {leftFileName || 'Left File'}
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          backgroundColor: rightHeaderBg,
          color: headerText,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ marginRight: '8px', color: isDarkMode ? '#569cd6' : '#0066cc' }}>▶</span>
          {rightFileName || 'Right File'}
        </div>
      </div>

      {/* Diff Editor */}
      <div style={{ flex: 1, width: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <DiffEditor
          original={leftContent}
          modified={rightContent}
          language={language}
          theme={theme}
          options={{
            renderSideBySide: true,
            readOnly: true,
            originalEditable: false,
            scrollBeyondLastLine: false,
            minimap: { enabled: true },
            fontSize,
            fontFamily,
            lineNumbers: 'on',
            folding: true,
            wordWrap: 'off',
            automaticLayout: true,
            renderMarginRevertIcon: false, // Disable revert icons - read-only mode
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              useShadows: false,
            },
          }}
          onMount={handleEditorMount}
        />
      </div>
    </div>
  );
};
