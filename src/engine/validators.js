// Validation functions for UNO game actions
import { WILDS, COLORS } from '../uno-engine.js';

/**
 * Validate that the given action is allowed in the current state.
 * @param {Object} state - current game state
 * @param {Object} action - {type, payload}
 * @returns {boolean} true if action is valid
 */
export const validateAction = (state, action) => {
  switch (action.type) {
    case 'DRAW_CARD':
      return validateDrawCard(state, action);
    case 'PLAY_CARD':
      return validatePlayCard(state, action);
    case 'CHOOSE_COLOR':
      return validateChooseColor(state, action);
    case 'CHOOSE_SWAP_PLAYER':
      return validateChooseSwapPlayer(state, action);
    case 'CALL_UNO':
      return validateCallUno(state, action);
    case 'CHALLENGE_UNO':
      return validateChallengeUno(state, action);
    case 'CHALLENGE_WILD_DRAW_FOUR':
      return validateChallengeWildDrawFour(state, action);
    case 'JUMP_IN_PLAY':
      return validateJumpInPlay(state, action);
    case 'NEXT_TURN':
      return true; // internal action, always valid
    case 'SET_DIRECTION':
      return true;
    case 'GAME_OVER':
      return true;
    default:
      return false;
  }
};

// Specific validators

function validateDrawCard(state, action) {
  const { playerId } = action.payload;
  // Only the current player can draw (unless forced draw due to penalty? but forced draws are via effects)
  // In our flow, drawing occurs either as a player action (when they choose to draw) or as effect.
  // We'll allow draw card action only if turn phase is DRAW or if they have to draw due to pending? Actually
  // the ACTION DRAW_CARD is initiated by player when they have no playable card and choose to draw.
  // So we check phase == DRAW and playerId matches current player.
  return state.turn.phase === 'DRAW' && action.payload.playerId === state.turn.currentPlayerId;
}

function validatePlayCard(state, action) {
  const { playerId, card, chosenColor } = action.payload;
  // Must be current player's turn
  if (action.payload.playerId !== state.turn.currentPlayerId) {
    return false;
  }
  if (state.turn.phase !== 'DRAW' && state.turn.phase !== 'PLAY') {
    return false;
  }
  // Check if card is in player's hand
  const hand = state.hands[playerId];
  if (!hand || !hand.some(c => c.id === card.id)) {
    return false;
  }
  // Validate card can be played per current color/top card, considering wilds
  const topCard = state.deck.discardPile[state.deck.discardPile.length - 1];
  const currentColor = state.currentColor;
  // Use isValidPlay from existing engine
  // We'll import it or replicate logic
  const isValid = isValidPlayLogic(card, topCard, currentColor, state.pendingDraw);
  if (!isValid) return false;
  // If wild, chosenColor must be provided and be a valid color
  if (WILDS.includes(card.value)) {
    return !!chosenColor && COLORS.includes(chosenColor);
  }
  return true;
}

// Copy of isValidPlay from original engine (could import but we avoid circular)
function isValidPlayLogic(card, topCard, currentColor, pendingDraw = null) {
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

function validateChooseColor(state, action) {
  const { color } = action.payload;
  return state.turn.phase === 'CHOOSE_COLOR' && !!color && COLORS.includes(color);
}

function validateChooseSwapPlayer(state, action) {
  const { targetPlayerId } = action.payload;
  return state.turn.phase === 'CHOOSE_SWAP_PLAYER' &&
    !!state.hands[targetPlayerId] &&
    state.hands[targetPlayerId].id !== state.turn.currentPlayerId; // cannot swap with self
}

function validateCallUno(state, action) {
  const { playerId } = action.payload;
  const hand = state.hands[playerId];
  // Can call UNO if they have exactly one card left (or maybe after playing second-to-last)
  // We'll allow if hand length === 1
  return hand && hand.length === 1;
}

function validateChallengeUno(state, action) {
  const { challengerId, targetId } = action.payload;
  // Can challenge if the target has recently played their second-to-last card and not yet called UNO
  // Simplify: allow if UNO window is active
  return state.unoWindow.active === true;
}

function validateChallengeWildDrawFour(state, action) {
  const { challengerId, targetId } = action.payload;
  // Can challenge if the previous action was a Wild Draw Four play by targetId
  // We'll need to look at history; for now, allow if game state indicates a pending challenge?
  return false; // placeholder
}

function validateJumpInPlay(state, action) {
  const { playerId, card } = action.payload;
  // Jump-in allowed only if not current player's turn and card matches top card exactly (color and value)
  if (state.turn.phase !== 'PLAY') return false;
  if (playerId === state.turn.currentPlayerId) return false;
  const topCard = state.deck.discardPile[state.deck.discardPile.length - 1];
  // Exact match: color and value equal
  return card.color === topCard.color && card.value === topCard.value;
}

export default {
  validateAction,
  validateDrawCard,
  validatePlayCard,
  validateChooseColor,
  validateChooseSwapPlayer,
  validateCallUno,
  validateChallengeUno,
  validateChallengeWildDrawFour,
  validateJumpInPlay
};