// Validation functions for UNO game actions
import { WILDS, COLORS, isValidPlay, canJumpIn } from '../uno-engine.js';

/**
 * Validate that the given action is allowed in the current state.
 * @param {Object} state - current game state
 * @param {Object} action - {type, payload}
 * @returns {Object} { valid: boolean, reason?: string }
 */
export const validateAction = (state, action) => {
  let result = { valid: false, reason: '' };
  
  switch (action.type) {
    case 'DRAW_CARD':
      result = validateDrawCard(state, action);
      break;
    case 'PLAY_CARD':
      result = validatePlayCard(state, action);
      break;
    case 'CHOOSE_COLOR':
      result = validateChooseColor(state, action);
      break;
    case 'CHOOSE_SWAP_PLAYER':
      result = validateChooseSwapPlayer(state, action);
      break;
    case 'CALL_UNO':
      result = validateCallUno(state, action);
      break;
    case 'CHALLENGE_UNO':
      result = validateChallengeUno(state, action);
      break;
    case 'CHALLENGE_WILD_DRAW_FOUR':
      result = validateChallengeWildDrawFour(state, action);
      break;
    case 'JUMP_IN_PLAY':
      result = validateJumpInPlay(state, action);
      break;
    case 'NEXT_TURN':
    case 'SET_DIRECTION':
    case 'GAME_OVER':
    case 'RESET_GAME':
    case 'ADD_TO_HISTORY':
      result = { valid: true, reason: '' };
      break;
    default:
      result = { valid: false, reason: `Unknown action type: ${action.type}` };
  }
  
  if (!result.valid) {
    console.warn('[Validator] Action rejected:', action.type, result.reason);
  }
  return result;
};

// Specific validators

function validateDrawCard(state, action) {
  const { playerId } = action.payload;
  // Only the current player can draw (unless forced draw due to penalty - but forced draws are via effects)
  // The ACTION DRAW_CARD is initiated by player when they have no playable card and choose to draw.
  if (state.turn.phase !== 'DRAW' && state.turn.phase !== 'RESOLVE_DRAW') {
    return { valid: false, reason: `Invalid phase for draw: ${state.turn.phase}` };
  }
  if (action.payload.playerId !== state.turn.currentPlayerId) {
    return { valid: false, reason: 'Not current player' };
  }
  return { valid: true, reason: '' };
}

function validatePlayCard(state, action) {
  const { playerId, card, chosenColor } = action.payload;
  // Must be current player's turn
  if (action.payload.playerId !== state.turn.currentPlayerId) {
    return { valid: false, reason: 'Not current player' };
  }
  // Valid phases for playing: DRAW, PLAY (or RESOLVE_DRAW if they drew a playable card)
  if (!['DRAW', 'PLAY', 'RESOLVE_DRAW'].includes(state.turn.phase)) {
    return { valid: false, reason: `Invalid phase for play: ${state.turn.phase}` };
  }
  // Check if card is in player's hand
  const hand = state.hands[playerId];
  if (!hand || !hand.some(c => c.id === card.id)) {
    return { valid: false, reason: 'Card not in hand' };
  }
  // Validate card can be played per current color/top card, considering wilds
  const topCard = state.deck.discardPile[state.deck.discardPile.length - 1];
  const currentColor = state.currentColor;
  const isValid = isValidPlay(card, topCard, currentColor, state.pendingDraw);
  if (!isValid) {
    return { valid: false, reason: 'Card cannot be played on current top card' };
  }
  // If wild, chosenColor must be provided and be a valid color
  if (WILDS.includes(card.value)) {
    if (!chosenColor || !COLORS.includes(chosenColor)) {
      return { valid: false, reason: 'Wild card requires valid chosenColor' };
    }
  }
  return { valid: true, reason: '' };
}

// Copy of isValidPlay logic is now imported from uno-engine.js

function validateChooseColor(state, action) {
  const { color } = action.payload;
  if (state.turn.phase !== 'CHOOSE_COLOR' && state.turn.phase !== 'CHOOSE_ROULETTE_COLOR') {
    return { valid: false, reason: `Invalid phase for choose color: ${state.turn.phase}` };
  }
  if (!color || !COLORS.includes(color)) {
    return { valid: false, reason: 'Invalid color' };
  }
  return { valid: true, reason: '' };
}

function validateChooseSwapPlayer(state, action) {
  const { targetPlayerId } = action.payload;
  if (state.turn.phase !== 'CHOOSE_SWAP_PLAYER') {
    return { valid: false, reason: `Invalid phase for swap: ${state.turn.phase}` };
  }
  if (!state.hands[targetPlayerId]) {
    return { valid: false, reason: 'Target player not found' };
  }
  if (targetPlayerId === state.turn.currentPlayerId) {
    return { valid: false, reason: 'Cannot swap with self' };
  }
  return { valid: true, reason: '' };
}

function validateCallUno(state, action) {
  const { playerId } = action.payload;
  const hand = state.hands[playerId];
  // Can call UNO if they have exactly one card left
  if (!hand || hand.length !== 1) {
    return { valid: false, reason: 'Player does not have exactly one card' };
  }
  // Can only call UNO on their turn or after playing a card
  // (In our flow, CALL_UNO is an action the player takes after playing their second-to-last card)
  return { valid: true, reason: '' };
}

function validateChallengeUno(state, action) {
  const { challengerId, targetId } = action.payload;
  // Can challenge if the UNO window is active
  if (!state.unoWindow || !state.unoWindow.active) {
    return { valid: false, reason: 'UNO challenge window not active' };
  }
  // Can't challenge yourself
  if (challengerId === targetId) {
    return { valid: false, reason: 'Cannot challenge yourself' };
  }
  return { valid: true, reason: '' };
}

function validateChallengeWildDrawFour(state, action) {
  const { challengerId, targetId } = action.payload;
  // Can challenge if the previous action was a Wild Draw Four play by targetId
  // This would require checking history or a specific state flag
  // For now, check if there's a pending Wild Draw Four that can be challenged
  // In a full implementation, we'd track the last Wild Draw Four play
  if (!state.pendingDraw || !['wild-draw4', 'wild-reverse-draw4'].includes(state.pendingDraw.type)) {
    return { valid: false, reason: 'No Wild Draw Four to challenge' };
  }
  // Check if challenger is the next player (who would draw)
  // Or in some variants, any player can challenge
  return { valid: true, reason: '' };
}

function validateJumpInPlay(state, action) {
  const { playerId, card } = action.payload;
  // Jump-in allowed only if not current player's turn and card matches exactly
  if (state.turn.phase !== 'PLAY') {
    return { valid: false, reason: `Invalid phase for jump-in: ${state.turn.phase}` };
  }
  if (playerId === state.turn.currentPlayerId) {
    return { valid: false, reason: 'Current player cannot jump in' };
  }
  const topCard = state.deck.discardPile[state.deck.discardPile.length - 1];
  // Exact match: color and value
  if (!canJumpIn(card, topCard)) {
    return { valid: false, reason: 'Card does not exactly match top card' };
  }
  // Check if card is in player's hand
  const hand = state.hands[playerId];
  if (!hand || !hand.some(c => c.id === card.id)) {
    return { valid: false, reason: 'Card not in hand' };
  }
  return { valid: true, reason: '' };
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