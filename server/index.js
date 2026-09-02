import express from 'express'
import multer from 'multer'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import nodemailer from 'nodemailer'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const database = new Database(path.join(dataDir, 'lumeo-task.sqlite'))
database.pragma('journal_mode = WAL')
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    brand TEXT NOT NULL,
    description TEXT NOT NULL,
    objective TEXT,
    script TEXT,
    copy TEXT,
    size TEXT,
    scope TEXT,
    keywords TEXT,
    visualReference TEXT,
    visualElements TEXT,
    technicalNotes TEXT,
    firstSubmissionDate TEXT NOT NULL,
    firstReviewDate TEXT,
    submittedBy TEXT NOT NULL,
    reviewerName TEXT,
    reviewerEmail TEXT,
    requireAiContent TEXT NOT NULL DEFAULT 'No',
    status TEXT NOT NULL DEFAULT 'Pending',
    createdAt TEXT NOT NULL,
    completedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS task_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    originalName TEXT NOT NULL,
    storedName TEXT NOT NULL,
    mimeType TEXT,
    size INTEGER NOT NULL,
    data BLOB,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS brand_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimeType TEXT,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Awaiting response',
    correctionComment TEXT,
    createdAt TEXT NOT NULL,
    decidedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS review_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewId INTEGER NOT NULL REFERENCES task_reviews(id) ON DELETE CASCADE,
    originalName TEXT NOT NULL,
    mimeType TEXT,
    size INTEGER NOT NULL,
    data BLOB NOT NULL
  );
`)

try { database.exec('ALTER TABLE task_files ADD COLUMN data BLOB') } catch {}
try { database.exec('ALTER TABLE tasks ADD COLUMN reviewerName TEXT') } catch {}
try { database.exec('ALTER TABLE tasks ADD COLUMN reviewerEmail TEXT') } catch {}
try { database.exec("ALTER TABLE tasks ADD COLUMN requireAiContent TEXT NOT NULL DEFAULT 'No'") } catch {}

database.transaction(() => {
  const nonProductionTasks = database.prepare("SELECT id FROM tasks WHERE submittedBy IN ('Demo user', 'Workflow Test')").all()
  for (const { id } of nonProductionTasks) {
    const reviewIds = database.prepare('SELECT id FROM task_reviews WHERE taskId = ?').all(id)
    for (const review of reviewIds) database.prepare('DELETE FROM review_files WHERE reviewId = ?').run(review.id)
    database.prepare('DELETE FROM task_reviews WHERE taskId = ?').run(id)
    database.prepare('DELETE FROM task_files WHERE taskId = ?').run(id)
    database.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }
})()

const app = express()
app.set('trust proxy', 1)
const port = Number(process.env.PORT || 8787)
const notificationRecipients = {
  creative: 'stanley@lumeomarketing.com',
  digital: 'godwin@lumeomarketing.com',
}
const reviewers = new Map([
  ['catherine@lumeomarketing.com', 'Catherine'],
  ['mckenzie@lumeomarketing.com', 'Mckenzie'],
  ['ariel@lumeomarketing.com', 'Ariel'],
  ['tommyads18@gmail.com', 'Dr Awagu'],
])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
})

app.use(express.json())

const hasBuiltFrontend = fs.existsSync(path.join(rootDir, 'dist', 'index.html'))
if (hasBuiltFrontend) {
  app.use(express.static(path.join(rootDir, 'dist')))
}
function taskWithFiles(task) {
  const files = database.prepare('SELECT id, originalName, mimeType, size, createdAt FROM task_files WHERE taskId = ? ORDER BY id').all(task.id)
  const latestReview = database.prepare('SELECT id, message, status, correctionComment, createdAt, decidedAt FROM task_reviews WHERE taskId = ? ORDER BY id DESC LIMIT 1').get(task.id) || null
  return { ...task, files: files.length, attachments: files, latestReview }
}

function recipientFor(type) {
  return ['Web development', 'SEO', 'Update', 'Website update'].includes(type) ? notificationRecipients.digital : notificationRecipients.creative
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function emailField(label, value) {
  const content = String(value || '').trim() || 'Not provided'
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #eee8df;vertical-align:top;width:34%;color:#8b8378;font-size:12px;font-weight:700;">${escapeHtml(label)}</td><td style="padding:14px 0;border-bottom:1px solid #eee8df;vertical-align:top;color:#403c36;font-size:13px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(content)}</td></tr>`
}

function mailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS.includes('PASTE_A_NEW')) return null
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
}

