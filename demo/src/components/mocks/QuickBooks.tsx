import { Plus, FileText, PaperPlaneTilt } from '@phosphor-icons/react'

export function QuickBooksInvoice({ jobId }: { jobId: string }) {
  // Hardcoded around J-4178 (Reeves) so the demo numbers line up.
  void jobId
  return (
    <div className="h-full w-full bg-slate-50 text-slate-900 text-[13px]">
      <div className="h-12 bg-slate-900 text-white px-6 flex items-center gap-6 text-sm">
        <div className="font-bold">qb<span className="text-green-400">·</span></div>
        <span className="opacity-80">Dashboard</span>
        <span className="opacity-80">Sales</span>
        <span className="opacity-100 text-green-400 underline-offset-4 underline">Invoices</span>
        <span className="opacity-60">Customers</span>
        <span className="opacity-60">Reports</span>
        <div className="ml-auto text-xs opacity-70">Acme Home Services LLC</div>
      </div>

      <div className="px-6 pt-4">
        <div className="text-[11px] text-slate-500 mb-1">Invoices › New</div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">New invoice <span className="text-green-600 text-sm font-normal ml-2">DRAFT · created by Basics</span></h2>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-xs border border-slate-300 rounded">Save & close</button>
            <button className="px-3 py-1.5 text-xs bg-green-600 text-white rounded inline-flex items-center gap-1.5 opacity-60 cursor-not-allowed">
              <PaperPlaneTilt size={11} weight="fill" /> Save and send
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-6 pb-4 border-b border-slate-100">
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Bill to</div>
              <div className="font-medium">James Reeves</div>
              <div className="text-xs text-slate-500">4421 Beechwood Blvd<br />Pittsburgh, PA 15217</div>
              <div className="text-xs text-slate-500 mt-1">jreeves@gmail.com</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">Invoice no.</div>
              <div className="font-mono text-slate-900">INV-2041</div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide mt-3 mb-1">Date · due</div>
              <div className="text-xs">May 27, 2026 · Jun 26, 2026</div>
            </div>
          </div>

          <div className="pt-4">
            <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 text-[11px] text-slate-500 uppercase tracking-wide font-semibold pb-2 border-b border-slate-100">
              <div>Product / service</div><div>Qty</div><div>Rate</div><div className="text-right">Amount</div>
            </div>
            <Row product="Water heater — 65gal, AO Smith ProLine" qty="1" rate="$1,180.00" amt="$1,180.00" />
            <Row product="Labor — install + city permit" qty="4 hr" rate="$160.00" amt="$640.00" />
            <Row product="Parts kit — pan, drip line, flex" qty="1" rate="$80.00" amt="$80.00" />
            <Row product="Haul-away — old unit" qty="1" rate="$0.00" amt="$0.00" />
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
            <div className="text-right text-sm w-72 space-y-1">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>$1,900.00</span></div>
              <div className="flex justify-between text-slate-600"><span>Discount (loyal customer)</span><span>−$60.00</span></div>
              <div className="flex justify-between text-base font-semibold pt-2 border-t border-slate-200"><span>Total</span><span>$1,840.00</span></div>
              <div className="flex justify-between text-slate-500 text-xs"><span>Balance due</span><span>$1,840.00</span></div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded bg-green-50 border border-green-200 text-xs text-green-800 inline-flex items-center gap-2">
            <Plus size={12} /> Basics will email this draft to James once you approve. The invoice will be saved as DRAFT in QuickBooks until then.
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ product, qty, rate, amt }: { product: string; qty: string; rate: string; amt: string }) {
  return (
    <div className="grid grid-cols-[1fr_80px_100px_100px] gap-2 py-2 border-b border-slate-100 text-[13px]">
      <div className="inline-flex items-center gap-1.5"><FileText size={11} className="text-slate-400" /> {product}</div>
      <div className="text-slate-700">{qty}</div>
      <div className="text-slate-700">{rate}</div>
      <div className="text-right font-medium">{amt}</div>
    </div>
  )
}
