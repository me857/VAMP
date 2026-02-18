import React from 'react';
import { CheckCircle, XCircle, HelpCircle, ChevronRight, ChevronLeft, ExternalLink, Info } from 'lucide-react';
import { CHECKLIST_WEIGHTS } from '../utils/bankabilityScore.js';

const CHECKLIST_META = {
  hasTermsAndConditions: {
    label: 'Terms & Conditions (T&Cs) Present',
    description:
      'The website must have a complete Terms & Conditions page covering subscription terms, billing practices, and dispute resolution.',
    why: 'Absent T&Cs are cited in "services not as described" and "not as agreed" chargeback reason codes. Visa/MC require T&Cs for recurring billing.',
    network: 'Visa + Mastercard',
    severity: 'critical',
  },
  termsEasyToFind: {
    label: 'T&Cs Easy to Find (Linked Before Checkout)',
    description:
      'The Terms & Conditions link must appear in the website footer AND be presented (with acknowledgment checkbox) during the checkout flow.',
    why: 'Hidden T&Cs do not bind the cardholder legally and will not hold up in a dispute. FTC ROSCA compliance also requires disclosure.',
    network: 'Visa + Mastercard + FTC',
    severity: 'high',
  },
  hasRefundPolicy: {
    label: 'Refund / Return Policy Present',
    description:
      'A clear refund or return policy must be published, specifying timeframes, conditions, and how to initiate a refund.',
    why: 'Missing refund policies drive "dissatisfied with purchase" chargebacks. Cardholders dispute charges when they cannot find how to get a refund.',
    network: 'Visa + Mastercard',
    severity: 'critical',
  },
  refundPolicyVisible: {
    label: 'Refund Policy Visible Before Purchase',
    description:
      'The refund policy must be shown or linked on the product/service page and the checkout page—before the cardholder enters payment details.',
    why: 'Post-purchase disclosure does not satisfy Visa/Mastercard merchant rules for eCommerce sales.',
    network: 'Visa CDRN + Mastercard',
    severity: 'high',
  },
  hasOneClickCancellation: {
    label: '1-Click / Easy Self-Cancellation Mechanism',
    description:
      'Subscribers must be able to cancel online without calling, emailing, or navigating excessive steps (FTC "click-to-cancel" rule, effective 2024).',
    why: 'Forced cancellation friction is the #1 driver of "credit not processed" (CNP) chargebacks. The FTC click-to-cancel rule carries civil penalties.',
    network: 'FTC ROSCA + Visa CDRN + MC MATCH',
    severity: 'critical',
  },
  has3DS2: {
    label: '3DS 2.x Authentication Enabled',
    description:
      'All CNP (eCommerce) transactions should be authenticated via 3D Secure 2.x (e.g., Visa Secure, Mastercard Identity Check).',
    why: '3DS 2.x shifts fraud liability from the merchant to the issuer for authenticated transactions. It is the single biggest chargeback/fraud reduction lever available.',
    network: 'Visa + Mastercard (mandatory for many regions)',
    severity: 'critical',
  },
  mccMatchesDescriptor: {
    label: 'Billing Descriptor Matches MCC & Business',
    description:
      'The billing descriptor that appears on the cardholder\'s statement must clearly identify the business and match the MCC code. Avoid generic or confusing descriptors.',
    why: '"Unrecognized transaction" chargebacks spike when cardholders don\'t recognize the descriptor. MC/Visa require descriptor accuracy under merchant rules.',
    network: 'Visa + Mastercard',
    severity: 'high',
  },
  hasContactInfo: {
    label: 'Customer Support Contact Clearly Visible',
    description:
      'Phone number, email, and/or live chat must be prominently displayed on the website (header, footer, or dedicated contact page).',
    why: 'Cardholders who cannot reach merchant support turn to their bank for chargebacks. Visible support info deflects disputes to merchant resolution.',
    network: 'Visa CMP + Mastercard ECP',
    severity: 'medium',
  },
  hasPhysicalAddress: {
    label: 'Physical Business Address Displayed',
    description:
      'A valid physical business address (not just a PO Box) must be listed on the website—typically in the footer, contact page, or T&Cs.',
    why: 'Required by Visa merchant rules. Absence signals a fly-by-night operation to issuers reviewing dispute escalations.',
    network: 'Visa Merchant Rules',
    severity: 'medium',
  },
};

const SEVERITY_BADGE = {
  critical: 'bg-red-950/60 text-red-300 border border-red-700/50',
  high:     'bg-orange-950/60 text-orange-300 border border-orange-700/50',
  medium:   'bg-yellow-950/60 text-yellow-300 border border-yellow-700/50',
  low:      'bg-blue-950/60 text-blue-300 border border-blue-700/50',
};

