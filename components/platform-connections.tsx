'use client';

import { useEffect, useState } from 'react';

const platforms = [
  { id: 'claude', number: '01', name: 'Claude', description: 'Add your endpoint in Claude’s Custom Connectors. Sign in with GitHub when prompted.', href: 'https://claude.ai' },
  { id: 'openai', number: '02', name: 'ChatGPT', description: 'Use the same OAuth-protected endpoint in ChatGPT developer mode or your GPT Actions setup.', href: 'https://chatgpt.com' },
  { id: 'grok', number: '03', name: 'Grok', description: 'Paste the endpoint in Custom Connectors. Grok discovers registration and completes PKCE automatically.', href: 'https://grok.com' },
];

export function PlatformConnections() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const saved = localStorage.getItem('mcpbuddy-platform-connections');
    if (saved) setConnected(JSON.parse(saved));
  }, []);
  function mark(id: string) {
    const next = { ...connected, [id]: !connected[id] };
    setConnected(next); localStorage.setItem('mcpbuddy-platform-connections', JSON.stringify(next));
  }
  return <div className="grid">{platforms.map((platform) => {
    const isConnected = !!connected[platform.id];
    return <article key={platform.id} className={isConnected ? 'connection-card connected' : 'connection-card'}>
      <div className="card-top"><div className="number">{platform.number}</div><span className={isConnected ? 'connection-status online' : 'connection-status'}>{isConnected ? '● Connected' : '○ Not connected'}</span></div>
      <h2>Connect {platform.name}</h2><p>{platform.description}</p>
      <div className="card-actions"><a href={platform.href} target="_blank" rel="noreferrer">Open {platform.name} ↗</a><button type="button" className="connection-toggle" onClick={() => mark(platform.id)}>{isConnected ? 'Mark disconnected' : "I've connected it"}</button></div>
    </article>;
  })}</div>;
}
