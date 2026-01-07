export interface FileInfo {
  path: string; // Original path (can be relative or absolute)
  absolutePath: string; // Absolute path for file operations
  content: string;
}

export interface DiffChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}
