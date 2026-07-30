'use client';

import { useState, useTransition } from 'react';
import { updateUserInfo } from '@/app/actions';

export function UserInfoEditor({ initialValue }: { initialValue: string }) {
  const [content, setContent] = useState(initialValue); const [status, setStatus] = useState(''); const [pending, startTransition] = useTransition();
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus('');
    startTransition(async () => {
      try { await updateUserInfo(content); setStatus('Saved. MCP clients will receive this on their next user_info call.'); }
      catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save user info.'); }
    });
  }
  return <section className="user-info-editor"><div className="editor-head"><div><p className="eyebrow">USERINFO.MD</p><h2>AI context</h2><p>Private Markdown supplied to an AI when it calls <code>user_info()</code> before working on your behalf.</p></div><span>{content.length.toLocaleString()} / 20,000</span></div><form onSubmit={save}><label htmlFor="user-info">Profile, preferences, writing style, constraints, and current goals</label><textarea id="user-info" value={content} onChange={event => setContent(event.target.value)} maxLength={20_000} placeholder={'# About me\n\n- Name: ...\n- Preferences: ...\n- Current goals: ...'} /><div className="editor-actions"><small role="status">{status}</small><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save userinfo.md'}</button></div></form></section>;
}
