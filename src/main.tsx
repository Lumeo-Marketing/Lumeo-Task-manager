import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, FileText, FolderOpen, Grid2X2, ImagePlus,
  LayoutDashboard, ListTodo, Mail, Menu, MessageSquareText, MoreHorizontal,
  Paperclip, Plus, Search, Send, Settings, Sparkles, UploadCloud, Video,
  X, Zap,
} from 'lucide-react'
import './styles.css'
import './detail.css'

type TaskType = 'Video' | 'Online Poster / Flyer' | 'Print Poster / Flyer' | 'Web development' | 'SEO' | 'Website update'
type TaskStatus = 'Pending' | 'Completed'

type Task = {
  id: number
  title: string
  type: TaskType
  brand: string
  description: string
  dueDate: string
  status: TaskStatus
  files: number
  firstSubmissionDate?: string
  firstReviewDate?: string
  submittedBy?: string
  createdAt?: string
  completedAt?: string | null
  objective?: string
  script?: string
  copy?: string
  size?: string
  scope?: string
  keywords?: string
  visualReference?: string
  visualElements?: string
  technicalNotes?: string
  attachments?: Array<{ id: number; originalName: string; mimeType?: string; size: number }>
}

type ApiTask = Task & { firstSubmissionDate: string; attachments?: Array<{ id: number; originalName: string; mimeType?: string; size: number }> }
type BrandAsset = { id: number; brand: string; originalName: string; mimeType: string; size: number; createdAt: string }

type AppView = 'overview' | 'submit' | 'mytasks' | 'library' | 'detail'

const taskTypes: TaskType[] = ['Video', 'Online Poster / Flyer', 'Print Poster / Flyer', 'Web development', 'SEO', 'Website update']
const brands = ['Twinkle autism', 'Twinkle pedsych', 'Twinkle little star']

