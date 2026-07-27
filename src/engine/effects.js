// Pure effect functions for UNO game engine
// Each function takes (state, action) and returns { state: newState, effects: [] }
// where effects is an array of further action objects to be dispatched after this effect.

import { shuffle } from '../uno-engine.js';
import { WILDS, COLORS } from '../uno-engine.js';

/**
 * Draw card(s) for a player, reshuffling if necessary.
 * Returns new state with updated deck and hands.
 */
export const effectDraw = (state, action) => {
  const { playerId, count = 1 } = action.payload;
  let { drawPile, discardPile } = state.deck;
  const hand = [...(state.hands[playerId] || [])];

  for (let i = 0; i < count; i++) {
    // If draw pile empty, reshuffle discard pile (keep top card)
    if (drawPile.length === 0) {
      if (discardPile.length <= 1) break; // not enough to reshuffle
      const topCard = discardPile[discardPile.length - 1];
      drawPile = shuffle(discardPile.slice(0, -1));
      discardPile = [topCard];
    }
    if (drawPile.length === 0) break; // still empty after reshuffle
    
    const card = drawPile.shift();
    hand.push(card);
  }

  const newState = {
    ...state,
    deck: { drawPile, discardPile },
    hands: { ...state.hands, [playerId]: hand }
  };
  return { state: newState, effects: [] };
};

/**
 * Skip the next player(s).
 */
export const effectSkip = (state, action) => {
  const { playerIdToSkip } = action.payload;
  // The skip is handled by incrementing skipCount in the turn state
  // This effect just confirms the skip - the actual turn advancement handles it
  return { state, effects: [] };
};

/**
 * Reverse turn direction.
 */
export const effectReverse = (state, action) => {
  const newDirection = state.turn.direction === 1 ? -1 : 1;
  const newState = {
    ...state,
    turn: { ...state.turn, direction: newDirection }
  };
  return { state: newState, effects: [] };
};

/**
 * Add to pending draw (stacking penalties).
 */
export const effectAddPendingDraw = (state, action) => {
  const { amount, type, sourcePlayerId } = action.payload;
  const current = state.pendingDraw;
  let newPending = null;
  
  if (current) {
    // Stacking: add amounts
    newPending = {
      amount: current.amount + amount,
      type: type, // new card dictates the type
      sourcePlayerId: current.sourcePlayerId
    };
  } else {
    newPending = { amount, type, sourcePlayerId };
  }
  
  const newState = { ...state, pendingDraw: newPending };
  return { state: newState, effects: [] };
};

/**
 * Set the current color (after wild card).
 */
export const effectSetColor = (state, action) => {
  const { color } = action.payload;
  if (!COLORS.includes(color)) {
    console.warn('[effectSetColor] Invalid color:', color);
    return { state, effects: [] };
  }
  const newState = { ...state, currentColor: color };
  return { state: newState, effects: [] };
};

/**
 * Set swap target (for 7 card).
 */
export const effectSetSwapTarget = (state, action) => {
  const { targetPlayerId } = action.payload;
  const newState = { ...state, pendingSwapTarget: targetPlayerId };
  return { state: newState, effects: [] };
};

/**
 * Process pending draw penalty (player must draw cards).
 */
export const effectProcessPendingDraw = (state, action) => {
  const { targetPlayerId } = action.payload;
  const pending = state.pendingDraw;
  
  if (!pending) {
    return { state, effects: [] };
  }
  
  // Draw the penalty cards
  const drawEffect = effectDraw(state, {
    type: 'EFFECT_DRAW',
    payload: { playerId: targetPlayerId, count: pending.amount }
  });
  
  // Clear pending draw after drawing
  const newState = {
    ...drawEffect.state,
    pendingDraw: null,
    turn: { ...drawEffect.state.turn, needsAdvance: true }
  };
  
  return { state: newState, effects: [] };
};

/**
 * Handle color roulette: next player chooses color, then draws until match.
 */
export const effectColorRoulette = (state, action) => {
  const { targetPlayerId } = action.payload;
  const newState = {
    ...state,
    pendingDraw: { amount: 'roulette', type: 'color-roulette', sourcePlayerId: action.payload.sourcePlayerId },
    turn: { ...state.turn, phase: 'CHOOSE_ROULETTE_COLOR', currentPlayerId: targetPlayerId }
  };
  return { state: newState, effects: [] };
};

/**
 * Apply discard-all effect (discard all cards of a color).
 */
