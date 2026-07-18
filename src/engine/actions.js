// Action creators for UNO game engine
import { ActionTypes } from './actionTypes.js';

/**
 * Draw a card (or cards) for a player
 * @param {string} playerId
 * @param {Object|undefined} options - {count?: number, forceDraw?: boolean} etc.
 * @returns {Object} Action
 */
export const drawCard = (playerId, options = {}) => ({
  type: ActionTypes.DRAW_CARD,
  payload: { playerId, ...options }
});

/**
 * Play a card from hand
 * @param {string} playerId
 * @param {Object} card - the card to play
 * @param {string|null} chosenColor - for wild cards
 * @returns {Object} Action
 */
export const playCard = (playerId, card, chosenColor = null) => ({
  type: ActionTypes.PLAY_CARD,
  payload: { playerId, card, chosenColor }
});

/**
 * Choose color after playing a wild card
 * @param {string} playerId
 * @param {'red'|'yellow'|'green'|'blue'} color
 * @returns {Object} Action
 */
export const chooseColor = (playerId, color) => ({
  type: ActionTypes.CHOOSE_COLOR,
  payload: { playerId, color }
});

/**
 * Choose which player to swap hands with (after playing a 7)
 * @param {string} playerId
 * @param {string} targetPlayerId
 * @returns {Object} Action
 */
export const chooseSwapPlayer = (playerId, targetPlayerId) => ({
  type: ActionTypes.CHOOSE_SWAP_PLAYER,
  payload: { playerId, targetPlayerId }
});

/**
 * Resolve pending draw effects (e.g., from Draw 2 or Wild Draw Four)
 * @param {Object} payload - maybe {amount, sourcePlayerId, targetPlayerId}
 * @returns {Object} Action
 */
export const resolveDraw = (payload) => ({
  type: ActionTypes.RESOLVE_DRAW,
  payload
});

/**
 * Call UNO
 * @param {string} playerId
 * @returns {Object} Action
 */
export const callUno = (playerId) => ({
  type: ActionTypes.CALL_UNO,
  payload: { playerId }
});

/**
 * Challenge an UNO call
 * @param {string} challengerId
 * @param {string} targetPlayerId
 * @returns {Object} Action
 */
export const challengeUno = (challengerId, targetPlayerId) => ({
  type: ActionTypes.CHALLENGE_UNO,
  payload: { challengerId, targetPlayerId }
});

/**
 * Challenge a Wild Draw Four play
 * @param {string} challengerId
 * @param {string} targetPlayerId
 * @returns {Object} Action
 */
export const challengeWildDrawFour = (challengerId, targetPlayerId) => ({
  type: ActionTypes.CHALLENGE_WILD_DRAW_FOUR,
  payload: { challengerId, targetPlayerId }
});

/**
 * Attempt to play a card out of turn (jump-in)
 * @param {string} playerId
 * @param {Object} card
 * @param {string|null} chosenColor
 * @returns {Object} Action
 */
export const jumpInPlay = (playerId, card, chosenColor = null) => ({
  type: ActionTypes.JUMP_IN_PLAY,
  payload: { playerId, card, chosenColor }
});

/**
 * Advance to next player's turn
 * @returns {Object} Action
 */
export const nextTurn = () => ({
  type: ActionTypes.NEXT_TURN,
  payload: {}
});

/**
 * Set game direction (for reverse)
 * @param {1|-1} direction
 * @returns {Object} Action
 */
export const setDirection = (direction) => ({
  type: ActionTypes.SET_DIRECTION,
  payload: { direction }
});

/**
 * End the game
 * @param {string} winnerId
 * @returns {Object} Action
 */
export const gameOver = (winnerId) => ({
  type: ActionTypes.GAME_OVER,
  payload: { winnerId }
});

/**
 * Reset game to initial state (for new round)
 * @returns {Object} Action
 */
export const resetGame = () => ({
  type: ActionTypes.RESET_GAME,
  payload: {}
});

/**
 * Add entry to history log
 * @param {Object} historyEntry - {action, playerId, timestamp}
 * @returns {Object} Action
 */
export const addToHistory = (historyEntry) => ({
  type: ActionTypes.ADD_TO_HISTORY,
  payload: { historyEntry }
});

/**
 * Internal effect: draw N cards
 * @param {string} playerId
 * @param {number} count
 * @returns {Object} Action
 */
export const effectDraw = (playerId, count) => ({
  type: ActionTypes.EFFECT_DRAW,
  payload: { playerId, count }
});

/**
 * Internal effect: skip a player
 * @param {string} playerIdToSkip
 * @returns {Object} Action
 */
export const effectSkip = (playerIdToSkip) => ({
  type: ActionTypes.EFFECT_SKIP,
  payload: { playerIdToSkip }
});

/**
 * Internal effect: reverse direction
 * @returns {Object} Action
 */
export const effectReverse = () => ({
  type: ActionTypes.EFFECT_REVERSE,
  payload: {}
});

/**
 * Internal effect: add to pending draw (stacking)
 * @param {number} amount
 * @param {'draw2'|'wild4'} type
 * @param {string} sourcePlayerId
 * @returns {Object} Action
 */
export const effectAddPendingDraw = (amount, type, sourcePlayerId) => ({
  type: ActionTypes.EFFECT_ADD_PENDING_DRAW,
  payload: { amount, type, sourcePlayerId }
});

/**
 * Internal effect: set current color
 * @param {'red'|'yellow'|'green'|'blue'} color
 * @returns {Object} Action
 */
export const effectSetColor = (color) => ({
  type: ActionTypes.EFFECT_SET_COLOR,
  payload: { color }
});

/**
 * Internal effect: set swap target (for 7)
 * @param {string} targetPlayerId
 * @returns {Object} Action
 */
export const effectSetSwapTarget = (targetPlayerId) => ({
  type: ActionTypes.EFFECT_SET_SWAP_TARGET,
  payload: { targetPlayerId }
});