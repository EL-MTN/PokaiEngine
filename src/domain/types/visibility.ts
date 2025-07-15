/**
 * Simple visibility rule: Show hole cards only at showdown
 */
export function shouldShowHoleCards(
	viewerType: 'player' | 'spectator' | 'replay',
	viewerId: string | undefined,
	cardOwnerId: string,
	isShowdown: boolean,
	playerFolded: boolean,
): boolean {
	// Players can always see their own cards
	if (viewerType === 'player' && viewerId === cardOwnerId) {
		return true;
	}

	// For everyone else (spectators, replays, other players):
	// Show cards only at showdown if the player hasn't folded
	return isShowdown && !playerFolded;
}