const embeddedUserName = new URLSearchParams(window.location.search).get('name')?.trim()
  || new URLSearchParams(window.location.search).get('contactName')?.trim()
  || 'Tommy Gogd'

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function normalizeTask(task: ApiTask): Task {
  const dueDate = task.firstSubmissionDate ? new Date(`${task.firstSubmissionDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Date to be confirmed'
  return { ...task, dueDate, files: task.attachments?.length ?? task.files ?? 0 }
}

const starterTasks: Task[] = [
  { id: 1, title: 'Back to school social reel', type: 'Video', brand: 'Twinkle autism', description: 'A warm, energetic 30-second reel for the August enrollment push.', dueDate: 'Aug 28, 2026', status: 'Pending', files: 4 },
  { id: 2, title: 'Parent workshop flyer', type: 'Print Poster / Flyer', brand: 'Twinkle pedsych', description: 'Promote the fall parent workshop series across clinic locations.', dueDate: 'Aug 25, 2026', status: 'Pending', files: 2 },
  { id: 3, title: 'Therapy services landing page', type: 'Web development', brand: 'Twinkle little star', description: 'New service page with clear pathways for families to get started.', dueDate: 'Sep 02, 2026', status: 'Pending', files: 1 },
  { id: 4, title: 'August newsletter refresh', type: 'Website update', brand: 'Twinkle autism', description: 'Update the existing newsletter layout and swap in the new announcements.', dueDate: 'Aug 19, 2026', status: 'Completed', files: 3 },
]

function App() {
  const [activeView, setActiveView] = useState<AppView>('overview')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [userName, setUserName] = useState(embeddedUserName)
  const [tasks, setTasks] = useState(starterTasks)
  const [statusFilter, setStatusFilter] = useState<'All' | TaskStatus>('All')
  const [type, setType] = useState<TaskType>('Video')
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const pendingCount = tasks.filter((task) => task.status === 'Pending').length
  const visibleTasks = useMemo(() => statusFilter === 'All' ? tasks : tasks.filter((task) => task.status === statusFilter), [statusFilter, tasks])
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)

  useEffect(() => {
    fetch('/api/tasks').then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load tasks'))).then((items: ApiTask[]) => setTasks(items.map(normalizeTask))).catch(() => setNotice('Offline mode: showing demo tasks.'))
  }, [])

  useEffect(() => {
    function receiveGhlUser(event: MessageEvent<{ name?: string; contactName?: string; user?: { name?: string } }>) {
      const nextName = event.data?.name?.trim() || event.data?.contactName?.trim() || event.data?.user?.name?.trim()
      if (nextName) setUserName(nextName)
    }
    window.addEventListener('message', receiveGhlUser)
    return () => window.removeEventListener('message', receiveGhlUser)
  }, [])

  async function toggleTask(id: number) {
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    const status = task.status === 'Pending' ? 'Completed' : 'Pending'
    const response = await fetch(`/api/tasks/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!response.ok) return setNotice('Could not update this task.')
    const updated = normalizeTask(await response.json())
    setTasks((current) => current.map((item) => item.id === id ? updated : item))
  }

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('projectTitle') || 'Untitled task')
    const brand = String(data.get('brand') || brands[0])
    const description = String(data.get('description') || '')
    const date = String(data.get('firstSubmissionDate') || '')
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]')
    const attachments = Array.from(fileInput?.files ?? []).map((file) => file.name).join(', ')
    const formattedDate = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Date to be confirmed'
    data.set('type', type)
    data.set('submittedBy', userName)
    const response = await fetch('/api/tasks', { method: 'POST', body: data })
    if (!response.ok) return setNotice('Could not save the task. Check that the API is running.')
    const savedTask = normalizeTask(await response.json())
    setTasks((current) => [savedTask, ...current.filter((task) => task.id !== savedTask.id)])
    setNotice('Task saved. It is now queued for review.')
    form.reset()
    window.setTimeout(() => setNotice(''), 4500)
    // Integration boundary: send this payload to your GHL webhook and email service.
    const fields = Object.fromEntries([...data.entries()].filter(([, value]) => typeof value === 'string')) as Record<string, string>
    void submitToGhlAndEmail({ ...fields, type, submittedBy: userName, attachments })
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><img src="/lumelog.png" alt="Lumeo" /></div>
        <nav className="nav-links">
          <button className={activeView === 'overview' ? 'active' : ''} onClick={() => { setActiveView('overview'); setSelectedTaskId(null); setStatusFilter('All'); setMobileNav(false) }}><LayoutDashboard size={18} /> Overview</button>
          <button className={activeView === 'submit' ? 'active' : ''} onClick={() => { setActiveView('submit'); setMobileNav(false) }}><Plus size={18} /> Submit a request</button>
          <button className={activeView === 'mytasks' ? 'active' : ''} onClick={() => { setActiveView('mytasks'); setStatusFilter('Pending'); setMobileNav(false) }}><ListTodo size={18} /> My tasks <span className="nav-count">{pendingCount}</span></button>
        </nav>
        <div className="sidebar-section"><p className="eyebrow">Workspace</p><button onClick={() => { setActiveView('overview'); setSelectedTaskId(null); setStatusFilter('All'); setMobileNav(false) }}><FolderOpen size={17} /> All requests</button><button onClick={() => { setActiveView('library'); setSelectedTaskId(null); setMobileNav(false) }}><Grid2X2 size={17} /> Brand library</button></div>
        <div className="sidebar-bottom"><button><CircleHelp size={17} /> Help center</button><button><Settings size={17} /> Settings</button><div className="profile"><span className="profile-avatar">{initials(userName)}</span><span><strong>{userName}</strong><small>GHL contact</small></span><MoreHorizontal size={18} /></div></div>
      </aside>
      {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <main className="main-content">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="crumb"><span>Workspace</span><ArrowUpRight size={13} /><strong>{activeView === 'submit' ? 'Submit a request' : activeView === 'mytasks' ? 'My tasks' : activeView === 'library' ? 'Brand library' : activeView === 'detail' ? selectedTask?.title || 'Task details' : 'Overview'}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18} /></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><div className="top-avatar">{initials(userName)}</div></div></header>
        {activeView === 'overview' || activeView === 'mytasks' ? <Overview tasks={visibleTasks} statusFilter={statusFilter} setStatusFilter={setStatusFilter} toggleTask={toggleTask} onNew={() => setActiveView('submit')} onOpen={(id) => { setSelectedTaskId(id); setActiveView('detail') }} userName={userName} myTasks={activeView === 'mytasks'} /> : activeView === 'library' ? <BrandLibrary onBack={() => setActiveView('overview')} /> : activeView === 'detail' && selectedTask ? <TaskDetail task={selectedTask} toggleTask={toggleTask} onBack={() => setActiveView('overview')} /> : <SubmissionForm type={type} setType={setType} onSubmit={submitTask} onCancel={() => setActiveView('overview')} />}
      </main>
      {notice && <div className="toast"><CheckCircle2 size={19} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={16} /></button></div>}
    </div>
  )
}

