import js from '@eslint/js';
import next from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'storage/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.impeccable/**',
      '.agents/**',
      '.claude/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // consistent-type-imports is deliberately absent. It needs type-aware
      // linting, which means running the TypeScript program on every lint and
      // wiring a parser that overrides the one eslint-config-next installs.
      // The boundary rules below are the ones that actually prevent bugs and
      // they work without type information.
    },
  },

  // ---------------------------------------------------------------------
  // Architectural boundaries. These are not style rules; each one guards a
  // failure that is expensive to find later.
  // ---------------------------------------------------------------------

  {
    // The pricing engine is a pure function module. Letting it reach the
    // database would make every price a query and make the search page an
    // N+1, which is the exact cost the batch resolver exists to avoid.
    files: ['src/lib/pricing/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/db', '@/lib/db/*', '**/lib/db/*', 'mongoose'],
              message:
                'src/lib/pricing must stay pure. Pass data in as arguments; resolve it in rate-cards.ts or a Server Component.',
            },
          ],
        },
      ],
    },
  },

  {
    // Every date in this system is a civil date in Asia/Bangkok, carried as
    // a 'YYYY-MM-DD' string. Local Date accessors read the HOST timezone, so
    // a UTC server and a Bangkok laptop disagree about which night a booking
    // falls on. dates.ts is the single audited exception.
    files: ['src/lib/pricing/**/*.ts', 'src/lib/availability/**/*.ts'],
    ignores: ['src/lib/pricing/dates.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name=/^(getDay|getDate|getMonth|getFullYear|getHours|toLocaleDateString|toLocaleString)$/]",
          message:
            'Local Date accessors read the host timezone. Use the DateKey helpers in src/lib/pricing/dates.ts.',
        },
      ],
    },
  },

  {
    // proxy.ts runs on every request before routing. Native modules and the
    // database connection do not belong in that path.
    files: ['src/proxy.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['mongoose', '@node-rs/argon2', 'sharp', '@/lib/db', '@/lib/db/*'],
              message:
                'proxy.ts runs on every request. Keep the database and native modules out of it; resolve them in Server Components and Server Actions.',
            },
          ],
        },
      ],
    },
  },

  {
    // Components take data as props. A client component that imports a model
    // pulls Mongoose, and through it the MongoDB driver, into the browser
    // bundle. The build then fails with "Can't resolve 'tls'" pointing at
    // node_modules, which says nothing about the one import that caused it.
    files: ['src/components/**/*.ts', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/db', '@/lib/db/*', '@/lib/db/**', 'mongoose'],
              // Type-only imports are erased and cannot reach the bundle.
              allowTypeImports: true,
              message:
                'Components receive data as props. Query in a Server Component and pass the result down; shared constants belong in a dependency-free module such as @/lib/villas/constants.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  prettier,
];

export default config;
