'use client';

import { useEffect, useState } from 'react';

export function SidebarIdentity({ initialName }: { initialName?: string | null }) {
  const [name, setName] = useState(initialName ?? 'Loading account…');
  useEffect(() => { fetch('/api/dashboard/me', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { if (data?.name) setName(data.name); }).catch(() => undefined); }, []);
  return <div className="identity"><span>{name.slice(0, 1).toUpperCase() || 'U'}</span><small>{name}</small></div>;
}
