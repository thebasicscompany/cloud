import { MagnifyingGlass, Plus, CheckCircle, Clock, CaretRight, FileText, MapPin, Phone, User } from '@phosphor-icons/react'

/* --- JobBoard Pro is a made-up SaaS so the demo isn't tied to any vendor --- */

const JOBS = [
  {
    id: 'J-4178', customer: 'James Reeves', address: '4421 Beechwood Blvd, Pittsburgh PA',
    type: 'Water heater install', tech: 'Mike Sullivan', completedAt: '4:12 PM',
    total: '$1,840', balance: '$1,840', status: 'completed' as const,
  },
  {
    id: 'J-4181', customer: 'Sarah Chen', address: '218 Maple St, Squirrel Hill',
    type: 'AC tune-up', tech: 'Jorge Vargas', completedAt: '3:48 PM',
    total: '$245', balance: '$245', status: 'completed' as const,
  },
  {
    id: 'J-4183', customer: 'Marcus Diaz', address: '887 Negley Ave, Pittsburgh PA',
    type: 'Electrical panel upgrade', tech: 'Mike Sullivan', completedAt: '2:21 PM',
    total: '$3,200', balance: '$0 (paid)', status: 'completed' as const,
  },
  {
    id: 'J-4188', customer: 'Patel family', address: '12 Wightman St, Squirrel Hill',
    type: 'Drain clear', tech: 'Jorge Vargas', completedAt: '— in progress',
    total: '$180', balance: '—', status: 'in_progress' as const,
  },
  {
    id: 'J-4191', customer: 'Lisa Wong', address: '90 Forbes Ave', type: 'Estimate visit',
    tech: 'Mike Sullivan', completedAt: '— scheduled 5:30 PM',
    total: '—', balance: '—', status: 'scheduled' as const,
  },
]

export function JobBoardDashboard() {
  return (
    <div className="h-full w-full bg-slate-50 text-slate-900 text-[13px]">
      <Header />
      <div className="px-6 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Today · Mon, May 27</h2>
          <button className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium inline-flex items-center gap-1">
            <Plus size={12} /> New job
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4 text-xs">
          <Pill active>Completed (3)</Pill>
          <Pill>In progress (1)</Pill>
          <Pill>Scheduled (1)</Pill>
          <Pill>All (12)</Pill>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[80px_1fr_1fr_120px_100px_90px] gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            <div>Job</div><div>Customer</div><div>Type / Tech</div><div>Completed</div><div>Balance</div><div>Status</div>
          </div>
          {JOBS.map((j, i) => (
            <div
              key={j.id}
              className="grid grid-cols-[80px_1fr_1fr_120px_100px_90px] gap-2 px-4 py-3 border-b border-slate-100 hover:bg-slate-50"
            >
              <div className="font-mono text-xs text-slate-700">{j.id}</div>
              <div>
                <div className="font-medium">{j.customer}</div>
                <div className="text-[11px] text-slate-500 truncate">{j.address}</div>
              </div>
              <div>
                <div>{j.type}</div>
                <div className="text-[11px] text-slate-500">w/ {j.tech}</div>
              </div>
              <div className="text-slate-700">{j.completedAt}</div>
              <div className={j.balance.startsWith('$0') ? 'text-emerald-600' : 'text-slate-900 font-medium'}>{j.balance}</div>
              <div>
                {j.status === 'completed' && <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px]"><CheckCircle size={11} weight="fill" />done</span>}
                {j.status === 'in_progress' && <span className="inline-flex items-center gap-1 text-amber-700 text-[11px]"><Clock size={11} />active</span>}
                {j.status === 'scheduled' && <span className="text-slate-500 text-[11px]">scheduled</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-slate-400 mt-3">5 of 12 jobs shown · sorted by completion time</div>
      </div>
    </div>
  )
}

export function JobBoardJobDetail({ jobId }: { jobId: string }) {
  const j = JOBS.find((x) => x.id === jobId) ?? JOBS[0]
  return (
    <div className="h-full w-full bg-slate-50 text-slate-900 text-[13px]">
      <Header />
      <div className="px-6 pt-4">
        <div className="text-[11px] text-slate-500 mb-1">
          <a className="hover:underline">Today</a> <CaretRight size={11} weight="bold" className="inline" /> Job {j.id}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{j.type}</h2>
              {j.status === 'completed' && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[11px] font-medium inline-flex items-center gap-1 job-header__status">
                  <CheckCircle size={11} weight="fill" /> Completed
                </span>
              )}
            </div>
            <div className="text-slate-500 text-xs mt-1 font-mono">{j.id} · {j.completedAt}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">Outstanding</div>
            <div className="text-2xl font-bold text-slate-900 balance-due"><strong>{j.balance}</strong></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-2 inline-flex items-center gap-1"><User size={11} /> Customer</div>
            <div className="font-medium">{j.customer}</div>
            <div className="text-xs text-slate-500 mt-2 inline-flex items-center gap-1"><Phone size={10} /> (412) 555-0119</div>
            <div className="text-xs text-slate-500 inline-flex items-center gap-1"><MapPin size={10} /> {j.address}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">Technician</div>
            <div className="font-medium">{j.tech}</div>
            <div className="text-xs text-slate-500 mt-2">on site 1:18 PM → 4:12 PM</div>
            <div className="text-xs text-slate-500">"replaced 50gal w/ 65gal, brought up to code"</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-2">Total</div>
            <div className="text-lg font-semibold">{j.total}</div>
            <div className="text-xs text-slate-500 mt-2">Labor $640 · Parts $1,200</div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-2.5 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1"><FileText size={11} /> Line items</div>
          <ul className="divide-y divide-slate-100">
            <Line label="Water heater — 65gal gas, AO Smith ProLine" qty="1" amt="$1,180" />
            <Line label="Labor — install + permit" qty="4 hr" amt="$640" />
            <Line label="Pan, drip line, flex connectors" qty="kit" amt="$80" />
            <Line label="Old unit haul-away" qty="—" amt="incl." />
          </ul>
        </div>
      </div>
    </div>
  )
}

function Line({ label, qty, amt }: { label: string; qty: string; amt: string }) {
  return (
    <li className="grid grid-cols-[1fr_80px_80px] px-4 py-2.5 text-[12px]">
      <div>{label}</div>
      <div className="text-slate-500">{qty}</div>
      <div className="text-right">{amt}</div>
    </li>
  )
}

function Header() {
  return (
    <div className="h-12 bg-emerald-700 text-white px-6 flex items-center gap-6 text-sm">
      <div className="font-semibold">JobBoard Pro</div>
      <a className="opacity-80 hover:opacity-100">Today</a>
      <a className="opacity-60 hover:opacity-100">Schedule</a>
      <a className="opacity-60 hover:opacity-100">Customers</a>
      <a className="opacity-60 hover:opacity-100">Invoices</a>
      <a className="opacity-60 hover:opacity-100">Reports</a>
      <div className="ml-auto flex items-center gap-3">
        <div className="px-2 py-1 rounded bg-emerald-600/50 text-xs inline-flex items-center gap-1"><MagnifyingGlass size={11} weight="bold" /> Search jobs</div>
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-[11px] font-bold">MS</div>
      </div>
    </div>
  )
}

function Pill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className="px-2.5 py-1 rounded-full inline-flex items-center gap-1 cursor-pointer"
      style={{
        background: active ? '#10b981' : 'white',
        color: active ? 'white' : '#475569',
        border: '1px solid ' + (active ? '#10b981' : '#e2e8f0'),
      }}
    >
      {children}
    </span>
  )
}
