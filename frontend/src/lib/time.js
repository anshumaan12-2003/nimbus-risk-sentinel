import { formatDistanceToNowStrict, format } from 'date-fns'

// The API returns naive UTC timestamps ("2026-09-23T23:20:00"); treat them as UTC, not local time.
export function parseUtc(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const s = String(value)
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
}

export function ago(value) {
  const d = parseUtc(value)
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : 'never'
}

export function shortDate(value) {
  const d = parseUtc(value)
  return d ? format(d, 'd MMM') : ''
}

export function dateTime(value) {
  const d = parseUtc(value)
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—'
}
