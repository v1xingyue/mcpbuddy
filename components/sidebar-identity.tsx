'use client';

import { useEffect, useState } from 'react';

export function SidebarIdentity({ initialName, disableRefresh = false }: { initialName?: string | null; disableRefresh?: boolean }) {
  const [name, setName] = useState(initialName ?? 'Loading account…');
  useEffect(() => { if (disableRefresh) return; fetch('/api/dashboard/me', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { if (data?.name) setName(data.name); }).catch(() => undefined); }, [disableRefresh]);
  return <div className="identity"><span>{name.slice(0, 1).toUpperCase() || 'U'}</span><small>{name}</small></div>;
}
