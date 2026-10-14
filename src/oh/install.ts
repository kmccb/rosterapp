/*
 * What "Add to Home Screen" picks up on a paying school's page.
 *
 * scripts/paid-apps.mjs writes /oh/apps/<slug>/ at build time: a manifest that
 * names the school and opens on its page, and icons cut from its crest. This
 * puts the links to them in the document head while that school is on screen,
 * and takes them out again when it is not — the directory itself, and every
 * school that does not pay, has none, exactly as before.
 *
 * Android reads the manifest; an iPhone ignores manifests for this and reads
 * the apple-touch-icon link and the title meta instead, so both are set.
 */

type Tag = { el: HTMLElement; created: boolean; previous: string | null; attr: string };

const put = (selector: string, make: () => HTMLElement, attr: string, value: string): Tag => {
  const found = document.head.querySelector<HTMLElement>(selector);
  const el = found ?? make();
  const tag = { el, created: !found, previous: found ? el.getAttribute(attr) : null, attr };
  el.setAttribute(attr, value);
  if (!found) document.head.appendChild(el);
  return tag;
};

const link = (rel: string) => () => {
  const el = document.createElement('link');
  el.rel = rel;
  return el;
};

const meta = (name: string) => () => {
  const el = document.createElement('meta');
  el.name = name;
  return el;
};

/** Links the school's app in; returns what puts the head back as it was. */
export function installAs(slug: string, name: string, ground: string | null): () => void {
  const base = `/oh/apps/${slug}/`;
  const tags: Tag[] = [
    put('link[rel="manifest"]', link('manifest'), 'href', `${base}manifest.webmanifest`),
    put('link[rel="apple-touch-icon"]', link('apple-touch-icon'), 'href', `${base}apple-touch-icon.png`),
    put('meta[name="apple-mobile-web-app-title"]', meta('apple-mobile-web-app-title'), 'content', name),
    put('meta[name="apple-mobile-web-app-capable"]', meta('apple-mobile-web-app-capable'), 'content', 'yes'),
    put('meta[name="mobile-web-app-capable"]', meta('mobile-web-app-capable'), 'content', 'yes'),
  ];
  if (ground) tags.push(put('meta[name="theme-color"]', meta('theme-color'), 'content', ground));

  return () => {
    for (const t of tags) {
      if (t.created) t.el.remove();
      else if (t.previous === null) t.el.removeAttribute(t.attr);
      else t.el.setAttribute(t.attr, t.previous);
    }
  };
}
