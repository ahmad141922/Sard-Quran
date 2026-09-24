import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { countryByCode, countryName, searchCountries, type Country } from '@/lib/countries';
import { useI18n } from '@/hooks/useI18n';

/**
 * A country field you can type into.
 *
 * A `<select>` of seventy-five entries is a scroll, and the browser's own
 * type-ahead only matches from the first letter — useless for someone who
 * knows the country as «الامارات» when the list says «الإمارات». So this is a
 * button that opens a filtered list, and the filter forgives the hamza, the
 * taa marbuta, the alif maqsura and the «ال» (see `foldArabic`). Typing digits
 * searches the dialling code instead, which is how someone who knows +966 but
 * not the spelling finds Saudi Arabia.
 *
 * Closes on Escape, on a click outside, and on choosing — and returns focus to
 * the button, so a keyboard never loses its place.
 */
interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

const CountryPicker: React.FC<Props> = ({ id, label, value, onChange, className }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const chosen = countryByCode(value);
  const results = useMemo(() => searchCountries(query), [query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (c: Country) => {
    onChange(c.code);
    setOpen(false);
    setQuery('');
    buttonRef.current?.focus();
  };

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex w-full items-center justify-between gap-2 rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all focus:border-primary focus:ring-2"
      >
        <span className={chosen ? 'font-bold' : 'text-muted-foreground'}>
          {chosen ? `${countryName(chosen)} ‎+${chosen.dial}` : t('recChooseCountry')}
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                // One result and a press of Enter is the whole interaction for
                // someone who typed «مصر» or «966».
                if (e.key === 'Enter' && results.length) { e.preventDefault(); choose(results[0]); }
              }}
              placeholder={t('recSearchCountry')}
              aria-label={t('recSearchCountryLabel')}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul role="listbox" aria-label={label} className="max-h-56 overflow-y-auto py-1">
            {results.map(c => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => choose(c)}
                  role="option"
                  aria-selected={c.code === value}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-accent ${
                    c.code === value ? 'font-bold text-primary' : 'text-foreground'
                  }`}
                >
                  <span>{countryName(c)}</span>
                  <span className="flex items-center gap-2">
                    <span dir="ltr" className="text-xs tabular-nums text-muted-foreground">+{c.dial}</span>
                    {c.code === value && <Check size={14} aria-hidden />}
                  </span>
                </button>
              </li>
            ))}
            {!results.length && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t('recNoCountryMatch')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CountryPicker;
