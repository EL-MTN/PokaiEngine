// Increase max listeners to prevent warnings in tests
if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
	process.setMaxListeners(20);
}

module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	transform: {
		'^.+\\.ts$': 'ts-jest',
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@core/(.*)$': '<rootDir>/src/core/$1',
		'^@engine/(.*)$': '<rootDir>/src/engine/$1',
		'^@communication/(.*)$': '<rootDir>/src/communication/$1',
		'^@logging/(.*)$': '<rootDir>/src/logging/$1',
		'^@types$': '<rootDir>/src/types/index',
		'^@tests/(.*)$': '<rootDir>/tests/$1',
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
	testTimeout: 10000, // 10 second default timeout
	maxWorkers: '50%', // Use 50% of available CPU cores
};
