import { describe, it, expect } from 'vitest';
import { generateDiff, parseDiff } from './diff';

/**
 * Helper: extract only +/- lines from diff output (skip headers and context)
 */
function diffLines(diff: string): string[] {
  const lines = diff.split('\n');
  // Skip the first two header lines (--- and +++)
  return lines.slice(2).filter(l => l.startsWith('+') || l.startsWith('-'));
}

/**
 * Helper: extract context and change lines (skip headers)
 */
function bodyLines(diff: string): string[] {
  return diff.split('\n').slice(2); // skip --- and +++ headers
}

describe('generateDiff', () => {
  it('returns only headers for identical content', () => {
    const result = generateDiff('hello\nworld', 'hello\nworld', 'a.txt', 'b.txt');
    const lines = result.split('\n');
    expect(lines[0]).toBe('--- a.txt');
    expect(lines[1]).toBe('+++ b.txt');
    // All remaining lines should be context (space-prefixed)
    const body = bodyLines(result);
    expect(body.every(l => l.startsWith(' '))).toBe(true);
  });

  it('detects a simple single-line change', () => {
    const result = generateDiff('hello', 'goodbye', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-hello');
    expect(changes).toContain('+goodbye');
  });

  it('detects added lines at the end', () => {
    const result = generateDiff('line1', 'line1\nline2\nline3', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('+line2');
    expect(changes).toContain('+line3');
    // Original line should not be marked as deleted
    expect(changes).not.toContain('-line1');
  });

  it('detects deleted lines at the end', () => {
    const result = generateDiff('line1\nline2\nline3', 'line1', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-line2');
    expect(changes).toContain('-line3');
    expect(changes).not.toContain('+line1');
  });

  it('detects added lines at the beginning', () => {
    const result = generateDiff('existing', 'new\nexisting', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('+new');
    expect(changes).not.toContain('-existing');
  });

  it('detects deleted lines at the beginning', () => {
    const result = generateDiff('old\nexisting', 'existing', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-old');
    expect(changes).not.toContain('+existing');
  });

  it('handles empty before content', () => {
    const result = generateDiff('', 'new content', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('+new content');
  });

  it('handles empty after content', () => {
    const result = generateDiff('old content', '', 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-old content');
  });

  it('handles both empty', () => {
    const result = generateDiff('', '', 'a.txt', 'b.txt');
    const body = bodyLines(result);
    // Should have one context line for the empty string
    expect(body.length).toBe(1);
  });

  it('handles a modification in the middle', () => {
    const before = 'line1\nline2\nline3';
    const after = 'line1\nmodified\nline3';
    const result = generateDiff(before, after, 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-line2');
    expect(changes).toContain('+modified');
    expect(changes).not.toContain('-line1');
    expect(changes).not.toContain('-line3');
  });

  it('handles multiple separate changes', () => {
    const before = 'a\nb\nc\nd\ne';
    const after = 'a\nB\nc\nD\ne';
    const result = generateDiff(before, after, 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-b');
    expect(changes).toContain('+B');
    expect(changes).toContain('-d');
    expect(changes).toContain('+D');
  });

  it('handles insertion of multiple lines in the middle', () => {
    const before = 'a\nb';
    const after = 'a\nx\ny\nz\nb';
    const result = generateDiff(before, after, 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('+x');
    expect(changes).toContain('+y');
    expect(changes).toContain('+z');
    // a and b should remain as context
    expect(changes).not.toContain('-a');
    expect(changes).not.toContain('-b');
  });

  it('handles deletion of multiple lines in the middle', () => {
    const before = 'a\nx\ny\nz\nb';
    const after = 'a\nb';
    const result = generateDiff(before, after, 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toContain('-x');
    expect(changes).toContain('-y');
    expect(changes).toContain('-z');
    expect(changes).not.toContain('+a');
    expect(changes).not.toContain('+b');
  });

  it('does not produce false changes for large identical blocks', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
    const content = lines.join('\n');
    const result = generateDiff(content, content, 'a.txt', 'b.txt');
    const changes = diffLines(result);
    expect(changes).toHaveLength(0);
  });

  it('handles replacement beyond lookahead window correctly', () => {
    // Create a case where 15 consecutive lines change (beyond maxLookAhead of 10)
    const before = Array.from({ length: 15 }, (_, i) => `old${i}`).join('\n') + '\nanchor';
    const after = Array.from({ length: 15 }, (_, i) => `new${i}`).join('\n') + '\nanchor';
    const result = generateDiff(before, after, 'a.txt', 'b.txt');
    const body = bodyLines(result);
    // The anchor line should appear as context
    const anchorLines = body.filter(l => l === ' anchor');
    expect(anchorLines.length).toBeGreaterThanOrEqual(1);
  });
});

describe('parseDiff', () => {
  it('parses a simple diff correctly', () => {
    const diff = generateDiff('a\nb\nc', 'a\nB\nc', 'a.txt', 'b.txt');
    const parsed = parseDiff(diff);
    expect(parsed.beforeFile).toBe('a.txt');
    expect(parsed.afterFile).toBe('b.txt');
    expect(parsed.changes.length).toBeGreaterThan(0);

    // Should have the modification
    const mods = parsed.changes.filter(c => c.type === 'modification');
    expect(mods.length).toBe(1);
    expect(mods[0].beforeLines).toEqual(['b']);
    expect(mods[0].afterLines).toEqual(['B']);
  });

  it('parses additions correctly', () => {
    const diff = generateDiff('a\nc', 'a\nb\nc', 'a.txt', 'b.txt');
    const parsed = parseDiff(diff);
    const additions = parsed.changes.filter(c => c.type === 'addition');
    expect(additions.length).toBe(1);
    expect(additions[0].afterLines).toEqual(['b']);
  });

  it('parses deletions correctly', () => {
    const diff = generateDiff('a\nb\nc', 'a\nc', 'a.txt', 'b.txt');
    const parsed = parseDiff(diff);
    const deletions = parsed.changes.filter(c => c.type === 'deletion');
    expect(deletions.length).toBe(1);
    expect(deletions[0].beforeLines).toEqual(['b']);
  });

  it('returns empty changes for identical content', () => {
    const diff = generateDiff('same', 'same', 'a.txt', 'b.txt');
    const parsed = parseDiff(diff);
    expect(parsed.changes).toHaveLength(0);
  });
});
