/**
 * stdout discipline — anything printed to stdout would corrupt JSON output
 * (--json mode) or the MCP stdio JSON-RPC stream. These helpers route all
 * console traffic to stderr for the duration of a headless call.
 */

export async function withStderrConsole<T>(fn: () => Promise<T>): Promise<T> {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  const redirect = (...args: unknown[]): void => {
    process.stderr.write(args.map(String).join(' ') + '\n');
  };
  console.log = redirect;
  console.info = redirect;
  console.warn = redirect;
  console.error = redirect;
  console.debug = redirect;
  try {
    return await fn();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
  }
}

/** Print a JSON payload to stdout (the ONLY thing allowed on stdout). */
export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}
