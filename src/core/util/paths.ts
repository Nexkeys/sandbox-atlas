import * as path from 'path';

const caseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';

/** Converts platform separators to forward slashes. */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

/** Forward-slash path of `absolutePath` relative to `root`. */
export function relativePosix(root: string, absolutePath: string): string {
  return toPosixPath(path.relative(root, absolutePath));
}

/** Normalised key for comparing paths on case-insensitive file systems. */
export function pathKey(absolutePath: string): string {
  const normalized = path.resolve(absolutePath);
  return caseInsensitiveFs ? normalized.toLowerCase() : normalized;
}
