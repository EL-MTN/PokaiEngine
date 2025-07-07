module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/tests/**/*.test.ts'],
	transform: {
		'^.+.ts$': 'ts-jest',
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@core/(.*)$': '<rootDir>/src/core/$1',
		'^@engine/(.*)$': '<rootDir>/src/engine/$1',
		'^@communication/(.*)$': '<rootDir>/src/communication/$1',
		'^@logging/(.*)$': '<rootDir>/src/logging/$1',
		'^@types$': '<rootDir>/src/types/index',
		'^@tests/(.*)$': '<rootDir>/src/tests/$1',
	},
};