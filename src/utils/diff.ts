/**
 * Generate a unified diff between two strings
 */
export function generateDiff(before: string, after: string, beforeFileName: string, afterFileName: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  
  // Simple line-by-line diff
  const diff: string[] = [];
  diff.push(`--- ${beforeFileName}`);
  diff.push(`+++ ${afterFileName}`);
  
  let i = 0;
  let j = 0;
  
  while (i < beforeLines.length || j < afterLines.length) {
    if (i >= beforeLines.length) {
      // Only in after
      diff.push(`+${afterLines[j]}`);
      j++;
    } else if (j >= afterLines.length) {
      // Only in before
      diff.push(`-${beforeLines[i]}`);
      i++;
    } else if (beforeLines[i] === afterLines[j]) {
      // Same line
      diff.push(` ${beforeLines[i]}`);
      i++;
      j++;
    } else {
      // Different lines - try to find matching line ahead
      let foundMatch = false;
      let lookAhead = 1;
      const maxLookAhead = 10; // Limit lookahead to avoid O(n²)
      
      while (lookAhead <= maxLookAhead && j + lookAhead < afterLines.length) {
        if (beforeLines[i] === afterLines[j + lookAhead]) {
          // Found match ahead - add all lines up to match as additions
          for (let k = j; k < j + lookAhead; k++) {
            diff.push(`+${afterLines[k]}`);
          }
          diff.push(` ${beforeLines[i]}`);
          i++;
          j += lookAhead + 1;
          foundMatch = true;
          break;
        }
        lookAhead++;
      }
      
      if (!foundMatch) {
        // Check if next line in before matches current in after
        lookAhead = 1;
        while (lookAhead <= maxLookAhead && i + lookAhead < beforeLines.length) {
          if (beforeLines[i + lookAhead] === afterLines[j]) {
            // Found match ahead in before - add all lines up to match as deletions
            for (let k = i; k < i + lookAhead; k++) {
              diff.push(`-${beforeLines[k]}`);
            }
            diff.push(` ${afterLines[j]}`);
            i += lookAhead + 1;
            j++;
            foundMatch = true;
            break;
          }
          lookAhead++;
        }
      }
      
      if (!foundMatch) {
        // No match found - treat as modification
        diff.push(`-${beforeLines[i]}`);
        diff.push(`+${afterLines[j]}`);
        i++;
        j++;
      }
    }
  }
  
  return diff.join('\n');
}

export interface DiffChangeEntry {
  type: 'addition' | 'deletion' | 'modification';
  beforeLines: string[];
  afterLines: string[];
}

export interface ParsedDiff {
  beforeFile: string;
  afterFile: string;
  changes: DiffChangeEntry[];
}

/**
 * Parse a unified diff string (as produced by generateDiff) into structured changes.
 */
export function parseDiff(diffText: string): ParsedDiff {
  const lines = diffText.split('\n');
  const beforeFile = lines[0]?.replace(/^--- /, '') || '';
  const afterFile = lines[1]?.replace(/^\+\+\+ /, '') || '';
  
  const changes: DiffChangeEntry[] = [];
  let pendingDeletions: string[] = [];
  let pendingAdditions: string[] = [];

  const flushPending = () => {
    if (pendingDeletions.length > 0 && pendingAdditions.length > 0) {
      changes.push({
        type: 'modification',
        beforeLines: pendingDeletions,
        afterLines: pendingAdditions,
      });
    } else if (pendingDeletions.length > 0) {
      changes.push({
        type: 'deletion',
        beforeLines: pendingDeletions,
        afterLines: [],
      });
    } else if (pendingAdditions.length > 0) {
      changes.push({
        type: 'addition',
        beforeLines: [],
        afterLines: pendingAdditions,
      });
    }
    pendingDeletions = [];
    pendingAdditions = [];
  };

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('-')) {
      pendingDeletions.push(line.slice(1));
    } else if (line.startsWith('+')) {
      pendingAdditions.push(line.slice(1));
    } else {
      // Context line — flush any pending changes
      flushPending();
    }
  }
  
  // Flush remaining
  flushPending();

  return { beforeFile, afterFile, changes };
}

