interface Props { name: string; phone: string; address: string; problem: string }

export function LeadFormInbound({ name, phone, address, problem }: Props) {
  return (
    <div className="h-full w-full bg-slate-950 text-slate-200 font-mono text-xs p-6 overflow-auto">
      <div className="text-emerald-400 mb-3">// inbound webhook payload — acmehomes.com/quote</div>
      <div className="text-slate-500 mb-1">POST /webhooks/lead-form HTTP/1.1</div>
      <div className="text-slate-500">Content-Type: application/json</div>
      <div className="text-slate-500">X-Acme-Webhook-Secret: ••••••••</div>
      <div className="text-slate-500 mb-4">User-Agent: acmehomes-website/2.1</div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <pre className="text-slate-200 leading-relaxed">{`{
  "form": "quote_request",
  "submitted_at": "2026-05-27T18:14:02-04:00",
  "lead": {
    "name": ${JSON.stringify(name)},
    "phone": ${JSON.stringify(phone)},
    "email": "smaddox@yahoo.com",
    "address": ${JSON.stringify(address)},
    "city": "Pittsburgh",
    "state": "PA",
    "zip": "15217",
    "problem": ${JSON.stringify(problem)},
    "urgency": "today_if_possible",
    "referrer": "google: \\"ac stopped cooling pittsburgh\\""
  },
  "consent": { "sms": true, "call": true }
}`}</pre>
      </div>

      <div className="mt-4 text-slate-500">→ matched automation auto-002 "lead intake → personalized quote SMS"</div>
      <div className="text-slate-500">→ dispatching worker run-002 in workspace acme-home-services</div>
    </div>
  )
}
