import PDFDocument from 'pdfkit'
import { FEEDBACK_SECTIONS } from '../../src/utils/feedbackQuestions.js'

const TEAL = '#2E5A63'
const ACCENT = '#5F94AC'
const GRAY = '#6B7280'

function formatAnswer(field, answers) {
  const v = answers[field.key]
  if (v === undefined || v === null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (field.type === 'scale5') return `${v} / 5`
  return String(v)
}

export function buildFeedbackPdf({ nurseryName, respondentName, pilotPeriod, answers, submittedAt }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(20).text('Smart Dismissal System — Pilot Feedback', { align: 'left' })
    doc.moveDown(0.3)
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
    doc.text(`Nursery: ${nurseryName}`)
    if (respondentName) doc.text(`Submitted by: ${respondentName}`)
    if (pilotPeriod) doc.text(`Pilot period: ${pilotPeriod}`)
    doc.text(`Submitted: ${new Date(submittedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`)
    doc.moveDown(1)

    for (const section of FEEDBACK_SECTIONS) {
      // Keep a section's heading attached to at least its first question.
      if (doc.y > 680) doc.addPage()

      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text(section.title)
      doc.moveDown(0.4)

      for (const field of section.fields) {
        if (doc.y > 720) doc.addPage()

        doc.fillColor('#1F2937').font('Helvetica-Bold').fontSize(10).text(field.label)
        doc.fillColor(GRAY).font('Helvetica').fontSize(10).text(formatAnswer(field, answers), { indent: 10 })

        if (field.explainKey && answers[field.explainKey]) {
          doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(9).text(`Explanation: ${answers[field.explainKey]}`, {
            indent: 10,
          })
        }
        doc.moveDown(0.6)
      }
      doc.moveDown(0.4)
    }

    // PDFKit auto-inserts a page break whenever an explicit y sits past
    // page.height - page.margins.bottom — 760 is past that boundary with a
    // 50pt margin, so this was silently starting a fresh (near-blank) page
    // just to print one footer line. Zeroing the bottom margin for this one
    // call lets it render on the current page instead.
    const bottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(8).text('Technothera · Smart Dismissal System', 50, 760, {
      width: 512,
      align: 'center',
    })
    doc.page.margins.bottom = bottomMargin

    doc.end()
  })
}
