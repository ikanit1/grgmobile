/**
 * HTTP Digest authentication (RFC 2617).
 * LiteAPI doc IPC/NVR 3.2 Call Authentication.
 */
import * as crypto from 'crypto';

function md5(s: string): string {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex');
}

function parseDigestChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|([^\s,]*))/g;
  let m;
  while ((m = regex.exec(header)) !== null) {
    params[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return params;
}

export function buildDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: Record<string, string>,
  body?: string,
): string {
  const realm = challenge.realm ?? '';
  const nonce = challenge.nonce ?? '';
  const qop = challenge.qop ?? '';
  const opaque = challenge.opaque ?? '';
  const algorithm = (challenge.algorithm ?? 'MD5').toUpperCase();

  const nc = '00000001';
  const cnonce = crypto.randomBytes(16).toString('hex');

  const ha1Input = `${username}:${realm}:${password}`;
  const ha1 = algorithm === 'MD5-SESS' ? md5(md5(ha1Input) + ':' + nonce + ':' + cnonce) : md5(ha1Input);
  const ha2Input = body && (method === 'POST' || method === 'PUT') ? `${method}:${uri}:${md5(body ?? '')}` : `${method}:${uri}`;
  const ha2 = md5(ha2Input);

  const responseInput = qop === 'auth-int' || qop === 'auth'
    ? `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`
    : `${ha1}:${nonce}:${ha2}`;
  const response = md5(responseInput);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  if (algorithm !== 'MD5') parts.push(`algorithm=${algorithm}`);

  return 'Digest ' + parts.join(', ');
}

export function parseWwwAuthenticate(wwwAuth: string): Record<string, string> | null {
  if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest ')) return null;
  return parseDigestChallenge(wwwAuth.slice(7));
}
