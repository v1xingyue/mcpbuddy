import { readFileSync } from 'node:fs';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8').split(/\r?\n/).find(value => value.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  } catch { return undefined; }
}

const apiKey = envValue('JUPITER_API_KEY');
if (!apiKey) throw new Error('JUPITER_API_KEY is missing from the environment or .env.local.');
const headers = { 'x-api-key': apiKey };
const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function request(label, url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const body = await response.text();
  console.log(JSON.stringify({ label, status: response.status, ok: response.ok, url: url.replace(apiKey, '[redacted]'), body: body.slice(0, 4000) }, null, 2));
  return { response, body };
}

const mint = process.argv[2];
if (!mint) {
  await request('Tokens V2 search: NVDAx', 'https://api.jup.ag/tokens/v2/search?query=NVDAx');
  console.log('Pass the exact mint as an argument to run Quote and Swap-build diagnostics.');
  process.exit(0);
}

const quoteUrl = new URL('https://api.jup.ag/swap/v1/quote');
quoteUrl.search = new URLSearchParams({ inputMint: usdc, outputMint: mint, amount: '1000000', slippageBps: '50' }).toString();
const quote = await request('Quote: 1 USDC → requested mint', quoteUrl.toString());
if (!quote.response.ok) process.exit(1);
const quoteResponse = JSON.parse(quote.body);
const wallet = envValue('DIAGNOSTIC_WALLET');
if (!wallet) { console.log('Quote succeeded. Set DIAGNOSTIC_WALLET to test /swap construction (no signing or broadcast occurs).'); process.exit(0); }
await request('Swap build: unsigned only', 'https://api.jup.ag/swap/v1/swap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteResponse, userPublicKey: wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, blockhashSlotsToExpiry: 150 }) });
