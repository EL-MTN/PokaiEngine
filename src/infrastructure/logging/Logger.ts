import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

// Ensure logs directory exists
const logsDir = 'logs';
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
	error: 0,
	warn: 1,
	info: 2,
	http: 3,
	debug: 4,
};

// Define colors for each level
const colors = {
	error: 'red',
	warn: 'yellow',
	info: 'green',
	http: 'magenta',
	debug: 'white',
};

// Tell winston about our colors
winston.addColors(colors);

// Define which transports the logger must use
const transports = [
	// Console transport
	new winston.transports.Console({
		format: winston.format.combine(
			winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
			winston.format.colorize({ all: true }),
			winston.format.printf(
				(info) => `${info.timestamp} ${info.level}: ${info.message}`,
			),
		),
	}),
	// File transport for errors
	new winston.transports.File({
		filename: 'logs/error.log',
		level: 'error',
		format: winston.format.combine(
			winston.format.timestamp(),
			winston.format.json(),
		),
	}),
	// File transport for all logs
	new winston.transports.File({
		filename: 'logs/combined.log',
		format: winston.format.combine(
			winston.format.timestamp(),
			winston.format.json(),
		),
	}),
];

// Create the logger
const Logger = winston.createLogger({
	level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
	levels,
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		winston.format.json(),
	),
	transports,
	// Don't exit on handled exceptions
	exitOnError: false,
});

// If we're in test environment, reduce logging noise
if (
	process.env.NODE_ENV === 'test' ||
	process.env.JEST_WORKER_ID !== undefined
) {
	Logger.level = 'error'; // Only show errors in tests
	Logger.silent = true; // Or completely silent
}

// Create child loggers for different modules
export const createModuleLogger = (module: string) => {
	return Logger.child({ module });
};

// Export specific loggers for common modules
export const gameLogger = createModuleLogger('Game');
export const replayLogger = createModuleLogger('Replay');
export const dbLogger = createModuleLogger('Database');
export const serverLogger = createModuleLogger('Server');
export const communicationLogger = createModuleLogger('Communication');
export const authLogger = createModuleLogger('Auth');

export default Logger;
