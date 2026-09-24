/**
 * The tags on one place, and the two taps it takes to add another.
 *
 * The four suggested labels are buttons because they are what a teacher
 * reaches for nine times in ten, and a halaqa is not a place to be typing.
 * The free field is there because the tenth time matters — «يحتاج تسميعًا
 * بطيئًا» is a real thing to say about a boy and we did not think of it.
 */

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { MAX_TAG_LENGTH, SUGGESTED_TAGS, addTag, removeTag } from '@/lib/place-tags';

interface Props {
  /** The place, in the canonical scheme — see `place-tags`. */
  anchorId: number;
  tags: string[];
  onChange: () => void;
  /** A report is read, not edited; the reader is where tags are put on. */
  readOnly?: boolean;
}

export const PlaceTagRow: React.FC<Props> = ({ anchorId, tags, onChange, readOnly }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const add = (label: string) => {
    addTag(anchorId, label);
    setText('');
    setOpen(false);
    onChange();
  };

  if (readOnly && !tags.length) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-tags={anchorId}>
      {tags.map(tag => (
        <span
          key={tag}
          data-tag={tag}
          className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:text-violet-300"
        >
          {tag}
          {!readOnly && (
            <button
              type="button"
              data-remove-tag
              onClick={() => { removeTag(anchorId, tag); onChange(); }}
              aria-label={`${t('recDelete')} — ${tag}`}
              className="opacity-60 hover:opacity-100"
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}

      {!readOnly && !open && (
        <button
          type="button"
          data-add-tag
          onClick={() => setOpen(true)}
          aria-label={t('recAddTag')}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
        >
          <Plus size={10} />
          {t('recTags')}
        </button>
      )}

      {!readOnly && open && (
        <div className="mt-1 flex w-full flex-wrap items-center gap-1" data-tag-picker>
          {/* The common case, one tap — and a tag already on stays off the row. */}
          {SUGGESTED_TAGS.filter(s => !tags.includes(s)).map(s => (
            <button
              key={s}
              type="button"
              data-suggested={s}
              onClick={() => add(s)}
              className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-800 hover:bg-violet-500/20 dark:text-violet-300"
            >
              {s}
            </button>
          ))}
          <input
            data-tag-input
            autoFocus
            value={text}
            maxLength={MAX_TAG_LENGTH}
            placeholder={t('recTagPlaceholder')}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') add(text);
              if (e.key === 'Escape') { setOpen(false); setText(''); }
            }}
            className="w-28 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-foreground"
          />
        </div>
      )}
    </div>
  );
};

export default PlaceTagRow;
