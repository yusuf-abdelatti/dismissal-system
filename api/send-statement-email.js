import { createClient } from '@supabase/supabase-js'
import { buildBillingStatementPdf } from './_lib/billingStatementPdf.js'

const FROM_ADDRESS = 'Technothera <billing@technothera.com>'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return
  }

  // Same pattern as generate-billing-statement.js — scoped to the caller's
  // own JWT, so this can only ever send statements the calling account is
  // actually allowed to see.
  const callerClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userError } = await callerClient.auth.getUser()
  if (userError || !user) {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  const { data: superAdminRow } = await callerClient.from('super_admins').select('id').eq('id', user.id).maybeSingle()
  if (!superAdminRow) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const { statementId, to, message } = req.body || {}
  if (!statementId || !to || !message) {
    res.status(400).json({ error: 'statementId, to and message are required' })
    return
  }

  const { data: statement } = await callerClient.from('billing_statements').select('*').eq('id', statementId).maybeSingle()
  if (!statement) {
    res.status(404).json({ error: 'Statement not found' })
    return
  }

  const { data: organization } = await callerClient
    .from('organizations')
    .select('name')
    .eq('id', statement.organization_id)
    .maybeSingle()

  const pdfBuffer = await buildBillingStatementPdf({
    organization: organization || { name: 'Organization' },
    breakdown: statement.breakdown,
    generatedAt: statement.generated_at,
  })

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Payment Statement — ${organization?.name || 'Technothera'} (${statement.period_start} to ${statement.period_end})`,
      text: message,
      attachments: [
        {
          filename: `${(organization?.name || 'statement').replace(/[^a-z0-9]+/gi, '-')}-${statement.period_start}-to-${statement.period_end}.pdf`,
          content: pdfBuffer.toString('base64'),
        },
      ],
    }),
  })

  if (!resendRes.ok) {
    const body = await resendRes.text().catch(() => '')
    res.status(502).json({ error: `Could not send email: ${body}` })
    return
  }

  res.status(200).json({ ok: true })
}
