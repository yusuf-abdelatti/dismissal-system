import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import { buildFeedbackPdf } from './_lib/feedbackPdf.js'
import { NURSERY_OPTIONS } from '../src/utils/feedbackQuestions.js'

// Plain anon-key client, not the service-role admin client — the table's
// RLS policy already permits public inserts (this form is intentionally
// unauthenticated), so there's no reason to use a more powerful credential
// than the operation actually needs.
let supabase = null
function getClient() {
  if (!supabase) {
    supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  }
  return supabase
}

let transporter = null
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })
  }
  return transporter
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { nurseryName, pilotPeriod, answers } = req.body || {}

  if (!nurseryName || !NURSERY_OPTIONS.includes(nurseryName) || !answers || typeof answers !== 'object') {
    res.status(400).json({ error: 'Invalid submission' })
    return
  }

  const submittedAt = new Date().toISOString()

  const { error: dbError } = await getClient().from('dismissal_feedback_responses').insert({
    nursery_name: nurseryName,
    role: answers.role || null,
    overall_satisfaction: Number.isFinite(answers.overall_satisfaction) ? answers.overall_satisfaction : null,
    reliability_rating: Number.isFinite(answers.reliability_rating) ? answers.reliability_rating : null,
    adds_real_value: answers.adds_real_value || null,
    continue_using: answers.continue_using || null,
    answers,
    submitted_at: submittedAt,
  })

  if (dbError) {
    console.error('feedback insert failed:', dbError.message)
    res.status(500).json({ error: 'Could not save submission' })
    return
  }

  // Email is best-effort — the response is already safely stored, so a mail
  // hiccup shouldn't make the submitter think their feedback was lost.
  try {
    const pdfBuffer = await buildFeedbackPdf({ nurseryName, pilotPeriod, answers, submittedAt })

    await getTransporter().sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: `Pilot Feedback — ${nurseryName}`,
      text: `New pilot feedback submitted by ${nurseryName}${pilotPeriod ? ` (${pilotPeriod})` : ''}. PDF attached.`,
      attachments: [
        {
          filename: `${nurseryName.replace(/[^a-z0-9]+/gi, '-')}-feedback-${submittedAt.slice(0, 10)}.pdf`,
          content: pdfBuffer,
        },
      ],
    })
  } catch (mailError) {
    console.error('feedback email failed:', mailError.message)
  }

  res.status(200).json({ ok: true })
}
