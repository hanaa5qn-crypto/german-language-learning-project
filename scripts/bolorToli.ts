// Bolor-toli German→Mongolian dictionary client.
// -----------------------------------------------------------------------------
// Bolor-toli (https://bolor-toli.com, also on the App Store as "Bolor dictionary")
// is the standard, human-edited German↔Mongolian dictionary. Its public
// /pub/translate endpoint is gated by an "API-Key" header that the web client
// computes as sha256(word.toLowerCase().trim() + direction). The hash routine
// below is reproduced verbatim from the site's own bundle so we can fetch the
// same authoritative glosses the app shows — no machine translation involved.
//
// direction "3" = German → Mongolian.

const SHA256_K = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];

function add(a: number, b: number): number {
  const n = (65535 & a) + (65535 & b);
  return ((a >> 16) + (b >> 16) + (n >> 16)) << 16 | 65535 & n;
}
const rotr = (x: number, n: number) => x >>> n | x << 32 - n;
const shr = (x: number, n: number) => x >>> n;

function sha256(message: string): string {
  const utf8 = (() => {
    let out = ''; const t = message.replace(/\r\n/g, '\n');
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c < 128) out += String.fromCharCode(c);
      else if (c < 2048) { out += String.fromCharCode(c >> 6 | 192); out += String.fromCharCode(63 & c | 128); }
      else { out += String.fromCharCode(c >> 12 | 224); out += String.fromCharCode(c >> 6 & 63 | 128); out += String.fromCharCode(63 & c | 128); }
    }
    return out;
  })();

  const bits = 8;
  const words: number[] = [];
  for (let i = 0; i < utf8.length * bits; i += bits) {
    words[i >> 5] |= (utf8.charCodeAt(i / bits) & 255) << 24 - i % 32;
  }
  const len = utf8.length * bits;
  words[len >> 5] |= 128 << 24 - len % 32;
  words[15 + (len + 64 >> 9 << 4)] = len;

  const h = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
  const S = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, hh] = h;
    for (let k = 0; k < 64; k++) {
      S[k] = k < 16
        ? (words[k + i] | 0)
        : add(add(add(rotr(S[k-2], 17) ^ rotr(S[k-2], 19) ^ shr(S[k-2], 10), S[k-7]),
                rotr(S[k-15], 7) ^ rotr(S[k-15], 18) ^ shr(S[k-15], 3)), S[k-16]);
      const t1 = add(add(add(add(hh, rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)), (e & f ^ ~e & g)), SHA256_K[k]), S[k]);
      const t2 = add(rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), (a & b ^ a & c ^ b & c));
      hh = g; g = f; f = e; e = add(d, t1); d = c; c = b; b = a; a = add(t1, t2);
    }
    h[0]=add(a,h[0]);h[1]=add(b,h[1]);h[2]=add(c,h[2]);h[3]=add(d,h[3]);
    h[4]=add(e,h[4]);h[5]=add(f,h[5]);h[6]=add(g,h[6]);h[7]=add(hh,h[7]);
  }

  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 4 * h.length; i++) {
    out += hex.charAt(h[i >> 2] >> 8 * (3 - i % 4) + 4 & 15) + hex.charAt(h[i >> 2] >> 8 * (3 - i % 4) & 15);
  }
  return out;
}

// The site seeds the hash with a folded code-point sum (mod 10000000008) of the
// query before sha256-ing it. Reproduced from the bundle's encrypt() plugin.
export function apiKey(query: string): string {
  const modulus = Math.pow(10, 10) + 8;
  const chars: string[] = [];
  for (let i = 0; i < query.length; i++) {
    const code = query.charCodeAt(i);
    if (code >= 55296 && code <= 56319 && i + 1 < query.length) {
      const next = query.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) { chars.push(query.slice(i, i + 2)); i++; continue; }
    }
    chars.push(query.charAt(i));
  }
  let seed = 0;
  for (const ch of chars) { seed += ch.codePointAt(0)!; seed++; seed %= modulus; }
  return sha256(seed.toString());
}

export interface BolorVariant { w: string; acro: string; tags?: { article?: string; usage?: string } | null; }
export interface BolorResult { w: { vars: BolorVariant[] }; t: { vars: BolorVariant[] }; }
export interface BolorResponse { er?: BolorResult[]; sr?: BolorResult[]; }

const DE_MN = '3';

export async function lookup(word: string): Promise<BolorResponse> {
  const q = word.toLowerCase().trim();
  const key = apiKey(q + DE_MN);
  const url = `https://bolor-toli.com/pub/translate?word=${encodeURIComponent(word)}&direction=${DE_MN}`;
  const res = await fetch(url, {
    headers: { 'API-Key': key, 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for "${word}"`);
  return res.json() as Promise<BolorResponse>;
}

// Cyrillic-Mongolian glosses from the exact-match results, in dictionary order,
// de-duplicated. Returns up to `max` senses joined with ", ".
export function extractMongolian(resp: BolorResponse, word: string, max = 2): string {
  const wanted = word.toLowerCase().trim();
  const glosses: string[] = [];
  for (const r of resp.er ?? []) {
    // Only trust results whose German term is exactly our headword (skip phrases).
    const term = r.t?.vars?.find((v) => v.acro === 'de')?.w?.toLowerCase().trim();
    if (term !== wanted) continue;
    for (const v of r.w?.vars ?? []) {
      if (v.acro !== 'mn') continue;
      const g = v.w.trim();
      if (g && !glosses.includes(g)) glosses.push(g);
    }
  }
  return glosses.slice(0, max).join(', ');
}

// Pull the grammatical article the dictionary records for a noun, if any.
export function extractArticle(resp: BolorResponse, word: string): string | undefined {
  const wanted = word.toLowerCase().trim();
  for (const r of resp.er ?? []) {
    const v = r.t?.vars?.find((x) => x.acro === 'de' && x.w?.toLowerCase().trim() === wanted);
    if (v?.tags?.article) return v.tags.article;
  }
  return undefined;
}
