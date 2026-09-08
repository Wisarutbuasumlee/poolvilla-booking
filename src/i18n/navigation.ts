import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware replacements for next/link and next/navigation. Importing the
// bare next/link inside the app drops the locale prefix on client navigation.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
