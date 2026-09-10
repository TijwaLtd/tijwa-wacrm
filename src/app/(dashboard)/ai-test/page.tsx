'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AiTestPage() {
  const { activeAccountId } = useAuth();
  const [conversationId, setConversationId] = useState('');
  const [conversationLabel, setConversationLabel] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingConv, setFetchingConv] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Fetch a random conversation on mount
  useEffect(() => {
    if (!activeAccountId) return;
    setFetchingConv(true);
    supabase
      .from('conversations')
      .select('id, contact_id, contacts(name, phone), last_message_text')
      .eq('account_id', activeAccountId)
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const pick = data[Math.floor(Math.random() * data.length)];
          setConversationId(pick.id);
          const name =
            (pick as any).contacts?.name ||
            (pick as any).contacts?.phone ||
            'Unknown';
          setConversationLabel(
            `${name} — ${(pick.last_message_text || '').slice(0, 50)}`
          );
        }
      })
      .then(() => setFetchingConv(false));
  }, [activeAccountId]);

  const pickRandom = async () => {
    if (!activeAccountId) return;
    setFetchingConv(true);
    const { data } = await supabase
      .from('conversations')
      .select('id, contact_id, contacts(name, phone), last_message_text')
      .eq('account_id', activeAccountId)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (data && data.length > 0) {
      const pick = data[Math.floor(Math.random() * data.length)];
      setConversationId(pick.id);
      const name =
        (pick as any).contacts?.name ||
        (pick as any).contacts?.phone ||
        'Unknown';
      setConversationLabel(
        `${name} — ${(pick.last_message_text || '').slice(0, 50)}`
      );
    }
    setFetchingConv(false);
  };

  const runTest = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/ai/test/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: activeAccountId,
          message: message.trim(),
          conversationId: conversationId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">AI Tool Calling Test</h1>

      <div className="mb-8 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Conversation
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={conversationId}
              onChange={(e) => {
                setConversationId(e.target.value);
                setConversationLabel('');
              }}
              placeholder={
                fetchingConv ? 'Loading...' : 'Optional — for history context'
              }
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              onClick={pickRandom}
              disabled={fetchingConv || !activeAccountId}
              className="rounded-lg bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300 disabled:opacity-50"
            >
              {fetchingConv ? '...' : 'Random'}
            </button>
          </div>
          {conversationLabel && (
            <p className="mt-1 truncate text-xs text-gray-500">
              {conversationLabel}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Customer Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="e.g. I want to send 3 cartons of Doll shoes to Fedha near Doni School. Pickup is at Tom Mboya Street plot no 4"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={runTest}
          disabled={loading || !message.trim() || !activeAccountId}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Test'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-500">Config</h2>
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">Business Type:</span>{' '}
                {result.businessType || '(none)'}
              </div>
              <div>
                <span className="font-medium">Tools Available:</span>{' '}
                {result.tools?.join(', ')}
              </div>
              <div>
                <span className="font-medium">System Prompt:</span>{' '}
                {result.systemPromptPreview?.length} chars
              </div>
            </div>
          </div>

          {result.round0 && (
            <div className="rounded-lg border p-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-500">
                Round 0 — AI Response
              </h2>
              <div className="space-y-2 text-sm">
                {result.round0.text && (
                  <div className="rounded p-3 font-mono text-xs whitespace-pre-wrap">
                    {result.round0.text}
                  </div>
                )}
                {result.round0.toolCalls?.length > 0 ? (
                  <div className="rounded bg-green-50 p-3">
                    <div className="mb-1 font-medium text-green-800">
                      Tool Calls ({result.round0.toolCalls.length}):
                    </div>
                    {result.round0.toolCalls.map((tc: any, i: number) => (
                      <div key={i} className="font-mono text-xs">
                        <div className="font-bold">{tc.name}()</div>
                        {tc.parsedArgs && (
                          <pre className="mt-1 overflow-x-auto text-gray-600">
                            {JSON.stringify(tc.parsedArgs, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded bg-yellow-50 p-3 font-medium text-yellow-800">
                    No tool calls — AI generated text instead
                  </div>
                )}
                {result.round0.handoff && (
                  <div className="rounded bg-orange-50 p-3 font-medium text-orange-800">
                    Handoff sentinel triggered
                  </div>
                )}
              </div>
            </div>
          )}

          {result.round1 && (
            <div className="rounded-lg border p-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-500">
                Round 1 — After Tool Execution
              </h2>
              <div className="space-y-2 text-sm">
                {result.round1.text && (
                  <div className="rounded p-3 font-mono text-xs whitespace-pre-wrap">
                    {result.round1.text}
                  </div>
                )}
                {result.round1.toolCalls?.length > 0 ? (
                  <div className="rounded p-3 text-blue-800">
                    More tool calls:{' '}
                    {result.round1.toolCalls
                      .map((tc: any) => tc.name)
                      .join(', ')}
                  </div>
                ) : (
                  <div className="text-gray-500">No more tool calls</div>
                )}
              </div>
            </div>
          )}

          {result.toolResults?.length > 0 && (
            <div className="rounded-lg border p-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-500">
                Tool Results
              </h2>
              {result.toolResults.map((tr: any, i: number) => (
                <div key={i} className="mb-2 rounded p-3 font-mono text-xs">
                  {tr.response ? (
                    <div>
                      <div className="mb-1 font-bold">Response:</div>
                      <pre className="whitespace-pre-wrap text-green-800">
                        {tr.response}
                      </pre>
                    </div>
                  ) : (
                    <pre className="overflow-x-auto">
                      {JSON.stringify(tr, null, 2)}
                    </pre>
                  )}
                  {tr.buttons && (
                    <div className="mt-2">
                      <span className="font-bold">Buttons:</span>{' '}
                      {tr.buttons.map((b: any) => (
                        <span
                          key={b.id}
                          className="mr-1 inline-block rounded bg-blue-100 px-2 py-1 text-xs text-blue-800"
                        >
                          {b.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-500">
              Final Result (what customer sees)
            </h2>
            <div className="rounded p-4">
              {result.finalButtons && (
                <div className="mb-2">
                  {result.finalButtons.map((b: any) => (
                    <span
                      key={b.id}
                      className="mr-1 inline-block rounded bg-blue-500 px-3 py-1 text-sm text-white"
                    >
                      {b.title}
                    </span>
                  ))}
                </div>
              )}
              <div className="font-mono text-sm whitespace-pre-wrap">
                {result.finalText || '(empty)'}
              </div>
            </div>
          </div>

          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-500">
              Debug Logs ({result.logs?.length})
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs text-gray-600">
              {result.logs?.join('\n')}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