function mailSender() {
  return { name: 'Lumeoe Task System', address: process.env.SMTP_FROM || process.env.SMTP_USER }
}

function publicBaseUrl(request) {
  return String(process.env.APP_BASE_URL || `${request.protocol}://${request.get('host')}`).replace(/\/$/, '')
}

async function sendReviewRequest(task, review, file, reviewUrl) {
  const transporter = mailTransporter()
  if (!transporter) {
    console.warn(`Review request for task ${task.id} saved; email skipped until SMTP is configured.`)
    return { status: 'skipped', recipient: task.reviewerEmail }
  }
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1e9;font-family:Arial,Helvetica,sans-serif;color:#403c36;"><div style="padding:32px 16px;"><div style="max-width:620px;margin:auto;background:#fffdf9;border:1px solid #e6dfd4;border-radius:14px;overflow:hidden;"><div style="padding:28px 32px;background:#242321;color:#fffdf9;"><div style="color:#fed550;font-size:12px;font-weight:800;letter-spacing:1px;">LUMEO TASK SYSTEM</div><h1 style="margin:16px 0 7px;font-size:24px;">${escapeHtml(task.title)}</h1><p style="margin:0;color:#d5d0c7;">Ready for your review</p></div><div style="padding:28px 32px;"><p style="font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(review.message)}</p><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;margin-top:15px;padding:13px 19px;border-radius:7px;background:#242321;color:#fffdf9;text-decoration:none;font-size:13px;font-weight:700;">Review this task</a><p style="margin-top:22px;color:#8b8378;font-size:11px;">Use the review page to approve the work or request a correction.</p></div></div></div></body></html>`
  await transporter.sendMail({
    from: mailSender(),
    to: task.reviewerEmail,
    subject: `[Lumeo Task System] Review: ${task.title}`,
    text: `${review.message}\n\nReview this task: ${reviewUrl}`,
    html,
    attachments: file ? [{ filename: file.originalname, content: file.buffer, contentType: file.mimetype || undefined }] : [],
  })
  return { status: 'sent', recipient: task.reviewerEmail }
}

async function notifyReviewDecision(task, decision, comment = '') {
  const recipient = recipientFor(task.type)
  const transporter = mailTransporter()
  if (!transporter) {
    console.warn(`Review decision for task ${task.id} saved; email skipped until SMTP is configured.`)
    return { status: 'skipped', recipient }
  }
  const approved = decision === 'Approved'
  const heading = approved ? 'Task approved' : 'Correction requested'
  const detail = approved ? `${task.reviewerName} approved “${task.title}”.` : `${task.reviewerName} requested a correction for “${task.title}”.\n\nComment: ${comment}`
  await transporter.sendMail({
    from: mailSender(),
    to: recipient,
    subject: `[Lumeo Task System] ${heading}: ${task.title}`,
    text: detail,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;padding:28px;"><p style="color:#a17d18;font-size:12px;font-weight:800;letter-spacing:1px;">LUMEO TASK SYSTEM</p><h1 style="font-size:24px;color:#242321;">${heading}</h1><p style="font-size:14px;line-height:1.7;color:#4e4942;">${escapeHtml(detail).replace(/\n/g, '<br>')}</p></div>`,
  })
  return { status: 'sent', recipient }
}

