#!/usr/bin/env node

/**
 * SDK Integration Example
 * 
 * Shows how easy it is to build a bot with the new SDK vs. raw Socket.IO
 */

console.log('🔄 Comparing Raw Socket.IO vs PokaiBot SDK');
console.log('===========================================\n');

// === Raw Socket.IO Implementation (Old Way) ===
console.log('❌ OLD WAY - Raw Socket.IO (50+ lines):');
console.log(`
import { io } from 'socket.io-client';

class RawSocketBot {
  constructor(botId, apiKey) {
    this.botId = botId;
    this.apiKey = apiKey;
    this.socket = null;
    this.isAuthenticated = false;
    this.gameId = null;
    this.playerId = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io('http://localhost:3000');
      
      this.socket.on('connect', () => {
        this.socket.emit('auth.login', {
          botId: this.botId,
          apiKey: this.apiKey
        });
      });
      
      this.socket.on('auth.login.success', (data) => {
        this.isAuthenticated = true;
        this.playerId = data.playerId;
        resolve();
      });
      
      this.socket.on('auth.login.error', (data) => {
        reject(new Error(data.message));
      });
    });
  }

  async joinGame(gameId, chipStack) {
    return new Promise((resolve, reject) => {
      this.socket.emit('game.join', { gameId, chipStack });
      
      this.socket.once('game.join.success', (data) => {
        this.gameId = gameId;
        resolve();
      });
      
      this.socket.once('game.join.error', (data) => {
        reject(new Error(data.error));
      });
    });
  }

  async submitAction(actionType, amount) {
    return new Promise((resolve, reject) => {
      const action = { type: actionType, timestamp: Date.now() };
      if (amount) action.amount = amount;
      
      this.socket.emit('action.submit', { action });
      
      this.socket.once('action.submit.success', resolve);
      this.socket.once('action.submit.error', (data) => {
        reject(new Error(data.error));
      });
    });
  }

  setupEventHandlers() {
    this.socket.on('turn.start', async (data) => {
      // Complex game state management
      this.socket.emit('state.current', {});
      this.socket.once('state.current.success', async (stateData) => {
        this.socket.emit('state.actions', {});
        this.socket.once('state.actions.success', async (actionsData) => {
          // Finally make decision...
          const actions = actionsData.possibleActions;
          if (actions.find(a => a.type === 'check')) {
            await this.submitAction('check');
          } else {
            await this.submitAction('fold');
          }
        });
      });
    });
  }
}
`);

console.log('\n✅ NEW WAY - PokaiBot SDK (10 lines):');
console.log(`
import { PokaiBot, ActionType } from 'pokai-bot-sdk';

const bot = new PokaiBot({
  credentials: { botId: 'my-bot', apiKey: 'my-key' }
});

await bot.connect();
await bot.joinGame({ gameId: 'game-1', chipStack: 1000 });

bot.setEventHandlers({
  onTurnStart: async () => {
    const actions = await bot.getPossibleActions();
    
    if (actions.find(a => a.type === ActionType.Check)) {
      await bot.submitAction(ActionType.Check);
    } else {
      await bot.submitAction(ActionType.Fold);
    }
  }
});
`);

console.log('\n📊 SDK Benefits:');
console.log('================');
console.log('✅ 80% less code');
console.log('✅ Built-in error handling');
console.log('✅ Automatic reconnection');
console.log('✅ TypeScript support');
console.log('✅ Strategy helper functions');
console.log('✅ Comprehensive documentation');
console.log('✅ Pre-built example bots');
console.log('✅ Consistent API patterns');
console.log('✅ Human-like timing utilities');
console.log('✅ Pot odds calculations');

console.log('\n🎯 Developer Experience Improvements:');
console.log('=====================================');
console.log('• No more manual Socket.IO event management');
console.log('• No more Promise wrapper boilerplate');
console.log('• No more connection state management');
console.log('• Built-in debugging and logging');
console.log('• Poker-specific utility functions');
console.log('• Clear error types and messages');
console.log('• Automatic game state caching');
console.log('• Example bots for different strategies');

console.log('\n🚀 Getting Started:');
console.log('===================');
console.log('1. npm install pokai-bot-sdk');
console.log('2. Copy basic-bot.js example');
console.log('3. Add your credentials');
console.log('4. Run your bot!');

console.log('\n📚 Learn More:');
console.log('==============');
console.log('• SDK Documentation: ./README.md');
console.log('• Basic Bot Example: ./examples/basic-bot.js');
console.log('• Aggressive Bot: ./examples/aggressive-bot.js');
console.log('• Advanced Strategy: ./examples/advanced-strategy-bot.js');
console.log('• TypeScript Types: ./src/types.ts');
console.log('• Utility Functions: ./src/utils.ts');

console.log('\n✨ The PokaiBot SDK makes poker bot development enjoyable!');