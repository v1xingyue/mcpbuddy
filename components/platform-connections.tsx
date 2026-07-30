'use client';

import { useEffect, useState } from 'react';

const platforms = [
  { id: 'claude', number: '01', name: 'Claude', description: 'Add your endpoint in Claude’s Custom Connectors. Sign in with GitHub when prompted.', href: 'https://claude.ai', chatHref: 'https://claude.ai/new' },
  { id: 'openai', number: '02', name: 'ChatGPT', description: 'Use the same OAuth-protected endpoint in ChatGPT developer mode or your GPT Actions setup.', href: 'https://chatgpt.com', chatHref: 'https://chatgpt.com/' },
  { id: 'grok', number: '03', name: 'Grok', description: 'Paste the endpoint in Custom Connectors. Grok discovers registration and completes PKCE automatically.', href: 'https://grok.com/connectors', chatHref: 'https://grok.com/' },
];

export function PlatformConnections({ connectedPlatforms }: { connectedPlatforms: string[] }) {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const saved = localStorage.getItem('mcpbuddy-platform-connections');
    setConnected({ ...(saved ? JSON.parse(saved) : {}), ...Object.fromEntries(connectedPlatforms.map(platform => [platform, true])) });
  }, [connectedPlatforms]);
  function sayHiUrl(platform: (typeof platforms)[number]) {
    const prompt = `Use the MCPBuddy hello tool now with {"platform":"${platform.id}"} to confirm this connection.`;
    const chatUrl = new URL(platform.chatHref);
    chatUrl.searchParams.set('q', prompt);
    return chatUrl.toString();
  }
  return <div className="grid">{platforms.map((platform) => {
    const isConnected = !!connected[platform.id];
    return <article key={platform.id} className={isConnected ? 'connection-card connected' : 'connection-card'}>
      <div className="card-top"><div className="number">{platform.number}</div><span className={isConnected ? 'connection-status online' : 'connection-status'}>{isConnected ? '● Connected' : '○ Not connected'}</span></div>
      <h2>Connect {platform.name}</h2><p>{platform.description}</p>
      <div className="card-actions"><a href={platform.href} target="_blank" rel="noreferrer">Open {platform.name} ↗</a><a className="connection-toggle" href={sayHiUrl(platform)} target="_blank" rel="noreferrer">Say hi from {platform.name}</a></div>
    </article>;
  })}</div>;
}
