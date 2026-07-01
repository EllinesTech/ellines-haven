import { useState, useRef, useEffect } from 'react';
import { useEditMode } from '../context/EditModeContext';

/**
 * EditableField — wraps any piece of text so admins can click-to-edit inline.
 *
 * Props:
 *   field     — Firestore field key  (e.g. "hero_sub")
 *   children  — the actual rendered text (used as fallback + display value)
 *   tag       — HTML tag to render when not editing (default: 'span')
 *   multiline — use textarea instead of input
 *   className / style — passed through to the wrapper
 */
export default function EditableField({ field, children, tag: Tag = 'span', multiline = false, className, style }) {
  const { editMode, pageData, updateField } = useEditMode() || {};
  const [active, setActive] = useState(false);
  const [draft,  setDraft]  = useState('');
  const inputRef = useRef(null);

  // Value = whatever admin has typed, falling back to children
  const value = (editMode && pageData && field in pageData) ? pageData[field] : (children ?? '');

  useEffect(() => {
    if (active && inputRef.current) inputRef.current.focus();
  }, [active]);

  if (!editMode) {
    return <Tag className={className} style={style}>{value}</Tag>;
  }

  if (active) {
    const commonStyle = {
      width: '100%', background: 'rgba(201,168,76,0.08)',
      border: '2px solid var(--gold, #c9a84c)', borderRadius: 4,
      color: 'inherit', padding: '4px 8px', fontSize: 'inherit',
      fontFamily: 'inherit', lineHeight: 'inherit', resize: 'vertical',
      outline: 'none', boxSizing: 'border-box', display: 'block',
    };
    return (
      <span className={className} style={{ ...style, display: 'inline-block', width: '100%', position: 'relative' }}>
        {multiline
          ? <textarea ref={inputRef} value={draft} rows={3} style={commonStyle}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { updateField(field, draft); setActive(false); }}
              onKeyDown={e => { if (e.key === 'Escape') { setActive(false); } }} />
          : <input ref={inputRef} type="text" value={draft} style={commonStyle}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { updateField(field, draft); setActive(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { updateField(field, draft); setActive(false); }
                if (e.key === 'Escape') { setActive(false); }
              }} />
        }
      </span>
    );
  }

  return (
    <Tag
      className={className}
      style={{
        ...style,
        outline: '2px dashed rgba(201,168,76,0.5)',
        outlineOffset: 2,
        cursor: 'text',
        borderRadius: 3,
        position: 'relative',
        minWidth: 20,
        minHeight: '1em',
        display: Tag === 'span' ? 'inline-block' : undefined,
      }}
      title={`Edit: ${field}`}
      onClick={() => { setDraft(String(value)); setActive(true); }}
    >
      {value || <em style={{ opacity: 0.4, fontSize: '0.85em' }}>Click to edit…</em>}
      <span style={{
        position: 'absolute', top: -10, right: -2,
        background: 'var(--gold, #c9a84c)', color: '#000',
        fontSize: '0.55rem', fontWeight: 700, padding: '1px 4px',
        borderRadius: 3, pointerEvents: 'none', lineHeight: 1.4,
        letterSpacing: 0.3, whiteSpace: 'nowrap',
      }}>✏️ {field}</span>
    </Tag>
  );
}
