// Cloudflare Pages runs this for / and nothing else (the file name is the
// route). The decision lives in src/marketing/rootVisit.ts, where it is tested.
import { MARKETING, sellsInstead } from '../src/marketing/rootVisit';

interface Context {
  request: Request;
  next: () => Promise<Response>;
}

export const onRequest = (context: Context): Promise<Response> | Response =>
  sellsInstead(new URL(context.request.url), context.request.headers)
    ? Response.redirect(MARKETING, 302)
    : context.next();
