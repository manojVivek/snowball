import { clsx } from 'clsx/lite'
import type { ComponentProps, ReactNode } from 'react'

export function Drawer({
  open,
  onClose,
  title,
  children,
  className,
  ...props
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
} & Omit<ComponentProps<'div'>, 'title'>) {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-olive-950/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed right-0 top-0 h-full w-full sm:max-w-md bg-white z-50 shadow-xl',
          'flex flex-col',
          'animate-slide-in-right',
          className
        )}
        {...props}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-olive-950/10 px-4 sm:px-6 py-3 sm:py-4">
          <h2 className="text-base sm:text-lg font-semibold text-olive-950">{title}</h2>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-olive-950/5 text-olive-500 hover:text-olive-950 transition-colors"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </>
  )
}