async function notifyTask(taskId) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS.includes('PASTE_A_NEW')) {
    console.warn('Task saved locally; email skipped until SMTP_HOST, SMTP_USER, and SMTP_PASS are configured.')
    const taskType = database.prepare('SELECT type FROM tasks WHERE id = ?').get(taskId)?.type || ''
    return { status: 'skipped', recipient: recipientFor(taskType) }
  }
  const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
  const files = database.prepare('SELECT originalName, mimeType, data FROM task_files WHERE taskId = ? ORDER BY id').all(taskId)
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  const fields = [
    ['Project title', task.title],
    ['Request type', task.type],
    ['Brand', task.brand],
    ['REQUIRE AI CONTENT', task.requireAiContent],
    ['First submission date', task.firstSubmissionDate],
    ['Project description', task.description],
    ['Objective / goal', task.objective],
    ['Script / copy / information / details', task.script],
    ['Copy / information / details', task.copy],
    ['Print size', task.size],
    ['First review date', task.firstReviewDate],
    ['Visual reference', task.visualReference],
    ['Images / visual elements', task.visualElements],
    ['Pages, features, or update scope', task.scope],
    ['Target keywords', task.keywords],
    ['Technical notes', task.technicalNotes],
    ['Reviewer', task.reviewerName],
    ['Submitted by', task.submittedBy],
  ]
  const text = fields.map(([label, value]) => `${label}: ${value || 'Not provided'}`).join('\n')
  const rows = fields.map(([label, value]) => emailField(label, value)).join('')
  const attachmentSummary = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} attached` : 'No files attached'
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1e9;font-family:Arial,Helvetica,sans-serif;color:#403c36;"><div style="padding:32px 16px;background:#f6f1e9;"><div style="max-width:680px;margin:0 auto;background:#fffdf9;border:1px solid #e6dfd4;border-radius:14px;overflow:hidden;"><div style="padding:28px 32px;background:#242321;color:#fffdf9;"><div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#fed550;">LUMEO TASK SYSTEM</div><h1 style="margin:18px 0 8px;font-size:25px;line-height:1.2;">${escapeHtml(task.title)}</h1><p style="margin:0;color:#d5d0c7;font-size:13px;">New ${escapeHtml(task.type)} request from ${escapeHtml(task.submittedBy || 'Lumeo user')}</p></div><div style="padding:26px 32px;"><div style="display:inline-block;padding:7px 10px;border-radius:20px;background:#fff2c9;color:#9b7416;font-size:11px;font-weight:700;">PENDING REVIEW</div><table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;">${rows}</table><div style="margin-top:22px;padding:14px 16px;border-radius:8px;background:#fff9df;color:#80661d;font-size:12px;"><strong>Attachments:</strong> ${escapeHtml(attachmentSummary)}</div></div><div style="padding:18px 32px;background:#f3eee6;color:#978e83;font-size:11px;">Submitted through Lumeo Task System.</div></div></div></body></html>`
  await transporter.sendMail({
    from: mailSender(),
    to: recipientFor(task.type),
    subject: `[Lumeo Task System] ${task.type}: ${task.title}`,
    text,
    html,
    attachments: files.filter((file) => file.data).map((file) => ({ filename: file.originalName, content: file.data, contentType: file.mimeType || undefined })),
  })
  return { status: 'sent', recipient: recipientFor(task.type) }
}

app.get('/api/health', (_request, response) => response.json({ ok: true, databasePath: path.join(dataDir, 'lumeo-task.sqlite') }))
app.get('/api/tasks', (_request, response) => {
  const tasks = database.prepare('SELECT * FROM tasks ORDER BY createdAt DESC').all().map(taskWithFiles)
  response.json(tasks)
})

app.get('/api/brands', (_request, response) => {
  const brands = database.prepare('SELECT brand, COUNT(*) AS assets FROM brand_assets GROUP BY brand').all()
  response.json(brands)
})

app.get('/api/brands/:brand/assets', (request, response) => {
  const assets = database.prepare('SELECT id, brand, originalName, mimeType, size, createdAt FROM brand_assets WHERE brand = ? ORDER BY createdAt DESC').all(request.params.brand)
  response.json(assets)
})

app.get('/api/brand-assets/:id/download', (request, response) => {
  const asset = database.prepare('SELECT originalName, mimeType, data FROM brand_assets WHERE id = ?').get(request.params.id)
  if (!asset) return response.status(404).json({ error: 'Asset not found' })
  response.setHeader('Content-Type', asset.mimeType || 'application/octet-stream')
  response.setHeader('Content-Disposition', `attachment; filename="${asset.originalName.replace(/"/g, '')}"`)
  response.send(asset.data)
})

app.get('/api/task-files/:id/download', (request, response) => {
  const file = database.prepare('SELECT originalName, mimeType, data FROM task_files WHERE id = ?').get(request.params.id)
  if (!file) return response.status(404).json({ error: 'File not found' })
  response.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
  response.setHeader('Content-Disposition', `attachment; filename="${file.originalName.replace(/"/g, '')}"`)
  response.send(file.data)
})

