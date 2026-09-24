import React from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

/**
 * One button, one other language.
 *
 * The Recitation tool offers Arabic and English and nothing else, so a menu
 * would be a list of one. The button says the language it switches *to* —
 * «عربي» while you are reading English — which is the only labelling a reader
 * of the other language can act on.
 */
const LangToggle: React.FC<{ className?: string; iconOnly?: boolean }> = ({ className, iconOnly }) => {
  const { lang, setLang, nextLang } = useI18n();
  const other = nextLang();
  const label = other === 'ar' ? 'عربي' : other === 'en' ? 'English' : other.toUpperCase();

  if (other === lang) return null;

  return (
    <button
      onClick={() => setLang(other)}
      data-a11y-tap
      aria-label={label}
      title={label}
      className={className ?? 'flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'}
    >
      <Languages size={16} aria-hidden />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
};

export default LangToggle;
