'use client';

import { useState, useTransition } from 'react';
import { updateUserInfo } from '@/app/actions';
import { CONTEXT_PACK_TEMPLATE } from '@/lib/context-pack';

export function UserInfoEditor({ initialValue }: { initialValue: string }) {
  const [content, setContent] = useState(initialValue); const [status, setStatus] = useState(''); const [pending, startTransition] = useTransition();
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus('');
    startTransition(async () => {
      try { await updateUserInfo(content); setStatus('Saved. MCP clients will receive this on their next user_info call.'); }
      catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save user info.'); }
    });
  }
  function useTemplate() {
    if (content.trim() && !window.confirm('Replace the unsaved editor content with the Context Pack template?')) return;
    setContent(CONTEXT_PACK_TEMPLATE); setStatus('Starter template loaded. Fill in only the sections you want an AI client to receive.');
  }
  return <section className="user-info-editor"><div className="editor-head"><div><p className="eyebrow">AI CONTEXT PACK</p><h2>Your portable AI brief</h2><p>Private Markdown supplied when an AI calls <code>user_info()</code> before working on your behalf.</p></div><span>{content.length.toLocaleString()} / 20,000</span></div><div className="context-pack-note"><b>Shared scope</b><span>Every connected AI client receives this pack after authorization. Do not add secrets; client, project, and tool-specific permissions are not available in this first version.</span></div><form onSubmit={save}><div className="editor-label-row"><label htmlFor="user-info">Profile, preferences, hard limits, goals, project notes, and tool guidance</label><button className="quiet context-template" type="button" onClick={useTemplate}>Use starter template</button></div><textarea id="user-info" value={content} onChange={event => setContent(event.target.value)} maxLength={20_000} placeholder={CONTEXT_PACK_TEMPLATE} /><div className="editor-actions"><small role="status">{status}</small><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Context Pack'}</button></div></form></section>;
}