function Overview({ tasks, statusFilter, setStatusFilter, toggleTask, onNew, onOpen, userName, myTasks }: { tasks: Task[]; statusFilter: 'All' | TaskStatus; setStatusFilter: (filter: 'All' | TaskStatus) => void; toggleTask: (id: number) => void; onNew: () => void; onOpen: (id: number) => void; userName: string; myTasks: boolean }) {
  const completed = tasks.filter((task) => task.status === 'Completed').length
  return <section className="page"><div className="page-heading"><div><p className="kicker">Thursday, August 20, 2026</p><h1>{myTasks ? 'My tasks' : `Good morning, ${userName.split(' ')[0]}`} <span>✦</span></h1><p className="subheading">{myTasks ? 'Everything currently assigned to you is collected here.' : 'Keep the good work moving. Here’s what’s on the studio desk.'}</p></div><button className="primary-button" onClick={onNew}><Plus size={18} /> New request</button></div>
    <div className="stat-grid"><div className="stat-card yellow"><div className="stat-icon"><Clock3 size={19} /></div><span>In progress</span><strong>06</strong><small>+2 this week</small></div><div className="stat-card coral"><div className="stat-icon"><Send size={18} /></div><span>Awaiting review</span><strong>03</strong><small>1 needs attention</small></div><div className="stat-card mint"><div className="stat-icon"><CheckCircle2 size={19} /></div><span>Completed this month</span><strong>{String(completed + 11).padStart(2, '0')}</strong><small>+18% from July</small></div><div className="stat-card dark"><div className="stat-icon"><Zap size={18} /></div><span>Avg. turnaround</span><strong>2.4<span>d</span></strong><small>Down from 3.1d</small></div></div>
    <div className="section-heading"><div><h2>Task overview</h2><p>Keep an eye on every active request.</p></div><button className="text-button">View all <ArrowUpRight size={15} /></button></div>
    <div className="filter-row"><div className="segmented"><button className={statusFilter === 'All' ? 'selected' : ''} onClick={() => setStatusFilter('All')}>All <span>09</span></button><button className={statusFilter === 'Pending' ? 'selected' : ''} onClick={() => setStatusFilter('Pending')}>Pending <span>06</span></button><button className={statusFilter === 'Completed' ? 'selected' : ''} onClick={() => setStatusFilter('Completed')}>Completed <span>03</span></button></div><button className="filter-button"><CalendarDays size={15} /> Sort: Due date <ChevronDown size={14} /></button></div>
    <div className="task-list">{tasks.map((task) => <TaskRow key={task.id} task={task} toggleTask={toggleTask} onOpen={onOpen} />)}</div>
  </section>
}

