import { FormEvent, useState } from 'react'
import { FileText, Send, UploadCloud, X } from 'lucide-react'

type CompletionTask = {
  id: number
  title: string
  reviewerName?: string
  reviewerEmail?: string
}

export default function CompletionModal({ task, onClose, onSent }: { task: CompletionTask; onClose: () => void; onSent: (task: unknown) => void }) {
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`/api/tasks/${task.id}/review`, { method: 'POST', body: new FormData(event.currentTarget) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not send this task for review')
      onSent(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send this task for review')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="completion-overlay" role="dialog" aria-modal="true" aria-labelledby="completion-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <form className="completion-modal" onSubmit={submit}>
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={submitting}><X size={18} /></button>
      <p className="kicker">Send for review</p>
      <h2 id="completion-title">Complete “{task.title}”</h2>
      <p className="modal-intro">Send the finished work to <strong>{task.reviewerName || 'the selected reviewer'}</strong>. The task will remain under review until they approve it.</p>
      <label className="modal-field"><span>Message or link <b>*</b></span><input name="message" required placeholder="Add a delivery note or paste the finished-work URL" /></label>
      <label className="modal-upload"><UploadCloud size={21} /><span>{fileName || 'Choose the completed file'}<small>One file, up to 25 MB</small></span><input name="file" type="file" required onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} /></label>
      {fileName && <div className="modal-file"><FileText size={15} /> {fileName}</div>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>Cancel</button><button type="submit" className="primary-button" disabled={submitting} aria-busy={submitting}>{submitting ? <span className="inline-spinner" /> : <Send size={16} />} {submitting ? 'Sending…' : 'Send to reviewer'}</button></div>
    </form>
  </div>
}
