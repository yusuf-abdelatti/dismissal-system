import PDFDocument from 'pdfkit'
import { METRIC_EXPLANATIONS } from '../../src/utils/analytics.js'
import { TEAL, GRAY, GRAY_LIGHT, DARK, drawBanner, infoColumns, sectionHeading, glanceBoxes, table, note, footer, ensureSpace } from './pdfTheme.js'

function fmtPct(n) {
  return `${Math.round(n * 100)}%`
}

function fmtMinutes(n) {
  return n == null ? 'Not enough data' : `${n.toFixed(1)} minutes`
}

// Prints "Label   Value" and, when given, a small plain-language line right
// underneath explaining what that number means — so a non-technical
// nursery owner reading the PDF alone doesn't need anyone to interpret it.
function statLine(doc, label, value, noteText) {
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text(label, { continued: true })
  doc.font('Helvetica').fillColor(GRAY).text(`   ${value}`)
  if (noteText) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(GRAY_LIGHT).text(noteText, { indent: 10, width: 480 })
  }
  doc.moveDown(0.35)
}

export function buildAnalyticsPdf({ nursery, dateFrom, dateTo, overview, trend, granularity, peak, prepTime, arrival, delay, classBreakdown, insights }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    // Pinned to Cairo explicitly — see the same fix in billingStatementPdf.js.
    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Cairo' })

    drawBanner(doc, {
      leftTitle: 'TECHNOTHERA',
      leftSubtitle: 'Smart Dismissal System',
      rightTitle: 'USAGE REPORT',
      rightSubtitle: `Generated: ${generatedAt}`,
    })

    infoColumns(doc, [
      { label: 'Prepared For', lines: [nursery.name] },
      { label: 'Reporting Period', lines: [`${dateFrom} to ${dateTo}`] },
    ])

    sectionHeading(doc, 'Overview')
    glanceBoxes(doc, [
      { label: 'Actively Enrolled', value: String(overview.totalChildren) },
      { label: 'Used the System', value: `${overview.activeChildren} (${fmtPct(overview.adoptionRate)})` },
      { label: 'Pickup Requests', value: String(overview.totalRequests) },
    ])
    note(doc, `${METRIC_EXPLANATIONS.enrolledChildren} ${METRIC_EXPLANATIONS.activeChildren}`)
    statLine(doc, 'Active days in period', String(overview.activeDaysCount), METRIC_EXPLANATIONS.activeDays)
    statLine(doc, 'Average requests per active day', overview.avgPerActiveDay.toFixed(1), METRIC_EXPLANATIONS.avgPerActiveDay)
    doc.moveDown(0.5)

    if (trend.length > 0) {
      ensureSpace(doc, 170)
      sectionHeading(doc, `Usage Trend (${granularity})`)

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
        doc.rect(x, y, barWidth, barHeight).fill(TEAL)
      })

      doc.y = chartTop + chartHeight + 6
      doc.x = chartLeft
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
      // "-" not "→": the standard Helvetica PDF encoding pdfkit uses here
      // has no arrow glyph and silently renders it as garbled characters.
      doc.text(`${trend[0].label}  -  ${trend[trend.length - 1].label}`, chartLeft, doc.y, { width: chartWidth })
      doc.x = chartLeft
      doc.moveDown(0.3)
      note(doc, METRIC_EXPLANATIONS.usageTrend)
    }

    ensureSpace(doc, 70)
    sectionHeading(doc, 'Peak Usage')
    doc
      .fillColor(GRAY)
      .font('Helvetica')
      .fontSize(10)
      .text(peak ? `Busiest time: ${peak.label} (${peak.count} requests)` : 'Not enough data to determine a peak period.')
    if (peak) {
      doc.moveDown(0.2)
      note(doc, METRIC_EXPLANATIONS.peakPeriod)
    } else {
      doc.moveDown(0.5)
    }

    ensureSpace(doc, 90)
    sectionHeading(doc, 'Dismissal Preparation Time')
    statLine(doc, 'Expected (configured target)', `${prepTime.expectedMinutes} minutes`, METRIC_EXPLANATIONS.prepExpected)
    statLine(
      doc,
      'Actual average',
      prepTime.actualAverageMinutes != null
        ? `${fmtMinutes(prepTime.actualAverageMinutes)} (based on ${prepTime.sampleSize} of ${overview.totalRequests} requests)`
        : 'Not enough data',
      METRIC_EXPLANATIONS.prepActual
    )
    doc.moveDown(0.5)

    if (delay.consideredCount > 0) {
      ensureSpace(doc, 120)
      sectionHeading(doc, 'Delay Time')
      statLine(
        doc,
        `Exceeded the ${prepTime.expectedMinutes}-minute target`,
        `${delay.delayedCount} of ${delay.consideredCount} requests (${fmtPct(delay.delayedRate)})`,
        METRIC_EXPLANATIONS.delayExceeded
      )
      statLine(doc, 'Average delay when delayed', fmtMinutes(delay.avgDelayMinutes), METRIC_EXPLANATIONS.delayAverage)
      note(
        doc,
        `Requests cancelled or cleared without ever being marked Ready or Delivered have no recorded end time and are excluded from these numbers (${fmtPct(delay.coverage)} of requests are covered).`
      )
    }

    if (arrival.sampleSize > 0) {
      ensureSpace(doc, 90)
      sectionHeading(doc, 'Parent Arrival-to-Handoff Time')
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(10)
        .text(`Average ${fmtMinutes(arrival.averageMinutes)}, based on ${arrival.sampleSize} of ${overview.totalRequests} requests (${fmtPct(arrival.coverage)} of pickups used the arrival button).`, { width: 500 })
      doc.moveDown(0.2)
      note(doc, METRIC_EXPLANATIONS.arrivalHandoff)
    }

    if (classBreakdown.length > 0) {
      ensureSpace(doc, 170)
      sectionHeading(doc, 'Class-by-Class Performance')
      note(
        doc,
        'Enrolled = actively enrolled in this class · Used = had a pickup this period · Avg Prep = average time to get a child ready · Delayed = pickups that ran past the target time.'
      )
      doc.moveDown(0.2)

      table(doc, {
        columns: [
          { header: 'Class', width: 150 },
          { header: 'Enrolled', width: 70, align: 'right' },
          { header: 'Used', width: 65, align: 'right' },
          { header: 'Requests', width: 70, align: 'right' },
          { header: 'Avg Prep', width: 80, align: 'right' },
          { header: 'Delayed', width: 65, align: 'right' },
        ],
        rows: classBreakdown.map((row) => [
          row.className,
          String(row.totalChildren),
          String(row.activeChildren),
          String(row.totalRequests),
          fmtMinutes(row.avgPrepMinutes),
          row.totalRequests > 0 ? `${row.delayedCount} (${fmtPct(row.delayedRate)})` : '—',
        ]),
      })
    }

    ensureSpace(doc, 100)
    sectionHeading(doc, 'Key Insights')
    doc.font('Helvetica').fontSize(10).fillColor(GRAY)
    for (const line of insights) {
      ensureSpace(doc, 24)
      doc.text(`•  ${line}`, { width: 500 })
      doc.moveDown(0.4)
    }

    footer(doc)
    doc.end()
  })
}
