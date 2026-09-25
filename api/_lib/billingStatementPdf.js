import PDFDocument from 'pdfkit'

const TEAL = '#2E5A63'
const ACCENT = '#5F94AC'
const GRAY = '#6B7280'
const NOTE_GRAY = '#9CA3AF'
const DARK = '#1F2937'

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > 700) doc.addPage()
}

export function buildBillingStatementPdf({ organization, breakdown, generatedAt }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 56 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(20).text('Technothera — Payment Statement')
    doc.moveDown(0.3)
    doc.fillColor(GRAY).font('Helvetica').fontSize(10.5)
    doc.text(`Organization: ${organization.name}`)
    doc.text(`Period: ${breakdown.periodStart} to ${breakdown.periodEnd}  (${breakdown.months} month${breakdown.months === 1 ? '' : 's'} billed)`)
    // Pinned to Cairo explicitly — this runs on a Vercel serverless
    // function, which defaults to UTC, not the nursery's local time. Left
    // unpinned this silently showed a time 2 hours off (and could even
    // show the wrong calendar date near midnight Cairo time).
    doc.text(
      `Generated: ${new Date(generatedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Cairo' })}`
    )
    doc.moveDown(1)

    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Per-Branch Detail')
    doc.moveDown(0.4)

    const xs = [56, 260, 350, 440]
    const widths = [190, 80, 80, 76]
    const headerY = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
    ;['Branch', 'Avg Seats', 'Rate', 'Subtotal'].forEach((h, i) => doc.text(h, xs[i], headerY, { width: widths[i] }))
    doc.moveDown(1)
    doc.moveTo(56, doc.y).lineTo(556, doc.y).strokeColor('#E5E7EB').stroke()
    doc.moveDown(0.4)

    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    for (const b of breakdown.branches) {
      ensureSpace(doc, 20)
      const rowY = doc.y
      doc.text(b.name, xs[0], rowY, { width: widths[0] })
      doc.text(b.avgSeats.toFixed(1), xs[1], rowY, { width: widths[1] })
      doc.text(`${breakdown.rate} EGP`, xs[2], rowY, { width: widths[2] })
      doc.text(`${fmt(b.subtotal)} EGP`, xs[3], rowY, { width: widths[3] })
      doc.moveDown(0.9)
    }
    doc.x = 56
    doc.moveDown(0.6)

    ensureSpace(doc, 90)
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('How This Was Calculated')
    doc.moveDown(0.3)
    doc.fillColor(GRAY).font('Helvetica').fontSize(10).text(
      'Each branch’s daily active-child count is recorded automatically every day. The figure above for each branch is the average of those daily counts over this period, multiplied by the rate and the number of months billed.',
      { width: 500 }
    )
    doc.moveDown(0.3)
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10.5).text(
      `Combined average across all branches: ${breakdown.combinedAvgSeats.toFixed(1)}${breakdown.seatLimit != null ? ` of ${breakdown.seatLimit} shared seats` : ''}`
    )
    doc.moveDown(1)

    ensureSpace(doc, 140)
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Amount Due')
    doc.moveDown(0.4)
    doc.moveTo(56, doc.y).lineTo(556, doc.y).strokeColor('#E5E7EB').stroke()
    doc.moveDown(0.5)

    const line = (label, value, note) => {
      const y = doc.y
      doc.fillColor(DARK).font('Helvetica').fontSize(10.5).text(label, 56, y, { width: 350 })
      doc.font('Helvetica-Bold').text(`${fmt(value)} EGP`, 380, y, { width: 176, align: 'right' })
      if (note) {
        doc.fillColor(NOTE_GRAY).font('Helvetica-Oblique').fontSize(8).text(note, 56, doc.y, { width: 500 })
      }
      doc.moveDown(0.5)
    }

    line('Recurring subscription (this period)', breakdown.recurringTotal)
    if (breakdown.setupFeeEgp > 0) {
      line('One-time setup fee', breakdown.setupFeeEgp, 'Included on this statement only')
    }

    doc.moveDown(0.3)
    doc.moveTo(56, doc.y).lineTo(556, doc.y).strokeColor('#E5E7EB').stroke()
    doc.moveDown(0.4)
    const totalY = doc.y
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text('Total Due', 56, totalY, { width: 350 })
    doc.font('Helvetica-Bold').fontSize(13).text(`${fmt(breakdown.totalDue)} EGP`, 380, totalY, { width: 176, align: 'right' })
    doc.x = 56

    doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(8).text('Technothera · Smart Dismissal System', 56, 750, {
      width: 500,
      align: 'center',
    })

    doc.end()
  })
}
