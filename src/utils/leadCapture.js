/**
 * Lead Capture — Webhook stub + localStorage persistence
 *
 * sendLeadToWebhook() is intentionally a stub. Replace the WEBHOOK_URL
 * constant (or set import.meta.env.VITE_LEAD_WEBHOOK_URL) when a real
 * CRM / n8n / Zapier endpoint is available.
 */

const STORAGE_KEY = 'vamp_leads';
const WEBHOOK_URL = import.meta.env.VITE_LEAD_WEBHOOK_URL ?? null;

/**
 * Persist a lead to localStorage.
 * Appends to existing leads array; caps at 200 entries to avoid bloat.
 *
 * @param {object} leadData
 */
export function storeLead(leadData) {
  try {
    const existing = getStoredLeads();
    const updated = [
      ...existing,
      { ...leadData, capturedAt: new Date().toISOString() },
    ].slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    // localStorage may be blocked in private-browsing or storage full
    console.warn('[leadCapture] Could not persist lead:', err.message);
  }
}

/**
 * Retrieve all stored leads from localStorage.
 *
 * @returns {object[]}
 */
export function getStoredLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Send lead data to a CRM webhook.
 * Stub implementation — logs to console and fires a real POST only when
 * VITE_LEAD_WEBHOOK_URL is configured.
 *
 * @param {object} leadData  { name, email, website, vampRatio, grade, ... }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function sendLeadToWebhook(leadData) {
  const payload = {
    ...leadData,
    submittedAt: new Date().toISOString(),
    source: 'VAMP Risk Diagnostic Tool',
  };

  console.info('[leadCapture] Lead captured:', payload);

  // Persist locally first (always)
  storeLead(payload);

  if (!WEBHOOK_URL) {
    // No endpoint configured — resolve gracefully
    return {
      success: true,
      message: 'Lead stored locally. Configure VITE_LEAD_WEBHOOK_URL to enable CRM sync.',
    };
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[leadCapture] Webhook responded with ${res.status}`);
      return { success: false, message: `Webhook error: HTTP ${res.status}` };
    }

    return { success: true, message: 'Lead sent to CRM.' };
  } catch (err) {
    console.error('[leadCapture] Webhook POST failed:', err.message);
    // Don't surface network errors to user — lead is already stored locally
    return { success: true, message: 'Lead stored locally (webhook unreachable).' };
  }
}
