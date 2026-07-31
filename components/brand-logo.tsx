import Image from 'next/image';

/** Shared wordmark so the product icon is visible wherever MCPBuddy is branded. */
export function BrandLogo() {
  return <><Image className="brand-icon" src="/icon.svg" alt="" width={32} height={32} priority /><span className="brand-wordmark">mcp<span>buddy</span></span></>;
}
