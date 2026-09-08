import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Native modules must stay out of the bundler and run in Node directly.
  serverExternalPackages: ['mongoose', '@node-rs/argon2', 'sharp'],

  typedRoutes: true,

  images: {
    // Uploads are served by src/app/api/uploads/[...path]/route.ts, not from /public.
    localPatterns: [{ pathname: '/api/uploads/**' }],
    formats: ['image/webp'],
  },

  experimental: {
    // Server Actions receive image uploads; the default 1mb body limit is too small.
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

export default withNextIntl(nextConfig);
