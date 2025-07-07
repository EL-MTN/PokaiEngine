# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server with ts-node
- `npm run build` - Compile TypeScript to JavaScript in /dist
- `npm start` - Run production server from compiled code

### Testing
- `npm test` - Run all tests
- `npm test -- <filename>` - Run specific test file (e.g., `npm test -- Card.test.ts`)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Code Quality
- `npm run lint` - Check code for linting errors
- `npm run lint:fix` - Automatically fix linting errors
- `npm run clean` - Remove build artifacts

## Architecture Overview

PokaiEngine is a Texas Hold'em poker engine designed for bot battles with real-time communication. The codebase follows a layered architecture:

### Core Layers

1. **Communication Layer** (`/src/communication/`)
   - `SocketHandler.ts` - Socket.io server handling real-time bot connections
   - `BotInterface.ts` - Abstraction for bot communication
   - Events: `identify`, `action`, `gameState`, game events

2. **Engine Layer** (`/src/engine/`)
   - `GameController.ts` - Manages multiple concurrent games
   - `GameEngine.ts` - Single game logic with event-driven state transitions
   - Handles game flow, turn management, and event emission

3. **Core Layer** (`/src/core/`)
   - `/cards/` - Card representation, deck management, hand evaluation
   - `/game/` - GameState, Player models, PotManager for side pots
   - `/betting/` - ActionValidator for bet validation and rules

4. **Logging Layer** (`/src/logging/`)
   - `GameLogger.ts` - Comprehensive event logging
   - `ReplaySystem.ts` - Game replay from logs

### Key Design Patterns

- **Event-Driven**: GameEngine emits events for all state changes
- **Type Safety**: Comprehensive TypeScript interfaces in `/src/types/index.ts`
- **Stateless Design**: Engine can be scaled horizontally
- **Module Exports**: Can be used as library or standalone server

### Important Implementation Details

- Socket.io v4.7.4 for WebSocket communication
- Turn timers implemented with automatic fold on timeout
- Complete edge case handling (all-ins, side pots, split pots)
- Hand evaluation using bitwise operations for performance
- Comprehensive test coverage including stress tests

### Entry Points

- **Server Mode**: `/src/index.ts` - Creates PokaiServer with HTTP health endpoints
- **Library Mode**: Import individual classes from package exports
- **Bot Connection**: Socket.io on port 3000 (configurable via PORT env)

### Testing Strategy

Tests are organized by layer:
- `/src/tests/core/` - Unit tests for game logic
- `/src/tests/engine/` - Engine and edge case tests
- `/src/tests/integration/` - Full game scenarios and network tests