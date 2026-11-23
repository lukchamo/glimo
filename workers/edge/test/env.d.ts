import type { D1Migration } from '@cloudflare/vitest-plugin';
import type { Env as WorkerEnv } from '../src/types';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
    // Lets `exports.default.fetch()` from "cloudflare:workers" know the Worker under test.
    interface GlobalProps {
      mainModule: typeof import('../src/index');
    }
  }
}
