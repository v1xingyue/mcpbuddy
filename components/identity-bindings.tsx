'use client';

import { useRef, useState, useTransition } from 'react';
import { unbindIdentity } from '@/app/actions';

type IdentityMethod = { id: 'github' | 'google' | 'wallet'; label: string; href?: string };

const methods: IdentityMethod[] = [
  { id: 'github', label: 'GitHub', href: '/api/account/link/github' },
  { id: 'google', label: 'Google', href: '/api/account/link/google' },
  { id: 'wallet', label: 'Solana wallet' },
] as const;

export function IdentityBindings({ providers }: { providers: string[] }) {
  const [bound, setBound] = useState(() => new Set(providers));
  const [selected, setSelected] = useState<IdentityMethod | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  function toggle(method: IdentityMethod) {
    setMessage('');
    if (bound.has(method.id)) { setSelected(method); dialog.current?.showModal(); return; }
    if (method.href) { window.location.assign(method.href); return; }
    setMessage('Bind a Solana wallet from the wallet panel above.');
  }

  function confirm() {
    if (!selected) return;
    startTransition(async () => {
      try {
        await unbindIdentity(selected.id);
        setBound(previous => { const next = new Set(previous); next.delete(selected.id); return next; });
        dialog.current?.close(); setSelected(null);
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not unbind this identity.'); dialog.current?.close(); }
    });
  }

  return <section className="identity-bindings"><div><p className="eyebrow">SIGN-IN METHODS</p><h2>Bound identities</h2><p>Any bound method can sign in to this MCPBuddy account.</p></div><div className="binding-actions">{methods.map(method => <button className="identity-toggle" type="button" role="switch" aria-checked={bound.has(method.id)} key={method.id} onClick={() => toggle(method)}><span>{method.label}</span><i aria-hidden="true" /></button>)}{message && <p className="identity-message" role="status">{message}</p>}</div><dialog className="unbind-dialog" ref={dialog} onClose={() => setSelected(null)}><p className="label">UNBIND IDENTITY</p><h2>Remove {selected?.label}?</h2><p>You will no longer be able to sign in with this method. This does not delete your MCPBuddy data.</p><div><button className="quiet" type="button" onClick={() => dialog.current?.close()} disabled={pending}>Cancel</button><button className="unbind-confirm" type="button" onClick={confirm} disabled={pending}>{pending ? 'Removing…' : 'Unbind'}</button></div></dialog></section>;
}
