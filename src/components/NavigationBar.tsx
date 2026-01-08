import { useState, useEffect } from 'react';
import { FileInfo } from '../types';

interface NavigationBarProps {
  currentDiffIndex: number;
  totalDiffs: number;
  onPrevious: () => void;
  onNext: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  fontFamily: string;
  onFontFamilyChange: (family: string) => void;
  onAIChatClick?: () => void;
  isAIAvailable?: boolean;
  aiStatus?: 'idle' | 'thinking' | 'ready';
  leftFileSaved?: boolean;
  rightFileSaved?: boolean;
}

const FONT_FAMILIES = [
  'Monaco',
  'Menlo',
  'PT Mono',
  'Courier',
  'Courier New',
];

// Generate font sizes from 6 to 32 (inclusive)
const FONT_SIZES = Array.from({ length: 27 }, (_, i) => i + 6);

export const NavigationBar: React.FC<NavigationBarProps> = ({
  currentDiffIndex,
  totalDiffs,
  onPrevious,
  onNext,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  onAIChatClick,
  isAIAvailable = false,
  aiStatus = 'idle',
  leftFileSaved = true,
  rightFileSaved = true,
}) => {
  // Debug logging
  useEffect(() => {
    console.log('NavigationBar - isAIAvailable:', isAIAvailable, 'onAIChatClick:', !!onAIChatClick);
  }, [isAIAvailable, onAIChatClick]);
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
  const savedColor = isDarkMode ? '#4caf50' : '#2e7d32';
  const unsavedColor = isDarkMode ? '#ff9800' : '#f57c00';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '8px 16px',
      backgroundColor,
      borderBottom: `1px solid ${borderColor}`,
      color: textColor,
      fontSize: '13px',
      flexShrink: 0,
      margin: 0,
    }}>
      {/* Left side: Save status and Navigation controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Save status indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '3px',
          backgroundColor: isDarkMode ? '#2d2d2d' : '#e8e8e8',
        }}>
          <span style={{ color: labelColor }}>Save status:</span>
          <span style={{ 
            color: leftFileSaved ? savedColor : unsavedColor,
            fontWeight: '500',
          }}>
            Left: {leftFileSaved ? 'Saved' : 'Unsaved'}
          </span>
          <span style={{ color: labelColor }}>|</span>
          <span style={{ 
            color: rightFileSaved ? savedColor : unsavedColor,
            fontWeight: '500',
          }}>
            Right: {rightFileSaved ? 'Saved' : 'Unsaved'}
          </span>
        </div>

        {/* Navigation controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
      </div>

      {/* Right side: AI Chat Button */}
      {onAIChatClick && (
        <button
          onClick={onAIChatClick}
          title={
            !isAIAvailable ? "AI Diff Analysis (LM Studio - checking availability...)" :
            aiStatus === 'thinking' ? "AI is analyzing the diff..." :
            aiStatus === 'ready' ? "AI Diff Analysis (Ready)" :
            "AI Diff Analysis (LM Studio)"
          }
          style={{
            ...buttonStyle,
            backgroundColor: isDarkMode ? '#2d2d2d' : '#ffffff',
            color: textColor,
            border: `1px solid ${borderColor}`,
            opacity: isAIAvailable ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '16px',
            padding: '4px 8px',
          }}
        >
          {aiStatus === 'thinking' ? (
            <>
              <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>🤖</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>⏱</span>
            </>
          ) : aiStatus === 'ready' ? (
            <>
              <span>🤖</span>
              <span style={{ fontSize: '12px' }}>✓</span>
            </>
          ) : (
            <>
              <span>🤖</span>
              {!isAIAvailable && <span style={{ fontSize: '12px', color: '#ff4444' }}>✗</span>}
            </>
          )}
        </button>
      )}
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
