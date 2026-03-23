'use client';

import { useState } from 'react';

export default function TicketReplyForm({
  ticketId,
  companySlug,
  onReplySent,
}: {
  ticketId: string;
  companySlug: string;
  onReplySent: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReply = async () => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/tickets/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companySlug,
          ticketId,
          message: replyText.trim(),
        }),
      });
      if (res.ok) {
        setReplyText('');
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        onReplySent();
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(data.error || `Failed to send reply (${res.status})`);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-white/10">
      <p className="text-sm font-medium text-white mb-2">Reply to this ticket</p>
      <div className="flex gap-2">
        <textarea
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          placeholder="Type your reply..."
          rows={3}
          className="flex-1 bg-gray-700/50 text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500 resize-none"
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <div>
          {success && <p className="text-xs text-green-400">Reply sent successfully!</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <button
          onClick={handleReply}
          disabled={!replyText.trim() || submitting}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitting ? 'Sending...' : 'Send Reply'}
        </button>
      </div>
    </div>
  );
}
