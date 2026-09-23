import { useState, useEffect } from 'react'

export function useCountUp(targetValue, duration = 1200) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const end = typeof targetValue === 'number' ? targetValue : parseInt(targetValue, 10) || 0
    if (end === 0) {
      setCount(0)
      return
    }

    let start = 0
    const startTime = performance.now()

    const updateCounter = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Smooth ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(start + (end - start) * easeOut)
      
      setCount(current)

      if (progress < 1) {
        requestAnimationFrame(updateCounter)
      } else {
        setCount(end)
      }
    }

    const frameId = requestAnimationFrame(updateCounter)
    return () => cancelAnimationFrame(frameId)
  }, [targetValue, duration])

  return count
}
