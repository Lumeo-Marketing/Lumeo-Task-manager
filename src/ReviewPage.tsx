import { FormEvent, useEffect, useState } from 'react'
import { Check, FileText, MessageSquareText } from 'lucide-react'

type Review = {
  title: string
  type: string
  brand: string
  message: string
  reviewerName: string
  reviewStatus: string
  taskStatus: string
  correctionComment?: string
  file?: { originalName: string; size: number } | null
}

export default function ReviewPage({ token }: { token: string }) {
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState('')
  const [showCorrection, setShowCorrection] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    fetch(`/api/reviews/${token}`).then(async (response) => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'This review could not be loaded')
      setReview(data)
    }).catch((requestError) => setError(requestError.message))
  }, [token])

  async function respond(decision: 'approve' | 'correction', comment = '') {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`/api/reviews/${token}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, comment }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Your response could not be saved')
      setResult(decision === 'approve' ? 'Approved' : 'Correction sent')
      setReview((current) => current ? { ...current, reviewStatus: data.decision, taskStatus: data.taskStatus, correctionComment: comment } : current)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Your response could not be saved')
    } finally {
      setSubmitting(false)
    }
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const comment = String(new FormData(event.currentTarget).get('comment') || '').trim()
    void respond('correction', comment)
  }

  if (error && !review) return <main className="review-page"><div className="review-card"><p className="kicker">Lumeo Task System</p><h1>Review unavailable</h1><p className="review-copy">{error}</p></div></main>
  if (!review) return <main className="review-page"><div className="review-card review-loading"><span className="inline-spinner dark" /> Loading review…</div></main>
  const decided = review.reviewStatus !== 'Awaiting response' || Boolean(result)
  return <main className="review-page"><div className="review-card">
    <p className="kicker">Lumeo Task System / {review.type}</p>
    <h1>{review.title}</h1>
    <p className="review-brand">{review.brand}</p>
    <div className="review-message"><MessageSquareText size={18} /><p>{review.message}</p></div>
    {review.file && <a className="review-file" href={`/api/reviews/${token}/file`} download={review.file.originalName}><FileText size={18} /><span>{review.file.originalName}<small>{Math.ceil(review.file.size / 1024)} KB · Download file</small></span></a>}
    {decided ? <div className={`review-result ${review.reviewStatus === 'Approved' ? 'approved' : ''}`}><Check size={20} /><div><strong>{result || review.reviewStatus}</strong><p>{review.reviewStatus === 'Approved' ? 'The task owner has been notified.' : 'Your correction was sent to the task owner.'}</p></div></div> : <>
      <div className="review-actions"><button className="approve-button" onClick={() => void respond('approve')} disabled={submitting}><Check size={17} /> Approve</button><button className="correction-button" onClick={() => setShowCorrection(true)} disabled={submitting}><MessageSquareText size={17} /> Request correction</button></div>
      {showCorrection && <form className="correction-form" onSubmit={submitCorrection}><label><span>What needs to be corrected? <b>*</b></span><textarea name="comment" required rows={5} placeholder="Give the team clear, actionable feedback." /></label>{error && <p className="modal-error" role="alert">{error}</p>}<button className="primary-button" disabled={submitting}>{submitting ? 'Sending…' : 'Submit correction'}</button></form>}
    </>}
  </div></main>
}
