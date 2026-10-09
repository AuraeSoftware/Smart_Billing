import { useId, useState } from 'react'

/** A password <input> with a show/hide toggle — same field, same
 * validation (`required`/`minLength` pass straight through), just visible
 * on demand instead of only as dots. */
export default function PasswordField({
  label,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  minLength?: number
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', paddingRight: 40 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          style={{
            position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
            background: 'none', border: 'none', padding: 4, margin: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-3)', cursor: 'pointer',
          }}
        >
          {visible ? (
            // Eye-off
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            // Eye
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
