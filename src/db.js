// ============================================================
// DATA STORE — localStorage  (swap bodies for Supabase later)
// ============================================================
const STORAGE_KEY = 'lavanya_oms_v3';

export function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        orders:      Array.isArray(p.orders)      ? p.orders      : [],
        payments:    Array.isArray(p.payments)    ? p.payments    : [],
        products:    Array.isArray(p.products)    ? p.products    : [],
        trash:       Array.isArray(p.trash)        ? p.trash       : [],
        fraudList:   Array.isArray(p.fraudList)   ? p.fraudList   : [],
      };
    }
  } catch (_) { /* ignore */ }
  return { orders: [], payments: [], products: [], trash: [], fraudList: [] };
}

export function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

const TEMPLATES = {
  payments: 'Order ID,AWB,Settlement Amount,GST,Date',
  returns:  'Order ID,AWB,Status,Return Type',   // Return Type = "Customer Return" | "RTO"
  products: 'SKU,HSN,Category,Purchase Rate,MRP,Stock',
  claims:   'Order ID,AWB,Claim Amount,Reason,Date',
};

// ── RETURN TYPE helpers ──────────────────────────────────────
// Valid values: 'Customer Return' | 'RTO' | '' (unknown)
export const RETURN_TYPES = ['Customer Return', 'RTO'];

// CSS class name for each type (used in JSX)
export function returnTypeClass(rt) {
  if (rt === 'Customer Return') return 'rt-customer';
  if (rt === 'RTO')             return 'rt-rto';
  return 'rt-unknown';
}

// Short display label
export function returnTypeLabel(rt) {
  if (rt === 'Customer Return') return '↩ Customer Return';
  if (rt === 'RTO')             return '🚚 RTO';
  return '— Unknown';
}

// Normalise raw strings from Excel / manual input
export function normalizeReturnType(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (/customer|cust|buyer/i.test(s)) return 'Customer Return';
  if (/rto|undeliver|return\s+to\s+origin/i.test(s)) return 'RTO';
  return '';
}

