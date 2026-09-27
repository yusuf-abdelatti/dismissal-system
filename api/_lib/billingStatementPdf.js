import PDFDocument from 'pdfkit'
import { NAVY, TEAL_LIGHT, GRAY, GRAY_LIGHT, DARK, drawBanner, infoColumns, sectionHeading, glanceBoxes, table, footer, ensureSpace } from './pdfTheme.js'

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function buildBillingStatementPdf({ organization, breakdown, generatedAt }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    // Pinned to Cairo explicitly — this runs on a Vercel serverless
    // function, which defaults to UTC, not the nursery's local time. Left
    // unpinned this silently showed a time 2 hours off (and could even
    // show the wrong calendar date near midnight Cairo time).
    const generatedLabel = new Date(generatedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Cairo' })

    drawBanner(doc, {
      leftTitle: 'TECHNOTHERA',
      leftSubtitle: 'Smart Dismissal System',
      rightTitle: 'PAYMENT STATEMENT',
      rightSubtitle: `Generated: ${generatedLabel}`,
    })

    infoColumns(doc, [
      { label: 'Organization', lines: [organization.name] },
      {
        label: 'Period Covered',
        lines: [`${breakdown.periodStart} to ${breakdown.periodEnd}`, `${breakdown.months} month${breakdown.months === 1 ? '' : 's'} billed`],
      },
    ])

    glanceBoxes(doc, [
      { label: 'Total Due', value: `${fmt(breakdown.totalDue)} EGP` },
      {
        label: 'Combined Avg Seats',
        value: breakdown.combinedAvgSeats.toFixed(1),
        caption: breakdown.seatLimit != null ? `of ${breakdown.seatLimit} shared seats` : undefined,
      },
    ])

    sectionHeading(doc, 'Per-Branch Detail')
    table(doc, {
      columns: [
        { header: 'Branch', width: 220 },
        { header: 'Avg Seats', width: 100, align: 'right' },
        { header: 'Rate', width: 90, align: 'right' },
        { header: 'Subtotal', width: 102, align: 'right' },
      ],
      rows: breakdown.branches.map((b) => [b.name, b.avgSeats.toFixed(1), `${breakdown.rate} EGP`, `${fmt(b.subtotal)} EGP`]),
    })

    ensureSpace(doc, 90)
    sectionHeading(doc, 'How This Was Calculated')
    doc.fillColor(GRAY).font('Helvetica').fontSize(10).text(
      'Each branch’s daily active-child count is recorded automatically every day. The figure above for each branch is the average of those daily counts over this period, multiplied by the rate and the number of months billed.',
      { width: 500 }
    )
    doc.moveDown(1)

    ensureSpace(doc, 150)
    sectionHeading(doc, 'Amount Due')

    const dueRows = [{ label: 'Recurring subscription (this period)', value: breakdown.recurringTotal }]
    if (breakdown.setupFeeEgp > 0) {
      dueRows.push({ label: 'One-time setup fee', value: breakdown.setupFeeEgp, note: 'Included on this statement only' })
    }

    for (const row of dueRows) {
      ensureSpace(doc, 26)
      const y = doc.y
      doc.fillColor(DARK).font('Helvetica').fontSize(10.5).text(row.label, 50, y, { width: 350 })
      doc.font('Helvetica-Bold').text(`${fmt(row.value)} EGP`, 380, y, { width: 170, align: 'right' })
      if (row.note) {
        doc.fillColor(GRAY_LIGHT).font('Helvetica-Oblique').fontSize(8).text(row.note, 50, doc.y, { width: 500 })
      }
      doc.moveDown(0.5)
    }

    doc.x = 50
    doc.moveDown(0.2)
    ensureSpace(doc, 40)
    const totalY = doc.y
    const totalHeight = 30
    doc.rect(50, totalY, 500, totalHeight).fill(TEAL_LIGHT)
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Total Due', 62, totalY + 8, { width: 300 })
    doc.font('Helvetica-Bold').fontSize(13).text(`${fmt(breakdown.totalDue)} EGP`, 380, totalY + 8, { width: 158, align: 'right' })
    doc.y = totalY + totalHeight
    doc.x = 50

    footer(doc)
    doc.end()
  })
}