app.post('/api/brands/:brand/assets', upload.array('files', 10), (request, response) => {
  const files = request.files || []
  if (!files.length) return response.status(400).json({ error: 'At least one file is required' })
  const insert = database.prepare('INSERT INTO brand_assets (brand, originalName, mimeType, size, data, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
  const createdAt = new Date().toISOString()
  for (const file of files) insert.run(request.params.brand, file.originalname, file.mimetype, file.size, file.buffer, createdAt)
  response.status(201).json(database.prepare('SELECT id, brand, originalName, mimeType, size, createdAt FROM brand_assets WHERE brand = ? ORDER BY createdAt DESC').all(request.params.brand))
})

app.post('/api/tasks', upload.array('files', 10), async (request, response) => {
  const fields = request.body
  const required = ['projectTitle', 'brand', 'description', 'firstSubmissionDate', 'type', 'submittedBy', 'reviewerEmail']
  const missing = required.filter((field) => !String(fields[field] || '').trim())
  if (missing.length) return response.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })
  const reviewerEmail = String(fields.reviewerEmail).trim().toLowerCase()
  const reviewerName = reviewers.get(reviewerEmail)
  if (!reviewerName) return response.status(400).json({ error: 'Please select a valid reviewer' })

  const createdAt = new Date().toISOString()
  const requireAiContent = String(fields.requireAiContent || 'No').toLowerCase() === 'yes' ? 'Yes' : 'No'
  const result = database.prepare(`INSERT INTO tasks (title, type, brand, description, objective, script, copy, size, scope, keywords, visualReference, visualElements, technicalNotes, firstSubmissionDate, firstReviewDate, submittedBy, reviewerName, reviewerEmail, requireAiContent, status, createdAt) VALUES (@title, @type, @brand, @description, @objective, @script, @copy, @size, @scope, @keywords, @visualReference, @visualElements, @technicalNotes, @firstSubmissionDate, @firstReviewDate, @submittedBy, @reviewerName, @reviewerEmail, @requireAiContent, 'Pending', @createdAt)`).run({
    title: fields.projectTitle,
    type: fields.type,
    brand: fields.brand,
    description: fields.description,
    objective: fields.objective || '',
    script: fields.script || '',
    copy: fields.copy || '',
    size: fields.size || '',
    scope: fields.scope || '',
    keywords: fields.keywords || '',
    visualReference: fields.visualReference || '',
    visualElements: fields.visualElements || '',
    technicalNotes: fields.technicalNotes || '',
    firstSubmissionDate: fields.firstSubmissionDate,
    firstReviewDate: fields.firstReviewDate || '',
    submittedBy: fields.submittedBy,
    reviewerName,
    reviewerEmail,
    requireAiContent,
    createdAt,
  })
  const taskId = Number(result.lastInsertRowid)
  const insertFile = database.prepare('INSERT INTO task_files (taskId, originalName, storedName, mimeType, size, data, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const file of request.files || []) insertFile.run(taskId, file.originalname, file.originalname, file.mimetype, file.size, file.buffer, createdAt)
  let notification
  try {
    notification = await notifyTask(taskId)
  } catch (error) {
    notification = { status: 'failed', recipient: recipientFor(fields.type), error: error.message }
    console.error('Notification email failed after local save:', error.message)
  }
  response.status(201).json({ ...taskWithFiles(database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)), notification })
})

app.post('/api/tasks/:id/review', upload.single('file'), async (request, response) => {
  const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(request.params.id)
  if (!task) return response.status(404).json({ error: 'Task not found' })
  if (task.status !== 'Pending') return response.status(409).json({ error: 'Only pending tasks can be sent for review' })
  if (!task.reviewerEmail || !reviewers.has(String(task.reviewerEmail).toLowerCase())) return response.status(400).json({ error: 'This task does not have a valid reviewer' })
  const message = String(request.body?.message || '').trim()
  if (!message) return response.status(400).json({ error: 'A review message or link is required' })
  if (!request.file) return response.status(400).json({ error: 'Attach the completed work before sending it for review' })

  const token = crypto.randomBytes(32).toString('hex')
  const createdAt = new Date().toISOString()
  const reviewResult = database.prepare('INSERT INTO task_reviews (taskId, token, message, status, createdAt) VALUES (?, ?, ?, ?, ?)').run(task.id, token, message, 'Awaiting response', createdAt)
  const reviewId = Number(reviewResult.lastInsertRowid)
  database.prepare('INSERT INTO review_files (reviewId, originalName, mimeType, size, data) VALUES (?, ?, ?, ?, ?)').run(reviewId, request.file.originalname, request.file.mimetype, request.file.size, request.file.buffer)

  const reviewUrl = `${publicBaseUrl(request)}/review/${token}`
  let notification
  try {
    notification = await sendReviewRequest(task, { message }, request.file, reviewUrl)
  } catch (error) {
    database.prepare('DELETE FROM review_files WHERE reviewId = ?').run(reviewId)
    database.prepare('DELETE FROM task_reviews WHERE id = ?').run(reviewId)
    console.error('Reviewer email failed:', error.message)
    return response.status(502).json({ error: 'The review email could not be sent. The task remains pending.' })
  }

  database.prepare("UPDATE tasks SET status = 'Under review', completedAt = NULL WHERE id = ?").run(task.id)
  response.status(201).json({ ...taskWithFiles(database.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)), notification, reviewUrl })
})

