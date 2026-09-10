'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function AiTestPage() {
  const { activeAccountId } = useAuth()
  const [conversationId, setConversationId] = useState('')
  const [conversationLabel, setConversationLabel] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchingConv, setFetchingConv] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  // Fetch a random conversation on mount
  useEffect(() => {
    if (!activeAccountId) return
    setFetchingConv(true)
    supabase
      .from('conversations')
      .select('id, contact_id, contacts(name, phone), last_message_text')
      .eq('account_id', activeAccountId)
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const pick = data[Math.floor(Math.random() * data.length)]
          setConversationId(pick.id)
          const name = (pick as any).contacts?.name || (pick as any).contacts?.phone || 'Unknown'
          setConversationLabel(`${name} — ${(pick.last_message_text || '').slice(0, 50)}`)
        }
      })
      .finally(() => setFetchingConv(false))
  }, [activeAccountId])

  const pickRandom = async () => {
    if (!activeAccountId) return
    setFetchingConv(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, contact_id, contacts(name, phone), last_message_text')
      .eq('account_id', activeAccountId)
      .order('updated_at', { ascending: false })
      .limit(10)
    if (data && data.length > 0) {
      const pick = data[Math.floor(Math.random() * data.length)]
      setConversationId(pick.id)
      const name = (pick as any).contacts?.name || (pick as any).contacts?.phone || 'Unknown'
      setConversationLabel(`${name} — ${(pick.last_message_text || '').slice(0, 50)}`)
    }
    setFetchingConv(false)
  }

  const runTest = async () => {
    if (!message.trim()) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/ai/test/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: activeAccountId,
          message: message.trim(),
          conversationId: conversationId.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">AI Tool Calling Test</h1>

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conversation</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={conversationId}
              onChange={(e) => { setConversationId(e.target.value); setConversationLabel('') }}
              placeholder={fetchingConv ? 'Loading...' : 'Optional — for history context'}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={pickRandom}
              disabled={fetchingConv || !activeAccountId}
              className="bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {fetchingConv ? '...' : 'Random'}
            </button>
          </div>
          {conversationLabel && (
            <p className="text-xs text-gray-500 mt-1 truncate">{conversationLabel}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="e.g. I want to send 3 cartons of Doll shoes to Fedha near Doni School. Pickup is at Tom Mboya Street plot no 4"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={runTest}
          disabled={loading || !message.trim() || !activeAccountId}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Test'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold text-sm text-gray-500 mb-2">Config</h2>
            <div className="text-sm space-y-1">
              <div><span className="font-medium">Business Type:</span> {result.businessType || '(none)'}</div>
              <div><span className="font-medium">Tools Available:</span> {result.tools?.join(', ')}</div>
              <div><span className="font-medium">System Prompt:</span> {result.systemPromptPreview?.length} chars</div>
            </div>
          </div>

          {result.round0 && (
            <div className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold text-sm text-gray-500 mb-2">Round 0 — AI Response</h2>
              <div className="text-sm space-y-2">
                {result.round0.text && (
                  <div className="bg-gray-50 p-3 rounded font-mono text-xs whitespace-pre-wrap">
                    {result.round0.text}
                  </div>
                )}
                {result.round0.toolCalls?.length > 0 ? (
                  <div className="bg-green-50 p-3 rounded">
                    <div className="font-medium text-green-800 mb-1">
                      Tool Calls ({result.round0.toolCalls.length}):
                    </div>
                    {result.round0.toolCalls.map((tc: any, i: number) => (
                      <div key={i} className="text-xs font-mono">
                        <div className="font-bold">{tc.name}()</div>
                        {tc.parsedArgs && (
                          <pre className="mt-1 text-gray-600 overflow-x-auto">
                            {JSON.stringify(tc.parsedArgs, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 p-3 rounded text-yellow-800 font-medium">
                    No tool calls — AI generated text instead
                  </div>
                )}
                {result.round0.handoff && (
                  <div className="bg-orange-50 p-3 rounded text-orange-800 font-medium">
                    Handoff sentinel triggered
                  </div>
                )}
              </div>
            </div>
          )}

          {result.round1 && (
            <div className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold text-sm text-gray-500 mb-2">Round 1 — After Tool Execution</h2>
              <div className="text-sm space-y-2">
                {result.round1.text && (
                  <div className="bg-gray-50 p-3 rounded font-mono text-xs whitespace-pre-wrap">
                    {result.round1.text}
                  </div>
                )}
                {result.round1.toolCalls?.length > 0 ? (
                  <div className="bg-blue-50 p-3 rounded text-blue-800">
                    More tool calls: {result.round1.toolCalls.map((tc: any) => tc.name).join(', ')}
                  </div>
                ) : (
                  <div className="text-gray-500">No more tool calls</div>
                )}
              </div>
            </div>
          )}

          {result.toolResults?.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold text-sm text-gray-500 mb-2">Tool Results</h2>
              {result.toolResults.map((tr: any, i: number) => (
                <div key={i} className="bg-gray-50 p-3 rounded text-xs font-mono mb-2">
                  {tr.response ? (
                    <div>
                      <div className="font-bold mb-1">Response:</div>
                      <pre className="whitespace-pre-wrap text-green-800">{tr.response}</pre>
                    </div>
                  ) : (
                    <pre className="overflow-x-auto">{JSON.stringify(tr, null, 2)}</pre>
                  )}
                  {tr.buttons && (
                    <div className="mt-2">
                      <span className="font-bold">Buttons:</span>{' '}
                      {tr.buttons.map((b: any) => (
                        <span key={b.id} className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1">
                          {b.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold text-sm text-gray-500 mb-2">Final Result (what customer sees)</h2>
            <div className="bg-green-50 p-4 rounded">
              {result.finalButtons && (
                <div className="mb-2">
                  {result.finalButtons.map((b: any) => (
                    <span key={b.id} className="inline-block bg-blue-500 text-white px-3 py-1 rounded text-sm mr-1">
                      {b.title}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-sm whitespace-pre-wrap font-mono">
                {result.finalText || '(empty)'}
              </div>
            </div>
          </div>

          <details className="bg-white border rounded-lg p-4">
            <summary className="font-semibold text-sm text-gray-500 cursor-pointer">Debug Logs ({result.logs?.length})</summary>
            <pre className="text-xs text-gray-600 mt-2 overflow-x-auto">
              {result.logs?.join('\n')}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
