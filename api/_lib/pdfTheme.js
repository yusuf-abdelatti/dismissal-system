// Shared visual language for every generated PDF — extracted from the
// "Finnly Preschool Quotation Final" design so the analytics report and
// the payment statement look like they belong to the same product,
// without duplicating any of that document's actual content.

export const NAVY = '#1B2A41'
export const TEAL = '#1F7A5C'
export const TEAL_LIGHT = '#EAF7F2'
export const AMBER = '#C2740A'
export const AMBER_LIGHT = '#FDF3E7'
export const GRAY = '#6B7280'
export const GRAY_LIGHT = '#9CA3AF'
export const BORDER = '#E5E7EB'
export const DARK = '#1F2937'
export const WHITE = '#FFFFFF'

const MARGIN = 50
const PAGE_BOTTOM = 740

export function ensureSpace(doc, needed) {
  if (doc.y + needed > PAGE_BOTTOM) doc.addPage()
}

// Full-bleed dark banner across the very top of the page — deliberately
// ignores the page margin (drawn from x=0) to match the edge-to-edge bar
// in the reference design, not the inset content below it.
export function drawBanner(doc, { leftTitle, leftSubtitle, rightTitle, rightSubtitle }) {
  const width = doc.page.width
  const height = 74

  doc.rect(0, 0, width, height).fill(NAVY)

  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(19).text(leftTitle, MARGIN, 22, { lineBreak: false })
  doc.fillColor('#C7D2DE').font('Helvetica').fontSize(10).text(leftSubtitle, MARGIN, 46, { lineBreak: false })

  doc
    .fillColor(WHITE)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(rightTitle, 0, 23, { width: width - MARGIN, align: 'right' })
  doc
    .fillColor('#C7D2DE')
    .font('Helvetica')
    .fontSize(9.5)
    .text(rightSubtitle, 0, 47, { width: width - MARGIN, align: 'right' })

  doc.y = height + 26
  doc.x = MARGIN
}

// The two-column info block right under the banner (e.g. "Prepared For" /
// "Branches Covered" in the quotation) — a label/value pair per column.
export function infoColumns(doc, columns) {
  const colWidth = (doc.page.width - MARGIN * 2 - 20) / columns.length
  const startY = doc.y

  columns.forEach((col, i) => {
    const x = MARGIN + i * (colWidth + 20)
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5).text(col.label.toUpperCase(), x, startY, { width: colWidth, characterSpacing: 0.3 })
    let y = doc.y + 2
    col.lines.forEach((line, li) => {
      doc.fillColor(li === 0 ? DARK : GRAY).font(li === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(line, x, y, { width: colWidth })
      y = doc.y
    })
  })

  doc.x = MARGIN
  doc.y = Math.max(...columns.map(() => doc.y)) + 14
}

export function sectionHeading(doc, text) {
  ensureSpace(doc, 60)
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(text, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 })
  doc.moveDown(0.5)
  doc.x = MARGIN
}

// Side-by-side highlighted stat boxes — "Your Payments at a Glance" style.
export function glanceBoxes(doc, boxes) {
  ensureSpace(doc, 90)
  const gap = 14
  const boxWidth = (doc.page.width - MARGIN * 2 - gap * (boxes.length - 1)) / boxes.length
  const boxHeight = 78
  const top = doc.y

  boxes.forEach((box, i) => {
    const x = MARGIN + i * (boxWidth + gap)
    doc.roundedRect(x, top, boxWidth, boxHeight, 6).fill(TEAL_LIGHT)
    doc
      .fillColor(TEAL)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(box.label.toUpperCase(), x, top + 12, { width: boxWidth, align: 'center', characterSpacing: 0.3 })
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(box.value, x, top + 26, { width: boxWidth, align: 'center' })
    if (box.caption) {
      doc
        .fillColor(GRAY)
        .font('Helvetica')
        .fontSize(7.5)
        .text(box.caption, x + 8, top + 54, { width: boxWidth - 16, align: 'center' })
    }
  })

  doc.x = MARGIN
  doc.y = top + boxHeight + 20
}

// A table with a solid navy header row and thin row separators, matching
// the quotation's tables. `highlightLastRow` bolds and tints the final row
// (a total/summary line) with the light teal background.
export function table(doc, { columns, rows, highlightLastRow = false }) {
  const totalWidth = doc.page.width - MARGIN * 2
  const widths = columns.map((c) => (c.width ? c.width : totalWidth / columns.length))
  const xs = []
  let cursor = MARGIN
  widths.forEach((w) => {
    xs.push(cursor)
    cursor += w
  })

  ensureSpace(doc, 40)
  const headerY = doc.y
  const headerHeight = 22
  doc.rect(MARGIN, headerY, totalWidth, headerHeight).fill(NAVY)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(WHITE)
  columns.forEach((col, i) => {
    doc.text(col.header, xs[i] + 8, headerY + 7, { width: widths[i] - 12, align: col.align || 'left' })
  })
  doc.y = headerY + headerHeight

  rows.forEach((row, rowIndex) => {
    ensureSpace(doc, 24)
    const isLast = highlightLastRow && rowIndex === rows.length - 1
    const rowY = doc.y
    const rowHeight = 20

    if (isLast) {
      doc.rect(MARGIN, rowY, totalWidth, rowHeight).fill(TEAL_LIGHT)
    }

    doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(isLast ? NAVY : DARK)
    row.forEach((cell, i) => {
      doc.text(String(cell), xs[i] + 8, rowY + 5, { width: widths[i] - 12, align: columns[i].align || 'left' })
    })

    doc.y = rowY + rowHeight
    if (!isLast) {
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + totalWidth, doc.y).strokeColor(BORDER).lineWidth(0.5).stroke()
    }
  })

  doc.x = MARGIN
  doc.moveDown(1)
}

export function note(doc, text) {
  ensureSpace(doc, 20)
  doc.fillColor(GRAY_LIGHT).font('Helvetica-Oblique').fontSize(8).text(text, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 })
  doc.moveDown(0.6)
  doc.x = MARGIN
}

export function footer(doc) {
  const bottomMargin = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(8).text('Technothera · Smart Dismissal System', 0, 760, {
    width: doc.page.width,
    align: 'center',
  })
  doc.page.margins.bottom = bottomMargin
}
