export interface FileInfo {
  path: string;
  content: string;
}

export interface DiffChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}