function CheckItem({ id, meta, value, onChange }) {
  const [expanded, setExpanded] = React.useState(false);
  const weight = CHECKLIST_WEIGHTS[id]?.weight ?? 0;

  return (
    <div
      className={`
        rounded-xl border transition-all duration-200
        ${value === true
          ? 'bg-green-950/20 border-green-800/40'
          : value === false
            ? 'bg-red-950/20 border-red-800/40'
            : 'bg-slate-800/40 border-slate-700/50'}
      `}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Toggle buttons */}
          <div className="flex-shrink-0 flex flex-col gap-1 mt-0.5">
            <button
              onClick={() => onChange(id, value === true ? null : true)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                value === true
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-green-900/50 hover:text-green-300'
              }`}
            >
              <CheckCircle size={10} /> Yes
            </button>
            <button
              onClick={() => onChange(id, value === false ? null : false)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                value === false
                  ? 'bg-red-700 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-red-900/50 hover:text-red-300'
              }`}
            >
              <XCircle size={10} /> No
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-semibold ${
                    value === true ? 'text-green-200' : value === false ? 'text-red-200' : 'text-slate-200'
                  }`}>
                    {meta.label}
                  </p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${SEVERITY_BADGE[meta.severity]}`}>
                    {meta.severity}
                  </span>
                  <span className="text-[10px] text-slate-600">×{weight} pts</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{meta.network}</p>
              </div>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
              >
                <Info size={13} />
              </button>
            </div>

            {expanded && (
              <div className="mt-3 space-y-2 animate-fade-in">
                <p className="text-xs text-slate-300 leading-relaxed">{meta.description}</p>
                <div className="bg-slate-900/60 rounded-lg p-2.5">
                  <p className="text-[10px] text-yellow-500 uppercase tracking-wider mb-0.5 font-semibold">Why this matters</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{meta.why}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status indicator */}
        {value === null || value === undefined ? (
          <div className="flex items-center gap-1.5 mt-2 ml-14 text-[10px] text-slate-600">
            <HelpCircle size={10} />
            Not yet reviewed
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function WebsiteAuditor({ merchant, checklist, onChange, onBack, onNext, inline = false }) {
  const handleChange = (key, value) => {
    onChange({ [key]: value });
  };

  const answered = Object.values(checklist).filter((v) => v !== null && v !== undefined).length;
  const total = Object.keys(CHECKLIST_META).length;
  const passed = Object.entries(checklist).filter(([k, v]) => v === true && CHECKLIST_META[k]).length;
  const failed = Object.entries(checklist).filter(([k, v]) => v === false && CHECKLIST_META[k]).length;
  const progress = Math.round((answered / total) * 100);

  const groups = [
    {
      title: 'Legal & Compliance',
      keys: ['hasTermsAndConditions', 'termsEasyToFind', 'hasRefundPolicy', 'refundPolicyVisible'],
    },
    {
      title: 'Consumer Protection',
      keys: ['hasOneClickCancellation', 'has3DS2'],
    },
    {
      title: 'Identity & Transparency',
      keys: ['mccMatchesDescriptor', 'hasContactInfo', 'hasPhysicalAddress'],
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header — hidden when embedded inline */}
      {!inline && (
        <div>
          <h2 className="text-2xl font-black text-white">Website Compliance Audit</h2>
          <p className="text-sm text-slate-400 mt-1">
            {merchant.website ? (
              <a href={merchant.website} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1">
                {merchant.website} <ExternalLink size={11} />
              </a>
            ) : 'No website URL provided · '}
            Review each item while examining the merchant's site
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="card p-4 flex items-center gap-5">
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{answered}/{total} items reviewed</span>
            <span className="text-slate-400">
              <span className="text-green-400 font-semibold">{passed} pass</span>
              {' · '}
              <span className="text-red-400 font-semibold">{failed} fail</span>
              {' · '}
              <span className="text-slate-500">{total - answered} pending</span>
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{progress}%</p>
          <p className="text-[10px] text-slate-500">Complete</p>
        </div>
      </div>

      {/* Grouped checklist */}
      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest pl-1">
            {group.title}
          </h3>
          <div className="space-y-2">
            {group.keys.map((key) => (
              <CheckItem
                key={key}
                id={key}
                meta={CHECKLIST_META[key]}
                value={checklist[key]}
                onChange={handleChange}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Navigation — hidden when embedded inline */}
      {!inline && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={onBack} className="btn-secondary">
            <ChevronLeft size={16} /> Back to Data Entry
          </button>
          <button onClick={onNext} className="btn-primary">
            View Risk Dashboard <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
