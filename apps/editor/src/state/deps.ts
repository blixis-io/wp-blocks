/**
 * The seam between the editor state and the REST client implementation (`src/api/**`). The state code and its tests depend
 * only on the `RestClient` interface from `api/types.ts`; the real factory is re-exported here so `main.tsx` has one place
 * to get it from and tests can pass a fake instead.
 */
export { createRestClient } from '../api/index';
export type { ApiError, ApiResult, RestClient, StreamRead } from '../api/types';
