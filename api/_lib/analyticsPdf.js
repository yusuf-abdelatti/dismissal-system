import PDFDocument from 'pdfkit'
import { METRIC_EXPLANATIONS } from '../../src/utils/analytics.js'

const TEAL = '#2E5A63'
const ACCENT = '#5F94AC'
const GRAY = '#6B7280'
const NOTE_GRAY = '#9CA3AF'
const DARK = '#1F2937'

function fmtPct(n) {
  return `${Math.round(n * 100)}%`
}

function fmtMinutes(n) {
  return n == null ? 'Not enough data' : `${n.toFixed(1)} minutes`
}

// Prints "Label   Value" and, when given, a small plain-language line right
// underneath explaining what that number means — so a non-technical
// nursery owner reading the PDF alone doesn't need anyone to interpret it.
function statLine(doc, label, value, note) {
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text(label, { continued: true })
  doc.font('Helvetica').fillColor(GRAY).text(`   ${value}`)
  if (note) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(NOTE_GRAY).text(note, { indent: 10, width: 480 })
  }
  doc.moveDown(0.35)
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > 740) doc.addPage()
}

export function buildAnalyticsPdf({ nursery, dateFrom, dateTo, overview, trend, granularity, peak, prepTime, arrival, delay, classBreakdown, insights }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(20).text('Smart Dismissal System — Usage Report')
    doc.moveDown(0.3)
    doc.fillColor(GRAY).font('Helvetica').fontSize(11)
    doc.text(`Nursery: ${nursery.name}`)
    doc.text(`Reporting period: ${dateFrom} to ${dateTo}`)
    doc.text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`)
    doc.moveDown(1)

    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Overview')
    doc.moveDown(0.3)
    statLine(doc, 'Actively enrolled children', String(overview.totalChildren), METRIC_EXPLANATIONS.enrolledChildren)
    statLine(
      doc,
      'Used the system',
      `${overview.activeChildren} (${fmtPct(overview.adoptionRate)})`,
      METRIC_EXPLANATIONS.activeChildren
    )
    statLine(doc, 'Total pickup requests', String(overview.totalRequests), METRIC_EXPLANATIONS.totalRequests)
    statLine(doc, 'Active days in period', String(overview.activeDaysCount), METRIC_EXPLANATIONS.activeDays)
    statLine(
      doc,
      'Average requests per active day',
      overview.avgPerActiveDay.toFixed(1),
      METRIC_EXPLANATIONS.avgPerActiveDay
    )
    doc.moveDown(0.7)

    if (trend.length > 0) {
      ensureSpace(doc, 160)
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text(`Usage Trend (${granularity})`)
      doc.moveDown(0.4)

      const chartTop = doc.y
      const chartHeight = 90
      const chartLeft = 50
      const chartWidth = 500
      const barGap = 4
      const barWidth = Math.max(3, chartWidth / trend.length - barGap)
      const max = Math.max(1, ...trend.map((t) => t.count))

      trend.forEach((t, i) => {
        const barHeight = Math.max(2, (t.count / max) * chartHeight)
        const x = chartLeft + i * (barWidth + barGap)
        const y = chartTop + (chartHeight - barHeight)
        doc.rect(x, y, barWidth, barHeight).fill(ACCENT)
      })

      doc.y = chartTop + chartHeight + 6
      doc.x = chartLeft
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
      // "-" not "→": the standard Helvetica PDF encoding pdfkit uses here
      // has no arrow glyph and silently renders it as garbled characters.
      doc.text(`${trend[0].label}  -  ${trend[trend.length - 1].label}`, chartLeft, doc.y, { width: chartWidth })
      doc.x = chartLeft
      doc.font('Helvetica-Oblique').fillColor(NOTE_GRAY).fontSize(8).text(METRIC_EXPLANATIONS.usageTrend, chartLeft, doc.y, { width: chartWidth })
      doc.x = 50
      doc.moveDown(1)
    }

    ensureSpace(doc, 70)
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Peak Usage')
    doc.moveDown(0.3)
    doc
      .fillColor(GRAY)
      .font('Helvetica')
      .fontSize(10)
      .text(peak ? `Busiest time: ${peak.label} (${peak.count} requests)` : 'Not enough data to determine a peak period.')
    if (peak) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(NOTE_GRAY).text(METRIC_EXPLANATIONS.peakPeriod, { width: 500 })
    }
    doc.moveDown(1)

    ensureSpace(doc, 90)
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Dismissal Preparation Time')
    doc.moveDown(0.3)
    statLine(doc, 'Expected (configured target)', `${prepTime.expectedMinutes} minutes`, METRIC_EXPLANATIONS.prepExpected)
    statLine(
      doc,
      'Actual average',
      prepTime.actualAverageMinutes != null
        ? `${fmtMinutes(prepTime.actualAverageMinutes)} (based on ${prepTime.sampleSize} of ${overview.totalRequests} requests)`
        : 'Not enough data',
      METRIC_EXPLANATIONS.prepActual
    )
    doc.moveDown(0.7)

    if (delay.consideredCount > 0) {
      ensureSpace(doc, 110)
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Delay Time')
      doc.moveDown(0.3)
      statLine(
        doc,
        `Exceeded the ${prepTime.expectedMinutes}-minute target`,
        `${delay.delayedCount} of ${delay.consideredCount} requests (${fmtPct(delay.delayedRate)})`,
        METRIC_EXPLANATIONS.delayExceeded
      )
      statLine(doc, 'Average delay when delayed', fmtMinutes(delay.avgDelayMinutes), METRIC_EXPLANATIONS.delayAverage)
      doc.fillColor(NOTE_GRAY).font('Helvetica-Oblique').fontSize(8).text(
        `Requests cancelled or cleared without ever being marked Ready or Delivered have no recorded end time and are excluded from these numbers (${fmtPct(delay.coverage)} of requests are covered).`,
        { width: 500 }
      )
      doc.moveDown(1)
    }

    if (arrival.sampleSize > 0) {
      ensureSpace(doc, 90)
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Parent Arrival-to-Handoff Time')
      doc.moveDown(0.3)
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(10)
        .text(`Average ${fmtMinutes(arrival.averageMinutes)}, based on ${arrival.sampleSize} of ${overview.totalRequests} requests (${fmtPct(arrival.coverage)} of pickups used the arrival button).`, { width: 500 })
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(NOTE_GRAY).text(METRIC_EXPLANATIONS.arrivalHandoff, { width: 500 })
      doc.moveDown(1)
    }

    if (classBreakdown.length > 0) {
      ensureSpace(doc, 150)
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Class-by-Class Performance')
      doc.moveDown(0.2)
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(NOTE_GRAY)
        .text(
          'Enrolled = actively enrolled in this class · Used = had a pickup this period · Avg Prep = average time to get a child ready · Delayed = pickups that ran past the target time.',
          { width: 500 }
        )
      doc.moveDown(0.5)

      const xs = [50, 180, 250, 320, 390, 470]
      const widths = [130, 70, 70, 70, 80, 80]
      const headerY = doc.y
      doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
      ;['Class', 'Enrolled', 'Used', 'Requests', 'Avg Prep', 'Delayed'].forEach((h, i) =>
        doc.text(h, xs[i], headerY, { width: widths[i] })
      )
      doc.moveDown(1)
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#E5E7EB').stroke()
      doc.moveDown(0.4)

      doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      for (const row of classBreakdown) {
        ensureSpace(doc, 20)
        const rowY = doc.y
        doc.text(row.className, xs[0], rowY, { width: widths[0] })
        doc.text(String(row.totalChildren), xs[1], rowY, { width: widths[1] })
        doc.text(String(row.activeChildren), xs[2], rowY, { width: widths[2] })
        doc.text(String(row.totalRequests), xs[3], rowY, { width: widths[3] })
        doc.text(fmtMinutes(row.avgPrepMinutes), xs[4], rowY, { width: widths[4] })
        doc.text(
          row.totalRequests > 0 ? `${row.delayedCount} (${fmtPct(row.delayedRate)})` : '—',
          xs[5],
          rowY,
          { width: widths[5] }
        )
        doc.moveDown(0.9)
      }
      // The loop above always finishes with an explicit-x .text() call in
      // the rightmost column (x=470) — pdfkit leaves doc.x sitting there
      // afterward, not back at the page margin. Left unreset, the very next
      // default-x .text() call (Key Insights, below) inherits x=470 and its
      // 500pt width runs straight off the right edge of the page, silently
      // clipping the text mid-word instead of wrapping.
      doc.x = 50
      doc.moveDown(0.6)
    }

    ensureSpace(doc, 100)
    doc.x = 50
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13).text('Key Insights')
    doc.moveDown(0.4)
    doc.font('Helvetica').fontSize(10).fillColor(GRAY)
    for (const line of insights) {
      ensureSpace(doc, 24)
      doc.text(`•  ${line}`, { width: 500 })
      doc.moveDown(0.4)
    }

    doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(8).text('Technothera · Smart Dismissal System', 50, 760, {
      width: 512,
      align: 'center',
    })

    doc.end()
  })
}
