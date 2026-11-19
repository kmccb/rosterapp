import type { CSSProperties } from 'react';
import { addressAfterClear, clearThisRoster } from '../recovery';

/*
 * Fixed colours and inline styles: the theme and the stylesheet's variables may be
 * what failed, and this screen has to be readable whatever state the app is in.
 */
const page: CSSProperties = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  padding: '48px 24px',
  background: '#10141c',
  color: '#ffffff',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
};

const button: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: 320,
  margin: '12px auto 0',
  padding: '14px 16px',
  border: '1px solid #ffffff',
  borderRadius: 8,
  background: 'transparent',
  color: '#ffffff',
  font: 'inherit',
};

export function RootCrash() {
  return (
    <div role="alert" style={page}>
      <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Something went wrong</h1>
      <p style={{ margin: '0 auto 24px', maxWidth: 320, lineHeight: 1.45 }}>
        Try reloading first. If this keeps happening, clearing removes the roster, its stats and its
        badge from this phone.
      </p>
      <button type="button" style={{ ...button, background: '#ffffff', color: '#10141c' }} onClick={() => location.reload()}>
        Reload
      </button>
      <button
        type="button"
        style={button}
        onClick={() => {
          clearThisRoster();
          location.replace(addressAfterClear(location.pathname));
        }}
      >
        Clear this roster
      </button>
    </div>
  );
}
