// Gmail treats  john.doe@gmail.com,  johndoe@gmail.com  and  john.doe+gym@gmail.com  as the SAME mailbox (and
// googlemail.com as gmail.com). Someone who registered with one spelling and later taps "Continue with Google" gets the
// canonical spelling back from Google; matching only the exact string would silently create a second, empty account.
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const escapeRe = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regex matching every spelling of the same Gmail mailbox, or null when the address is not Gmail / not usable. */
function gmailVariantRegex(email) {
  const [local, domain, ...rest] = String(email || '').trim().toLowerCase().split('@');
  if (!local || rest.length || !GMAIL_DOMAINS.has(domain)) return null;
  const base = local.split('+')[0].replace(/\./g, '');
  if (!base || base.length > 64) return null;
  const body = base.split('').map(escapeRe).join('\\.?');
  return new RegExp(`^${body}(\\+[^@]*)?@(gmail|googlemail)\\.com$`);
}

module.exports = { gmailVariantRegex, GMAIL_DOMAINS };
