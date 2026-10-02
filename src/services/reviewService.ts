import type { Contract, FindingsFile } from '../domain/types';

export interface LoadedReview {
  contract: Contract;
  file: FindingsFile;
}

/**
 * The "backend" is two local JSON files behind a small service, so the app
 * can show real loading, error and empty states.
 *
 * Try these in the address bar:
 *   ?delay=2500   slow load
 *   ?fail=1       the service fails (shows the error screen with Retry)
 *   ?empty=1      the agent returns no findings
 */
export interface DemoOptions {
  delayMs: number;
  fail: boolean;
  empty: boolean;
}

export class ReviewLoadError extends Error {}

const DEFAULT_DELAY_MS = 700;
const MAX_DELAY_MS = 10_000;

export function readDemoOptions(search: string): DemoOptions {
  const params = new URLSearchParams(search);
  const delay = Number(params.get('delay'));
  const hasDelay = params.has('delay') && Number.isFinite(delay) && delay >= 0;
  return {
    delayMs: hasDelay ? Math.min(delay, MAX_DELAY_MS) : DEFAULT_DELAY_MS,
    fail: params.get('fail') === '1',
    empty: params.get('empty') === '1',
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchReview(options: DemoOptions): Promise<LoadedReview> {
  await wait(options.delayMs);
  if (options.fail) {
    throw new ReviewLoadError('The review service did not respond.');
  }
  const [contractModule, findingsModule] = await Promise.all([
    import('../../data/sample-contract.json'),
    import('../../data/findings.json'),
  ]);
  const contract = contractModule.default as unknown as Contract;
  const file = findingsModule.default as unknown as FindingsFile;
  return { contract, file: options.empty ? { ...file, findings: [] } : file };
}
