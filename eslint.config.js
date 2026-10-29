import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  /**
   * A `const` read above its own declaration is hoisted but NOT initialised, so
   * it throws "Cannot access X before initialization" AT RUNTIME while passing
   * lint and building fine. That shape crashed the Algo Trade tab twice.
   *
   * SCOPED to the live-trading screens rather than applied project-wide: across
   * the whole of src it flags ~75 more places, nearly all of them a read inside
   * a nested function, which runs long after the module has evaluated and is
   * therefore safe. Clearing those would mean reordering working code in
   * StrategyBuilder and PortfolioBacktestResults for no safety gain -- churn
   * with its own risk. Here the count is already zero, so the rule costs
   * nothing and catches the next real one.
   *
   * Widen this list as other areas are cleaned up.
   */
  {
    files: [
      'src/components/AlgoTrade.jsx',
      'src/components/algotrade/**/*.{js,jsx}',
      'src/services/live*.{js,jsx}',
    ],
    rules: {
      'no-use-before-define': ['error', {
        functions: false,
        classes: false,
        variables: true,
        allowNamedExports: true,
      }],
    },
  },
])
