import { routing } from './routing';

// The [locale] segment exists twice in the app tree, once under (public) and
// once under (admin). Both root layouts re-export this so the two copies can
// never drift apart.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
