// Generates a collective onboarding-kit PDF for one nursery: an explanation of
// the system, a board status guide for staff, install links/QR code, and a
// per-class parent login credentials table. Deliberately config-driven (not
// hardcoded to one nursery) so the same script can be reused for future
// nurseries — just swap the config and the children JSON.
//
// Usage: node scripts/generate-nursery-kit.mjs <config.json>
// config.json shape: { nurseryName, subdomain, childrenPath, outputPath }

import fs from 'fs'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import {
  NAVY, TEAL, GRAY, DARK, WHITE,
  drawBanner, sectionHeading, table, note, footer, ensureSpace, dividerPage,
} from '../api/_lib/pdfTheme.js'

const configPath = process.argv[2]
if (!configPath) {
  console.error('Usage: node scripts/generate-nursery-kit.mjs <config.json>')
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const { nurseryName, subdomain, childrenPath, outputPath } = config
const children = JSON.parse(fs.readFileSync(childrenPath, 'utf-8'))

const appUrl = `https://${subdomain}`
const installUrl = `${appUrl}/installing`

const STATUS_ROWS = [
  ['Requested', 'A parent taps "Request Pickup" in the app.', 'Parent', 'Appears on the board with a countdown timer.'],
  ['Ready', 'Staff taps "Mark Ready" once the child is ready and waiting.', 'Staff', 'Turns green on the board.'],
  ['Arrived', 'The parent taps "I Have Arrived" at pickup.', 'Parent', 'Glows/highlighted on the board.'],
  ['Ready — Waiting', 'Child was marked Ready but the pickup window has passed and the parent hasn’t arrived yet.', 'Automatic', 'Amber warning on the board — needs attention.'],
  ['Waiting (urgent)', 'A parent has arrived and the pickup window has passed.', 'Automatic', 'Red, pulsing — the most urgent thing on the board.'],
  ['Delivered', 'Staff taps "Mark Delivered" once the handoff is complete.', 'Staff', 'Disappears from the board.'],
  ['Cleared', 'Anything still open gets closed automatically at the nursery’s daily reset time.', 'Automatic', 'A safety net only — not a normal part of the flow.'],
]

async function build() {
  const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  // ---------- Cover ----------
  dividerPage(doc, {
    eyebrow: 'Technothera · Smart Dismissal System',
    title: `${nurseryName}\nOnboarding Kit`,
    subtitle: subdomain,
  })

  // ---------- Part 1: About ----------
  doc.addPage()
  dividerPage(doc, { eyebrow: 'Part 1 of 4', title: 'About the Dismissal System' })
  doc.addPage()
  drawBanner(doc, {
    leftTitle: 'TECHNOTHERA',
    leftSubtitle: 'Smart Dismissal System',
    rightTitle: 'ABOUT THE SYSTEM',
    rightSubtitle: nurseryName,
  })
  sectionHeading(doc, 'What it replaces')
  doc.fillColor(GRAY).font('Helvetica').fontSize(10.5).text(
    'Instead of calling out names, checking a paper log, or radioing between reception and the classroom, every pickup happens through the app and shows up live on a display screen at reception.',
    { width: 512 }
  )
  doc.moveDown(1)

  sectionHeading(doc, 'How it works — 4 steps')
  const steps = [
    ['1. Request', 'A parent opens the app and taps "Request Pickup" for their child.'],
    ['2. Ready', 'Staff sees the request, gets the child ready, and taps "Mark Ready."'],
    ['3. Arrived', 'The parent arrives at pickup and taps "I Have Arrived" in the app.'],
    ['4. Delivered', 'Staff hands the child over and taps "Mark Delivered" to close the request.'],
  ]
  for (const [title, body] of steps) {
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10.5).text(title, { continued: true })
    doc.font('Helvetica').fillColor(GRAY).text(`   ${body}`)
    doc.moveDown(0.4)
  }
  doc.moveDown(0.6)

  sectionHeading(doc, 'The display board')
  doc.fillColor(GRAY).font('Helvetica').fontSize(10.5).text(
    'A screen at reception shows every active request live, color-coded by class, so staff always know at a glance who’s waiting and who needs attention. Part 2 of this kit explains exactly what each state on that board means.',
    { width: 512 }
  )
  doc.moveDown(1)

  sectionHeading(doc, 'Where to find it')
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10.5).text(appUrl)
  footer(doc)

  // ---------- Part 2: Board Status Guide ----------
  doc.addPage()
  dividerPage(doc, { eyebrow: 'Part 2 of 4', title: 'Board Status Guide' })
  doc.addPage()
  drawBanner(doc, {
    leftTitle: 'TECHNOTHERA',
    leftSubtitle: 'Smart Dismissal System',
    rightTitle: 'BOARD STATUS GUIDE',
    rightSubtitle: nurseryName,
  })
  note(doc, 'What each state on the display board means, who triggers it, and what it looks like on screen.')
  doc.moveDown(0.4)
  table(doc, {
    columns: [
      { header: 'Status', width: 110 },
      { header: 'What it means', width: 230 },
      { header: 'Triggered by', width: 82 },
      { header: 'On screen', width: 90 },
    ],
    rows: STATUS_ROWS,
  })
  footer(doc)

  // ---------- Part 3: Getting Started ----------
  doc.addPage()
  dividerPage(doc, { eyebrow: 'Part 3 of 4', title: 'Getting Started' })
  doc.addPage()
  drawBanner(doc, {
    leftTitle: 'TECHNOTHERA',
    leftSubtitle: 'Smart Dismissal System',
    rightTitle: 'LINKS & INSTALL',
    rightSubtitle: nurseryName,
  })
  sectionHeading(doc, 'The app')
  doc.fillColor(GRAY).font('Helvetica').fontSize(10.5).text('Open this link on any phone or the reception display:', { width: 512 })
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(12).text(appUrl)
  doc.moveDown(1)

  sectionHeading(doc, 'Installing it on a phone')
  doc.fillColor(GRAY).font('Helvetica').fontSize(10.5).text(
    'This link auto-detects iPhone vs. Android and walks through adding the app to the home screen, with a short video for each:',
    { width: 512 }
  )
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(12).text(installUrl)
  doc.moveDown(0.8)

  const qrDataUrl = await QRCode.toDataURL(installUrl, { margin: 1, width: 300 })
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')
  ensureSpace(doc, 190)
  const qrSize = 150
  const qrX = (doc.page.width - qrSize) / 2
  doc.image(qrBuffer, qrX, doc.y, { width: qrSize, height: qrSize })
  doc.y += qrSize + 6
  doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(9).text('Scan to open the install guide', 0, doc.y, { width: doc.page.width, align: 'center' })
  footer(doc)

  // ---------- Part 4: Credentials ----------
  doc.addPage()
  dividerPage(doc, { eyebrow: 'Part 4 of 4', title: 'Parent Login Credentials' })

  const byClass = {}
  for (const c of children) {
    byClass[c.class] = byClass[c.class] || []
    byClass[c.class].push(c)
  }

  let firstClassPage = true
  for (const [className, kids] of Object.entries(byClass)) {
    doc.addPage()
    if (firstClassPage) {
      drawBanner(doc, {
        leftTitle: 'TECHNOTHERA',
        leftSubtitle: 'Smart Dismissal System',
        rightTitle: 'PARENT LOGIN CREDENTIALS',
        rightSubtitle: nurseryName,
      })
      note(doc, 'Password is the child’s birthdate in DDMMYY format. Families can change it after logging in. Keep this document private.')
      doc.moveDown(0.4)
      firstClassPage = false
    }
    sectionHeading(doc, `Class: ${className}`)
    table(doc, {
      columns: [
        { header: 'Child Name', width: 190 },
        { header: 'Login Email', width: 230 },
        { header: 'Password', width: 92 },
      ],
      rows: kids.map((k) => [k.name, k.email, k.password || 'Birthdate needed']),
    })
  }
  footer(doc)

  doc.end()
  const buffer = await done
  fs.mkdirSync(outputPath.substring(0, outputPath.lastIndexOf('/')), { recursive: true })
  fs.writeFileSync(outputPath, buffer)
  console.log('Written to', outputPath)
}

build()
