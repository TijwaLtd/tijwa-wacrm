/**
 * Currency — single source of truth for deal-value formatting and
 * the currency picker options.
 *
 * Uses `Intl.supportedValuesOf('currency')` at runtime to get the
 * full ISO-4217 list, with `Intl.DisplayNames` for localized labels.
 * Falls back to a hardcoded top-50 list in environments that don't
 * support these APIs (very rare — all modern browsers + Node 18+ do).
 *
 * The picker sorts currencies by the user's locale so locally-relevant
 * ones float to the top. KES is the default for this app.
 */

/** App-wide fallback when no account/deal currency is available. */
export const DEFAULT_CURRENCY = "KES";

export interface CurrencyOption {
  /** ISO-4217 code, e.g. "USD". Stored verbatim in the DB. */
  code: string;
  /** Human label for the dropdown, e.g. "US Dollar". */
  label: string;
  /** Symbol for compact display, e.g. "$". */
  symbol: string;
}

/**
 * Hardcoded fallback — the most commonly used currencies worldwide.
 * Used when `Intl.supportedValuesOf` is unavailable (very rare).
 * KES is first so it appears at the top by default.
 */
const FALLBACK_CURRENCIES: CurrencyOption[] = [
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "MXN", label: "Mexican Peso", symbol: "$" },
  { code: "COP", label: "Colombian Peso", symbol: "$" },
  { code: "CHF", label: "Swiss Franc", symbol: "Fr" },
  { code: "SEK", label: "Swedish Krona", symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", label: "Danish Krone", symbol: "kr" },
  { code: "PLN", label: "Polish Zloty", symbol: "zł" },
  { code: "CZK", label: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", label: "Hungarian Forint", symbol: "Ft" },
  { code: "TRY", label: "Turkish Lira", symbol: "₺" },
  { code: "RUB", label: "Russian Ruble", symbol: "₽" },
  { code: "HKD", label: "Hong Kong Dollar", symbol: "HK$" },
  { code: "TWD", label: "Taiwan Dollar", symbol: "NT$" },
  { code: "THB", label: "Thai Baht", symbol: "฿" },
  { code: "MYR", label: "Malaysian Ringgit", symbol: "RM" },
  { code: "IDR", label: "Indonesian Rupiah", symbol: "Rp" },
  { code: "PHP", label: "Philippine Peso", symbol: "₱" },
  { code: "VND", label: "Vietnamese Dong", symbol: "₫" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", label: "Bangladeshi Taka", symbol: "৳" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "TZS", label: "Tanzanian Shilling", symbol: "TSh" },
  { code: "UGX", label: "Ugandan Shilling", symbol: "USh" },
  { code: "RWF", label: "Rwandan Franc", symbol: "FRw" },
  { code: "ETB", label: "Ethiopian Birr", symbol: "Br" },
  { code: "MAD", label: "Moroccan Dirham", symbol: "MAD" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", label: "Qatari Riyal", symbol: "QR" },
  { code: "KWD", label: "Kuwaiti Dinar", symbol: "KD" },
  { code: "BHD", label: "Bahraini Dinar", symbol: "BD" },
  { code: "OMR", label: "Omani Rial", symbol: "OMR" },
  { code: "JOD", label: "Jordanian Dinar", symbol: "JD" },
  { code: "ILS", label: "Israeli Shekel", symbol: "₪" },
  { code: "CLP", label: "Chilean Peso", symbol: "$" },
  { code: "PEN", label: "Peruvian Sol", symbol: "S/" },
  { code: "ARS", label: "Argentine Peso", symbol: "$" },
  { code: "UYU", label: "Uruguayan Peso", symbol: "$U" },
  { code: "PYG", label: "Paraguayan Guarani", symbol: "₲" },
  { code: "BOB", label: "Bolivian Boliviano", symbol: "Bs" },
  { code: "GTQ", label: "Guatemalan Quetzal", symbol: "Q" },
  { code: "HNL", label: "Honduran Lempira", symbol: "L" },
  { code: "NIO", label: "Nicaraguan Cordoba", symbol: "C$" },
  { code: "CRC", label: "Costa Rican Colon", symbol: "₡" },
  { code: "JMD", label: "Jamaican Dollar", symbol: "J$" },
  { code: "TTD", label: "Trinidad Dollar", symbol: "TT$" },
  { code: "DOP", label: "Dominican Peso", symbol: "RD$" },
  { code: "BTN", label: "Bhutanese Ngultrum", symbol: "Nu" },
  { code: "MNT", label: "Mongolian Tugrik", symbol: "₮" },
  { code: "KHR", label: "Cambodian Riel", symbol: "៛" },
  { code: "LAK", label: "Lao Kip", symbol: "₭" },
  { code: "MMK", label: "Myanmar Kyat", symbol: "K" },
  { code: "NPR", label: "Nepalese Rupee", symbol: "₨" },
  { code: "AFN", label: "Afghan Afghani", symbol: "؋" },
  { code: "IQD", label: "Iraqi Dinar", symbol: "ع.د" },
  { code: "IRR", label: "Iranian Rial", symbol: "﷼" },
  { code: "ALL", label: "Albanian Lek", symbol: "L" },
  { code: "BGN", label: "Bulgarian Lev", symbol: "лв" },
  { code: "RSD", label: "Serbian Dinar", symbol: "din" },
  { code: "BAM", label: "Bosnia Mark", symbol: "KM" },
  { code: "MKD", label: "Macedonian Denar", symbol: "ден" },
  { code: "MDL", label: "Moldovan Leu", symbol: "L" },
  { code: "GEL", label: "Georgian Lari", symbol: "₾" },
  { code: "AMD", label: "Armenian Dram", symbol: "֏" },
  { code: "AZN", label: "Azerbaijani Manat", symbol: "₼" },
  { code: "KZT", label: "Kazakhstani Tenge", symbol: "₸" },
  { code: "UZS", label: "Uzbekistani Som", symbol: "сўм" },
  { code: "MUR", label: "Mauritian Rupee", symbol: "₨" },
  { code: "BWP", label: "Botswana Pula", symbol: "P" },
  { code: "NAD", label: "Namibian Dollar", symbol: "N$" },
  { code: "MWK", label: "Malawian Kwacha", symbol: "MK" },
  { code: "ZMW", label: "Zambian Kwacha", symbol: "ZK" },
  { code: "BIF", label: "Burundian Franc", symbol: "FBu" },
  { code: "SOS", label: "Somali Shilling", symbol: "Sh" },
  { code: "CDF", label: "Congolese Franc", symbol: "FC" },
  { code: "XAF", label: "CFA Franc BEAC", symbol: "FCFA" },
  { code: "XOF", label: "CFA Franc BCEAO", symbol: "CFA" },
  { code: "XPF", label: "CFP Franc", symbol: "₣" },
  { code: "ISK", label: "Icelandic Krona", symbol: "kr" },
  { code: "LVL", label: "Latvian Lats", symbol: "Ls" },
  { code: "LTL", label: "Lithuanian Litas", symbol: "Lt" },
  { code: "EEK", label: "Estonian Kroon", symbol: "kr" },
];

/**
 * Get the symbol for a currency code using `Intl.NumberFormat`.
 * Falls back to the code itself if Intl can't resolve it.
 */
function getSymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency");
    return sym?.value ?? code;
  } catch {
    return code;
  }
}

/**
 * Build the full currency list, sorted by the user's locale.
 *
 * 1. If `Intl.supportedValuesOf` is available, use it for the
 *    complete ISO-4217 list.
 * 2. Use `Intl.DisplayNames` to get localized labels.
 * 3. Sort alphabetically by label (locale-aware).
 * 4. Always pin KES to the top as the app default.
 */
function buildCurrencyList(): CurrencyOption[] {
  let codes: string[];

  try {
    codes = Intl.supportedValuesOf("currency");
  } catch {
    // Very rare fallback — only for ancient runtimes
    codes = FALLBACK_CURRENCIES.map((c) => c.code);
  }

  // Localized currency names via Intl.DisplayNames
  let displayNames: Intl.DisplayNames | null = null;
  try {
    const lang = typeof navigator !== "undefined" ? navigator.language : "en";
    displayNames = new Intl.DisplayNames([lang], { type: "currency" });
  } catch {
    // ignore — we'll use the code as label
  }

  const list: CurrencyOption[] = codes.map((code) => ({
    code,
    label: displayNames?.of(code) ?? code,
    symbol: getSymbol(code),
  }));

  // Sort: locale-aware alphabetical by label
  const lang = typeof navigator !== "undefined" ? navigator.language : "en";
  const collator = new Intl.Collator(lang, { sensitivity: "base" });
  list.sort((a, b) => collator.compare(a.label, b.label));

  // Pin KES to the top
  const kesIdx = list.findIndex((c) => c.code === "KES");
  if (kesIdx > 0) {
    const [kes] = list.splice(kesIdx, 1);
    list.unshift(kes);
  }

  return list;
}

// Lazily-initialized currency list. Built once on first access.
let _cache: CurrencyOption[] | null = null;

/**
 * Get the full currency list. Lazily built on first call, then cached.
 * Safe to call from both SSR and client — `navigator` is only read
 * inside `buildCurrencyList()` and falls back to "en" on the server.
 */
export function getCurrencies(): CurrencyOption[] {
  if (!_cache) _cache = buildCurrencyList();
  return _cache;
}

/**
 * @deprecated Use `getCurrencies()` instead. This is kept for backward
 * compatibility with existing components that import `CURRENCIES`.
 * Returns a snapshot — call `getCurrencies()` for a fresh reference.
 */
export const CURRENCIES = getCurrencies();

/**
 * Format a deal value as a currency string. Whole-number output
 * (no minor units) — deal values are tracked to the dollar across
 * the app. `currency` defaults to KES so callers with nothing better
 * stay safe, but pass the account/deal currency wherever known.
 *
 * Total by design: `Intl.NumberFormat` throws a RangeError on a
 * structurally invalid currency code, and `deals.currency` carries
 * NO DB CHECK (only `accounts.default_currency` does), so legacy
 * rows, imports, or hand-edited data can hold malformed values like
 * "United States". We never let that crash a render — on a bad code
 * we fall back to "CODE 1,234".
 */
export function formatCurrency(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = (currency || DEFAULT_CURRENCY).trim();
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Invalid ISO code — show the raw code + grouped number so the
    // value is still legible instead of throwing.
    return `${code} ${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(amount)}`;
  }
}

/**
 * Compact currency for tight spaces (donut center, legend rows):
 * "KSh1.2M" / "$34.5k" / "₹900". Uses the currency's symbol from
 * the list, falling back to the code when we don't carry a symbol.
 */
export function formatCurrencyShort(
  value: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const code = currency || DEFAULT_CURRENCY;
  const opt = getCurrencies().find((c) => c.code === code);
  const symbol = opt?.symbol ?? `${code} `;
  return `${symbol}${formatCompactNumber(value)}`;
}

/**
 * Compact number for tight spaces (chart tiles, legends): 1_234 → "1.2k",
 * 1_200_000 → "1.2M", 900 → "900". The unit-less core shared with
 * {@link formatCurrencyShort}.
 */
export function formatCompactNumber(value: number): string {
  const v = Number(value || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}
