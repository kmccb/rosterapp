/*
 * A school's own address.
 *
 * The directory remembers one followed school per phone, which is right for a
 * parent and useless for a gate sign: a QR code has to open one school for
 * everybody who scans it. `/oh/?school=<slug>` does that, and the short
 * addresses in public/_redirects point at it.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function schoolParam(search: string): string | null {
  const value = new URLSearchParams(search).get('school');
  return value && SLUG.test(value) ? value : null;
}

/**
 * Which school to open. A slug the directory doesn't know is a misprinted
 * link, and the reader gets what /oh/ would have shown them anyway — their own
 * school, or the picker — rather than a blank page.
 */
export function resolveLink(
  param: string | null,
  schools: { slug: string }[],
  chosen: string | null,
): string | null {
  if (param && schools.some((s) => s.slug === param)) return param;
  return chosen;
}