export const effectDiscardAll = (state, action) => {
  const { playerId, color } = action.payload;
  const hand = [...(state.hands[playerId] || [])];
  const remainingHand = [];
  const discarded = [];
  
  for (const card of hand) {
    if (card.color === color) {
      discarded.push(card);
    } else {
      remainingHand.push(card);
    }
  }
  
  // Add discarded cards to discard pile (under the discard-all card)
  const playedDiscardAllCard = state.deck.discardPile[state.deck.discardPile.length - 1];
  let newDiscardPile = [...state.deck.discardPile];
  // Remove the discard-all card, add discarded cards, then add it back
  newDiscardPile = newDiscardPile.slice(0, -1);
  newDiscardPile.push(...discarded);
  newDiscardPile.push(playedDiscardAllCard);
  
  const newState = {
    ...state,
    hands: { ...state.hands, [playerId]: remainingHand },
    deck: { ...state.deck, discardPile: newDiscardPile }
  };
  
  return { state: newState, effects: [] };
};

/**
 * Handle 7 card: swap hands with another player.
 */
export const effectSwapHands = (state, action) => {
  const { playerId, targetPlayerId } = action.payload;
  if (!state.hands[playerId] || !state.hands[targetPlayerId]) {
    return { state, effects: [] };
  }
  
  const newState = {
    ...state,
    hands: {
      ...state.hands,
      [playerId]: [...state.hands[targetPlayerId]],
      [targetPlayerId]: [...state.hands[playerId]]
    }
  };
  
  return { state: newState, effects: [] };
};

/**
 * Handle 0 card: rotate all hands in current direction.
 */
export const effectRotateHands = (state, action) => {
  const playerIds = Object.keys(state.hands);
  if (playerIds.length < 2) return { state, effects: [] };
  
  const newHands = {};
  const len = playerIds.length;
  
  playerIds.forEach((pid, idx) => {
    // Direction 1 (clockwise): each player gets hand from player to their right (idx - 1)
    // Direction -1 (counter-clockwise): each player gets hand from player to their left (idx + 1)
    const sourceIdx = state.turn.direction === 1
      ? (idx - 1 + len) % len
      : (idx + 1) % len;
    const sourceId = playerIds[sourceIdx];
    newHands[pid] = [...state.hands[sourceId]];
  });
  
  const newState = { ...state, hands: newHands };
  return { state: newState, effects: [] };
};

/**
 * Handle UNO call.
 */
export const effectCallUno = (state, action) => {
  const { playerId } = action.payload;
  const unoCalledBy = { ...(state.unoCalledBy || {}), [playerId]: true };
  const newState = {
    ...state,
    unoCalledBy,
    unoWindow: { active: true, expiresOnAction: true }
  };
  return { state: newState, effects: [] };
};

/**
 * Handle UNO challenge.
 */
export const effectChallengeUno = (state, action) => {
  const { challengerId, targetId } = action.payload;
  const unoCalledBy = state.unoCalledBy || {};
  const targetHadUno = unoCalledBy[targetId] === true;
  
  let newState = state;
  
  if (targetHadUno) {
    // Challenger was wrong: challenger draws 4
    newState = effectDraw(state, {
      type: 'EFFECT_DRAW',
      payload: { playerId: challengerId, count: 4 }
    }).state;
  } else {
    // Target didn't call UNO: target draws 4
    newState = effectDraw(state, {
      type: 'EFFECT_DRAW',
      payload: { playerId: targetId, count: 4 }
    }).state;
  }
  
  // Close UNO window
  newState = {
    ...newState,
    unoWindow: { active: false, expiresOnAction: true }
  };
  
  return { state: newState, effects: [] };
};

/**
 * Handle Wild Draw Four challenge.
 */
export const effectChallengeWildDrawFour = (state, action) => {
  const { challengerId, targetId } = action.payload;
  // Need to check if target had a matching color card when they played the Wild Draw 4
  // This requires tracking the hand at time of play - for now, simple version:
  // Assume challenge succeeds (target had matching color) -> challenger draws 6
  // In a full implementation, we'd store the hand state at time of play
  
  const newState = effectDraw(state, {
    type: 'EFFECT_DRAW',
    payload: { playerId: challengerId, count: 6 }
  }).state;
  
  return { state: newState, effects: [] };
};

/**
 * Handle jump-in play.
 */
export const effectJumpIn = (state, action) => {
  const { playerId, card, chosenColor } = action.payload;
  // The card is already played by the reducer; this effect handles turn order change
  // Play continues FROM the jumper
  const playerIds = Object.keys(state.hands);
  const currentIdx = playerIds.indexOf(state.turn.currentPlayerId);
  const jumperIdx = playerIds.indexOf(playerId);
  
  // New turn order starts from jumper
  const newState = {
    ...state,
    turn: {
      ...state.turn,
      currentPlayerId: playerId,
      // Next turn will advance from jumper
    }
  };
  
  return { state: newState, effects: [] };
};

export default {
  effectDraw,
  effectSkip,
  effectReverse,
  effectAddPendingDraw,
  effectSetColor,
  effectSetSwapTarget,
  effectProcessPendingDraw,
  effectColorRoulette,
  effectDiscardAll,
  effectSwapHands,
  effectRotateHands,
  effectCallUno,
  effectChallengeUno,
  effectChallengeWildDrawFour,
  effectJumpIn
};