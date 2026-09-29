import { program } from './cli.js';
import { EXIT } from './lib/output.js';

// Commands write their JSON and then call process.exit(). On a pipe, stdout is
// asynchronous by default, so output larger than the pipe buffer was cut off
// when the process exited first. Blocking writes finish before the exit.
for (const output of [process.stdout, process.stderr]) {
  (output as unknown as { _handle?: { setBlocking?: (blocking: boolean) => void } })._handle?.setBlocking?.(true);
}

// A reader that stops early (`oxa ... | head`) closes the pipe; stop quietly.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(EXIT.SUCCESS);
  throw error;
});

program.parse();
