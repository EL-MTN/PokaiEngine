// Mock all loggers globally
jest.mock('@/infrastructure/logging/Logger', () => ({
	authLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	gameLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	serverLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	applicationLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	communicationLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	createGameLogger: jest.fn(() => ({
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	})),
}));

// Ensure logs directory exists for tests
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Speed up MongoDB operations in tests
process.env.NODE_ENV = 'test';

// Reduce MongoDB connection pool for tests
if (!process.env.MONGODB_MAX_POOL_SIZE) {
	process.env.MONGODB_MAX_POOL_SIZE = '1';
}
