import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Compose class names; later Tailwind utilities override earlier conflicting ones (px-2 then px-4 -> px-4).
export const cn = (...inputs) => twMerge(clsx(inputs))
