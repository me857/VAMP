/**
 * Site Audit Engine
 *
 * Fetches and analyses a merchant website from the browser.
 * Returns structured findings that map to the WebsiteAuditor compliance checklist.
 *
 * Because this runs in the browser, most cross-origin fetches will be blocked by
 * CORS. Strategy:
 *   1. Try a normal fetch() — if the server allows CORS, parse the full HTML.
 *   2. If CORS blocks us, still do URL-based checks (HTTPS, TLD, path probing).
 *   3. Return structured findings with a `confidence` level so the UI can guide
 *      the user to manually confirm anything we couldn't auto-detect.
 *
 * Findings map:
 *   confidence: 'high'   — automated check, reliable
 *              'medium' — heuristic match, likely correct
 *              'low'    — inferred, needs manual confirmation
 *              'n/a'    — couldn't determine (CORS / not found)
 */

// ── Constants ────────────────────────────────────────────────────────────────

const SOCIAL_DOMAINS = [
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
  'threads.net', 'snapchat.com',
];

const TERMS_RE      = /\b(terms\s*(and\s*conditions|of\s*(service|use))|t\s*&\s*c|user\s*agreement)\b/i;
const PRIVACY_RE    = /\b(privacy\s*policy|privacy\s*notice|data\s*protection)\b/i;
const REFUND_RE     = /\b(refund|return|money.back|cancellation\s*policy)\b/i;
const CONTACT_RE    = /\b(contact\s*us|get\s*in\s*touch|customer\s*(service|support)|help\s*center|support\s*center)\b/i;
const PHONE_RE      = /(\+\d[\d\s\-().]{7,}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/;
const EMAIL_RE      = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
const ADDRESS_RE    = /\b\d{1,5}\s+[a-z\s]{3,30},\s*[a-z\s]{2,20},?\s*[a-z]{2,3}\s+[\d-]{4,10}/i;
const ADDRESS2_RE   = /\b(suite|ste\.?|floor|fl\.?|unit|po\s*box)\s+\d/i;

// Subscription / recurring billing patterns
const RECURRING_RE  = /\b(subscri(be|ption)|recurring(\s*(billing|charge|payment))?|auto.?renew(al)?|billed\s*(monthly|annually|weekly)|automatic\s*renewal|membership\s*fee)\b/i;
// Easy-cancellation language
const CANCEL_RE     = /\b(cancel\s*anytime|easy\s*cancel|1.?click\s*cancel|self.?service\s*cancel|cancel\s*(your\s*)?(subscription|membership)\s*online)\b/i;
// "Hidden" recurring — asterisks, small-print markers
const HIDDEN_REC_RE = /(\*\s*(recurring|auto.?renew|billed)|†\s*(recurring|subscription))/i;
// Dark/deceptive patterns
const DECEPTIVE = [
  { re: /pre.?checked|pre.?ticked/i,            label: 'Pre-ticked opt-in checkboxes detected' },
  { re: /\$0\.00\s+today|free\s+today/i,        label: '"$0.00 / free today" with implied future charge' },
  { re: /free\s+trial[^.]*?then\s+\$/i,         label: 'Free trial with subsequent charge language' },
  { re: /cancel\s*within\s*\d+\s*(hours?|days?)/i, label: 'Short forced cancellation window' },
  { re: /no\s+refund|all\s+sales\s+final/i,     label: 'No-refund policy language' },
];

const CHECKOUT_RE   = /\b(add\s*to\s*cart|buy\s*now|checkout|place\s*order|complete\s*purchase|proceed\s*to\s*pay)\b/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Extract all <a> link texts + hrefs for keyword matching. */
function extractLinks(html) {
  const re = /href=["']([^"'#?]+)["'][^>]*>([^<]{0,80})/gi;
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({ href: m[1].trim(), text: m[2].trim() });
  }
  return results;
}

/** Check footer specifically — terms in footer counts as "easy to find". */
function inFooter(html, pattern) {
  const footerMatch = /<footer[\s\S]{0,5000}<\/footer>/i.exec(html);
  if (footerMatch) return pattern.test(footerMatch[0]);
  // Fallback: last 3 000 chars of page (common footer placement)
  return pattern.test(html.slice(-3000));
}

/** Try to fetch a relative path from the same origin. */
async function probeUrl(base, path, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    clearTimeout(id);
    return false;
  }
}

// ── Main audit function ───────────────────────────────────────────────────────

