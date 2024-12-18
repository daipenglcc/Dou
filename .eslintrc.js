module.exports = {
	env: {
		node: true,
		es2021: true
	},
	extends: ['eslint:recommended', 'plugin:prettier/recommended'],
	parserOptions: {
		ecmaVersion: 12,
		sourceType: 'module'
	},
	rules: {
		'no-console': 'off',
		'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		'prettier/prettier': [
			'error',
			{
				singleQuote: true,
				semi: false,
				useTabs: true,
				tabWidth: 4,
				trailingComma: 'none',
				printWidth: 100,
				bracketSpacing: true
			}
		]
	}
}
