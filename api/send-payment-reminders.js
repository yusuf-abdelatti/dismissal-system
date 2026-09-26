import { createClient } from '@supabase/supabase-js'

const REMINDER_INTERVAL_DAYS = 3
const REMINDER_RECIPIENTS = ['technothera@gmail.com', 'yusuf.a.abdelatti@gmail.com']
// technothera.com is verified with Resend, so sending is no longer
// restricted to the Resend account's own email — this now reaches any
// recipient, including both addresses above.
const FROM_ADDRESS = 'Technothera <billing@technothera.com>'

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function sendReminderEmail({ organizationName, statement }) {
  const subject = `Payment reminder — ${organizationName} (${statement.period_start} → ${statement.period_end})`
  const text = `Reminder: the payment statement for ${organizationName}, covering ${statement.period_start} to ${statement.period_end}, is not yet marked as paid.

Total due: ${fmt(statement.total_due_egp)} EGP

This is an automated reminder — it will keep repeating every few days until the statement is marked paid in the Super Admin panel.`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: REMINDER_RECIPIENTS,
      subject,
      text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

export default async function handler(req, res) {
  // Vercel Cron includes this header automatically when CRON_SECRET is set
  // as an environment variable — this is what stops anyone else from
  // triggering an endpoint that reads across every organization and sends
  // real emails.
  const authHeader = req.headers.authorization
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Service-role client — this runs on a schedule with no logged-in user,
  // so there's no session JWT to scope an RLS-respecting client to. It
  // only ever reads billing_statements/organizations and writes
  // last_reminder_sent_at, nothing user-facing.
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: statements, error } = await supabase
    .from('billing_statements')
    .select('id, organization_id, period_start, period_end, total_due_egp, last_reminder_sent_at, organizations(name)')
    .eq('paid', false)
    .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lte.${cutoff}`)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  let sent = 0
  const failures = []

  for (const statement of statements || []) {
    try {
      await sendReminderEmail({
        organizationName: statement.organizations?.name || 'Organization',
        statement,
      })
      await supabase
        .from('billing_statements')
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq('id', statement.id)
      sent += 1
    } catch (err) {
      failures.push({ statementId: statement.id, error: err.message })
    }
  }

  res.status(200).json({ checked: (statements || []).length, sent, failures })
}
