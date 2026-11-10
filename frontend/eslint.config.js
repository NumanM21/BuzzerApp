import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// ---------------------------------------------------------------------------------------------------------------
// Layer rules (docs/FrontendSteps.md, "Architecture: MVVM with MobX"). Each layer lists the imports it must not
// make, so a wrong dependency fails `npm run lint`. `regex` is matched against the import path; `typesOnly`
// still allows `import type`, which disappears from the built code.
// ---------------------------------------------------------------------------------------------------------------

function forbid(regex, message, { typesOnly = false } = {}) {
  return { regex, message, allowTypeImports: typesOnly };
}

const react = forbid('^(react|react-dom)(/|$)', 'This layer has no React: keep it a plain class or function.');
const mobxReact = forbid('^mobx-react-lite$', 'Only views and components use mobx-react-lite.');
const mobx = forbid('^mobx$', 'Services and domain rules stay free of MobX: state lives in stores and view models.');
const fluent = forbid('^@fluentui/', 'Fluent UI belongs in views, components and the theme.');
const router = forbid('^react-router', 'Routing belongs in app/ and views; a view model exposes intent instead.');

function folders(names, message, options) {
  return forbid(`^@/(${names.join('|')})/`, message, options);
}

// Every source file: cross-folder imports go through `@/`, so the layer rules below can't be bypassed with
// `../../`, and only tests use the test support folder.
const shared = [
  forbid('^\\.\\./', 'Import from another folder with the @/ alias (inside a folder use ./).'),
  folders(['test'], 'src/test/ is for tests only.'),
];

function restrictImports(...patterns) {
  return { '@typescript-eslint/no-restricted-imports': ['error', { patterns: [...shared, ...patterns] }] };
}

// View models, stores, MVVM helpers and domain rules run in tests without a browser.
const noDom = {
  'no-restricted-globals': [
    'error',
    ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location'].map((name) => ({
      name,
      message: 'No DOM here: take what you need through the constructor so a test can pass a fake.',
    })),
  ],
};

const layers = [
  {
    name: 'layer/domain',
    files: ['src/domain/**/*.ts'],
    rules: {
      ...restrictImports(forbid('^(?!\\./|@/domain/)', 'Domain code imports only other domain files.')),
      ...noDom,
    },
  },
  {
    name: 'layer/services',
    files: ['src/api/**/*.ts', 'src/realtime/**/*.ts'],
    rules: restrictImports(
      react,
      mobxReact,
      mobx,
      fluent,
      router,
      folders(
        ['stores', 'features', 'components', 'theme', 'app', 'mvvm'],
        'Services know nothing about the UI; they may import domain/ only.',
      ),
    ),
  },
  {
    name: 'layer/mvvm',
    files: ['src/mvvm/**/*.ts'],
    rules: {
      ...restrictImports(
        react,
        mobxReact,
        fluent,
        router,
        folders(['stores', 'features', 'components', 'theme', 'app', 'realtime'], 'MVVM helpers stand alone.'),
        folders(['api'], 'MVVM helpers may use API types only.', { typesOnly: true }),
      ),
      ...noDom,
    },
  },
  {
    name: 'layer/stores',
    files: ['src/stores/**/*.ts'],
    rules: {
      ...restrictImports(
        react,
        mobxReact,
        fluent,
        router,
        folders(['theme', 'features', 'components', 'app'], 'Stores hold server data and know nothing of screens.'),
      ),
      ...noDom,
    },
  },
  {
    // In a feature folder, a .ts file is a view model (or its helpers) and a .tsx file is a view.
    name: 'layer/view-models',
    files: ['src/features/**/*.ts'],
    rules: {
      ...restrictImports(
        react,
        mobxReact,
        fluent,
        router,
        folders(['theme', 'components', 'app'], 'A view model exposes meaning; the view and theme decide the look.'),
        folders(['api', 'realtime'], 'A view model talks to stores; it may use API and realtime types only.', {
          typesOnly: true,
        }),
      ),
      ...noDom,
    },
  },
  {
    name: 'layer/views',
    files: ['src/features/**/*.tsx'],
    rules: restrictImports(
      folders(['api', 'realtime', 'stores', 'mvvm'], 'A view goes through its view model (types are fine).', {
        typesOnly: true,
      }),
    ),
  },
  {
    name: 'layer/components',
    files: ['src/components/**/*.{ts,tsx}'],
    rules: restrictImports(
      folders(
        ['stores', 'api', 'realtime', 'features', 'app', 'mvvm'],
        'Components are presentational: props in, events out.',
      ),
      folders(['domain'], 'Components may use domain types only.', { typesOnly: true }),
    ),
  },
  {
    name: 'layer/theme',
    files: ['src/theme/**/*.{ts,tsx}'],
    rules: restrictImports(
      folders(
        ['stores', 'api', 'realtime', 'features', 'app', 'components', 'mvvm'],
        'The theme is style and data only.',
      ),
      folders(['domain'], 'The theme may use domain types only.', { typesOnly: true }),
    ),
  },
  {
    // app/ is the composition root and may import everything; only the shared rules apply.
    name: 'layer/app',
    files: ['src/app/**/*.{ts,tsx}', 'src/main.tsx'],
    rules: restrictImports(),
  },
  {
    // Tests and test support may import anything (they build the real thing with fakes), but still use `@/`.
    // Fast Refresh doesn't apply to them.
    name: 'layer/tests',
    files: ['src/test/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [shared[0]] }],
      'no-restricted-globals': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
];

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // The Vite preset's options, plus: `observer(...)` returns a component, like `memo(...)`.
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowCompoundComponents: true, extraHOCs: ['observer'] },
      ],
    },
  },
  ...layers,
]);
