import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { RootCrash } from './RootCrash';

describe('ErrorBoundary', () => {
  it('turns a thrown error into the failed state', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  });

  it('draws the page until something fails, and the fallback after', () => {
    const boundary = new ErrorBoundary({ fallback: 'fallback', children: 'page' });
    expect(boundary.render()).toBe('page');
    boundary.state = { failed: true };
    expect(boundary.render()).toBe('fallback');
  });
});

describe('RootCrash', () => {
  it('offers both ways out, painted without the theme that may have caused this', () => {
    const html = renderToStaticMarkup(createElement(RootCrash));
    expect(html).toContain('Reload');
    expect(html).toContain('Clear this roster');
    expect(html).not.toContain('var(--');
    expect(html).not.toContain('class=');
  });
});
