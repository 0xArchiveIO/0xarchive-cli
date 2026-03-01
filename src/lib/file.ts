import * as fs from 'node:fs';
import * as path from 'node:path';
import { exitError, EXIT } from './output.js';

/**
 * Write data to a file as JSON. Validates directory exists and handles permission errors.
 * Writes the full response envelope so file output matches stdout shape.
 */
export function writeOutputFile(filePath: string, data: unknown): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      exitError(`Output directory does not exist: ${dir}`, EXIT.VALIDATION);
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      exitError(`Permission denied writing to: ${filePath}`, EXIT.VALIDATION);
    }
    throw err;
  }
}
