document.addEventListener('DOMContentLoaded', () => {
	const SERVER_URL = 'http://localhost:3000';
	const socket = io(SERVER_URL);

	// State
	let gameId = null;
	const bots = {
		bot1: {
			id: null,
			name: 'PlayerBot',
			socket: io(SERVER_URL),
			view: {
				stack: document.getElementById('bot1-stack'),
				hand: document.getElementById('bot1-hand'),
				actions: document.getElementById('bot1-actions'),
				container: document.getElementById('bot1-view'),
			},
		},
		bot2: {
			id: null,
			name: 'OpponentBot',
			socket: io(SERVER_URL),
			view: {
				stack: document.getElementById('bot2-stack'),
				hand: document.getElementById('bot2-hand'),
				actions: document.getElementById('bot2-actions'),
				container: document.getElementById('bot2-view'),
			},
		},
	};

	// UI Elements
	const createGameBtn = document.getElementById('create-game-btn');
	const gameIdEl = document.getElementById('game-id');
	const communityCardsEl = document.getElementById('community-cards');
	const potSizeEl = document.getElementById('pot-size');
	const gameLogEl = document.getElementById('game-log');
	const bot1UnseatBtn = document.getElementById('bot1-unseat-btn');
	const bot2UnseatBtn = document.getElementById('bot2-unseat-btn');

	const log = (message) => {
		const entry = document.createElement('div');
		entry.className = 'log-entry';
		entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
		gameLogEl.appendChild(entry);
		gameLogEl.scrollTop = gameLogEl.scrollHeight;
	};

	const formatCard = (card) => {
		const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
		const ranks = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
		const rank = ranks[card.rank] || card.rank.toString();
		const suit = suits[card.suit] || card.suit;
		return { rank, suit };
	};

	const renderCard = (card) => {
		const { rank, suit } = formatCard(card);
		const cardEl = document.createElement('div');
		cardEl.className = `card suit-${suit}`;
		cardEl.textContent = rank;
		return cardEl;
	};

	const renderPlayerState = (botKey, gameState) => {
		const bot = bots[botKey];
		const playerState = gameState.players.find((p) => p.id === bot.id);

		if (playerState) {
			bot.view.stack.textContent = playerState.chipStack;
		}

		bot.view.hand.innerHTML = '';
		if (gameState.playerCards) {
			gameState.playerCards.forEach((card) => {
				bot.view.hand.appendChild(renderCard(card));
			});
		}

		bot.view.actions.innerHTML = '';
		if (gameState.currentPlayerToAct === bot.id && gameState.possibleActions) {
			bot.view.container.classList.add('active');
			gameState.possibleActions.forEach((action) => {
				const button = document.createElement('button');
				button.textContent =
					action.type.charAt(0).toUpperCase() + action.type.slice(1);
				button.className = `action-${action.type}`;
				button.onclick = () => {
					let actionData = {
						type: action.type,
						playerId: bot.id,
						timestamp: Date.now(),
					};
					if (action.type === 'bet' || action.type === 'raise') {
						const amount = prompt(
							`Enter amount for ${action.type} (min: ${action.minAmount}, max: ${action.maxAmount}):`,
							action.minAmount
						);
						if (amount) {
							actionData.amount = parseInt(amount, 10);
							bot.socket.emit('action', { action: actionData });
						}
					} else {
						if (action.type === 'call' && action.amount > 0) {
							actionData.amount = action.amount;
						}
						bot.socket.emit('action', { action: actionData });
					}
				};
				bot.view.actions.appendChild(button);
			});
		} else {
			bot.view.container.classList.remove('active');
		}
	};

	const setupBot = (botKey) => {
		const bot = bots[botKey];
		bot.socket.on('connect', () =>
			log(`${bot.name} connected to server via socket.`)
		);
		bot.socket.on('identificationSuccess', (data) => {
			bot.id = data.playerId;
			log(`${bot.name} joined game ${gameId} with ID ${bot.id}`);
		});
		bot.socket.on('gameState', (data) => {
			const gameState = data.gameState;
			communityCardsEl.innerHTML = '';
			gameState.communityCards.forEach((card) => {
				communityCardsEl.appendChild(renderCard(card));
			});
			potSizeEl.textContent = gameState.potSize;
			renderPlayerState(botKey, gameState);
		});
		bot.socket.on('gameEvent', (data) => {
			log(`[${bot.name}] Event: ${data.event.type}`);
			if (data.event.type === 'hand_complete') {
				const winnerInfo = data.event.winners
					.map(
						(w) =>
							`${w.playerId === bots.bot1.id ? 'Bot 1' : 'Bot 2'} wins $${
								w.winAmount
							} with ${w.handDescription}`
					)
					.join(', ');
				log(`Hand complete! ${winnerInfo}`);
			}
		});
		bot.socket.on('unseatConfirmed', () => {
			log(`${bot.name} requested to be unseated. They will leave after the hand.`);
		});

		bot.socket.on('unseatError', (data) => {
			log(`[${bot.name}] Unseat error: ${data.error}`);
		});
	};

	createGameBtn.addEventListener('click', async () => {
		if (gameId) {
			log('A game is already running.');
			return;
		}
		try {
			gameId = `web-ui-game-${Date.now()}`;
			await fetch(`${SERVER_URL}/api/games`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId,
					maxPlayers: 2,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
					isTournament: false,
				}),
			});
			gameIdEl.textContent = gameId;
			log(`Game created: ${gameId}`);

			bots.bot1.socket.emit('identify', {
				botName: bots.bot1.name,
				gameId,
				chipStack: 1000,
			});
			bots.bot2.socket.emit('identify', {
				botName: bots.bot2.name,
				gameId,
				chipStack: 1000,
			});
		} catch (error) {
			log(`Error creating game: ${error.message}`);
		}
	});

	bot1UnseatBtn.addEventListener('click', () => {
		if (bots.bot1.socket) {
			bots.bot1.socket.emit('unseat');
		}
	});

	bot2UnseatBtn.addEventListener('click', () => {
		if (bots.bot2.socket) {
			bots.bot2.socket.emit('unseat');
		}
	});

	setupBot('bot1');
	setupBot('bot2');
}); 