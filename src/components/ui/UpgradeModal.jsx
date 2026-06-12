/**
 * components/ui/UpgradeModal.jsx
 *
 * Generic "you've hit a plan limit" dialog. First consumer is the hub-cap gate
 * (HubFooter), but it is deliberately content-agnostic so future gate commits
 * (member cap, category cap, …) reuse it by passing their own title/body/items.
 *
 * The footer button is the primary CTA. When an `onUpgrade` callback is passed it
 * becomes the upgrade action (consumers route it to /pricing) and the label reads
 * "Upgrade to Pro"; with no `onUpgrade` it falls back to a "Got it" dismiss. Dismiss
 * is always available via the backdrop, Esc, or the back button (useModalChrome).
 *
 * Composes the shared modal infra: portal to document.body + useModalChrome
 * (scroll-lock + Esc/back close). z-index 700/710 sits ABOVE the SidePanel (400)
 * and the bottom sheets (500/600) so it renders over whatever triggered it.
 *
 * @param {boolean}           open
 * @param {function}          onClose
 * @param {function}          [onUpgrade]  primary-CTA action; when set, the button
 *                                         calls this (and the label becomes "Upgrade to Pro")
 *                                         instead of dismissing
 * @param {string}            [title]      defaults to the hub-cap heading
 * @param {string|string[]}   [body]       paragraph(s); defaults to the hub-cap copy
 * @param {string}            [itemsLabel] heading above the bullet list
 * @param {string[]}          [items]      bullet list; defaults to the hub-cap options
 * @param {string}            [ctaLabel]   overrides the button label (default: "Upgrade to Pro" when onUpgrade is set, else "Got it")
 */

import { createPortal }   from 'react-dom';
import { useModalChrome } from '../../hooks/useModalChrome';

const DEFAULT_TITLE = 'Upgrade to Pro';

const DEFAULT_BODY = [
  "You've reached your plan's hub limit. Free accounts can have 1 hub.",
  'Upgrade to Pro to manage up to 10 hubs. Pro is ₵40/month or ₵400/year.',
];

const DEFAULT_ITEMS_LABEL = 'Until then, you can:';

// No default bullets for the hub-cap gate: a free user at the cap owns exactly
// 1 hub, so "archive a hub you're not using" advice is nonsensical (it's their
// only hub). The modal stays generic — other gates (member/category cap) can
// still pass their own `items` prop to render a bullet list.
const DEFAULT_ITEMS = [];

export function UpgradeModal({
  open,
  onClose,
  onUpgrade,
  title      = DEFAULT_TITLE,
  body       = DEFAULT_BODY,
  itemsLabel = DEFAULT_ITEMS_LABEL,
  items      = DEFAULT_ITEMS,
  ctaLabel,
}) {
  const { dismissForNavigation } = useModalChrome({ isOpen: open, onClose });   // call ABOVE the guard, per its contract
  if (!open) return null;

  const paragraphs = Array.isArray(body) ? body : [body];
  // With an onUpgrade callback the button is the primary "go to /pricing" CTA; without
  // one it's a plain dismiss. ctaLabel overrides either default when a consumer passes it.
  // dismissForNavigation() runs first so the modal's close-time history.back() doesn't pop
  // the /pricing entry onUpgrade is about to push (see useModalChrome).
  const onCta = onUpgrade ? () => { dismissForNavigation(); onUpgrade(); } : onClose;
  const label = ctaLabel ?? (onUpgrade ? 'Upgrade to Pro' : 'Got it');

  return createPortal(
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 700 }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', top: '50%', left: 'max(0px, calc(50vw - 220px))', transform: 'translateY(-50%)', width: '100%', maxWidth: 360, margin: '0 16px', background: 'var(--c-modal-bg, var(--c-card, #fff))', borderRadius: 16, padding: '20px', zIndex: 710, boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--c-primary, #064e3b)', margin: '0 0 10px' }}>💜 {title}</p>

        {paragraphs.map((p, i) => (
          <p key={i} style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-muted, #6b7280)', margin: '0 0 10px', lineHeight: 1.5 }}>{p}</p>
        ))}

        {items?.length > 0 && (
          <>
            {itemsLabel && <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text, #1c1917)', margin: '4px 0 6px' }}>{itemsLabel}</p>}
            <ul style={{ margin: '0 0 18px', paddingLeft: 20 }}>
              {items.map((it, i) => (
                <li key={i} style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-muted, #6b7280)', margin: '0 0 4px', lineHeight: 1.5 }}>{it}</li>
              ))}
            </ul>
          </>
        )}

        <button onClick={onCta} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Nunito', sans-serif" }}>
          {label}
        </button>
      </div>
    </>,
    document.body
  );
}
