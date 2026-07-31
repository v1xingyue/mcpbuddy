'use client';

import { useEffect, useState } from 'react';

const platforms = [
  { id: 'claude', number: '01', name: 'Claude', description: 'Add your endpoint in Claude’s Custom Connectors. Sign in to MCPBuddy when prompted.', href: 'https://claude.ai' },
  { id: 'openai', number: '02', name: 'ChatGPT', description: 'Use the same OAuth-protected endpoint in ChatGPT developer mode or your GPT Actions setup.', href: 'https://chatgpt.com' },
  { id: 'grok', number: '03', name: 'Grok', description: 'Paste the endpoint in Custom Connectors. Grok discovers registration and completes PKCE automatically.', href: 'https://grok.com/connectors' },
];

export function PlatformConnections({ connectedPlatforms }: { connectedPlatforms: string[] }) {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem('mcpbuddy-platform-connections');
    setConnected({ ...(saved ? JSON.parse(saved) : {}), ...Object.fromEntries(connectedPlatforms.map(platform => [platform, true])) });
  }, [connectedPlatforms]);
  const connectedCount = platforms.filter(platform => connected[platform.id]).length;
  return <section className="connection-cards" aria-labelledby="connection-status-heading"><header className="connection-status-panel"><div><p className="label">CONNECTION STATUS</p><h2 id="connection-status-heading">{connectedCount} of {platforms.length} clients connected</h2><p>Each card reflects the latest verified MCP connection for this account.</p></div><div className="connection-progress" aria-label={`${connectedCount} of ${platforms.length} clients connected`}>{platforms.map(platform => <i key={platform.id} className={connected[platform.id] ? 'online' : ''} />)}</div></header><div className="connection-card-grid">{platforms.map((platform, index) => {
    const isConnected = !!connected[platform.id];
    return <article key={platform.id} style={{ '--card-index': index } as React.CSSProperties} className={isConnected ? 'connection-card connected' : 'connection-card'}><div className="card-top"><div className="number">{platform.number}</div><span className={isConnected ? 'connection-status online' : 'connection-status'}><i aria-hidden="true" />{isConnected ? 'Connected' : 'Not connected'}</span></div><h2>Connect {platform.name}</h2><p>{platform.description}</p><div className="card-actions"><a href={platform.href} target="_blank" rel="noreferrer">Open {platform.name} ↗</a><button type="button" className="connection-toggle" onClick={() => setVerifying(platform.id)}>Verify connection</button></div>{verifying === platform.id && <p className="hello-instruction">In a new {platform.name} chat with <b>MCPBuddy enabled</b>, send:<code>Call the MCPBuddy hello tool with {`{"platform":"${platform.id}"}`}.</code></p>}</article>;
  })}</div></section>;
}
