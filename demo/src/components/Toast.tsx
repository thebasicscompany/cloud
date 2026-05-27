import { useDemo } from '@/store'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, Info, Warning } from '@phosphor-icons/react'

export function Toast() {
  const toast = useDemo((s) => s.toast)
  return (
    <div className="pointer-events-none fixed top-20 right-6 z-40">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text}
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 border bg-card max-w-md"
            style={{
              borderColor:
                toast.kind === 'success' ? 'color-mix(in oklch, var(--color-primary) 60%, transparent)' :
                toast.kind === 'warn' ? 'color-mix(in oklch, var(--color-warn) 60%, transparent)' :
                'var(--color-border)',
            }}
          >
            {toast.kind === 'success' ? <CheckCircle size={16} weight="fill" className="text-primary" /> :
              toast.kind === 'warn' ? <Warning size={16} weight="fill" style={{ color: 'var(--color-warn)' }} /> :
              <Info size={16} weight="regular" className="text-muted-foreground" />}
            <div className="text-[13.5px] text-foreground">{toast.text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