app.get('/api/reviews/:token', (request, response) => {
  const review = database.prepare(`SELECT r.id, r.message, r.status AS reviewStatus, r.correctionComment, r.createdAt, r.decidedAt,
    t.id AS taskId, t.title, t.type, t.brand, t.reviewerName, t.status AS taskStatus
    FROM task_reviews r JOIN tasks t ON t.id = r.taskId WHERE r.token = ?`).get(request.params.token)
  if (!review) return response.status(404).json({ error: 'Review link not found' })
  const file = database.prepare('SELECT originalName, mimeType, size FROM review_files WHERE reviewId = ?').get(review.id) || null
  response.json({ ...review, file })
})

app.get('/api/reviews/:token/file', (request, response) => {
  const file = database.prepare('SELECT f.originalName, f.mimeType, f.data FROM review_files f JOIN task_reviews r ON r.id = f.reviewId WHERE r.token = ?').get(request.params.token)
  if (!file) return response.status(404).json({ error: 'Review file not found' })
  response.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
  response.setHeader('Content-Disposition', `attachment; filename="${file.originalName.replace(/"/g, '')}"`)
  response.send(file.data)
})

app.post('/api/reviews/:token/respond', async (request, response) => {
  const decision = request.body?.decision
  const comment = String(request.body?.comment || '').trim()
  if (!['approve', 'correction'].includes(decision)) return response.status(400).json({ error: 'Choose approve or correction' })
  if (decision === 'correction' && !comment) return response.status(400).json({ error: 'Please explain the correction needed' })
  const review = database.prepare('SELECT * FROM task_reviews WHERE token = ?').get(request.params.token)
  if (!review) return response.status(404).json({ error: 'Review link not found' })
  if (review.status !== 'Awaiting response') return response.status(409).json({ error: `This review was already marked ${review.status.toLowerCase()}` })
  const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(review.taskId)
  const decidedAt = new Date().toISOString()
  const reviewStatus = decision === 'approve' ? 'Approved' : 'Correction requested'
  const taskStatus = decision === 'approve' ? 'Completed' : 'Pending'
  database.transaction(() => {
    database.prepare('UPDATE task_reviews SET status = ?, correctionComment = ?, decidedAt = ? WHERE id = ?').run(reviewStatus, comment, decidedAt, review.id)
    database.prepare('UPDATE tasks SET status = ?, completedAt = ? WHERE id = ?').run(taskStatus, decision === 'approve' ? decidedAt : null, task.id)
  })()
  let notification
  try {
    notification = await notifyReviewDecision(task, reviewStatus, comment)
  } catch (error) {
    notification = { status: 'failed', recipient: recipientFor(task.type), error: error.message }
    console.error('Review decision email failed:', error.message)
  }
  response.json({ decision: reviewStatus, taskStatus, notification })
})

app.patch('/api/tasks/:id/status', (request, response) => {
  const status = request.body?.status
  if (!['Pending', 'Under review', 'Completed'].includes(status)) return response.status(400).json({ error: 'Status must be Pending, Under review, or Completed' })
  const completedAt = status === 'Completed' ? new Date().toISOString() : null
  const result = database.prepare('UPDATE tasks SET status = ?, completedAt = ? WHERE id = ?').run(status, completedAt, request.params.id)
  if (!result.changes) return response.status(404).json({ error: 'Task not found' })
  response.json(taskWithFiles(database.prepare('SELECT * FROM tasks WHERE id = ?').get(request.params.id)))
})

app.use((error, _request, response, _next) => {
  console.error('API error:', error)
  if (error instanceof multer.MulterError) return response.status(400).json({ error: error.message })
  response.status(500).json({ error: error.message || 'Internal server error' })
})

if (hasBuiltFrontend) {
  app.get('*splat', (_request, response) => response.sendFile(path.join(rootDir, 'dist', 'index.html')))
}

const httpServer = app.listen(port, () => console.log(`Lumeo Task API running at http://localhost:${port} using database ${path.join(dataDir, 'lumeo-task.sqlite')}`))

httpServer.on('error', (error) => {
  console.error('Lumeo Task API failed to start:', error)
  process.exitCode = 1
})
