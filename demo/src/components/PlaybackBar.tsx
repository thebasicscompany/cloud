import { useState } from 'react'
import { Play, Pause, ArrowCounterClockwise } from '@phosphor-icons/react'
import { useDemo } from '@/store'
import { BEATS } from '@/script'
import { Button } from '@/components/ui/button'

/* -----------------------------------------------------------------------------
   "Demo navigator" — replaces the heavy media-player look with a thin product
   strip. Two layers:
     - a 1.5px progress line pinned to the bottom of the viewport
     - a floating rounded pill above the progress: play/pause + chapter step
       indicator (• ○ • • •) + chapter title. No rewind/ff buttons, no big
       transport icons. Speed control hidden behind a tiny secondary pill.
   Designed to read as "this is the demo, not a video file."
----------------------------------------------------------------------------- */

interface Props {
  elapsed: number
  totalMs: number
  onReset: () => void
  onSeek: (ms: number) => void
}

export function PlaybackBar({ elapsed, totalMs, onReset, onSeek }: Props) {
  const playing = useDemo((s) => s.playing)
  const speed = useDemo((s) => s.speed)
  const setPlaying = (p: boolean) => useDemo.getState().patch({ playing: p })
  const cycleSpeed = () => {
    const s = useDemo.getState().speed
    const next = s === 0.5 ? 1 : s === 1 ? 2 : 0.5
    useDemo.getState().patch({ speed: next })
  }
  const [hover, setHover] = useState(false)

  const chapters = BEATS.filter((b) => b.chapter).map((b) => ({ t: b.t, label: b.chapter! }))
  const currentIdx = (() => {
    let i = -1
    chapters.forEach((c, idx) => { if (c.t <= elapsed) i = idx })
    return i
  })()
  const currentLabel = currentIdx >= 0 ? chapters[currentIdx].label : 'Welcome'
  const stepNum = currentIdx + 1
  const stepTotal = chapters.length

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative shrink-0 select-none"
    >
      {/* thin progress strip clipped to bottom of viewport */}
      <div
        className="h-[2px] bg-border/60 relative cursor-pointer"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
          const pct = (e.clientX - r.left) / r.width
          onSeek(pct * totalMs)
        }}
        title="Scrub"
      >
        <div
          className="absolute left-0 top-0 bottom-0 bg-primary transition-[width]"
          style={{ width: `${(elapsed / totalMs) * 100}%` }}
        />
      </div>

      {/* the floating widget bar */}
      <div
        className="h-12 flex items-center justify-center gap-3 px-4 bg-background/85 backdrop-blur-sm"
        style={{ opacity: hover || !playing ? 1 : 0.85 }}
      >
        {/* play/pause — a small round button */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full bg-foreground text-background hover:bg-foreground/90 hover:text-background shrink-0"
          onClick={() => setPlaying(!playing)}
          title={playing ? 'Pause (space)' : 'Play (space)'}
        >
          {playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
        </Button>

        {/* chapter dot indicators */}
        <div className="flex items-center gap-1.5" aria-label="demo chapters">
          {chapters.map((c, i) => {
            const done = i < currentIdx
            const current = i === currentIdx
            return (
              <button
                key={i}
                onClick={() => onSeek(c.t)}
                title={c.label}
                className="group relative size-1.5 transition-transform hover:scale-150"
              >
                <span
                  className="block size-full rounded-full transition-colors"
                  style={{
                    background: current
                      ? 'var(--color-primary)'
                      : done
                      ? 'color-mix(in oklch, var(--color-primary) 55%, transparent)'
                      : 'var(--color-border)',
                    boxShadow: current ? '0 0 0 3px color-mix(in oklch, var(--color-primary) 22%, transparent)' : undefined,
                  }}
                />
              </button>
            )
          })}
        </div>

        {/* chapter label + step counter */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12.5px] font-medium text-foreground truncate max-w-xs">{currentLabel}</span>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {String(stepNum).padStart(2, '0')} / {String(stepTotal).padStart(2, '0')}
          </span>
        </div>

        {/* divider */}
        <div className="h-4 w-px bg-border" />

        {/* time */}
        <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
          {fmt(elapsed)} <span className="text-border">·</span> <span className="text-foreground/70">{fmt(totalMs)}</span>
        </div>

        {/* speed cycler — single tiny pill */}
        <button
          onClick={cycleSpeed}
          className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-muted hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Cycle playback speed"
        >
          {speed}x
        </button>

        {/* restart */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onReset}
          title="Restart (R)"
        >
          <ArrowCounterClockwise size={12} weight="bold" />
        </Button>
      </div>
    </div>
  )
}

function fmt(ms: number) {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
