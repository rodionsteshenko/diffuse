import { useState, useEffect } from 'react';
import { FileInfo } from '../types';

interface NavigationBarProps {
  currentDiffIndex: number;
  totalDiffs: number;
  onPrevious: () => void;
  onNext: () => void;
  onCopyLeftToRight: () => void;
  onCopyRightToLeft: () => void;
  onSaveLeft: () => void;
  onSaveRight: () => void;
  onUndo: () => void;
  onRedo: () => void;
  leftFile: FileInfo | null;
  rightFile: FileInfo | null;
  isSaving: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
}

const FONT_FAMILIES = [
  'Monaco',
  'Menlo',
  'Courier New',
];

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24];

export const NavigationBar: React.FC<NavigationBarProps> = ({
  currentDiffIndex,
  totalDiffs,
  onPrevious,
  onNext,
  onCopyLeftToRight,
  onCopyRightToLeft,
  onSaveLeft,
  onSaveRight,
  onUndo,
  onRedo,
  leftFile,
  rightFile,
  isSaving,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
}) => {
  // Detect system theme
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

  const backgroundColor = isDarkMode ? '#1e1e1e' : '#f5f5f5';
  const borderColor = isDarkMode ? '#333' : '#ddd';
  const textColor = isDarkMode ? '#cccccc' : '#333333';
  const labelColor = isDarkMode ? '#888' : '#666';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 16px',
      backgroundColor,
      borderBottom: `1px solid ${borderColor}`,
      color: textColor,
      fontSize: '13px',
    }}>
      {/* Undo/Redo controls */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onUndo}
          title="Undo (Cmd/Ctrl+Z)"
          style={buttonStyle}
        >
          ↶ Undo
        </button>

        <button
          onClick={onRedo}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          style={buttonStyle}
        >
          ↷ Redo
        </button>
      </div>

      {/* Navigation controls */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={onPrevious}
          disabled={totalDiffs === 0}
          title="Previous diff (Alt+↑)"
          style={buttonStyle}
        >
          ↑ Previous
        </button>

        <span style={{ padding: '0 8px', fontSize: '12px' }}>
          {totalDiffs > 0 ? `${currentDiffIndex + 1} of ${totalDiffs}` : 'No changes'}
        </span>

        <button
          onClick={onNext}
          disabled={totalDiffs === 0}
          title="Next diff (Alt+↓)"
          style={buttonStyle}
        >
          Next ↓
        </button>
      </div>

      {/* Copy controls */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onCopyLeftToRight}
          disabled={totalDiffs === 0}
          title="Copy current diff from left to right (Alt+→)"
          style={buttonStyle}
        >
          Left → Right
        </button>

        <button
          onClick={onCopyRightToLeft}
          disabled={totalDiffs === 0}
          title="Copy current diff from right to left (Alt+←)"
          style={buttonStyle}
        >
          Right → Left
        </button>
      </div>

      {/* Save controls */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onSaveLeft}
          disabled={!leftFile || isSaving}
          title="Save left file (Cmd/Ctrl+Shift+S)"
          style={buttonStyle}
        >
          {isSaving ? 'Saving...' : 'Save Left'}
        </button>

        <button
          onClick={onSaveRight}
          disabled={!rightFile || isSaving}
          title="Save right file (Cmd/Ctrl+S)"
          style={buttonStyle}
        >
          {isSaving ? 'Saving...' : 'Save Right'}
        </button>
      </div>

      {/* Font controls */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderLeft: `1px solid ${borderColor}`, paddingLeft: '12px' }}>
        <label style={{ fontSize: '11px', color: labelColor }}>Font:</label>
        <select
          value={fontFamily}
          onChange={(e) => onFontFamilyChange(e.target.value)}
          style={{
            ...selectStyle,
            backgroundColor: isDarkMode ? '#2d2d2d' : '#ffffff',
            color: textColor,
            border: `1px solid ${borderColor}`,
          }}
          title="Select font family"
        >
          {FONT_FAMILIES.map(font => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>

        <label style={{ fontSize: '11px', color: labelColor }}>Size:</label>
        <select
          value={fontSize}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          style={{
            ...selectStyle,
            backgroundColor: isDarkMode ? '#2d2d2d' : '#ffffff',
            color: textColor,
            border: `1px solid ${borderColor}`,
          }}
          title="Select font size (Cmd +/-)"
        >
          {FONT_SIZES.map(size => (
            <option key={size} value={size}>{size}px</option>
          ))}
        </select>
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '4px 12px',
  backgroundColor: '#0e639c',
  color: '#ffffff',
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  padding: '3px 8px',
  backgroundColor: '#2d2d2d',
  color: '#cccccc',
  border: '1px solid #444',
  borderRadius: '3px',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
