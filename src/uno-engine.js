import deckData from './deck.json';

export function createDeck() {
  // Use the generated 168 card deck for Uno No Mercy
  return deckData.map(c => ({ ...c })); // copy
}

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHands(deck, playerIds, count = 7) {
  const hands = {};
  for (const id of playerIds) {
    hands[id] = [];
  }
  let deckCopy = [...deck];
  for (let i = 0; i < count; i++) {
    for (const id of playerIds) {
      hands[id].push(deckCopy.shift());
    }
  }
  // First discard: must not be a wild
  let topCard;
  do {
    topCard = deckCopy.shift();
  } while (WILDS.includes(topCard.value));
  return { hands, drawPile: deckCopy, discardPile: [topCard] };
}

export function isValidPlay(card, topCard, currentColor, pendingDraw = null) {
  if (pendingDraw) {
    const drawValues = {
      'draw2': 2,
      'wild-draw4': 4,
      'wild-reverse-draw4': 4,
      'draw6': 6,
      'draw10': 10
    };
    const pendingVal = drawValues[pendingDraw.type] || 0;
    const cardVal = drawValues[card.value] || 0;
    
    // You cannot stack on a color-roulette penalty
    if (pendingDraw.type === 'color-roulette') {
      return false;
    }
    
    // In No Mercy, you can stack a card of EQUAL or GREATER draw value
    if (cardVal > 0 && cardVal >= pendingVal) {
      return true;
    }
    return false; // MUST stack or draw
  }
  if (WILDS.includes(card.value)) return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export const WILDS = ['wild', 'wild-draw4', 'wild-reverse-draw4', 'color-roulette', 'draw6', 'draw10'];
export const COLORS = ['red', 'yellow', 'green', 'blue'];

// === End of pure functions ===

// Facade for the new modular UNO engine
// Maintains backward compatibility with existing imports.

import { createInitialState as createBaseState } from './engine/state.js';
import gameReducer from './engine/gameReducer.js';
import { ActionTypes } from './engine/actionTypes.js';

// Re-export original pure functions for compatibility
// (now exported individually above)

/**
 * Create initial game state using the new engine.
 * @param {string[]} playerIds - Array of player IDs
 * @param {{name:string, color:string}[]} playerInfos - Optional player info
 * @param {Object} rulesConfig - Optional rules overrides
 * @returns {Object} Initial game state
 */
export const createInitialState = (playerIds, playerInfos = [], rulesConfig = {}) => {
  const baseState = createBaseState(playerIds, playerInfos, rulesConfig);
  
  // Initialize the deck and deal cards
  const deck = shuffle(createDeck());
  const { hands, drawPile, discardPile } = dealHands(deck, playerIds, 7);
  
  baseState.hands = hands;
  baseState.deck = { drawPile, discardPile };
  baseState.topCard = discardPile[discardPile.length - 1];
  baseState.currentColor = baseState.topCard.color;
  
  return baseState;
};

/**
 * Redux-style reducer for the game.
 * @param {Object|undefined} state - Current state
 * @param {Object} action - Action object
 * @returns {Object} New state
 */
export const reducer = (state, action) => {
  return gameReducer(state, action);
};

/**
 * Draw a card for a player (legacy API).
 * @param {string} playerId - Player ID
 * @param {Object} state - Current game state
 * @returns {Object} New state after drawing one card
 */
export const drawCard = (playerId, state) => {
  if (!state) return state;
  return reducer(state, {
    type: 'DRAW_CARD',
    payload: { playerId, count: 1 }
  });
};

/**
 * Play a card (legacy API).
 * @param {string} playerId - Player ID
 * @param {Object} card - Card to play
 * @param {string|null} chosenColor - Chosen color for wild cards
 * @param {Object} state - Current game state
 * @returns {Object} New state after playing the card
 */
export const playCard = (playerId, card, chosenColor = null, state) => {
  if (!state) return state;
  return reducer(state, {
    type: 'PLAY_CARD',
    payload: { playerId, card, chosenColor }
  });
};

/**
 * Check if a player has won (legacy API).
 * @param {string} playerId - Player ID
 * @param {Object} hands - Hands object (playerId => hand array)
 * @returns {boolean} True if player has no cards
 */
export const checkWin = (playerId, hands) => {
  return hands[playerId]?.length === 0;
};

/**
 * Check if a player has exactly one card (legacy API).
 * @param {string} playerId - Player ID
 * @param {Object} hands - Hands object
 * @returns {boolean} True if player has exactly one card
 */
export const hasOneCard = (playerId, hands) => {
  return hands[playerId]?.length === 1;
};

// Export action types for use by UI/network if needed
export { ActionTypes };

// Export a function to validate an action (useful for network)
export const validateAction = (state, action) => {
  // Import validator from engine
  // To avoid circular, we could require it here but we'll just use a stub.
  // For now, we'll assume the validator will ignore invalid actions.
  return true;
};