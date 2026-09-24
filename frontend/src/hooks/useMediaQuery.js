import { useEffect, useState } from 'react'

/* True while the media query matches; updates live (rotation, window resize). */
export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    on(); m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}