function TaskRow({ task, toggleTask, onOpen }: { task: Task; toggleTask: (id: number) => void; onOpen: (id: number) => void }) {
  const typeIcon = task.type === 'Video' ? <Video size={18} /> : task.type.includes('Poster') ? <ImagePlus size={18} /> : task.type === 'Web development' ? <BriefcaseBusiness size={18} /> : <FileText size={18} />
  return <article className={`task-row ${task.status === 'Completed' ? 'is-complete' : ''}`} onClick={() => onOpen(task.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(task.id) }}><div className={`task-type-icon ${task.type === 'Video' ? 'video' : task.type.includes('Poster') ? 'poster' : 'web'}`}>{typeIcon}</div><div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`status-pill ${task.status.toLowerCase()}`}><i />{task.status}</span></div><p>{task.description}</p><div className="task-meta"><span className="brand-label"><i />{task.brand}</span><span><Paperclip size={13} /> {task.files} files</span><span><CalendarDays size={13} /> Due {task.dueDate}</span></div></div><button className={`complete-button ${task.status === 'Completed' ? 'done' : ''}`} onClick={(event) => { event.stopPropagation(); void toggleTask(task.id) }}>{task.status === 'Completed' ? <><Check size={15} /> Completed</> : 'Set completed'}</button><button className="view-details-button" onClick={(event) => { event.stopPropagation(); onOpen(task.id) }}>View details</button><button className="more-button" aria-label="Open task details" onClick={(event) => { event.stopPropagation(); onOpen(task.id) }}><ArrowUpRight size={19} /></button></article>
}

function TaskDetail({ task, toggleTask, onBack }: { task: Task; toggleTask: (id: number) => Promise<void>; onBack: () => void }) {
  const details: Array<[string, string | undefined]> = [
    ['Project title', task.title], ['Request type', task.type], ['Brand', task.brand], ['First submission date', task.firstSubmissionDate || task.dueDate], ['Project description', task.description], ['Objective / goal', task.objective], ['Script / copy / information / details', task.script], ['Copy / information / details', task.copy], ['Print size', task.size], ['First review date', task.firstReviewDate], ['Visual reference', task.visualReference], ['Images / visual elements', task.visualElements], ['Pages, features, or update scope', task.scope], ['Target keywords', task.keywords], ['Technical notes', task.technicalNotes],
  ]
  return <section className="page detail-page"><div className="detail-top"><button className="back-link" onClick={onBack}><ArrowUpRight size={16} /> Back to requests</button><span className={`status-pill ${task.status.toLowerCase()}`}><i />{task.status}</span></div><div className="detail-heading"><div><p className="kicker">{task.type} / {task.brand}</p><h1>{task.title}</h1><p className="subheading">Submitted by {task.submittedBy || 'Unknown user'} · {task.dueDate}</p></div><button className={`complete-button ${task.status === 'Completed' ? 'done' : ''}`} onClick={() => void toggleTask(task.id)}>{task.status === 'Completed' ? <><Check size={15} /> Mark pending</> : 'Set completed'}</button></div><div className="detail-grid"><div className="detail-card"><div className="detail-card-heading"><FileText size={18} /><div><h2>Request information</h2><p>Every field from the submitted form.</p></div></div><div className="detail-fields">{details.map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><p>{value?.trim() || 'Not provided'}</p></div>)}</div></div><aside className="detail-sidebar"><div className="detail-card metadata-card"><h2>Task timeline</h2><div className="timeline-row"><CalendarDays size={15} /><span>First submission<strong>{task.firstSubmissionDate || 'Not provided'}</strong></span></div><div className="timeline-row"><Clock3 size={15} /><span>First review<strong>{task.firstReviewDate || 'Not scheduled'}</strong></span></div><div className="timeline-row"><Zap size={15} /><span>Created<strong>{task.createdAt ? new Date(task.createdAt).toLocaleDateString() : 'Local task'}</strong></span></div></div><div className="detail-card attachments-card"><div className="detail-card-heading"><Paperclip size={18} /><div><h2>Attachments</h2><p>{task.attachments?.length || 0} files saved locally.</p></div></div>{task.attachments?.length ? task.attachments.map((file) => <a key={file.id} href={`/api/task-files/${file.id}/download`} download={file.originalName} className="attachment-link"><FileText size={15} /><span>{file.originalName}<small>{Math.ceil(file.size / 1024)} KB · Download</small></span><ArrowUpRight size={14} /></a>) : <p className="empty-attachments">No files attached.</p>}</div></aside></div></section>
}

