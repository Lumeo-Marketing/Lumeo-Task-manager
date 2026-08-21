import express from 'express'
import multer from 'multer'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import nodemailer from 'nodemailer'

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
`)

try { database.exec('ALTER TABLE task_files ADD COLUMN data BLOB') } catch {}

const count = database.prepare('SELECT COUNT(*) AS count FROM tasks').get().count
if (count === 0) {
  const seed = database.prepare(`INSERT INTO tasks (title, type, brand, description, firstSubmissionDate, submittedBy, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const now = new Date().toISOString()
  seed.run('Back to school social reel', 'Video', 'Twinkle autism', 'A warm, energetic 30-second reel for the August enrollment push.', '2026-08-28', 'Demo user', 'Pending', now)
  seed.run('Parent workshop flyer', 'Print Poster / Flyer', 'Twinkle pedsych', 'Promote the fall parent workshop series across clinic locations.', '2026-08-25', 'Demo user', 'Pending', now)
  seed.run('Therapy services landing page', 'Web development', 'Twinkle little star', 'New service page with clear pathways for families to get started.', '2026-09-02', 'Demo user', 'Pending', now)
  seed.run('August newsletter refresh', 'Update', 'Twinkle autism', 'Update the existing newsletter layout and swap in the new announcements.', '2026-08-19', 'Demo user', 'Completed', now)
}

const app = express()
const port = Number(process.env.PORT || 8787)
const notificationRecipients = {
  creative: 'stanley@lumeomarketing.com',
  digital: 'godwin@lumeomarketing.com',
}
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
  return { ...task, files: files.length, attachments: files }
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
    ['Submitted by', task.submittedBy],
  ]
  const text = fields.map(([label, value]) => `${label}: ${value || 'Not provided'}`).join('\n')
  const rows = fields.map(([label, value]) => emailField(label, value)).join('')
  const attachmentSummary = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} attached` : 'No files attached'
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1e9;font-family:Arial,Helvetica,sans-serif;color:#403c36;"><div style="padding:32px 16px;background:#f6f1e9;"><div style="max-width:680px;margin:0 auto;background:#fffdf9;border:1px solid #e6dfd4;border-radius:14px;overflow:hidden;"><div style="padding:28px 32px;background:#242321;color:#fffdf9;"><div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#fed550;">LUMEO TASK</div><h1 style="margin:18px 0 8px;font-size:25px;line-height:1.2;">${escapeHtml(task.title)}</h1><p style="margin:0;color:#d5d0c7;font-size:13px;">New ${escapeHtml(task.type)} request from ${escapeHtml(task.submittedBy || 'Lumeo user')}</p></div><div style="padding:26px 32px;"><div style="display:inline-block;padding:7px 10px;border-radius:20px;background:#fff2c9;color:#9b7416;font-size:11px;font-weight:700;">PENDING REVIEW</div><table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;">${rows}</table><div style="margin-top:22px;padding:14px 16px;border-radius:8px;background:#fff9df;color:#80661d;font-size:12px;"><strong>Attachments:</strong> ${escapeHtml(attachmentSummary)}</div></div><div style="padding:18px 32px;background:#f3eee6;color:#978e83;font-size:11px;">Submitted through Lumeo Task · This request is saved in the local task database.</div></div></div></body></html>`
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipientFor(task.type),
    subject: `[Lumeo Task] ${task.type}: ${task.title}`,
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
  const required = ['projectTitle', 'brand', 'description', 'firstSubmissionDate', 'type', 'submittedBy']
  const missing = required.filter((field) => !String(fields[field] || '').trim())
  if (missing.length) return response.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })

  const createdAt = new Date().toISOString()
  const result = database.prepare(`INSERT INTO tasks (title, type, brand, description, objective, script, copy, size, scope, keywords, visualReference, visualElements, technicalNotes, firstSubmissionDate, firstReviewDate, submittedBy, status, createdAt) VALUES (@title, @type, @brand, @description, @objective, @script, @copy, @size, @scope, @keywords, @visualReference, @visualElements, @technicalNotes, @firstSubmissionDate, @firstReviewDate, @submittedBy, 'Pending', @createdAt)`).run({
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

app.patch('/api/tasks/:id/status', (request, response) => {
  const status = request.body?.status
  if (!['Pending', 'Completed'].includes(status)) return response.status(400).json({ error: 'Status must be Pending or Completed' })
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

app.listen(port, () => console.log(`Lumeo Task API running at http://localhost:${port} using database ${path.join(dataDir, 'lumeo-task.sqlite')}`))
