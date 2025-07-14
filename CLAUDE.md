# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- `npm run dev` - Run socket server with hot reload
- `npm run dev:express` - Run Express server with hot reload
- `npm start` - Start socket server in production mode
- `npm run start:express` - Start Express server in production mode

### Building
- `npm run build` - Compile TypeScript and resolve path aliases
- `npm run clean` - Remove dist folder

### Testing
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- To run a single test file: `npm test -- path/to/test.ts`
- To run tests matching a pattern: `npm test -- --testNamePattern="pattern"`

## Architecture Overview

PokaiEngine is a production-ready Texas Hold'em poker engine built with TypeScript following clean architecture principles:

### Layer Structure
1. **Domain Layer** (`src/domain/`) - Core business logic, pure TypeScript with no external dependencies
   - `poker/` - Game rules, card evaluation, betting logic
   - `replay/` - Replay functionality domain logic
   - `types/` - Shared domain types and interfaces

2. **Application Layer** (`src/application/`) - Orchestrates domain logic
   - `engine/` - GameEngine and GameController manage game flow
   - `services/` - BotAuthService, ReplayService handle cross-cutting concerns

3. **Infrastructure Layer** (`src/infrastructure/`) - External integrations
   - `communication/` - Socket.IO for real-time communication
   - `persistence/` - MongoDB repositories using Mongoose
   - `logging/` - Winston logger configuration
   - `storage/` - File-based replay storage

4. **Presentation Layer** (`src/presentation/`) - User interfaces
   - `api/` - Express REST API endpoints
   - `server/` - Express and Socket.IO server setup
   - `dashboard/` - Web dashboard for game monitoring

### Key Patterns
- **Repository Pattern**: All database access through repositories
- **Factory Pattern**: Used for creating game instances and players
- **Event-Driven**: Socket.IO events for real-time updates
- **Command Pattern**: Player actions as commands

### Path Aliases
The project uses TypeScript path aliases (configured in tsconfig.json):
- `@/` - src/
- `@core/` - src/domain/
- `@engine/` - src/application/engine/
- `@services/` - src/application/services/
- `@infra/` - src/infrastructure/
- `@models/` - src/infrastructure/persistence/models/
- `@utils/` - src/utils/

## Bot Integration Points
- **WebSocket**: Connect to `ws://localhost:3001` with authentication token
- **REST API**: Available at `http://localhost:3000/api`
- **Authentication**: Token-based system, see `docs/BOT_AUTHENTICATION.md`
- **Examples**: Check `examples/` directory for working bot implementations

## Database
- Uses MongoDB with Mongoose ODM
- MongoDB Memory Server for testing (automatically handled)
- Connection managed in `src/infrastructure/persistence/database/`

## Testing Strategy
- Unit tests for domain logic
- Integration tests for API endpoints
- Stress tests for performance validation
- Test utilities in `src/tests/utils/`
- Mock factories for testing in various test directories

## Important Notes
- Always run tests before committing changes
- The project uses strict TypeScript configuration
- Logging is configured with Winston (logs to files and console)
- Replay files are stored in `replays/` directory
- Environment variables are loaded from `.env` file