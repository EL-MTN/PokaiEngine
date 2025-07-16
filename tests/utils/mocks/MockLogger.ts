export class MockLogger {
	public logs: Array<{ level: string; message: string; meta?: any }> = [];

	info(message: string, meta?: any): void {
		this.logs.push({ level: 'info', message, meta });
	}

	error(message: string, meta?: any): void {
		this.logs.push({ level: 'error', message, meta });
	}

	warn(message: string, meta?: any): void {
		this.logs.push({ level: 'warn', message, meta });
	}

	debug(message: string, meta?: any): void {
		this.logs.push({ level: 'debug', message, meta });
	}

	verbose(message: string, meta?: any): void {
		this.logs.push({ level: 'verbose', message, meta });
	}

	silly(message: string, meta?: any): void {
		this.logs.push({ level: 'silly', message, meta });
	}

	log(level: string, message: string, meta?: any): void {
		this.logs.push({ level, message, meta });
	}

	clear(): void {
		this.logs = [];
	}

	hasLogged(level: string, message: string): boolean {
		return this.logs.some(
			(log) => log.level === level && log.message.includes(message),
		);
	}

	getLogsByLevel(level: string): Array<{ message: string; meta?: any }> {
		return this.logs
			.filter((log) => log.level === level)
			.map(({ message, meta }) => ({ message, meta }));
	}

	getLastLog(): { level: string; message: string; meta?: any } | undefined {
		return this.logs[this.logs.length - 1];
	}

	getAllLogs(): Array<{ level: string; message: string; meta?: any }> {
		return [...this.logs];
	}
}
