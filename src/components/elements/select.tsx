import { clsx } from 'clsx/lite'
import type { ComponentProps } from 'react'

type SelectSize = 'md' | 'lg'

const sizes: Record<SelectSize, string> = {
  md: 'px-3 py-1 text-sm/7',
  lg: 'px-4 py-2 text-base',
}

type SelectProps = Omit<ComponentProps<'select'>, 'size'> & {
  size?: SelectSize
}

export function Select({
  size = 'md',
  className,
  ...props
}: SelectProps) {
  return (
    <select
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium',
        'bg-olive-950/10 text-olive-950 hover:bg-olive-950/15',
        'dark:bg-white/10 dark:text-white dark:hover:bg-white/20',
        'border-0 focus:outline-none focus:ring-2 focus:ring-olive-500',
        'cursor-pointer appearance-none pr-8',
        'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20fill%3D%27none%27%20viewBox%3D%270%200%2024%2024%27%20stroke%3D%27%2378716c%27%20stroke-width%3D%272%27%3E%3Cpath%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%20d%3D%27M19%209l-7%207-7-7%27%2F%3E%3C%2Fsvg%3E")] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat',
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function SoftSelect({
  size = 'md',
  className,
  ...props
}: SelectProps) {
  return (
    <select
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium',
        'bg-white text-olive-950 border border-olive-300 hover:border-olive-400',
        'dark:bg-olive-900 dark:text-white dark:border-olive-700 dark:hover:border-olive-600',
        'focus:outline-none focus:ring-2 focus:ring-olive-500',
        'cursor-pointer appearance-none pr-8',
        'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20fill%3D%27none%27%20viewBox%3D%270%200%2024%2024%27%20stroke%3D%27%2378716c%27%20stroke-width%3D%272%27%3E%3Cpath%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%20d%3D%27M19%209l-7%207-7-7%27%2F%3E%3C%2Fsvg%3E")] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat',
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