/**
 * @param {string} rawUrl
 * @returns {Promise<AuditResult>}
 *
 * AuditResult shape:
 * {
 *   success: boolean,
 *   corsBlocked: boolean,
 *   url: string,
 *   isHttps: boolean,
 *   findings: Finding[],          // all checks
 *   riskFlags: Finding[],         // failed checks with riskNote
 *   socialLinks: string[],        // social domains found
 *   checklistMappings: object,    // key→true/false for auto-confirmed items
 *   summary: string,
 * }
 */
export async function auditWebsite(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { success: false, error: 'No URL provided', findings: [] };

  const isHttps = url.startsWith('https://');
  // Extract origin for path probing
  const origin = (() => { try { return new URL(url).origin; } catch { return url; } })();

  const findings = [];

  // ── 1. SSL / HTTPS ───────────────────────────────────────────────────────
  findings.push({
    key: 'ssl',
    label: 'HTTPS / SSL Certificate',
    passed: isHttps,
    confidence: 'high',
    details: isHttps
      ? 'URL uses HTTPS — SSL certificate present'
      : 'URL uses HTTP — no SSL. Visa/MC require HTTPS for eCommerce.',
    riskNote: isHttps ? null
      : 'Non-HTTPS sites fail Visa and Mastercard merchant rules for card-not-present transactions.',
    checklistKey: null, // informational only — not in the existing 9-item checklist
  });

  // ── 2. Fetch page HTML ────────────────────────────────────────────────────
  let html = null;
  let corsBlocked = false;
  let reachable = true;

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    clearTimeout(fetchTimeout);
    if (res.ok || (res.status >= 200 && res.status < 500)) {
      html = await res.text();
    } else {
      reachable = false;
    }
  } catch (err) {
    clearTimeout(fetchTimeout);
    // CORS or network error — try opaque no-cors probe just to confirm reachable
    try {
      await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(5000) });
      corsBlocked = true; // reachable but CORS blocked
    } catch {
      reachable = false;
      corsBlocked = true;
    }
  }

  // ── 3. CORS / Unreachable handling ────────────────────────────────────────
  if (!html) {
    const detail = !reachable
      ? 'Could not reach the URL — check the address and try again.'
      : 'Page is live but browser security (CORS) prevents automated content scanning. Manual review required for most items.';

    findings.push({
      key: 'pageAccess',
      label: 'Page Content Access',
      passed: reachable,
      confidence: 'n/a',
      details: detail,
      riskNote: null,
      isInfo: true,
    });

    // Probe well-known paths to infer presence of key pages
    if (reachable) {
      const [hasPrivacy, hasTerms, hasRefund, hasContact] = await Promise.all([
        probeUrl(origin, '/privacy-policy').catch(() => false),
        probeUrl(origin, '/terms').catch(() => false),
        probeUrl(origin, '/refund-policy').catch(() => false),
        probeUrl(origin, '/contact').catch(() => false),
      ]);

      if (hasTerms) {
        findings.push({ key: 'hasTermsAndConditions', label: 'Terms & Conditions Page Found', passed: true, confidence: 'medium', details: '/terms path is accessible', riskNote: null, checklistKey: 'hasTermsAndConditions' });
      }
      if (hasPrivacy) {
        findings.push({ key: 'privacyProbe', label: 'Privacy Policy Page Found', passed: true, confidence: 'medium', details: '/privacy-policy path is accessible', riskNote: null });
      }
      if (hasRefund) {
        findings.push({ key: 'hasRefundPolicy', label: 'Refund Policy Page Found', passed: true, confidence: 'medium', details: '/refund-policy path is accessible', riskNote: null, checklistKey: 'hasRefundPolicy' });
      }
      if (hasContact) {
        findings.push({ key: 'hasContactInfo', label: 'Contact Page Found', passed: true, confidence: 'medium', details: '/contact path is accessible', riskNote: null, checklistKey: 'hasContactInfo' });
      }
    }

    const checklistMappings = {};
    findings.filter(f => f.checklistKey && f.passed).forEach(f => {
      checklistMappings[f.checklistKey] = true;
    });

    return {
      success: true,
      corsBlocked,
      reachable,
      url,
      isHttps,
      findings,
      riskFlags: findings.filter(f => !f.passed && f.riskNote),
      socialLinks: [],
      checklistMappings,
      summary: corsBlocked
        ? 'Browser security (CORS) blocked full scanning — limited path probing complete. Manual review required.'
        : 'Could not reach website — verify the URL is correct and publicly accessible.',
    };
  }

  // ── 4. Full HTML analysis ─────────────────────────────────────────────────
  const links = extractLinks(html);

  // Social media presence
  const socialLinks = SOCIAL_DOMAINS.filter(d => html.includes(d));
  findings.push({
    key: 'socialPresence',
    label: 'Social Media Presence',
    passed: socialLinks.length > 0,
    confidence: 'high',
    details: socialLinks.length > 0
      ? `Links to: ${socialLinks.join(', ')}`
      : 'No social media profile links found',
    riskNote: socialLinks.length === 0
      ? 'No social links can signal a low-legitimacy business to acquirer risk teams. Adding social proof reduces scrutiny during underwriting.'
      : null,
    isInfo: true,
    checklistKey: null,
  });

  // Terms & Conditions
  const hasTermsInline = TERMS_RE.test(html);
  const termsInFooter  = inFooter(html, TERMS_RE);
  findings.push({
    key: 'hasTermsAndConditions',
    label: 'Terms & Conditions Present',
    passed: hasTermsInline,
    confidence: 'high',
    details: hasTermsInline ? 'T&Cs link or text found on page' : 'No Terms & Conditions text or link detected',
    riskNote: hasTermsInline ? null : 'Absent T&Cs are the #1 cited reason for "services not as described" chargebacks. Visa/MC mandate T&Cs for recurring billing.',
    checklistKey: 'hasTermsAndConditions',
  });
  findings.push({
    key: 'termsEasyToFind',
    label: 'T&Cs Easy to Find (Linked Before Checkout / in Footer)',
    passed: termsInFooter,
    confidence: termsInFooter ? 'high' : 'medium',
    details: termsInFooter ? 'T&Cs found in footer / bottom of page' : 'T&Cs not found in footer — may be buried or absent',
    riskNote: termsInFooter ? null : 'T&Cs must appear in the site footer AND be acknowledged during checkout to limit dispute liability.',
    checklistKey: 'termsEasyToFind',
  });

  // Privacy policy
  const hasPrivacy = PRIVACY_RE.test(html);
  findings.push({
    key: 'privacyPolicy',
    label: 'Privacy Policy Present',
    passed: hasPrivacy,
    confidence: 'high',
    details: hasPrivacy ? 'Privacy policy link or text detected' : 'No privacy policy found',
    riskNote: hasPrivacy ? null : 'Privacy policy is legally required under GDPR, CCPA, and most card network merchant rules.',
    isInfo: true, // not in the 9-item checklist but very relevant
    checklistKey: null,
  });

  // Refund / return policy
  const hasRefund = REFUND_RE.test(html);
  const refundInFooter = inFooter(html, REFUND_RE);
  findings.push({
    key: 'hasRefundPolicy',
    label: 'Refund / Return Policy Present',
    passed: hasRefund,
    confidence: 'high',
    details: hasRefund ? 'Refund/return/cancellation policy language detected' : 'No refund policy text found',
    riskNote: hasRefund ? null : 'Missing refund policy is a primary driver of "item not as described" and "cardholder dissatisfied" chargebacks.',
    checklistKey: 'hasRefundPolicy',
  });
  // Can't reliably auto-confirm "visible before checkout" without crawling the checkout path
  // → leave refundPolicyVisible as manual

  // Contact information
  const hasContactText  = CONTACT_RE.test(html);
  const hasEmail        = EMAIL_RE.test(html);
  const hasPhone        = PHONE_RE.test(html);
  const hasContact      = hasContactText || hasEmail || hasPhone;
  const contactDetail   = [
    hasEmail  && 'email address',
    hasPhone  && 'phone number',
    hasContactText && 'contact page link',
  ].filter(Boolean);
  findings.push({
    key: 'hasContactInfo',
    label: 'Customer Support Contact Visible',
    passed: hasContact,
    confidence: 'high',
    details: hasContact
      ? `Found: ${contactDetail.join(', ')}`
      : 'No email, phone number, or contact page link detected',
    riskNote: hasContact ? null : 'Invisible customer support is the top reason cardholders escalate disputes to their bank instead of the merchant.',
    checklistKey: 'hasContactInfo',
  });

  // Physical address
  const hasPhysAddr = ADDRESS_RE.test(html) || ADDRESS2_RE.test(html);
  findings.push({
    key: 'hasPhysicalAddress',
    label: 'Physical Business Address Displayed',
    passed: hasPhysAddr,
    confidence: 'medium',
    details: hasPhysAddr ? 'Physical address or office location detected' : 'No physical address pattern found',
    riskNote: hasPhysAddr ? null : 'Visa merchant rules require a physical business address. Absence signals a fly-by-night operator during issuer dispute reviews.',
    checklistKey: 'hasPhysicalAddress',
  });

  // Recurring / subscription billing
  const recurringMatch = RECURRING_RE.exec(html);
  const hasRecurring   = Boolean(recurringMatch);
  const hasCancelEasy  = CANCEL_RE.test(html);
  const hasHiddenRec   = HIDDEN_REC_RE.test(html);

  if (hasRecurring) {
    const riskNote = !hasCancelEasy
      ? 'CRITICAL: Recurring billing language detected but no "cancel anytime" or easy-cancellation option found. This is the #1 driver of "credit not processed" chargebacks and a direct FTC/ROSCA violation.'
      : hasHiddenRec
        ? 'WARNING: Recurring billing terms appear to be in fine print / asterisked footnotes. Buried recurring terms generate chargebacks and regulatory scrutiny even when cancellation exists.'
        : null;
    findings.push({
      key: 'recurringBilling',
      label: 'Recurring/Subscription Billing Review',
      passed: hasCancelEasy && !hasHiddenRec,
      confidence: 'high',
      details: `Recurring billing language detected ("${recurringMatch[0]}"). ${hasCancelEasy ? '"Cancel anytime" language also present.' : 'No easy-cancellation language found.'} ${hasHiddenRec ? 'Terms appear to be in asterisked/footnote fine print.' : ''}`.trim(),
      riskNote,
      checklistKey: hasCancelEasy ? 'hasOneClickCancellation' : null,
    });
  } else {
    findings.push({
      key: 'recurringBilling',
      label: 'Recurring/Subscription Language',
      passed: true,
      confidence: 'high',
      details: 'No recurring billing or subscription language detected on homepage',
      riskNote: null,
      isInfo: true,
    });
  }

  // Deceptive / dark patterns
  const flagged = DECEPTIVE.filter(d => d.re.test(html));
  if (flagged.length > 0) {
    findings.push({
      key: 'deceptivePatterns',
      label: 'Potential Deceptive UX Patterns',
      passed: false,
      confidence: 'medium',
      details: flagged.map(f => f.label).join('; '),
      riskNote: 'Deceptive UX patterns are a leading cause of VAMP escalation, dispute spikes, and trigger enhanced monitoring from Visa/MC compliance teams. Each pattern identified should be reviewed and corrected.',
    });
  }

  // Checkout flow clarity
  const hasCheckout = CHECKOUT_RE.test(html);
  findings.push({
    key: 'checkoutClarity',
    label: 'Clear Purchase / Checkout Flow',
    passed: hasCheckout,
    confidence: 'medium',
    details: hasCheckout
      ? 'Checkout / add-to-cart / buy-now action detected on page'
      : 'No clear purchase action buttons detected on homepage (may be on inner pages)',
    riskNote: null,
    isInfo: true,
  });

  // ── 5. Build checklist mappings ─────────────────────────────────────────
  const checklistMappings = {};
  findings.forEach(f => {
    if (f.checklistKey && typeof f.passed === 'boolean' && f.confidence !== 'n/a') {
      // Only auto-set items we're reasonably confident about
      if (f.confidence === 'high' || f.confidence === 'medium') {
        checklistMappings[f.checklistKey] = f.passed;
      }
    }
  });

  // ── 6. Summary ───────────────────────────────────────────────────────────
  const scoredFindings = findings.filter(f => !f.isInfo && f.confidence !== 'n/a');
  const passed = scoredFindings.filter(f => f.passed).length;
  const riskFlags = findings.filter(f => !f.passed && f.riskNote && !f.isInfo);

  return {
    success: true,
    corsBlocked: false,
    reachable: true,
    url,
    isHttps,
    findings,
    riskFlags,
    socialLinks,
    checklistMappings,
    summary: `Scanned ${url} — ${passed}/${scoredFindings.length} compliance checks passed. ${riskFlags.length > 0 ? `${riskFlags.length} risk flag(s) require attention.` : 'No critical risk flags detected.'}`,
  };
}