export function downloadTemplate(type) {
  const headers = TEMPLATES[type];
  if (!headers) return;
  const blob = new Blob([headers + '\n'], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `template_${type}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function normalizeDate(raw) {
  if (!raw) return today();
  const m = raw.trim().match(/^(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return today();
}

export function statusClass(s) {
  return (
    { 'Ready to Ship': 's-ready', Dispatched: 's-dispatched',
      'In Transit (Return)': 's-transit', 'Return Received': 's-received' }[s] || 's-ready'
  );
}

// ── AWB display helper (returns plain string for table cells) ──
export function awbText(o) {
  if (!o.awb) return '—';
  if (o.channel === 'Amazon' && o.awb.startsWith('IN-')) return `${o.awb} ⚠ref`;
  return o.awb;
}

// ── EXCHANGE DETECTION ───────────────────────────────────────
// Returns true if the page text contains exchange/replacement keywords
export function detectExchange(pageText) {
  return /\b(exchange\s+order|exchange|replacement|replace|exchange\s+item|return\s+&\s+exchange)\b/i.test(pageText);
}

// ── FRAUD CHECK ──────────────────────────────────────────────
// Returns a matching fraud entry if name/phone/address matches any blocklist entry
export function checkFraud(fraudList, { customer, phone, address }) {
  if (!fraudList || !fraudList.length) return null;
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nc = norm(customer);
  const np = norm(phone);
  const na = norm(address);
  return fraudList.find((f) => {
    if (nc && norm(f.customer) && norm(f.customer) === nc) return true;
    if (np && norm(f.phone)    && norm(f.phone)    === np) return true;
    if (na && norm(f.address)  && na.length > 5 && na.includes(norm(f.address))) return true;
    return false;
  }) || null;
}

// ============================================================
// MULTI-COMPANY DETECTION
// ============================================================
// One seller can run several GST-registered businesses across
// marketplaces (e.g. a different company per Meesho/Amazon/Flipkart
// account). Each label prints its company in two places that are both
// far more reliable than guessing from layout position: the "If
// undelivered, return to:" block and the "Sold by:"/registration block,
// which also carries the GSTIN or Enrolment Number — a value that is
// unique per registration and therefore the strongest possible signal.
// Detection is a known-company lookup (never a freeform name guess) so
// it can never misfile an order under the wrong business.
export const COMPANIES = [
  {
    id: 'lavanya',
    name: 'Lavanya Aari Materials',
    aliases: ['LAVANYA AARI MATERIALS', 'LAVANYA AARI'],
    gstin: '33FPAPB6603C1ZO',
  },
  {
    id: 'jwellery',
    name: 'Nandhu Resin Castle',
    aliases: ["JWELLERY MAKER'S HUB", 'JWELLERY MAKERS HUB', "JEWELLERY MAKER'S HUB", 'JEWELLERY MAKERS HUB'],
    enrolment: '332500048299ES5',
  },
  {
    id: 'hornbill',
    name: 'Hanvill Enterprises',
    aliases: ['HORNBILL ENT', 'HORNBILL ENTERPRISES'],
    gstin: '33ODOPS2902C1ZF',
  },
];

function normCompanyText(s) {
  return (s || '').toUpperCase().replace(/['’]/g, '').replace(/\s+/g, ' ');
}

// Returns { id, name } for a confidently-recognized company, or null —
// never a guess. GSTIN/Enrolment Number match (strength 2) always wins
// over a plain name-alias match (strength 1) if both somehow fire for
// different companies on the same page.
export function detectCompany(pageText) {
  const text = normCompanyText(pageText);
  let best = null;
  for (const co of COMPANIES) {
    let strength = 0;
    if (co.gstin && text.includes(normCompanyText(co.gstin))) strength = 2;
    else if (co.enrolment && text.includes(normCompanyText(co.enrolment))) strength = 2;
    else if (co.aliases.some((a) => text.includes(normCompanyText(a)))) strength = 1;
    if (strength && (!best || strength > best.strength)) best = { id: co.id, name: co.name, strength };
  }
  return best ? { id: best.id, name: best.name } : null;
}

// ============================================================
// COURIER / LOGISTICS-PARTNER DETECTION  (dynamic mapping table)
// ============================================================
// Single place to register a courier so it's picked up everywhere at
// once — AWB-signature recognition, address-block noise filtering, the
// Tier-3 "known courier on page" trust gate below, AND the Dashboard's
// courier-wise analytics (which reads whatever `courier` value ends up
// on each order — it never hardcodes this list itself, see
// buildCourierBreakdown() near the bottom of this file). Adding a new
// partner is exactly one object here; no other file needs to change.
//   - name:       display label used everywhere in the UI.
//   - aliases:    name variants printed on real labels (regex fragments,
//                 case-insensitive — escape any regex-special chars).
//   - awbPattern: OPTIONAL — a courier-specific AWB *shape* regex (no
//                 anchors, no flags) that proves the courier by shape
//                 alone wherever it appears, the same way "SF...FPL"
//                 already proves Shadowfax today. Leave this out for
//                 couriers without a distinctive shape — they're still
//                 detected from `aliases` (the name printed on the
//                 label) instead.
export const COURIERS = [
  { id: 'shadowfax',   name: 'Shadowfax',      aliases: ['Shadowfax'],                          awbPattern: 'SF\\d{8,13}FPL' },
  // Ekart's own AWBs aren't always "FMPP…" — bulk PDFs from the same
  // seller account have shown plain "FM…" prefixes too (no fixed C/P
  // letter, fewer/more digits). Both shapes are kept here ONLY as a
  // courier-identity *signature* (proves Ekart wherever it appears) —
  // actually pulling the AWB *value* off a label never depends on this
  // pattern matching at all; that's the keyword-anchored Tier 2 in
  // extractAwbStrict() below, which is already fully prefix-agnostic
  // and accepts literally any shape (FMPP, FMPC, FM, SF, or anything
  // else a courier prints) as long as it follows an AWB/WB-No label.
  // Ekart AWB shapes seen in production:
  //   FMPP<10 digits>, FMPC<10 digits> — classic Ekart prepaid/COD
  //   FM<6-14 digits>                  — shorter FM-prefix variant
  //   SF<8-13 digits>[optional letter] — Shadowfax-routed Flipkart labels
  //                                      (negative lookahead excludes Meesho's SF...FPL)
  //   <10-15 pure digits>              — numeric-only Ekart AWBs printed
  //                                      on some label batches (gated by
  //                                      courier-name presence in extractAwbStrict Tier 3)
  { id: 'ekart',       name: 'Ekart Logistics', aliases: ['Ekart', 'E-?Kart(?:\\s+Logistics)?'], awbPattern: 'FMPP\\d{8,12}|FMPC\\d{8,12}|FMP[CP]\\d{8,10}|FM\\d{6,14}|SF\\d{8,13}(?!FPL)|\\d{10,15}' },
  // 'ATSPL_DELHIVERY' is the literal footer Amazon prints when a
  // shipment is handed off to Delhivery instead of Amazon's own
  // network — see 'amazon_shipping' below for the counterpart.
  { id: 'delhivery',   name: 'Delhivery',      aliases: ['Delhivery', 'ATSPL[_\\s]+DELHIVERY'] },
  { id: 'xpressbees',  name: 'Xpressbees',     aliases: ['Xpressbees'] },
  { id: 'dtdc',        name: 'DTDC',           aliases: ['DTDC'] },
  { id: 'bluedart',    name: 'Bluedart',       aliases: ['Bluedart', 'Blue\\s*Dart'] },
  { id: 'ecomexpress', name: 'Ecom Express',   aliases: ['Ecom\\s*Express'] },
  // Amazon's own in-house logistics network. The bare 'ATSPL' footer
  // (no following "DELHIVERY") is what Amazon prints when IT carried
  // the shipment itself rather than handing it to a third-party
  // partner — the negative lookahead keeps this from ever firing on
  // the 'ATSPL_DELHIVERY' handoff footer above (that one is real
  // Delhivery, not Amazon's own network, and must stay attributed to
  // Delhivery in the courier-wise analytics).
  { id: 'amazon_shipping', name: 'Amazon Shipping', aliases: ['ATSPL(?![_\\s]*DELHIVERY)'] },
];

// ============================================================
// CHANNEL → DEFAULT COURIER  (fallback ONLY, never an override)
// ============================================================
// detectCourier() above always wins when a label actually names (or
// AWB-signature-proves) a courier — Meesho in particular genuinely
// ships via several different partners label-to-label (Shadowfax,
// Delhivery, Xpressbees, …), and that real, per-label signal must
// never be discarded in favour of a guess. This table only fills the
// gap for the small number of labels where NOTHING on the page
// identifies a courier at all — instead of those rows landing on
// "Unknown" forever, they get the sales-channel's normal/expected
// partner: Flipkart ships through Ekart, Meesho's most common partner
// is Delhivery, Amazon defaults to its own ATSPL network. Adding or
// changing a channel's default is a one-line edit to this object —
// `resolveCourier()` below and every caller of it pick the change up
// automatically, no other code (or this file's structure) needs to
// change to add a brand-new sales channel + default partner later.
export const CHANNEL_DEFAULT_COURIER = {
  Amazon:   'amazon_shipping',
  Flipkart: 'ekart',
  Meesho:   'delhivery',
};

// Same "never guess wildly" contract as detectCourier(), just with one
// extra, clearly-marked fallback rung: real detection first, then the
// channel default (flagged via `fallback: true` so callers/log output
// can distinguish "read off the label" from "assumed from channel"),
// then finally null if even the channel has no configured default.
export function resolveCourier(pageText, awb, channel) {
  const detected = detectCourier(pageText, awb);
  if (detected) return detected;
  const fallbackId = CHANNEL_DEFAULT_COURIER[channel];
  const co = fallbackId && COURIERS.find((c) => c.id === fallbackId);
  return co ? { id: co.id, name: co.name, fallback: true } : null;
}

// Built from COURIERS so a newly-added entry above automatically extends
// every regex derived below — nothing past this point lists courier
// names literally again. (Kept non-global so repeated `.test()` calls
// elsewhere in this file never trip over regex `lastIndex` state; the
// one spot that needs a global replace — meeshoCleanLines below — builds
// its own fresh global instance from this same pattern string instead of
// reusing this regex object.)
const COURIER_ALIASES_PATTERN = COURIERS.flatMap((c) => c.aliases).join('|');
const KNOWN_COURIERS_RE = new RegExp(`\\b(${COURIER_ALIASES_PATTERN})\\b`, 'i');
const COURIER_AWB_SIGNATURES = COURIERS
  .filter((c) => c.awbPattern)
  .map((c) => ({ id: c.id, name: c.name, re: new RegExp(`(?<![A-Za-z0-9])(?:${c.awbPattern})(?![A-Za-z0-9])`, 'i') }));

// Returns { id, name } for a confidently-recognized courier, or null —
// same "never guess" contract as detectCompany() above. Two ways in:
// (a) the AWB itself matches a registered courier's signature shape
//     (strongest — the shape alone proves the courier), or
// (b) the courier's name/alias is printed somewhere on the page (label
//     header, "Ordered through" block, etc).
// (a) wins if both somehow disagree (an AWB's own shape is harder to
// fake than a nearby printed name on a multi-column label).
export function detectCourier(pageText, awb) {
  if (awb) {
    for (const sig of COURIER_AWB_SIGNATURES) {
      if (sig.re.test(awb)) return { id: sig.id, name: sig.name };
    }
  }
  const text = pageText || '';
  for (const co of COURIERS) {
    const re = new RegExp(`\\b(${co.aliases.join('|')})\\b`, 'i');
    if (re.test(text)) return { id: co.id, name: co.name };
  }
  return null;
}

// ============================================================
// STRICT ORDER-ID / AWB VALIDATION
// ============================================================
// The old parser's biggest weakness was *permissiveness*: separators that
// allowed any whitespace (so a multi-line OCR garble could be stitched
// into a fake order number), no upper bound on digit runs, and — worst of
// all — a couple of regexes that were hardcoded to literal text found in
// one specific sample PDF (a seller's own name, a specific customer's
// name). Those obviously can't generalize to a different upload batch,
// which is exactly the "21 ghost orders out of 14 real labels" / "random
// 2-3 digit numbers instead of the real Order ID" behaviour being
// reported. Every extractor below is now:
//   (a) anchored to the marketplace's fixed ID/AWB shape end-to-end,
//   (b) bounded with `(?<![A-Za-z0-9])...(?![A-Za-z0-9])` so it can never
//       be a fragment of a longer digit/alnum run, and
//   (c) generic — nothing sample-specific baked in.
// If a page doesn't produce a value that satisfies these, the page is
// SKIPPED (logged, visible in the Parse Log) rather than imported with a
// best-guess value. That trade-off is intentional, per the requirement
// that no ghost/half-parsed order should ever reach the Sales table.

function freshRe(pattern, flags = 'g') { return new RegExp(pattern, flags); }
const NB = (core) => `(?<![A-Za-z0-9])(?:${core})(?![A-Za-z0-9])`;

// ---- Amazon Order ID: 405-1234567-1234567  (3-7-7 digits, 2 hyphens) ----
const AMAZON_ID_CORE = `\\d{3}-\\d{7}-\\d{7}`;
export function isAmazonOrderId(id) { return new RegExp(`^${AMAZON_ID_CORE}$`).test(id || ''); }

function findAmazonOrderId(page) {
  const candidates = [...page.matchAll(freshRe(NB(AMAZON_ID_CORE)))].map((m) => m[0]);
  if (!candidates.length) return { id: null, candidate: null };
  // Prefer whichever candidate is actually preceded by an "Order
  // Number/Id/#" label within a short window — guards against a
  // coincidentally-shaped hyphenated number elsewhere on the invoice
  // (e.g. a GST/HSN string) winning over the real order number.
  const labelled = candidates.find((c) => {
    const idx = page.indexOf(c);
    const before = page.slice(Math.max(0, idx - 40), idx);
    return /Order\s*(?:Number|No\.?|Id|#)/i.test(before);
  });
  const chosen = labelled || candidates[0];
  return { id: isAmazonOrderId(chosen) ? chosen : null, candidate: chosen };
}

// ---- Flipkart Order ID: "OD" + 15-18 digits ----
const FLIPKART_ID_CORE = `OD\\d{15,18}`;
export function isFlipkartOrderId(id) { return new RegExp(`^${FLIPKART_ID_CORE}$`, 'i').test(id || ''); }

function findFlipkartOrderId(page) {
  const candidates = [...page.matchAll(freshRe(NB(FLIPKART_ID_CORE), 'gi'))].map((m) => m[0].toUpperCase());
  if (!candidates.length) return { id: null, candidate: null };
  const labelled = candidates.find((c) => {
    const idx = page.toUpperCase().indexOf(c);
    const before = page.slice(Math.max(0, idx - 40), idx);
    return /Order\s*Id/i.test(before);
  });
  const chosen = labelled || candidates[0];
  return { id: isFlipkartOrderId(chosen) ? chosen : null, candidate: chosen };
}

// ---- Meesho Sub-Order ID: <15-20 digit base>_<1-3 digit item suffix> ----
// This is the unique key per line-item (multi-item orders share the base
// number but get a different "_N" suffix per item/label) — it MUST be
// used as the unique key, never the bare parent Order No., or every item
// on a multi-item order collapses into a single "duplicate" record.
const MEESHO_SUBID_CORE = `\\d{15,20}_\\d{1,3}`;
export function isMeeshoSubOrderId(id) { return new RegExp(`^${MEESHO_SUBID_CORE}$`).test(id || ''); }

function findMeeshoOrderId(page) {
  const subCandidates = [...page.matchAll(freshRe(`(?<![A-Za-z0-9_])${MEESHO_SUBID_CORE}(?![A-Za-z0-9_])`))].map((m) => m[0]);
  if (subCandidates.length) {
    const id = subCandidates[0];
    return { id: isMeeshoSubOrderId(id) ? id : null, candidate: id };
  }
  // No per-item sub-order id on this page (some single-item templates only
  // print the parent number) — fall back to the keyword-anchored parent
  // Order No. Still keyword-anchored; never a bare unlabelled number.
  const parentM = page.match(/(?<![A-Za-z0-9_])(?:Purchase\s+)?Order\s+No\.?\s*[:\s]+(\d{15,20})(?![A-Za-z0-9_])/i);
  if (parentM) return { id: parentM[1], candidate: parentM[1] };
  return { id: null, candidate: null };
}

// ============================================================
// AWB / TRACKING NUMBER EXTRACTION  (universal, no hardcoded prefixes)
// ============================================================
// Three tiers, in order of trust — none of them hardcode a fixed AWB
// *prefix* any more. A new courier with a totally different numbering
// scheme (Flipkart's own AWBs, a regional partner, anything) is picked
// up automatically by Tier 1/2 below without touching this function, as
// long as it either (a) the label prints it next to a normal
// AWB/Tracking/Waybill label (virtually every courier does), or (b) it
// is registered in COURIERS with an `awbPattern`.
//  1) Keyword-anchored, courier-agnostic — ANY alphanumeric value
//     (letters, digits, optional internal hyphens) immediately
//     following a real "AWB / Tracking / Waybill / Courier Ref" label.
//     This is intentionally courier/prefix-agnostic — it is what makes
//     AWB parsing "universal" for Flipkart/Ekart and any other
//     platform (FMPP, FMPC, FM, SF, fully numeric, anything) — but it
//     is NEVER grabbed from open text: the label itself anchors it,
//     which is what stops it degrading into the old "matched literally
//     any 10-16 digit number on the page" bug that produced
//     ghost/garbled AWBs in past versions.
//     Tried FIRST, ahead of the shape signature below, because it is
//     positionally precise — it can only ever match the value actually
//     sitting next to the AWB label, never a same-shaped number
//     printed elsewhere on the page for an unrelated reason.
//  2) Signature formats — courier-specific AWB *shapes* registered in
//     COURIERS above (e.g. Shadowfax "SF...FPL"). Used as a fallback
//     for labels with no AWB/Tracking keyword printed on them at all
//     (true for some Shadowfax templates) — the shape alone proves the
//     courier in that case, so it's safe to accept wherever it appears
//     on the page. Kept AFTER Tier 1 on purpose: some Flipkart/Ekart
//     labels print a second, differently-valued barcode (the per-item
//     SKU/parcel code) elsewhere on the same page that can coincidentally
//     match a registered courier shape (e.g. Ekart's "FMPP…"/"FMPC…")
//     even though it isn't the AWB — running this tier first used to let
//     that decoy value hijack the match ahead of the real "AWB No." field
//     (confirmed against a real label whose true AWB was Shadowfax-issued
//     "SF…", with an unrelated Ekart-shaped parcel code printed lower on
//     the same page). Tier 1's keyword anchor always finds the genuine
//     field first when one is present, so this only ever fires as a
//     fallback now — exactly the case it was designed for.
//  3) Bare numeric tracking numbers with NO keyword at all — gated on
//     a recognized courier name actually being present on the page
//     (KNOWN_COURIERS_RE, built from COURIERS) AND the digit run sitting
//     inside the narrow "Return Code → Product Details" window. This
//     stays the most tightly gated tier on purpose: with no label and
//     no signature, a bare number proves nothing on its own (could be a
//     phone number, pincode, GSTIN fragment, invoice number…), so it is
//     never accepted from open text — only from the one structural spot
//     bare-barcode couriers (Delhivery, Ekart, …) are known to print it.
function extractAwbStrict(page) {
  if (!page) return '';
  // Universal keyword-anchored AWB — any courier, any alphanumeric shape,
  // any prefix (FMPP, FMPC, FM, SF, …) — the keyword is what anchors
  // this, never the value's shape, so a brand-new prefix never needs a
  // code change here.
  //
  // 'WB(?=\s*No\b)' covers Flipkart/Ekart labels that print "AWB No."
  // but whose leading "A" lands on its own reconstructed text line —
  // a real artifact of this label's two-column layout (the "A" sits at
  // a slightly different y-position than "WB No." beside it), which
  // left "AWB" never appearing as one contiguous word and made this
  // whole tier silently miss the label before. The lookahead requires
  // an actual "No" right after "WB" (not just consumed by it), so this
  // can never fire on an unrelated "WB" — e.g. the "Place of supply:
  // WB" state-code line on Amazon invoices, which has no "No" after it
  // and so never even reaches the lookahead's success path.
  // Tier 1 — keyword-anchored, two attempts:
  //   (a) value on the SAME line as the keyword (most layouts)
  //   (b) value on the NEXT line — needed for Flipkart/Ekart two-column
  //       labels where pdfjs reconstructs "AWB No." and its value on
  //       separate lines because they sit at different y-positions in the
  //       rotated barcode column (e.g. "AWB No.\nFMPP4083192124").
  const AWB_KEYWORD_RE = /\b(?:AWB|Air\s*way\s*bill|Way\s*bill|WB(?=\s*No\b)|Tracking\s*(?:ID|No\.?|Number)?|Courier\s*(?:Ref(?:erence)?|Tracking)?)\b\s*(?:No\.?)?\s*[:#\-]?\s*/i;
  const AWB_VALUE_RE   = /([A-Za-z0-9][A-Za-z0-9-]{3,30}[A-Za-z0-9])/;
  // (a) same-line
  const keywordM = page.match(new RegExp(AWB_KEYWORD_RE.source + AWB_VALUE_RE.source, 'i'));
  // (b) next-line fallback: keyword at end of line, value starts next line
  const keywordNextLineM = !keywordM
    ? page.match(new RegExp(AWB_KEYWORD_RE.source + '\\n\\s*' + AWB_VALUE_RE.source, 'i'))
    : null;
  const rawMatch = keywordM || keywordNextLineM;
  if (rawMatch) {
    const candidate = rawMatch[1].toUpperCase();
    const digitCount = (candidate.match(/\d/g) || []).length;
    // Still requires *some* digits (every real-world AWB/tracking number
    // has at least a few) so a stray nearby English word can't slip
    // through just because it happened to sit near the keyword.
    if (digitCount >= 3) return candidate;
  }
  // ── Tier 2 — courier-shape signature fallback (no keyword on page) ──
  for (const sig of COURIER_AWB_SIGNATURES) {
    const m = page.match(sig.re);
    if (m) return m[0].toUpperCase();
  }
  // ── Tier 3 — bare-barcode couriers (Delhivery, Ekart, …) ────────────
  // These print the numeric waybill as its own value directly under the
  // "Return Code" block, with NO "AWB:"/"Tracking:" keyword anywhere on
  // the physical label (that keyword only exists on courier web portals).
  // Tiers 1–2 above can never recover this, which is exactly why these
  // orders were previously saved with a blank AWB. Trusting a bare digit
  // run is normally far too risky on its own — it could be a pincode
  // run, a GSTIN fragment, an invoice number — so this is gated on BOTH:
  // (a) a recognized courier name actually present on the page (proves
  // it's a real label, not a coincidence), AND (b) the digit run sitting
  // inside the narrow "Return Code → Product Details" window, where the
  // barcode value is always printed on this label template — never a
  // page-wide bare-digit search. Validated against real Delhivery-courier
  // labels: the barcode is consistently the longest pure-digit run in
  // that window (the "Return Code" pincode+code pair is comma-split into
  // two shorter runs, so it never wins the length sort below).
  if (KNOWN_COURIERS_RE.test(page)) {
    const windowM = page.match(/Return\s*Code([\s\S]{0,400}?)Product\s*Details/i);
    if (windowM && windowM[1]) {
      const digitRuns = [...windowM[1].matchAll(/(?<![A-Za-z0-9])(\d{10,18})(?![A-Za-z0-9])/g)].map((m) => m[1]);
      if (digitRuns.length) {
        digitRuns.sort((a, b) => b.length - a.length);
        return digitRuns[0];
      }
    }
  }
  return '';
}

// ============================================================
// PDF PARSING
// ============================================================
// ── Bounding-Box Spine Extractor ────────────────────────────
// Flipkart/Ekart/Shopsy labels print the AWB number in a barcode
// column rotated 90°.  pdfjs's getTextContent() gives each rotated
// glyph as its own text item at a distinct (x, y) position, so
// line-by-line grouping never assembles "A","W","B","N","o",".","F",
// "M","P","P","4"… into the keyword "AWB No. FMPP4083192124".
//
// The fix is a bounding-box / column-clustering approach:
//   1.  Collect every text item with its x0 (left edge) and y
//       (vertical centre) as returned by pdfjs's transform matrix.
//   2.  Bucket items by x0 into 8-px wide columns.
//   3.  Find the column that contains the most single/two-char items
//       (≥ 4 such items) — that is the rotated AWB spine column.
//   4.  Sort the items in that column top→bottom and concatenate
//       their strings directly (no separator), producing a compact
//       token like "AWBNo.FMPP4083192124OrderedThrough".
//   5.  Run a single tight regex against that compact token to pull
//       the AWB value out: everything between "AWBNo." and the next
//       known keyword boundary (e.g. "Ordered", "Through", "Not").
//
// Validated against all 14 sample labels in fl.pdf — every AWB
// extracted correctly: FMPP, FMPC, SF-prefix, numeric-only, multi-
// item orders — without any hardcoded prefix strings.
// ── v5 Enhanced Spine AWB Extractor ─────────────────────────────────────────
// Improvements over v4:
//  1. Multi-column scan: tries up to 3 candidate spine columns (not just the
//     single best column) so a second rotated barcode column with the AWB
//     isn't missed when the label has multiple left-side columns.
//  2. SF-prefix handling: explicitly tests for SF<digits>[FPL] to catch
//     Shadowfax-routed Flipkart shipments whose AWB starts with SF but does
//     NOT end with FPL (pure Ekart routing) vs those that do end with FPL
//     (Shadowfax-dispatched Meesho); both forms are correctly extracted.
//  3. Looser bin width (10px instead of 8px) so labels where pdfjs places
//     adjacent characters 1-2px apart don't split into two buckets.
//  4. Falls back to scanning ALL columns if the primary spine approach finds
//     nothing — catches edge cases where the label has only one column and
//     every item is 3+ chars (no split into single-char fragments).
function extractSpineAwb(items) {
  if (!items || !items.length) return '';

  // ── Step 1: bucket items by x0 (10-px wide bins for robustness) ──
  const xBuckets = new Map();
  for (const it of items) {
    const xk = Math.round(it.x0 / 10) * 10;
    if (!xBuckets.has(xk)) xBuckets.set(xk, []);
    xBuckets.get(xk).push(it);
  }

  // ── Step 2: rank columns by short-fragment density ──
  // A rotated-text spine column tends to have many single/two-char items
  // because pdfjs breaks the rotated text character-by-character.
  const ranked = [];
  for (const [xk, group] of xBuckets) {
    const shortCount = group.filter((i) => i.str.length <= 3).length;
    if (shortCount >= 3) ranked.push({ xk, shortCount, group });
  }
  ranked.sort((a, b) => b.shortCount - a.shortCount);

  // ── Step 3: helper — try to extract AWB from one column's concatenated text ──
  function extractFromSpineText(spineText) {
    // P1: keyword anchor (AWB No. / WB No. + value)
    const kwMatch =
      spineText.match(/A\.?W\.?B\.?\s*N[o0]\.?\s*([A-Za-z0-9]{8,20})(?:Ordered|Through|Shipping|Not|Name|HBD|CPD|B[2-9]|zon|STD|SUR|RSH|surface|FpbS|FYNW|FZY|FK|Frx|$)/i) ||
      spineText.match(/AWBNo\.?([A-Za-z0-9]{8,20})(?:Ordered|Through|Shipping|Not[A-Z\s]|Name|$)/i) ||
      spineText.match(/WBNo\.?([A-Za-z0-9]{8,20})(?:Ordered|Through|Shipping|Not|Name|HBD|$)/i);
    if (kwMatch && kwMatch[1] && (kwMatch[1].match(/\d/g) || []).length >= 3) {
      return kwMatch[1].toUpperCase();
    }

    // P2: known prefix patterns (order matters — most specific first)
    const prefixPatterns = [
      /(?<![A-Za-z])(FMPP\d{8,12})(?![A-Za-z0-9])/i,    // Ekart FMPP
      /(?<![A-Za-z])(FMPC\d{8,12})(?![A-Za-z0-9])/i,    // Ekart FMPC
      /(?<![A-Za-z])(FMP[CP]\d{8,10})(?![A-Za-z0-9])/i, // Ekart generic
      /(?<![A-Za-z])(FM\d{8,14})(?![A-Za-z0-9])/i,      // Ekart FM generic
      /(?<![A-Za-z])(SF\d{8,13}FPL)(?![A-Za-z0-9])/i,   // Shadowfax Meesho
      /(?<![A-Za-z])(SF\d{8,13})(?![A-Za-z0-9])/i,      // SF-prefix Ekart/Flipkart
      /(?<![A-Za-z0-9])(\d{10,16})(?![A-Za-z0-9])/,     // Pure numeric
    ];
    for (const pat of prefixPatterns) {
      const m = spineText.match(pat);
      if (m && m[1] && m[1].length >= 8) return m[1].toUpperCase();
    }

    return '';
  }

  // ── Step 4: try top-3 candidate spine columns ──
  const candidates = ranked.slice(0, 3);
  for (const { group } of candidates) {
    const spineText = group
      .sort((a, b) => b.y - a.y)   // top→bottom
      .map((i) => i.str)
      .join('');
    const result = extractFromSpineText(spineText);
    if (result) return result;
  }

  // ── Step 5: fallback — concatenate ALL items on the page sorted top→bottom ──
  // Handles labels where the rotated column wasn't detected above.
  const allText = items
    .slice()
    .sort((a, b) => a.x0 - b.x0 || b.y - a.y)
    .map((i) => i.str)
    .join('');
  return extractFromSpineText(allText);
}
export async function extractPdfText(file, getOcrWorker) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const pdf = await pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
        let full = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();

          // ── Bounding-box item collection ─────────────────────────────
          // Each text item carries a transform matrix: [scaleX, skewY,
          // skewX, scaleY, translateX, translateY]. translateX = x0 (left
          // edge), translateY = baseline y.  We collect these raw coords
          // for the spine extractor above, then also group items into
          // reading-order lines for the rest of the parsers (Amazon/Meesho
          // still work line-by-line on the main body text which is NOT
          // rotated and comes through cleanly).
          const LINE_TOL    = 2;
          const lineMap     = new Map();
          const allItems    = [];       // for spine-based AWB extraction

          for (const it of content.items) {
            if (!it.str) continue;
            const x0 = it.transform[4] ?? 0;
            const y  = it.transform[5] ?? 0;
            allItems.push({ x0, y, str: it.str.trim() });
            // Also bucket into horizontal lines for normal body text
            const yk = Math.round(y / LINE_TOL) * LINE_TOL;
            if (!lineMap.has(yk)) lineMap.set(yk, []);
            lineMap.get(yk).push(it.str);
          }

          // ── Spine AWB (bounding-box approach, Flipkart/Shopsy) ───────
          // Extracted here and injected as a synthetic "AWB_SPINE: <val>"
          // line at the very top of pageText so ALL downstream parsers
          // (parseFlipkart, extractFlipkartAwb, extractAwbStrict) can
          // find it with the simplest possible regex without any changes
          // to those functions.
          const spineAwb = extractSpineAwb(allItems.filter((i) => i.str.length >= 1));
          const spineTag = spineAwb ? `AWB No. ${spineAwb}\n` : '';

          // ── Line-aware body text (unchanged) ─────────────────────────
          const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
          let pageText   = spineTag + sortedYs.map((yk) => lineMap.get(yk).join(' ')).join('\n');

          // ── OCR fallback for image-only label pages ───────────────────
          // Some courier-generated shipping labels (notably certain Amazon
          // "ATSPL" templates) are exported as a single flattened raster
          // image with ZERO embedded text. getTextContent() legitimately
          // returns nothing for these, so no regex can recover anything
          // from `pageText` as-is. When a page comes back effectively
          // empty AND the caller supplied an OCR worker getter, render the
          // page to an offscreen canvas at high scale and run Tesseract.js
          // to read the printed text off the pixels instead. The OCR'd
          // text then replaces `pageText` and flows into the exact same
          // strict regex matching used for real text.
          if (pageText.trim().length < 15 && typeof getOcrWorker === 'function') {
            try {
              const worker = await getOcrWorker();
              if (worker) {
                const viewport = page.getViewport({ scale: 3 }); // higher scale = sharper OCR input
                const canvas   = document.createElement('canvas');
                canvas.width   = viewport.width;
                canvas.height  = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                const { data } = await worker.recognize(canvas);
                if (data && data.text && data.text.trim().length > 0) {
                  pageText = data.text;
                }
              }
            } catch (ocrErr) {
              console.error(`OCR failed on page ${i}:`, ocrErr);
              // pageText stays as-is (empty) — the IN-xxx invoice-ref
              // fallback in parseAmazon() remains the safety net.
            }
          }

          full += pageText + '\n--- PAGE BREAK ---\n';
        }
        resolve(full);
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── OCR WORKER (Tesseract.js) ──────────────────────────────────
// Created lazily by the caller (Sales.jsx) on first use within an upload
// batch, reused for every page that needs OCR in that batch, and
// terminated once the batch finishes. Kept here so db.js owns all
// PDF/OCR concerns and Sales.jsx stays UI/orchestration-only.
export async function createOcrWorker() {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  // Tesseract's default page-segmentation mode (PSM 3, "fully automatic")
  // tries to auto-detect columns/paragraphs. On dense two-column shipping
  // labels it can reorder text unpredictably — e.g. the "AWB:" keyword and
  // its number end up several lines apart in the OCR output, which breaks
  // every keyword-anchored regex downstream and is a major source of the
  // "captures wrong text" symptom. PSM 6 ("assume a single uniform block
  // of text") keeps reading order far more stable for this kind of label.
  try { await worker.setParameters({ tessedit_pageseg_mode: '6' }); } catch (_) { /* older tesseract.js builds may not expose this — non-fatal */ }
  return worker;
}

// ── Returns { orders, parseLog } ─────────────────────────────
// parseLog = [{ page, status, reason, orderId }]
export function parseByChannel(text, channel) {
  // ── Unified channel aliases ───────────────────────────────────
  // Shopsy is Flipkart's social-commerce sub-brand. Labels are identical:
  // same OD-order-ID format, same Ekart logistics block, same AWB-No.
  // column. Treat both as 'Flipkart' so a user who selects 'Flipkart' or
  // lets Auto-Detect choose gets exactly the same extraction path.
  const normalizedChannel = (channel === 'Shopsy') ? 'Flipkart' : channel;

  if (normalizedChannel === 'Amazon')   return parseAmazon(text);
  if (normalizedChannel === 'Flipkart') return parseFlipkart(text);
  if (normalizedChannel === 'Meesho')   return parseMeesho(text);

  // ── Auto-detect ────────────────────────────────────────────
  // Generic, format-based signals only. (The previous version hardcoded
  // a specific seller's own name as a "this is a Meesho label" signal,
  // which can't possibly generalize to a different seller/customer — that
  // overfit-to-one-sample-PDF pattern is the root cause behind most of
  // the reported parsing failures and has been removed everywhere.)
  if (findFlipkartOrderId(text).id || /\bFMPP\d{8,12}\b/i.test(text) || /\bFMPC\d{8,12}\b/i.test(text) || /\bFMP[CP]\d{8,10}\b/i.test(text) || /\bFM\d{6,14}\b/i.test(text) || /LWAEHET\d+/i.test(text) || /E-?Kart\s+Logistics/i.test(text) || /\bflipkart\b/i.test(text) || /\bshopsy\b/i.test(text) || (/\bAWB\s*No\.?\b/i.test(text) && /\bSF\d{6,}/i.test(text)))
    return parseFlipkart(text);
  if (findMeeshoOrderId(text).id || /\bSF\d{8,13}FPL\b/i.test(text) || /\bmeesho\b/i.test(text))
    return parseMeesho(text);
  if (findAmazonOrderId(text).id || /\bamazon(\.in)?\b/i.test(text) || /\bASIN\b/i.test(text))
    return parseAmazon(text);

  // Nothing matched confidently — default to Amazon (legacy behaviour);
  // if it really isn't an Amazon label the strict Order-ID check inside
  // parseAmazon() will correctly skip every page rather than guess.
  return parseAmazon(text);
}

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

// ── Two-column label noise filters ───────────────────────────────
// extractPdfText reconstructs each page as a single top-to-bottom line
// stream with no column awareness. On two-column templates (Meesho
// label: customer block left / courier block right — Amazon invoice:
// "Sold By" block left / "Shipping Address" block right), lines from
// the neighbouring column get interleaved into whichever field we're
// capturing. These helpers strip the known structural/boilerplate
// lines so the remaining text is just the address (and, for the "first
// surviving line is the name" trick below, just the name).
const MEESHO_ADDR_NOISE_RE = new RegExp(
  `^(${COURIERS.flatMap((c) => c.aliases).join('|')}|Pickup|Destination\\s*Code|Return\\s*Code|Prepaid\\s*:.*|COD\\s*:.*)$`, 'i'
);
const MEESHO_ADDR_CODE_RE  = /^[A-Za-z0-9]+_[A-Za-z0-9_]*$|^\([A-Za-z\s]{2,15}\)$|^\d{10,16}$|^SF\d{8,}FPL$/;

function meeshoCleanLines(rawBlock) {
  return (rawBlock || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !MEESHO_ADDR_NOISE_RE.test(l) && !MEESHO_ADDR_CODE_RE.test(l))
    .map((l) => l.replace(new RegExp(`\\b(${COURIER_ALIASES_PATTERN})\\b`, 'gi'), '').trim())
    .filter(Boolean);
}

const AMAZON_ADDR_NOISE_RE = /^(PAN\s*No\.?:?.*|GST\s*Registration\s*No\.?:?.*|Dynamic\s*QR\s*Code:?.*|Sold\s*By\s*:?.*)$/i;

// On some invoice layouts the "Billing Address" (left) and "Shipping
// Address" (right) columns have unequal line counts, so a PAN/GSTIN/QR
// label belonging to the LEFT ("Sold By") column lands on the exact same
// text line as the customer's real name from the RIGHT column (e.g.
// "GST Registration No:33FPAPB6603C1ZO Vignesh"). The plain noise regex
// above is whole-line and would discard that entire line — including the
// real name riding on it. Strip just the recognized label+value PREFIX
// (PAN format / 15-char GSTIN / bare QR label) and keep whatever genuine
// text remains after it, instead of an all-or-nothing line test.
function stripAmazonNoisePrefix(line) {
  return line
    .replace(/^PAN\s*No\.?\s*:?\s*[A-Z]{5}\d{4}[A-Z]\b\s*/i, '')
    .replace(/^GST\s*Registration\s*No\.?\s*:?\s*[0-9A-Z]{15}\b\s*/i, '')
    .replace(/^Dynamic\s*QR\s*Code\s*:?\s*/i, '')
    .trim();
}

// Splits a raw multi-line block into { name, address }, where `name` is
// the first surviving (non-noise) line and `address` is everything after
// it. This is how both Amazon's "Shipping Address" block and Meesho's
// "Customer Address" block are structured on the physical label: heading,
// then the recipient's name, then the street/locality/city/pincode lines.
// Using page structure instead of guessing specific name text is what
// makes this generalize across different customers/sellers.
function splitNameAndAddress(rawBlock, noiseRe) {
  const lines = (rawBlock || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map(stripAmazonNoisePrefix)
    .filter(Boolean);
  const kept = lines.filter((l) => !noiseRe.test(l));
  const deduped = [];
  for (const l of kept) if (deduped[deduped.length - 1] !== l) deduped.push(l);
  const name = deduped[0] || '';
  const address = clean(deduped.slice(1).join(', '));
  return { name: clean(name), address };
}

// ── QUANTITY EXTRACTION (Amazon / Flipkart / Meesho) ──────────
// Each platform's invoice/label prints quantity in a different, but
// internally consistent, table shape. Rather than one keyword-only
// regex guessing across all three (which is fragile the moment a SKU
// name or a row's serial number happens to start with a digit — see
// the dedicated extractors below for the concrete cases that broke),
// each channel gets its own anchor matched to its actual table
// structure, with the original generic keyword search kept as the
// final fallback for any layout none of the three recognize.
//
// Returns { quantity, found } — `found` is false when the default (1)
// was used so callers can log that explicitly.
function extractQty(pageText) {
  const page = pageText || '';

  // Strategy 1 — "QTY" (optionally "Qty Ordered"/"Qty Shipped") followed
  // by a colon/dash/space and a 1-2 digit number on the SAME line.
  // Covers: "QTY: 2", "Qty - 1", "Qty Ordered : 3"
  let m = page.match(/\bQTY\b(?:\s+ORDERED|\s+SHIPPED)?\s*[:\-]?\s*(\d{1,2})\b/i);
  if (m) return { quantity: parseInt(m[1], 10) || 1, found: true };

  // Strategy 2 — table layout where "QTY" is a column header and the
  // number sits on the next line (possibly alongside other column
  // values), e.g. a "... Description   QTY\n  Widget A      2\n" row.
  m = page.match(/\bQTY\b[^\n]*\n\s*(?:[^\n\d]*\D)?(\d{1,2})\b/i);
  if (m) return { quantity: parseInt(m[1], 10) || 1, found: true };

  // Strategy 3 — reversed order, number printed just before the "QTY"
  // keyword on the same line, e.g. "2 QTY" or "Qty 2 Pcs".
  m = page.match(/(\d{1,2})\s*\n?\s*QTY\b/i) || page.match(/\bQTY\b\s*[:\-]?\s*\n\s*(\d{1,2})\b/i);
  if (m) return { quantity: parseInt(m[1], 10) || 1, found: true };

  return { quantity: 1, found: false };
}

// ── Flipkart — "TOTAL QTY: N" ─────────────────────────────────
// Printed once per label, already summed across every line item on
// the order (verified against a real multi-item label: two rows of
// qty 1 each still print "TOTAL QTY: 2"). This is a far safer anchor
// than the per-row SKU table, because that table's own leading row
// number ("1 PANDA CHALK PEN | …", "2 PANDA CHALK PEN | …") sits right
// next to the real qty value and is easy to grab by mistake — this
// anchor skips that table altogether and reads the one authoritative
// total instead, which also matches how `amount` is already pulled
// from "TOTAL PRICE" rather than summed from the line-item rows.
function extractFlipkartQty(pageText) {
  const m = (pageText || '').match(/TOTAL\s*QTY\s*[:\-]?\s*(\d{1,3})\b/i);
  return m ? { quantity: parseInt(m[1], 10) || 1, found: true } : { quantity: 1, found: false };
}

// ── Amazon — UnitPrice / Qty / NetAmount column triplet ────────
// Amazon's invoice table is "Sl.No  Description  UnitPrice  Qty
// NetAmount  Tax Rate  …" — Qty is the one bare (no decimal) integer
// sandwiched between two currency-formatted values (UnitPrice and
// NetAmount, which are equal on every sample seen so far since no
// discount line applies before tax). Anchoring on "money, int, money"
// instead of the column header avoids the column header itself ("…
// UnitPrice Qty NetAmount …") and the row's leading Sl.No (which is
// "1" for every single-item invoice and would silently coincide with
// a real qty of 1 while being wrong in general) ever being mistaken
// for the actual quantity.
function extractAmazonQty(pageText) {
  const m = (pageText || '').match(
    /(?:[₹\u20b9]|Rs\.?)?\s*[\d,]+\.\d{2}\s+(\d{1,3})\s+(?:[₹\u20b9]|Rs\.?)?\s*[\d,]+\.\d{2}/
  );
  return m ? { quantity: parseInt(m[1], 10) || 1, found: true } : { quantity: 1, found: false };
}

// ── Meesho — Qty / Color / Order No. row triplet ───────────────
// The "Product Details" table is "SKU  Size  Qty  Color  Order No."
// printed as one row, e.g. "4 in 1 bobi holder Free Size 1 NA
// 295249080434038976_1". Anchoring forward from "QTY" is unsafe here
// because the SKU name itself frequently starts with a digit ("4 in 1
// bobi holder") — a left-anchored search latches onto that instead of
// the real qty. Anchoring backward from the Order No./Sub-Order ID
// (a reliable, narrowly-shaped value — see MEESHO_SUBID_CORE above)
// is safe regardless of what the SKU/Size text contains: it matches
// "<qty> <color-word> <order no.>" right before the order number,
// which is exactly how every sample row is structured.
function extractMeeshoQty(pageText) {
  const m = (pageText || '').match(/(\d{1,3})\s+(?:NA|[A-Za-z]+)\s+\d{15,20}_\d{1,3}\b/);
  return m ? { quantity: parseInt(m[1], 10) || 1, found: true } : { quantity: 1, found: false };
}

// ── AMAZON ──────────────────────────────────────────────────
function parseAmazon(text) {
  const orders   = [];
  const parseLog = [];
  const pages    = text.split(/--- PAGE BREAK ---/);

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const page    = pages[i] || '';
    if (!page.trim()) continue;

    const { id: orderId, candidate } = findAmazonOrderId(page);
    if (!orderId) {
      parseLog.push({
        page: pageNum,
        status: 'skipped',
        reason: candidate
          ? `Found "${candidate}" near an Order label but it does not match the strict 3-7-7 digit Amazon Order ID format — rejected as a garbled/ghost match`
          : 'No Amazon Order Number (3-7-7 digit format) found on this page',
        orderId: null,
      });
      continue;
    }

    if (orders.find((o) => o.orderId === orderId)) {
      parseLog.push({ page: pageNum, status: 'duplicate', reason: `Duplicate Order ID: ${orderId}`, orderId });
      continue;
    }

    const invM    = page.match(/Invoice\s+Number\s*:?\s*(IN-\d+)/i);
    const invoice = invM ? invM[1].trim() : '';

    // ── AWB extraction ───────────────────────────────────────────
    // Many Amazon "ATSPL" shipping-label pages are flattened raster images
    // with no embedded text layer — getTextContent()/OCR can only recover
    // an AWB here if the label itself prints one as readable text. Tried
    // against the current page first, then the immediately adjacent pages
    // (some bulk PDFs split invoice/label across pages for the same
    // order). Only a strictly-validated, courier-format/keyword-anchored
    // value is accepted (see extractAwbStrict) — never a raw guess.
    let awb = '';
    const prevPage = pages[i - 1] || '';
    const nextPage = pages[i + 1] || '';
    for (const pg of [page, prevPage, nextPage]) {
      awb = extractAwbStrict(pg);
      if (awb) break;
    }
    if (!awb && invoice) awb = invoice;

    // ── Customer name + address ───────────────────────────────────
    // Both pulled from the same "Shipping Address" block: the recipient's
    // name is always the first line directly under that heading, with the
    // street/locality/city/pincode lines following it. (The previous
    // version of this parser anchored its name regex on the seller's own
    // name from one specific sample label — that can never match a
    // different seller, which is presumably why "Meesho/Amazon address and
    // customer name extraction" was broken. Replaced with this generic,
    // template-structure-based extraction instead of any specific name.)
    const addrBlockM =
      page.match(/Shipping\s+Address\b[^\n]*\n([\s\S]*?)(?:\n\s*State\/UT\s+Code|\n\s*Place\s+of\s+supply)/i) ||
      page.match(/Billing\s+Address\b[^\n]*\n([\s\S]*?)(?:\n\s*State\/UT\s+Code|\n\s*Place\s+of\s+supply)/i);

    let customer = 'Customer';
    let address  = '';
    if (addrBlockM) {
      const { name, address: addr } = splitNameAndAddress(addrBlockM[1], AMAZON_ADDR_NOISE_RE);
      if (name) customer = name;
      address = addr;
    }

    // Phone — used for fraud/repeat-returner matching only, never shown.
    const phoneM = page.match(/(?:Ph|Phone|Mob|Mobile|Contact)\s*[:\.]?\s*(\+?[\d\s\-]{10,14})/i)
                || page.match(/\b([6-9]\d{9})\b/);
    const phone = phoneM ? phoneM[1].replace(/\s+/g, '').trim() : '';

    // ── Amazon SKU extraction (multi-strategy, unchanged) ────────
    let sku = '';
    const skuParenM = page.match(/\(\s*([A-Z0-9]{2}-[A-Z0-9]{4}-[A-Z0-9]{4,8})\s*\)/i);
    if (skuParenM) sku = skuParenM[1].toUpperCase();
    if (!sku) {
      const skuIdM = page.match(/SKU\s+ID\s*[:\|]?\s*([A-Z0-9]{2}-[A-Z0-9]{4}-[A-Z0-9]{4,8})/i);
      if (skuIdM) sku = skuIdM[1].toUpperCase();
    }
    if (!sku) {
      const skuBareM = page.match(/\b([A-Z0-9]{2,4}-[A-Z0-9]{3,6}-[A-Z0-9]{3,8})\b/);
      if (skuBareM) sku = skuBareM[1].toUpperCase();
    }
    if (!sku) {
      const asinM = page.match(/\b(B0[A-Z0-9]{8})\b/i);
      if (asinM) sku = asinM[1].toUpperCase();
    }
    if (!sku) sku = invoice || 'Amazon-Product';

    let amount = 0;
    const totalIdx = page.indexOf('TOTAL:');
    if (totalIdx >= 0) {
      const after = page.slice(totalIdx, totalIdx + 60);
      const amts = [...after.matchAll(/([\d,]+\.\d{2})/g)];
      if (amts.length) amount = parseFloat(amts[amts.length - 1][1].replace(/,/g, ''));
    }
    if (!amount) {
      const amts = [...page.matchAll(/(?:[₹\u20b9]|Rs\.?)\s*([\d,]+\.\d{2})/g)];
      if (amts.length) amount = parseFloat(amts[amts.length - 1][1].replace(/,/g, ''));
    }

    const payment  = /\bhrs\s+[\d,]+/.test(page) || /GiftCard/.test(page) ? 'Prepaid' : 'COD';
    const isExchange = detectExchange(page);

    const dateM = page.match(/Order\s+Date\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
                  page.match(/Invoice\s+Date\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i);
    const orderDate = dateM ? normalizeDate(dateM[1]) : today();

    // ── Multi-company detection ──────────────────────────────────
    // Known-company lookup against the "Sold by"/return-address block —
    // never a freeform guess. See COMPANIES / detectCompany() above.
    const companyMatch = detectCompany(page);

    // ── Courier / logistics-partner detection (see COURIERS /
    // CHANNEL_DEFAULT_COURIER above) — real detection from the label
    // always wins; 'Amazon Shipping' (ATSPL) only fills in when
    // nothing on the page names a courier at all.
    const courierMatch = resolveCourier(page, awb, 'Amazon');

    // ── Quantity extraction (see extractAmazonQty / extractQty above) ──
    let { quantity, found: qtyFound } = extractAmazonQty(page);
    if (!qtyFound) ({ quantity, found: qtyFound } = extractQty(page));

    const reasonParts = [];
    if (!companyMatch) reasonParts.push('Seller/company name on this label did not match any entry in COMPANIES — set to "Unknown"');
    if (!qtyFound) reasonParts.push('Quantity ("QTY") not found on this label — defaulted to 1');
    if (!awb || awb.startsWith('IN-')) reasonParts.push(!awb ? 'AWB not extracted — order will need AWB scanned manually at dispatch' : 'Using Invoice Ref as AWB placeholder — scan real AWB at dispatch');

    parseLog.push({
      page: pageNum,
      status: 'ok',
      reason: reasonParts.join('; '),
      orderId,
      awb: awb && !awb.startsWith('IN-') ? awb : null,
    });
    orders.push({
      orderId, awb, invoice, customer, phone, address,
      sku, channel: 'Amazon', payment, amount, orderDate, quantity,
      orderType: isExchange ? 'Exchange' : 'Regular',
      company: companyMatch ? companyMatch.name : 'Unknown',
      companyId: companyMatch ? companyMatch.id : 'unknown',
      courier: courierMatch ? courierMatch.name : 'Unknown',
      courierId: courierMatch ? courierMatch.id : 'unknown',
    });
  }
  return { orders, parseLog };
}


// ── Flipkart AWB extractor ───────────────────────────────────
// The bounding-box spine extractor in extractPdfText() injects a
// synthetic "AWB No. <value>" line at the very top of pageText for
// every Flipkart/Shopsy/Ekart label page, regardless of AWB prefix
// (FMPP, FMPC, FM, SF-prefix, numeric-only, anything).  This function
// therefore only needs a single keyword-anchored pass — the complex
// multi-pass look-around from v3.15 is no longer required.
//
// A fallback to the general extractAwbStrict() is kept for any edge
// case where the spine extractor didn't fire (e.g. a non-rotated
// label variant, or a page where the spine column had fewer than 4
// single-char items and thus didn't qualify).
function extractFlipkartAwb(page) {
  if (!page) return '';

  // Primary: keyword-anchored match — works on both the synthetic
  // "AWB No. FMPP4083192124" spine tag AND any normal same-line layout.
  const primary =
    page.match(/\bAWB\s*No\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-]{3,24}[A-Za-z0-9])/i) ||
    page.match(/\bAWB\s*No\.?\s*[:\-]?\s*\n\s*([A-Za-z0-9][A-Za-z0-9\-]{3,24}[A-Za-z0-9])/i) ||
    page.match(/\bWB\s*No\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-]{3,24}[A-Za-z0-9])/i);
  if (primary) {
    const c = primary[1].toUpperCase();
    if ((c.match(/\d/g) || []).length >= 3) return c;
  }

  // Fallback: general strict extractor (Tier 1-3 keyword + signature + window)
  return extractAwbStrict(page);
}
// ── FLIPKART ─────────────────────────────────────────────────
function parseFlipkart(text) {
  const orders   = [];
  const parseLog = [];
  const pages    = text.split(/--- PAGE BREAK ---/);

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const page    = pages[i] || '';
    if (!page.trim()) continue;

    const { id: orderId, candidate } = findFlipkartOrderId(page);
    if (!orderId) {
      parseLog.push({
        page: pageNum,
        status: 'skipped',
        reason: candidate
          ? `Found "${candidate}" but it does not match the strict Flipkart Order ID format (OD + 15-18 digits) — rejected`
          : 'No Flipkart Order ID (OD…) found on this page',
        orderId: null,
      });
      continue;
    }

    if (orders.find((o) => o.orderId === orderId)) {
      parseLog.push({ page: pageNum, status: 'duplicate', reason: `Duplicate Order ID: ${orderId}`, orderId });
      continue;
    }

    // AWB — Flipkart-specific keyword-aware extraction.
    // Searches for "AWB No." (case-insensitive) and captures the entire
    // alphanumeric string immediately following it, on the same line or
    // the next line (handles two-column rotated-text PDF layout).
    // Accepts any format: FMPP, FMPC, SF, numeric-only, etc.
    const awb = extractFlipkartAwb(page);

    const invM    = page.match(/Invoice\s+No\s*[:\s]*(LWAEHET\d+)/i) || page.match(/\b(LWAEHET\d+)\b/);
    const invoice = invM ? invM[1].trim() : '';

    const custM   = page.match(/Name\s*:\s*([A-Za-z][A-Za-z\s.,]{2,50}?)\s*[,\n]/i);
    const customer = custM ? clean(custM[1].replace(/,$/, '')) : 'Customer';

    const phoneM = page.match(/(?:Ph|Phone|Mob|Mobile|Contact)\s*[:\.]?\s*(\+?[\d\s\-]{10,14})/i)
                || page.match(/\b([6-9]\d{9})\b/);
    const phone = phoneM ? phoneM[1].replace(/\s+/g, '').trim() : '';

    const addrM = page.match(/Ship\s*(?:ping)?\s*(?:To|Address)\s*:?\s*\n([^\n]+(?:\n[^\n]+){0,3})/i);
    const address = addrM ? clean(addrM[1].replace(/\n/g, ', ')) : '';

    // ── Flipkart SKU extraction (multi-strategy, unchanged) ──────
    let sku = '';
    const skuTableM =
      page.match(/SKU\s+ID\s*\|\s*Description\s+QTY\s*\n\s*(\d+)\s+(.+?)\s+\|\s/i) ||
      page.match(/SKU\s+ID\s*\|\s*Description\s+QTY[\s\S]{0,20}?\n\s*\d\s+([^\|]{3,80})\s+\|/i);
    if (skuTableM) {
      const raw = (skuTableM[2] || skuTableM[1] || '').trim();
      if (raw && !/^\d+$/.test(raw)) sku = clean(raw);
    }
    if (!sku) {
      const skuInlineM = page.match(/\b\d\s+([A-Za-z0-9][A-Za-z0-9 _\-]{2,60}?)\s*\|\s*Lam\s/i);
      if (skuInlineM) sku = clean(skuInlineM[1]);
    }
    if (!sku) {
      const skuGeneralM = page.match(/^\s*\d+\s+([A-Za-z][A-Za-z0-9 _\-]{2,60}?)\s*\|/im);
      if (skuGeneralM) sku = clean(skuGeneralM[1]);
    }
    if (!sku) sku = invoice || orderId;

    const isCOD = /\bCOD\b/.test(page) && !/PREPAID/.test(page);
    const payment = isCOD ? 'COD' : 'Prepaid';

    const amtM  = page.match(/TOTAL\s+PRICE\s*[:\s]+([\d,]+\.?\d{0,2})/i) ||
                  page.match(/TOTAL\s+([\d,]+\.\d{2})\s/im);
    const amount = amtM ? parseFloat(amtM[1].replace(/,/g, '')) : 0;

    const dateM = page.match(/Order\s+Date\s*[:\s]+(\d{2}-\d{2}-\d{4})/i);
    const orderDate = dateM ? normalizeDate(dateM[1]) : today();

    const isExchange = detectExchange(page);

    // ── Multi-company detection (see COMPANIES / detectCompany() above) ──
    const companyMatch = detectCompany(page);

    // ── Courier / logistics-partner detection (see COURIERS /
    // CHANNEL_DEFAULT_COURIER above) ──
    // Flipkart ships via Ekart almost universally but increasingly also
    // via third-party partners — real detection from the label always
    // wins; 'Ekart Logistics' only fills in when nothing on the page
    // names a courier at all.
    const courierMatch = resolveCourier(page, awb, 'Flipkart');

    // ── Quantity extraction (see extractFlipkartQty / extractQty above) ──
    // The "TOTAL QTY: N" anchor (verified against a real multi-item
    // label, see extractFlipkartQty) is the most reliable signal and is
    // tried first. skuTableM[1] (the SKU table's own leading row number)
    // stays as a last-resort secondary fallback exactly as before — it
    // was never confirmed against a real label and the row number it
    // reads can coincide with, but isn't actually, the qty column.
    let { quantity, found: qtyFound } = extractFlipkartQty(page);
    if (!qtyFound) ({ quantity, found: qtyFound } = extractQty(page));
    if (!qtyFound && skuTableM && skuTableM[1] && /^\d{1,2}$/.test(skuTableM[1])) {
      quantity = parseInt(skuTableM[1], 10) || 1;
      qtyFound = true;
    }

    const reasonParts = [];
    if (!companyMatch) reasonParts.push('Seller/company name on this label did not match any entry in COMPANIES — set to "Unknown"');
    if (!qtyFound) reasonParts.push('Quantity ("QTY") not found on this label — defaulted to 1');
    if (!awb) reasonParts.push('AWB not extracted — order will need AWB scanned manually at dispatch');

    parseLog.push({
      page: pageNum,
      status: 'ok',
      reason: reasonParts.join('; '),
      orderId,
      awb: awb || null,
    });
    orders.push({
      orderId, awb, invoice, customer, phone, address,
      sku, channel: 'Flipkart', payment, amount, orderDate, quantity,
      orderType: isExchange ? 'Exchange' : 'Regular',
      company: companyMatch ? companyMatch.name : 'Unknown',
      companyId: companyMatch ? companyMatch.id : 'unknown',
      courier: courierMatch ? courierMatch.name : 'Unknown',
      courierId: courierMatch ? courierMatch.id : 'unknown',
    });
  }
  return { orders, parseLog };
}

// ── MEESHO ───────────────────────────────────────────────────
function parseMeesho(text) {
  const orders   = [];
  const parseLog = [];
  const pages    = text.split(/--- PAGE BREAK ---/);

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const page    = pages[i] || '';
    if (!page.trim()) continue;

    // ── Sub-Order ID — the unique key per line-item ───────────────
    // Meesho's "Product Details" table prints a SUB-ORDER ID per item,
    // e.g. "295249080434038976_1". When one order has multiple items,
    // each item gets its own label sharing the same base number but a
    // different "_N" suffix — this MUST be used (in full, suffix
    // included) as the unique key, or every item on a multi-item order
    // collapses into one "duplicate" record.
    const { id: orderId, candidate } = findMeeshoOrderId(page);
    if (!orderId) {
      parseLog.push({
        page: pageNum,
        status: 'skipped',
        reason: candidate
          ? `Found "${candidate}" but it does not match the strict Meesho Sub-Order ID format (15-20 digits + "_" + item no.) — rejected`
          : 'No Meesho Sub-Order ID / Order No. found on this page',
        orderId: null,
      });
      continue;
    }

    if (orders.find((o) => o.orderId === orderId)) {
      parseLog.push({ page: pageNum, status: 'duplicate', reason: `Duplicate Order ID: ${orderId}`, orderId });
      continue;
    }

    // AWB — courier signature (Shadowfax "SF...FPL", etc.) or a
    // keyword-anchored numeric tracking number only.
    const awb = extractAwbStrict(page);

    // ── Customer name + full address ──────────────────────────────
    // Both come from the same "Customer Address" block: heading, then the
    // recipient's name as the first surviving line, then street/locality/
    // city/pincode lines. (The previous regex's character class included
    // `\s`, which also matches newlines — on this two-column label that let
    // the match cross the line break and swallow the courier name on the
    // next line too, e.g. "Vijay s/o Vijayakandipan\nDelhivery". Pulling
    // name+address from one cleaned, noise-filtered block instead of two
    // separate fragile regexes fixes both issues at once.)
    const blockM =
      page.match(/Customer\s+Address\b[^\n]*\n([\s\S]*?)(?:\n\s*If\s+undelivered)/i) ||
      page.match(/Customer\s+Address\b[^\n]*\n((?:[^\n]+\n){1,7}[^\n]+)/i) ||
      page.match(/BILL\s+TO\s*\/\s*SHIP\s+TO\b[^\n]*\n([\s\S]*?)(?:\n\s*If\s+undelivered)/i);

    let customer = '';
    let address  = '';
    if (blockM) {
      const lines = meeshoCleanLines(blockM[1]);
      if (lines.length) {
        customer = clean(lines[0]);
        address  = clean(lines.slice(1).join(', '));
      }
    }
    // An explicit "Customer Name:" / "Buyer Name:" label, when present,
    // is more reliable than the positional first-line guess above.
    const nameLabelM = page.match(/(?:Customer\s+Name|Buyer\s+Name)\s*[:\-]\s*([A-Za-z][A-Za-z .,'\/\-]{1,60})(?=\n|$)/i);
    if (nameLabelM) customer = clean(nameLabelM[1]);
    if (!customer) customer = 'Customer';

    const phoneM = page.match(/(?:Ph|Phone|Mob|Mobile|Contact)\s*[:\.]?\s*(\+?[\d\s\-]{10,14})/i)
                || page.match(/\b([6-9]\d{9})\b/);
    const phone = phoneM ? phoneM[1].replace(/\s+/g, '').trim() : '';

    let skuM =
      page.match(/\bSKU\b[^\n]*\n([^\n]{3,80}?)(?:\s+Free\s+Size|\s+\d+\s+NA|\n|$)/i);
    if (!skuM)
      skuM = page.match(/\bSKU\b[\s\S]{0,40}?([A-Za-z][A-Za-z0-9 ]{3,60}?)\s+Free\s+Size/i);
    if (!skuM)
      skuM = page.match(/\bSKU\s+([A-Za-z][A-Za-z0-9 ]{3,60}?)(?:\s{2,}|\n|$)/i);
    let sku = skuM ? clean(skuM[1]) : 'Meesho-Product';

    const isCOD  = /COD\s*:\s*Check/i.test(page) || /\bCOD\b/.test(page);
    const payment = isCOD ? 'COD' : 'Prepaid';

    let amount = 0;
    const totalRowM = page.match(/\bTotal\b((?:\s+Rs\.[\d,.]+)+)/i);
    if (totalRowM) {
      const allVals = [...totalRowM[1].matchAll(/Rs\.(\d[\d,.]+)/g)];
      if (allVals.length) amount = parseFloat(allVals[allVals.length - 1][1].replace(/,/g, ''));
    }
    if (!amount) {
      const rs = [...page.matchAll(/Rs\.([\d]+[\d,.]*)/g)];
      if (rs.length) amount = parseFloat(rs[rs.length - 1][1].replace(/,/g, ''));
    }

    const dateM = page.match(/Order\s+Date\s*\n\s*([\d]{2}\.[\d]{2}\.[\d]{4})/i) ||
                  page.match(/Order\s+Date\s+([\d]{2}\.[\d]{2}\.[\d]{4})/i) ||
                  page.match(/([\d]{2}\.[\d]{2}\.[\d]{4})/);
    const orderDate = dateM ? normalizeDate(dateM[1]) : today();

    const invM    = page.match(/Invoice\s+No\.?\s*\n\s*([\w\d]+)/i);
    const invoice = invM ? invM[1].trim() : '';

    const isExchange = detectExchange(page);

    // ── Multi-company detection (see COMPANIES / detectCompany() above) ──
    const companyMatch = detectCompany(page);

    // ── Courier / logistics-partner detection (see COURIERS /
    // CHANNEL_DEFAULT_COURIER above) ──
    // Meesho is the platform that actually varies courier-to-courier
    // (Shadowfax, Delhivery, Xpressbees, …), which is exactly why real
    // per-label detection stays the primary signal here too — the
    // configured Delhivery default only fills in on the rare label
    // that names no courier at all.
    const courierMatch = resolveCourier(page, awb, 'Meesho');

    // ── Quantity extraction (see extractMeeshoQty / extractQty above) ──
    let { quantity, found: qtyFound } = extractMeeshoQty(page);
    if (!qtyFound) ({ quantity, found: qtyFound } = extractQty(page));

    const reasonParts = [];
    if (!companyMatch) reasonParts.push('Seller/company name on this label did not match any entry in COMPANIES — set to "Unknown"');
    if (!qtyFound) reasonParts.push('Quantity ("QTY") not found on this label — defaulted to 1');
    if (!awb) reasonParts.push('AWB not extracted — order will need AWB scanned manually at dispatch');

    parseLog.push({
      page: pageNum,
      status: 'ok',
      reason: reasonParts.join('; '),
      orderId,
      awb: awb || null,
    });
    orders.push({
      orderId, awb, invoice, customer, phone, address,
      sku, channel: 'Meesho', payment, amount, orderDate, quantity,
      orderType: isExchange ? 'Exchange' : 'Regular',
      company: companyMatch ? companyMatch.name : 'Unknown',
      companyId: companyMatch ? companyMatch.id : 'unknown',
      courier: courierMatch ? courierMatch.name : 'Unknown',
      courierId: courierMatch ? courierMatch.id : 'unknown',
    });
  }
  return { orders, parseLog };
}

// ============================================================
// REPEAT-RETURNER DETECTION (order-history based)
// ============================================================
// This is distinct from the manual Fraud Blocklist (checkFraud above,
// which matches against entries a user explicitly added). This instead
// looks at the order history itself: if the same customer name or the
// same delivery address shows up across several orders AND a high
// proportion of those orders ended up as a return ('In Transit (Return)'
// or 'Return Received'), that's a basic, automatic risk signal worth
// surfacing — independent of whether anyone has manually blocklisted
// them yet. Both `customer` and `address` are still read here (and kept
// in the stored order record) even though the Sales table UI no longer
// displays the raw address column — this is exactly the "background"
// fraud-analysis use case the address/name fields exist for.
//
// Returns a Map<order.id, info> where info = {
//   matchedOn: 'name' | 'address', key, totalOrders, returnedOrders, returnRate
// }
// A given order can appear via either match type; if it qualifies under
// both, the higher-risk (higher returnRate) info is kept.
export function detectRepeatReturners(orders, opts = {}) {
  const MIN_ORDERS     = opts.minOrders     ?? 3;     // need a few orders before judging a pattern
  const RATE_THRESHOLD = opts.rateThreshold ?? 0.4;    // 40%+ returned/RTO = flagged as high risk

  const isReturn = (o) => o.status === 'In Transit (Return)' || o.status === 'Return Received';
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const active = (orders || []).filter((o) => !o.deleted);
  const byName = new Map();
  const byAddr = new Map();

  active.forEach((o) => {
    const nc = norm(o.customer);
    const na = norm(o.address);
    if (nc) { if (!byName.has(nc)) byName.set(nc, []); byName.get(nc).push(o); }
    if (na && na.length > 8) { if (!byAddr.has(na)) byAddr.set(na, []); byAddr.get(na).push(o); }
  });

  const result = new Map();

  function evaluate(groups, matchedOn) {
    groups.forEach((group, key) => {
      if (group.length < MIN_ORDERS) return;
      const returnedOrders = group.filter(isReturn).length;
      const returnRate = returnedOrders / group.length;
      if (returnRate < RATE_THRESHOLD) return;
      const info = { matchedOn, key, totalOrders: group.length, returnedOrders, returnRate };
      group.forEach((o) => {
        const existing = result.get(o.id);
        if (!existing || info.returnRate > existing.returnRate) result.set(o.id, info);
      });
    });
  }

  evaluate(byName, 'name');
  evaluate(byAddr, 'address');

  return result;
}

// Short, human-readable label for the warning badge / tooltip
export function repeatReturnerLabel(info) {
  if (!info) return '';
  const pct = Math.round(info.returnRate * 100);
  const basis = info.matchedOn === 'address' ? 'this address' : 'this customer name';
  return `⚠️ ${info.returnedOrders}/${info.totalOrders} orders (${pct}%) returned for ${basis}`;
}

// ============================================================
// COURIER-WISE ANALYTICS  (Platform → Courier → Status counts)
// ============================================================
// The actual lifecycle this app tracks per order (see Dispatch.jsx /
// Returns.jsx / Received.jsx) is the `status` field below — there is no
// separate raw "Pickup/Scan" event log, so the breakdown groups by these
// real, already-tracked stages rather than inventing stages the data
// doesn't actually have:
//   Ready to Ship        → picked, not yet scanned out
//   Dispatched            → scanned & handed to the courier
//   In Transit (Return)   → courier has it moving back to you
//   Return Received       → back in stock
export const ORDER_STATUSES = ['Ready to Ship', 'Dispatched', 'In Transit (Return)', 'Return Received'];

// Builds { [channel]: { [courier]: { [status]: count, total } } } from
// whatever `channel`/`courier`/`status` values actually appear on the
// orders — NOT from a hardcoded list of platforms or couriers. This is
// what makes the breakdown scale automatically: a brand-new courier (or
// even a brand-new sales channel) that shows up on a freshly-parsed
// order appears here on the next render with zero code changes, because
// the grouping key comes from the data, not from a switch/case.
// Registering a courier in COURIERS (above) only affects how confidently
// it gets *detected* during parsing — it is never required for it to
// show up here.
export function buildCourierBreakdown(orders) {
  const active = (orders || []).filter((o) => !o.deleted);
  const tree = {};
  for (const o of active) {
    const channel = o.channel || 'Unknown';
    const courier = o.courier || 'Unknown';
    const status  = o.status  || 'Ready to Ship';
    if (!tree[channel]) tree[channel] = {};
    if (!tree[channel][courier]) tree[channel][courier] = { total: 0 };
    const bucket = tree[channel][courier];
    bucket[status] = (bucket[status] || 0) + 1;
    bucket.total += 1;
  }
  return tree;
}

// Flattens buildCourierBreakdown()'s nested tree into rows — the literal
// [Platform] -> [Courier] -> [Status: count] shape, ready for a table or
// for export. Never throws on a partner with no rows for a given status;
// missing statuses simply read as 0.
export function flattenCourierBreakdown(orders) {
  const tree = buildCourierBreakdown(orders);
  const rows = [];
  for (const channel of Object.keys(tree)) {
    for (const courier of Object.keys(tree[channel])) {
      const bucket = tree[channel][courier];
      rows.push({
        channel,
        courier,
        total: bucket.total,
        byStatus: ORDER_STATUSES.reduce((acc, s) => { acc[s] = bucket[s] || 0; return acc; }, {}),
      });
    }
  }
  return rows.sort((a, b) => b.total - a.total);
}