function BrandLibrary({ onBack }: { onBack: () => void }) {
  const [brand, setBrand] = useState(brands[0])
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetch(`/api/brands/${encodeURIComponent(brand)}/assets`).then((response) => response.json()).then(setAssets).catch(() => setNotice('Brand library is unavailable while the API is offline.'))
  }, [brand])

  async function uploadAssets(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files?.length) return
    const data = new FormData()
    Array.from(event.target.files).forEach((file) => data.append('files', file))
    const response = await fetch(`/api/brands/${encodeURIComponent(brand)}/assets`, { method: 'POST', body: data })
    if (!response.ok) return setNotice('Could not save those brand assets.')
    setAssets(await response.json())
    setNotice('Brand assets saved to the local database.')
    event.target.value = ''
  }

  return <section className="page"><div className="page-heading"><div><p className="kicker">Workspace / library</p><h1>Brand library <span>✦</span></h1><p className="subheading">Keep reusable logos, references, and visual assets available for every request.</p></div><button className="secondary-button" onClick={onBack}><ArrowUpRight size={16} /> Back to overview</button></div><div className="library-tabs">{brands.map((item) => <button key={item} className={brand === item ? 'selected' : ''} onClick={() => setBrand(item)}>{item}</button>)}</div><div className="library-toolbar"><div><h2>{brand}</h2><p>{assets.length} saved assets</p></div><label className="primary-button upload-library"><UploadCloud size={17} /> Add assets<input type="file" multiple onChange={uploadAssets} /></label></div><div className="asset-grid">{assets.map((asset) => <a className="asset-card" key={asset.id} href={`/api/brand-assets/${asset.id}/download`} download={asset.originalName}><div className="asset-preview"><FileText size={25} /></div><strong>{asset.originalName}</strong><small>{Math.ceil(asset.size / 1024)} KB · Download</small></a>)}{assets.length === 0 && <div className="empty-library"><FolderOpen size={25} /><h3>No brand assets yet</h3><p>Upload the logos, references, or files your team uses most.</p></div>}</div>{notice && <div className="library-notice">{notice}</div>}</section>
}

