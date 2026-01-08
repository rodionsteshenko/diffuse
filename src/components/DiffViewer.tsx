import { useEffect, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface DiffViewerProps {
  leftContent: string;
  rightContent: string;
  editedLeftContent?: string; // Edited content (for tracking changes, not updating props)
  editedRightContent?: string; // Edited content (for tracking changes, not updating props)
  leftPath: string;
  rightPath: string;
  leftFileName?: string; // Display name for left file
  rightFileName?: string; // Display name for right file
  fontSize: number;
  fontFamily: string;
  onMount?: (editor: editor.IStandaloneDiffEditor) => void;
  onDiffClick?: (lineNumber: number) => void;
  onLeftContentChange?: (content: string) => void;
  onRightContentChange?: (content: string) => void;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
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
  editedLeftContent,
  editedRightContent,
  leftPath: _leftPath,
  rightPath,
  leftFileName,
  rightFileName,
  fontSize,
  fontFamily,
  onMount,
  onDiffClick,
  onLeftContentChange,
  onRightContentChange,
  onNavigateNext,
  onNavigatePrevious,
}) => {
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const lastExternalLeftContentRef = useRef<string>(leftContent);
  const lastExternalRightContentRef = useRef<string>(rightContent);
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
            'diffEditor.insertedTextBorder': '#1e5a1e', // Match background color to hide borders
            'diffEditor.removedTextBorder': '#5a1e1e', // Match background color to hide borders
            'editor.lineHighlightBorder': '#00000000', // Fully transparent
            'editor.lineHighlightBackground': '#00000000', // Fully transparent
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
            'diffEditor.insertedTextBorder': '#d4edda', // Match background color to hide borders
            'diffEditor.removedTextBorder': '#f8d7da', // Match background color to hide borders
            'editor.lineHighlightBorder': '#00000000', // Fully transparent
            'editor.lineHighlightBackground': '#00000000', // Fully transparent
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

    // Get both editors
    const modifiedEditor = editor.getModifiedEditor();
    const originalEditor = editor.getOriginalEditor();

    // Override Alt+Up/Down to use for diff navigation instead of moving lines
    // We'll handle this at the window level instead since Monaco commands might not override properly
    // The window handler in useDiffNavigation will catch these events

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
          'diffEditor.insertedTextBorder': '#1e5a1e', // Match background color to hide borders
          'diffEditor.removedTextBorder': '#5a1e1e', // Match background color to hide borders
          'editor.lineHighlightBorder': '#00000000', // Fully transparent
          'editor.lineHighlightBackground': '#00000000', // Fully transparent
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
          'diffEditor.insertedTextBorder': '#d4edda', // Match background color to hide borders
          'diffEditor.removedTextBorder': '#f8d7da', // Match background color to hide borders
          'editor.lineHighlightBorder': '#00000000', // Fully transparent
          'editor.lineHighlightBackground': '#00000000', // Fully transparent
        },
      });
    }

    // Listen for clicks to detect which diff was clicked
    // (editors already obtained above)

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

    // Listen for content changes in both editors
    originalEditor.onDidChangeModelContent(() => {
      const content = originalEditor.getValue();
      onLeftContentChange?.(content);
    });

    modifiedEditor.onDidChangeModelContent(() => {
      const content = modifiedEditor.getValue();
      onRightContentChange?.(content);
    });

    onMount?.(editor);
  };

  // Update editor content only when it comes from external sources (file loading/watching)
  // Not when user edits (to prevent scroll position jumps)
  useEffect(() => {
    if (editorRef.current) {
      const originalEditor = editorRef.current.getOriginalEditor();
      const modifiedEditor = editorRef.current.getModifiedEditor();
      
      // Only update if the external content changed (not from user edits)
      if (leftContent !== lastExternalLeftContentRef.current) {
        lastExternalLeftContentRef.current = leftContent;
        // Preserve cursor position and scroll when updating from external source
        const position = originalEditor.getPosition();
        const scrollTop = originalEditor.getScrollTop();
        originalEditor.setValue(leftContent);
        if (position) {
          originalEditor.setPosition(position);
          originalEditor.setScrollTop(scrollTop);
        }
      }
      
      if (rightContent !== lastExternalRightContentRef.current) {
        lastExternalRightContentRef.current = rightContent;
        // Preserve cursor position and scroll when updating from external source
        const position = modifiedEditor.getPosition();
        const scrollTop = modifiedEditor.getScrollTop();
        modifiedEditor.setValue(rightContent);
        if (position) {
          modifiedEditor.setPosition(position);
          modifiedEditor.setScrollTop(scrollTop);
        }
      }
    }
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
            readOnly: false,
            originalEditable: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: true },
            fontSize,
            fontFamily,
            lineNumbers: 'on',
            folding: true,
            wordWrap: 'off',
            automaticLayout: true,
            renderMarginRevertIcon: true, // Enable revert icons for editable mode
            renderLineHighlight: 'none', // Disable line highlighting to prevent borders
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
