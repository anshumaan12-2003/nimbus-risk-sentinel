import { QueryClient } from '@tanstack/react-query'

/*
  One cache for all server data.
  Why TanStack Query instead of useEffect+useState per page:
   - dedupes identical requests (Dashboard + Header both need preflight -> 1 call)
   - stale-while-revalidate: navigating back shows cached data instantly, refreshes quietly
   - uniform loading / error / retry semantics on every page
   - targeted invalidation when the backend tells us something changed (see useLiveInvalidation)
*/
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const qk = {
  scans: ['scans'],
  scan: (id) => ['scans', id],
  scanWarnings: (id) => ['scans', id, 'warnings'],
  scanProgress: (id) => ['scans', id, 'progress'],
  requests: (status) => ['remediation', 'requests', status || 'all'],
  users: ['users'],
  activeScan: ['scans', 'active'],
  latestScan: ['scans', 'latest'],
  findings: (p = {}) => ['findings', p],
  finding: (id) => ['findings', 'one', id],
  stats: ['findings', 'stats'],
  inventory: ['inventory'],
  compliance: ['compliance'],
  controls: ['compliance', 'controls'],
  preflight: ['account', 'preflight'],
  config: ['account', 'config'],
  audit: ['remediation', 'audit'],
  drift: ['drift'],
  topology: ['topology'],
}
