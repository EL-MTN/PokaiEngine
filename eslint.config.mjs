import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jest from 'eslint-plugin-jest';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
	// Base JavaScript recommended configuration
	js.configs.recommended,

	// TypeScript configuration for all TS files
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: './tsconfig.json',
				ecmaVersion: 2020,
				sourceType: 'module',
			},
			globals: {
				...globals.node,
				...globals.es2020,
				NodeJS: 'readonly',
			},
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.json',
				},
			},
		},
				plugins: {
			'@typescript-eslint': tseslint.plugin,
			import: importPlugin,
		},
		rules: {
			// Use TypeScript recommended rules only
			...tseslint.configs.recommended.rules,
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': 'error',
			
			// VSCode-style import organization (replaces sort-imports)
			'import/order': [
				'error',
				{
					groups: [
						'builtin', // Built-in imports (come first)
						'external', // External library imports
						'internal', // Internal modules
						['sibling', 'parent'], // Relative imports
						'index', // Index imports
						'unknown', // Unknown
					],
					'newlines-between': 'always',
					alphabetize: {
						order: 'asc',
						caseInsensitive: true,
					},
					pathGroups: [
						{
							pattern: '@/**',
							group: 'internal',
							position: 'before',
						},
					],
					pathGroupsExcludedImportTypes: ['builtin'],
				},
			],
			// Sort named imports within import statements
			'sort-imports': [
				'error',
				{
					ignoreCase: true,
					ignoreDeclarationSort: true, // Let import/order handle declaration sorting
					ignoreMemberSort: false,
					memberSyntaxSortOrder: ['none', 'all', 'single', 'multiple'],
					allowSeparatedGroups: true,
				},
			],
		},
	},

	// Test files configuration
	{
		files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.jest,
				...globals.node,
			},
		},
		plugins: {
			jest,
		},
		rules: {
			// Use Jest recommended rules only
			...jest.configs.recommended.rules,
		},
	},

	// Browser/dashboard files
	{
		files: ['**/dashboard/**/*.js', '**/presentation/dashboard/**/*.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				io: 'readonly',
			},
		},
	},

	// JavaScript files configuration
	{
		files: ['**/*.js', '**/*.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2020,
			},
		},
	},

	// Configuration files
	{
		files: ['*.config.js', '*.config.ts', 'jest.setup.js'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
				jest: 'readonly',
			},
		},
		rules: {
			'no-console': 'off',
		},
	},

	// Example files
	{
		files: ['examples/**/*.js'],
		rules: {
			'no-console': 'off',
		},
	},

	// Prettier integration (must be last)
	prettierConfig,

	// Global ignores
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'coverage/**',
			'logs/**',
			'replays/**',
			'*.config.js',
			'.git/**',
		],
	},
);
