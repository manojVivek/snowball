import { clsx } from 'clsx/lite'
import type { ComponentProps, ReactNode } from 'react'

interface BrokerCardProps extends Omit<ComponentProps<'button'>, 'children'> {
  name: string
  description?: string
  icon?: ReactNode
  selected?: boolean
  comingSoon?: boolean
}

export function BrokerCard({
  name,
  description,
  icon,
  selected = false,
  comingSoon = false,
  className,
  disabled,
  ...props
}: BrokerCardProps) {
  return (
    <button
      type="button"
      disabled={disabled || comingSoon}
      className={clsx(
        'relative flex flex-col items-center justify-center rounded-xl p-3 sm:p-4 text-center transition-all',
        'min-w-[80px] sm:min-w-[120px] min-h-[70px] sm:min-h-[100px]',
        selected
          ? 'bg-olive-950 text-white ring-2 ring-olive-950 dark:bg-olive-300 dark:text-olive-950 dark:ring-olive-300'
          : comingSoon
            ? 'bg-olive-950/5 text-olive-400 cursor-not-allowed'
            : 'bg-olive-950/5 text-olive-700 hover:bg-olive-950/10 dark:bg-white/5 dark:text-olive-300 dark:hover:bg-white/10',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className={clsx('w-6 h-6 sm:w-8 sm:h-8 mb-1.5 sm:mb-2', comingSoon && 'opacity-50 grayscale')}>
          {icon}
        </div>
      )}
      <span className={clsx('text-xs sm:text-sm font-medium', selected && 'text-white dark:text-olive-950')}>
        {name}
      </span>
      {description && (
        <span className={clsx('text-[10px] sm:text-xs mt-0.5', selected ? 'text-white/70 dark:text-olive-950/70' : 'text-olive-500')}>
          {description}
        </span>
      )}
      {comingSoon && (
        <span className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[10px] font-medium bg-olive-300 text-olive-950 rounded-full">
          Soon
        </span>
      )}
    </button>
  )
}

interface BrokerCardGroupProps {
  children: React.ReactNode
  className?: string
}

export function BrokerCardGroup({ children, className }: BrokerCardGroupProps) {
  return (
    <div className={clsx('flex flex-wrap items-center justify-center gap-2 sm:gap-3', className)}>
      {children}
    </div>
  )
}
