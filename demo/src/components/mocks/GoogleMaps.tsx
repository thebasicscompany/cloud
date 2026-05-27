import { MapPin, Star, House as HomeIcon } from '@phosphor-icons/react'

export function GoogleMapsMock({ address }: { address: string }) {
  return (
    <div className="h-full w-full relative">
      {/* fake map — a grid + roads */}
      <div className="absolute inset-0 bg-[#e7f0d5]">
        <svg className="w-full h-full opacity-90" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
          {/* major roads */}
          <path d="M0 320 H800" stroke="#fff" strokeWidth="14" />
          <path d="M0 320 H800" stroke="#fcd34d" strokeWidth="8" />
          <path d="M380 0 V600" stroke="#fff" strokeWidth="10" />
          {/* minor roads */}
          <path d="M0 140 H800" stroke="#fff" strokeWidth="4" />
          <path d="M0 480 H800" stroke="#fff" strokeWidth="4" />
          <path d="M180 0 V600" stroke="#fff" strokeWidth="3" />
          <path d="M580 0 V600" stroke="#fff" strokeWidth="3" />
          {/* parks */}
          <rect x="40" y="380" width="120" height="80" fill="#c2e09a" />
          <rect x="600" y="40" width="150" height="100" fill="#c2e09a" />
          {/* buildings */}
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (i % 10) * 80 + 20
            const y = Math.floor(i / 10) * 70 + 20
            return <rect key={i} x={x} y={y} width="24" height="22" fill="#dadcd6" opacity={0.7} />
          })}
        </svg>
      </div>

      {/* pin at center */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <div className="relative">
          <MapPin size={36} className="text-red-500 drop-shadow-lg" weight="fill" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 mt-1 bg-white rounded-md shadow-lg px-3 py-2 text-xs whitespace-nowrap">
          <div className="font-medium text-slate-900">218 Maple St</div>
          <div className="text-slate-500">Squirrel Hill, Pittsburgh</div>
        </div>
      </div>

      {/* google maps chrome */}
      <div className="absolute top-3 left-3 bg-white rounded-full shadow-lg px-4 py-2 text-xs flex items-center gap-2 border border-slate-200">
        <div className="text-blue-500 font-bold text-sm">G</div>
        <span className="text-slate-700">{address}</span>
      </div>

      {/* info card */}
      <div className="absolute bottom-3 right-3 w-80 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Property details · public records</div>
          <div className="font-semibold text-slate-900">218 Maple St, Pittsburgh PA 15217</div>
          <div className="text-xs text-slate-500">Squirrel Hill South · single family</div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
            <Stat label="size" value="1,940 sqft" />
            <Stat label="built" value="1953" />
            <Stat label="lot" value="0.12 acre" />
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1"><HomeIcon size={10} weight="regular" /> Older home — likely original ductwork</div>
        </div>
        <div className="border-t border-slate-100 p-3 bg-slate-50">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Comparable jobs in this neighborhood</div>
          <div className="space-y-1 text-[11px]">
            <Comp date="Apr 14" address="312 Wightman St"   problem="AC stopped" outcome="capacitor · $385" />
            <Comp date="Mar 02" address="89 Beechwood Blvd" problem="AC stopped" outcome="capacitor · $325" />
            <Comp date="Jul 22 '25" address="650 Forbes Ave" problem="No cool air" outcome="contactor · $410" />
          </div>
        </div>
        <div className="border-t border-slate-100 p-2 bg-emerald-50 text-[11px] text-emerald-800 flex items-center gap-1.5">
          <Star size={11} weight="fill" className="text-emerald-600" /> 2/3 same-day capacitor fixes · avg $373
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-900">{value}</div>
    </div>
  )
}

function Comp({ date, address, problem, outcome }: { date: string; address: string; problem: string; outcome: string }) {
  return (
    <div className="grid grid-cols-[50px_1fr_auto] gap-2 text-[11px]">
      <div className="text-slate-400 font-mono">{date}</div>
      <div className="truncate">
        <span className="text-slate-700">{address}</span>{' '}
        <span className="text-slate-500">— {problem}</span>
      </div>
      <div className="text-slate-900 font-medium">{outcome}</div>
    </div>
  )
}
