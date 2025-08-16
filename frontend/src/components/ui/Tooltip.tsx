import React, { useState } from 'react'

type TooltipProps = {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export default function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const pos = side
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          className={`absolute z-50 whitespace-nowrap text-xs px-2 py-1 rounded bg-gray-800 text-white border border-black/20 shadow ${
            pos === 'top' ? 'bottom-full mb-1 left-1/2 -translate-x-1/2' :
            pos === 'bottom' ? 'top-full mt-1 left-1/2 -translate-x-1/2' :
            pos === 'left' ? 'right-full mr-1 top-1/2 -translate-y-1/2' :
            'left-full ml-1 top-1/2 -translate-y-1/2'
          }`}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  )
}


