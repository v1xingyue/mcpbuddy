'use client';

import { useEffect, useState } from 'react';
import { EndpointCard } from '@/components/endpoint-card';
import { PlatformConnections } from '@/components/platform-connections';

const pendingPlatforms = [
  { number: '01', name: 'Claude' },
  { number: '02', name: 'ChatGPT' },
  { number: '03', name: 'Grok' },
];

function ConnectionSkeleton() {
  return <section className="connection-pending" aria-busy="true" aria-live="polite"><div className="sync-note"><i /><div><b>Syncing your connections</b><small>Your MCP workspace is ready. Checking linked AI clients…</small></div></div><div className="connection-skeleton">{pendingPlatforms.map(platform => <article key={platform.name}><div className="card-top"><span className="number">{platform.number}</span><span className="pending-status"><i />Checking</span></div><h2>Connect {platform.name}</h2><p>Loading connection status and setup details.</p><span className="pending-action">Preparing controls</span></article>)}</div></section>;
}

export function ConnectionsContent({ endpoint }: { endpoint: string }) {
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[] | null>(null);
  useEffect(() => { let active = true; fetch('/api/dashboard/connections', { cache: 'no-store' }).then(response => response.ok ? response.json() : { connectedPlatforms: [] }).then(data => { if (active) setConnectedPlatforms(data.connectedPlatforms ?? []); }).catch(() => { if (active) setConnectedPlatforms([]); }); return () => { active = false; }; }, []);
  return <><EndpointCard endpoint={endpoint} />{connectedPlatforms === null ? <ConnectionSkeleton /> : <PlatformConnections connectedPlatforms={connectedPlatforms} />}</>;
}
