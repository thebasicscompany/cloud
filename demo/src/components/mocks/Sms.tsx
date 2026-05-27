import { useEffect, useRef } from 'react'
import { CaretLeft, VideoCamera, Plus, Waveform, Camera, Image as ImageIcon, AppWindow } from '@phosphor-icons/react'

interface Props { to: string; body: string; typed: number }

/* -----------------------------------------------------------------------------
   iPhone 15 Pro silhouette. Strict flex column. Messages region scrolls to
   the bottom as the bubble grows, with `pb-3` so the last bubble never
   crowds the composer's top edge.
----------------------------------------------------------------------------- */

export function SmsCompose({ to, body, typed }: Props) {
  const visible = body.slice(0, typed)
  const isTyping = typed < body.length
  const [phone, name] = to.split(' · ').length > 1 ? [to.split(' · ')[0], to.split(' · ')[1]] : [to, 'Customer']
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  const msgRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight
  }, [typed])

  return (
    <div className="h-full w-full flex items-center justify-center px-10 py-4 overflow-auto"
      style={{ background: 'radial-gradient(110% 80% at 50% 0%, #ffffff 0%, #f4f4f3 55%, #ebebe9 100%)' }}>
      <div className="flex items-center gap-12 max-w-5xl">

        <div className="relative shrink-0">
          {/* titanium frame */}
          <div
            className="relative w-[278px] h-[570px] rounded-[44px] p-[3px]"
            style={{
              background: 'linear-gradient(140deg, #5a5a5d 0%, #2a2a2c 35%, #1c1c1e 65%, #4a4a4d 100%)',
              boxShadow: '0 40px 70px -25px rgba(0,0,0,0.5), 0 20px 40px -20px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            {/* bezel */}
            <div className="relative w-full h-full rounded-[42px] bg-black overflow-hidden">
              {/* screen — clips everything */}
              <div className="absolute inset-[4px] rounded-[39px] overflow-hidden bg-white flex flex-col">

                {/* Dynamic Island */}
                <div className="absolute left-1/2 -translate-x-1/2 top-[10px] w-[100px] h-[30px] rounded-full bg-black z-30 pointer-events-none" />

                {/* status bar */}
                <div className="shrink-0 h-10 flex items-center justify-between px-6 pt-1.5 text-[12.5px] font-semibold text-black">
                  <span className="tabular-nums">6:01</span>
                  <span className="flex items-center gap-1.5">
                    <span className="flex items-end gap-[2px]">
                      <span className="w-[3px] h-[4px] bg-black rounded-[1px]" />
                      <span className="w-[3px] h-[6px] bg-black rounded-[1px]" />
                      <span className="w-[3px] h-[8px] bg-black rounded-[1px]" />
                      <span className="w-[3px] h-[10px] bg-black rounded-[1px]" />
                    </span>
                    <span className="text-[10.5px] font-bold tracking-tight ml-0.5">5G</span>
                    <span className="ml-1 relative w-[22px] h-[10px] rounded-[3px] border border-black/80 flex items-center">
                      <span className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-[5px] rounded-r-[1px] bg-black/80" />
                      <span className="ml-[1.5px] h-[7px] bg-black rounded-[1.5px]" style={{ width: '15px' }} />
                    </span>
                  </span>
                </div>

                {/* compact chat header */}
                <div className="shrink-0 bg-[#f6f6f6]/95 backdrop-blur border-b border-black/[0.06] px-3 pt-1 pb-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <button className="text-[#007aff] flex items-center -ml-1">
                      <CaretLeft size={18} weight="bold" />
                      <span className="text-[13px] -ml-0.5">7</span>
                    </button>
                    <button className="text-[#007aff]">
                      <VideoCamera size={16} weight="regular" />
                    </button>
                  </div>
                  <div className="flex flex-col items-center -mt-1">
                    <div className="size-8 rounded-full flex items-center justify-center text-white font-semibold text-[12px] mb-0.5"
                      style={{ background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)' }}>
                      {initials}
                    </div>
                    <div className="text-[11.5px] font-medium text-black leading-tight">{name}</div>
                    <div className="text-[9.5px] text-[#8e8e93] leading-tight">{phone}</div>
                  </div>
                </div>

                {/* messages — scrollable, with bottom padding so bubble never crowds composer */}
                <div
                  ref={msgRef}
                  className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pt-2 pb-3"
                >
                  <div className="text-center text-[9.5px] text-[#8e8e93] mb-2">
                    <span className="font-semibold">Today</span> <span>6:01 PM</span>
                  </div>

                  <div className="flex justify-end mb-0.5">
                    <div className="max-w-[78%]">
                      <div
                        className="px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap text-white break-words"
                        style={{
                          background: 'linear-gradient(180deg, #2090ff 0%, #007aff 100%)',
                          borderRadius: '18px',
                          borderBottomRightRadius: '5px',
                          minHeight: '28px',
                        }}
                      >
                        <span className={isTyping ? 'caret' : ''}>{visible}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right pr-1 text-[9px] text-[#8e8e93]">
                    {isTyping ? 'Drafting…' : 'Pending approval'}
                  </div>
                </div>

                {/* composer — sits inside an inset safe area so its rounded
                    rectangle stays clear of the screen's curved corners */}
                <div
                  className="shrink-0 bg-[#f6f6f6]/95 backdrop-blur border-t border-black/[0.06] px-4 pt-2 pb-1"
                  style={{ boxShadow: '0 -8px 12px -8px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex items-end gap-2">
                    <button className="size-[26px] rounded-full bg-[#e5e5ea] text-black flex items-center justify-center shrink-0">
                      <Plus size={14} weight="bold" />
                    </button>
                    <div className="flex-1 rounded-[16px] bg-white border border-black/[0.08] pl-3 pr-1 py-[4px] flex items-center gap-1">
                      <span className="text-[12.5px] text-[#bcbcbf] flex-1">iMessage</span>
                      <button className="size-[22px] rounded-full bg-[#e5e5ea] text-[#8e8e93] flex items-center justify-center">
                        <Waveform size={12} weight="bold" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-1.5 text-[#8e8e93]">
                    <Camera size={14} weight="regular" />
                    <ImageIcon size={14} weight="regular" />
                    <AppWindow size={14} weight="regular" />
                  </div>
                </div>

                {/* home indicator strip — taller to clear the screen curve */}
                <div className="shrink-0 h-6 flex items-end justify-center pb-1.5">
                  <div className="w-28 h-[4px] rounded-full bg-black/85" />
                </div>
              </div>
            </div>
          </div>

          {/* side buttons */}
          <div className="absolute -left-[3px] top-[110px] w-[3px] h-[26px] rounded-l-sm bg-[#4a4a4d]" />
          <div className="absolute -left-[3px] top-[150px] w-[3px] h-[44px] rounded-l-sm bg-[#4a4a4d]" />
          <div className="absolute -left-[3px] top-[208px] w-[3px] h-[44px] rounded-l-sm bg-[#4a4a4d]" />
          <div className="absolute -right-[3px] top-[160px] w-[3px] h-[72px] rounded-r-sm bg-[#4a4a4d]" />
        </div>

        {/* annotation column */}
        <div className="max-w-xs space-y-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-700 font-semibold">drafted from your customer history</div>
          <div className="font-display text-[22px] tracking-tight text-black leading-tight">
            Mentions the kids. The heat. The neighborhood. The likely cause. The price band.
          </div>
          <p className="text-[13px] text-black/65 leading-relaxed">
            All from data Basics already had — JobBoard Pro records, Google Maps public records, your last 90 days of capacitor jobs in Squirrel Hill.
          </p>
          <div className="pt-3 border-t border-black/10">
            <div className="text-[10.5px] uppercase tracking-wider text-black/50 mb-1.5">time spent by you</div>
            <div className="font-mono text-2xl tabular-nums text-black">0:00</div>
            <div className="text-[11.5px] text-black/50 mt-1">From form submit to drafted text: 14 seconds.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