function SubmissionForm({ type, setType, onSubmit, onCancel }: { type: TaskType; setType: (type: TaskType) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const isVideo = type === 'Video'
  const isPoster = type.includes('Poster')
  if (type === 'Website update') return <WebsiteUpdateForm onSubmit={onSubmit} onCancel={onCancel} />
  return <section className="page form-page"><div className="page-heading compact"><div><p className="kicker">New creative brief</p><h1>Submit a request <span>✦</span></h1><p className="subheading">Give the studio a clear starting point. You can always add detail later.</p></div><div className="form-help"><MessageSquareText size={17} /><span>Need help? <strong>Chat with studio</strong></span></div></div><form onSubmit={onSubmit}><div className="form-layout"><div className="form-column"><div className="form-block"><div className="block-heading"><span className="number">01</span><div><h2>Request type</h2><p>What can we help bring to life?</p></div></div><div className="type-grid">{taskTypes.map((taskType) => <button type="button" key={taskType} className={type === taskType ? 'type-card selected' : 'type-card'} onClick={() => setType(taskType)}>{taskType === 'Video' ? <Video /> : taskType.includes('Poster') ? <ImagePlus /> : taskType === 'Web development' ? <BriefcaseBusiness /> : taskType === 'SEO' ? <Search /> : <FileText />}<span>{taskType}</span>{type === taskType && <Check className="type-check" size={16} />}</button>)}</div></div><div className="form-block"><div className="block-heading"><span className="number">02</span><div><h2>Project details</h2><p>The essentials our team needs to get started.</p></div></div><div className="field-grid"><label className="field full"><span>Project title <b>*</b></span><input name="projectTitle" required placeholder="e.g. Back to school campaign" /></label><label className="field"><span>Brand <b>*</b></span><select name="brand" required defaultValue={brands[0]}>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label><label className="field"><span>First submission date <b>*</b></span><input name="firstSubmissionDate" type="date" required defaultValue="2026-08-28" /></label><label className="field full"><span>Project description <b>*</b></span><textarea name="description" required placeholder="Tell us what this request is for and what success looks like..." rows={4} /></label>{(isVideo || isPoster || type === 'Web development' || type === 'SEO' || type === 'Update') && <label className="field full"><span>{isVideo ? 'Objective / goal' : type === 'SEO' ? 'SEO goal & target audience' : type === 'Web development' ? 'Build goal & key functionality' : 'Objective / goal'} <b>*</b></span><textarea name="objective" required placeholder="What should this work achieve?" rows={3} /></label>}{isVideo && <label className="field full"><span>Script / copy / information / details <b>*</b></span><textarea name="script" required placeholder="Paste your script or key talking points here..." rows={4} /></label>}{isPoster && <label className="field full"><span>{type === 'Print Poster / Flyer' ? 'Copy / information / details' : 'Copy / information / details message'} <b>*</b></span><textarea name="copy" required placeholder="Add the exact message, dates, calls to action, or disclaimers..." rows={4} /></label>}{type === 'Print Poster / Flyer' && <label className="field"><span>Print size <b>*</b></span><select name="size" required defaultValue="Single"><option>Single</option><option>Trifold</option><option>PunchCard</option></select></label>}{(type === 'Update' || type === 'Web development') && <label className="field full"><span>Links, pages, or details to update <b>*</b></span><textarea name="scope" required placeholder="Share URLs, current content, or a list of requested changes..." rows={3} /></label>}{type === 'SEO' && <label className="field full"><span>Target keywords <b>*</b></span><input name="keywords" required placeholder="e.g. autism therapy, child psychology, Tampa" /></label>}<label className="field"><span>First review date</span><input name="firstReviewDate" type="date" /></label><label className="field"><span>Visual reference</span><input name="visualReference" placeholder="Paste a link or describe the look" /></label>{(isVideo || isPoster) && <label className="field full"><span>{isVideo ? 'Images to use (visual elements)' : 'Images to use / visual elements'}</span><textarea name="visualElements" placeholder="List preferred photos, graphics, or assets to include..." rows={3} /></label>}</div></div></div><aside className="form-aside"><div className="upload-card"><div className="upload-icon"><UploadCloud size={21} /></div><h3>Bring your assets</h3><p>Upload logos, references, copy docs, or anything else that helps.</p><label className="upload-zone"><Paperclip size={17} /><span>Drop files here or <strong>browse</strong></span><small>PNG, JPG, PDF up to 25 MB</small><input type="file" multiple /></label></div><div className="aside-note"><Sparkles size={17} /><div><strong>A thoughtful brief goes far.</strong><p>Our studio team usually replies within one business day.</p></div></div></aside></div><div className="form-footer"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button"><Send size={17} /> Submit request</button></div></form></section>
}

function WebsiteUpdateForm({ onSubmit, onCancel }: { onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <section className="page form-page"><div className="page-heading compact"><div><p className="kicker">Digital request</p><h1>Website update <span>✦</span></h1><p className="subheading">Share the current page and exactly what needs to change.</p></div><div className="form-help"><FileText size={17} /><span>Website update intake</span></div></div><form onSubmit={onSubmit}><div className="form-layout"><div className="form-column"><div className="form-block"><div className="block-heading"><span className="number">01</span><div><h2>Update details</h2><p>Give the team enough context to make the change correctly.</p></div></div><div className="field-grid"><label className="field full"><span>Project title <b>*</b></span><input name="projectTitle" required placeholder="e.g. Update services page" /></label><label className="field"><span>Brand <b>*</b></span><select name="brand" required defaultValue={brands[0]}>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label><label className="field"><span>First submission date <b>*</b></span><input name="firstSubmissionDate" type="date" required /></label><label className="field full"><span>Project description <b>*</b></span><textarea name="description" required placeholder="What needs to be updated and why?" rows={4} /></label><label className="field full"><span>Objective / goal <b>*</b></span><textarea name="objective" required placeholder="What should be different when the update is complete?" rows={3} /></label><label className="field full"><span>Pages, content, and changes required <b>*</b></span><textarea name="scope" required placeholder="List the page URLs, text changes, images, layout changes, or fixes." rows={4} /></label><label className="field full"><span>Current website or page link <b>*</b></span><input name="visualReference" required placeholder="https://yourwebsite.com/page" /></label><label className="field"><span>First review date</span><input name="firstReviewDate" type="date" /></label><label className="field"><span>Technical notes</span><input name="technicalNotes" placeholder="CMS, hosting, access, or other notes" /></label></div></div></div><aside className="form-aside"><div className="upload-card"><div className="upload-icon"><UploadCloud size={21} /></div><h3>Attach update references</h3><p>Include screenshots, replacement copy, or new images for the page.</p><label className="upload-zone"><Paperclip size={17} /><span>Drop files here or <strong>browse</strong></span><small>PNG, JPG, PDF up to 25 MB</small><input type="file" multiple /></label></div></aside></div><div className="form-footer"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button"><Send size={17} /> Submit website update</button></div></form></section>
}

function WebDevelopmentForm({ onSubmit, onCancel }: { onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <section className="page form-page"><div className="page-heading compact"><div><p className="kicker">Creative studio / web</p><h1>Web development brief <span>✦</span></h1><p className="subheading">Tell the digital team what needs to be built, improved, or connected.</p></div><div className="form-help"><BriefcaseBusiness size={17} /><span>Dedicated web project intake</span></div></div><form onSubmit={onSubmit}><div className="form-layout"><div className="form-column"><div className="form-block"><div className="block-heading"><span className="number">01</span><div><h2>Project details</h2><p>Help us understand the product and the people using it.</p></div></div><div className="field-grid"><label className="field full"><span>Project title <b>*</b></span><input name="projectTitle" required placeholder="e.g. New parent resources page" /></label><label className="field"><span>Brand <b>*</b></span><select name="brand" required defaultValue={brands[0]}>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label><label className="field"><span>First submission date <b>*</b></span><input name="firstSubmissionDate" type="date" required /></label><label className="field full"><span>Project description <b>*</b></span><textarea name="description" required placeholder="What are we building or changing? Include the context behind the request." rows={4} /></label><label className="field full"><span>Goal and success criteria <b>*</b></span><textarea name="objective" required placeholder="What should visitors or staff be able to do when this is complete?" rows={3} /></label><label className="field full"><span>Pages, features, and functionality <b>*</b></span><textarea name="scope" required placeholder="List pages, forms, integrations, automations, or technical requirements." rows={4} /></label><label className="field full"><span>Reference links or existing website</span><input name="visualReference" placeholder="https://example.com or describe the reference" /></label><label className="field"><span>First review date</span><input name="firstReviewDate" type="date" /></label><label className="field"><span>Technical notes</span><input name="technicalNotes" placeholder="CMS, hosting, domain, integrations" /></label></div></div></div><aside className="form-aside"><div className="upload-card web-upload"><div className="upload-icon"><BriefcaseBusiness size={21} /></div><h3>Web project workspace</h3><p>Share wireframes, screenshots, brand assets, or technical documentation with the build team.</p><label className="upload-zone"><Paperclip size={17} /><span>Drop files here or <strong>browse</strong></span><small>PNG, JPG, PDF, DOC up to 25 MB</small><input type="file" multiple /></label></div><div className="aside-note"><Sparkles size={17} /><div><strong>Clear scope, faster launch.</strong><p>Include a link to the current site when this is an update.</p></div></div></aside></div><div className="form-footer"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button"><Send size={17} /> Submit web brief</button></div></form></section>
}

async function submitToGhlAndEmail(payload: Record<string, string>) {
  const ghlWebhookUrl = import.meta.env.VITE_GHL_WEBHOOK_URL
  const emailEndpoint = import.meta.env.VITE_EMAIL_ENDPOINT
  const requests = [ghlWebhookUrl && fetch(ghlWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), emailEndpoint && fetch(emailEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })].filter(Boolean)
  await Promise.allSettled(requests)
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
