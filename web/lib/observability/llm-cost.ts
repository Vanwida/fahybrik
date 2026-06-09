import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  estimateCost,
  recordLlmInvocation as _recordLlmInvocation,
  type LlmUsage,
  type RecordLlmInvocationParams as SharedRecordLlmInvocationParams,
} from '@fahybrid/shared/domain/observability/llm-cost';

export { estimateCost };
export type { LlmUsage };

export type RecordLlmInvocationParams = Omit<SharedRecordLlmInvocationParams, 'client' | 'onError'> & {
  client?: Sql;
};

/**
 * Record one LLM invocation. BEST-EFFORT — swallows all errors so a logging
 * failure can never break the response the user is waiting on.
 */
export async function recordLlmInvocation(params: RecordLlmInvocationParams): Promise<boolean> {
  return _recordLlmInvocation({
    ...params,
    client: params.client ?? defaultSql,
    onError: (message, detail) => {
      // Single structured stderr line is the allowed console.* (safety net,
      // mirrors lib/observability/capture.ts).
      // eslint-disable-next-line no-console
      console.error(message, JSON.stringify(detail));
    },
  });
}
