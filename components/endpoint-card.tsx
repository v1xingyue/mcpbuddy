'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

export function EndpointCard({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(timer); }, [copied]);
  async function copyEndpoint() {
    try { await navigator.clipboard.writeText(endpoint); setCopied(true); } catch { setCopied(false); }
  }
  return <section className="endpoint-panel"><div className="endpoint-details"><p className="eyebrow">YOUR MCP ENDPOINT</p><div className="endpoint-value"><code>{endpoint}</code><button className="copy-endpoint" type="button" onClick={copyEndpoint} aria-label="Copy MCP endpoint">{copied ? <Check size={15} /> : <Copy size={15} />}{copied && <span role="status">Copied</span>}</button></div></div><div className="endpoint-meta"><span className="endpoint-status"><i />Endpoint online</span><a className="account-link" href="/account">Manage account</a></div></section>;
}
