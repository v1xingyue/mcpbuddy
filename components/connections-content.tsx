'use client';

import { useEffect, useState } from 'react';
import { EndpointCard } from '@/components/endpoint-card';
import { PlatformConnections } from '@/components/platform-connections';

function ConnectionSkeleton() {
  return <div className="data-loading-progress" role="status" aria-label="Loading connections"><i /></div>;
}

export function ConnectionsContent({ endpoint }: { endpoint: string }) {
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[] | null>(null);
  useEffect(() => { let active = true; fetch('/api/dashboard/connections', { cache: 'no-store' }).then(response => response.ok ? response.json() : { connectedPlatforms: [] }).then(data => { if (active) setConnectedPlatforms(data.connectedPlatforms ?? []); }).catch(() => { if (active) setConnectedPlatforms([]); }); return () => { active = false; }; }, []);
  return <>{connectedPlatforms === null ? <><EndpointCard endpoint={endpoint} /><ConnectionSkeleton /></> : <PlatformConnections endpoint={endpoint} connectedPlatforms={connectedPlatforms} />}</>;
}
