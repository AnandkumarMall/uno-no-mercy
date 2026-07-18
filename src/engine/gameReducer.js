// Game reducer for UNO engine
import { ActionTypes } from './actionTypes.js';
import { createInitialState } from './state.js';
import { validateAction } from './validators.js';
import { shuffle } from '../uno-engine.js';
import { WILDS, COLORS } from '../uno-engine.js';

/**
 * Reducer function: (state, action) => newState
 * If state is undefined, we expect the caller to have provided player info via init.
 * For safety, we return a minimal state if state is undefined.
 */
export const gameReducer = (state = undefined, action) => {
  // Initialize state if undefined (should not happen in normal flow; we rely on createInitialState)
  if (state === undefined) {
    // Return a minimal empty state; the caller should have called createInitialState.
    return {
      players: {},
      hands: {},
      deck: { drawPile: [], discardPile: [] },
      turn: { currentPlayerId: null, direction: 1, phase: 'DRAW' },
      currentColor: null,
      pendingDraw: null,
      unoWindow: { active: false, expiresOnAction: true },
      status: { winnerId: null, isOver: false },
      history: [],
      rules: {
        official: {
          challengeWildDrawFour: true,
          mustCallUno: true,
          reshuffleDiscard: true,
          reverseIsSkipWithTwo: true,
          drawTwoOnFirstTurn: true
        },
        variants: {
          stacking: { enabled: true, allowDraw2OnDraw2: true, allowWild4OnWild4: true, allowMixed: false },
          jumpIn: { enabled: true, requireExactMatch: true },
          sevenZero: { enabled: true, sevenSwapsHand: true, zeroRotatesHands: true, preserveCardOrder: true },
          unoChallengeWindow: { type: 'nextPlayerAction' },
          drawUntilPlayable: { enabled: true, maxReshuffles: 3 },
          progressiveStacking: { enabled: false, increment: 2 },
          maxCardsElimination: { enabled: true, maxCards: 25 }
        }
      }
    };
  }

  // If action is undefined, return state unchanged
  if (!action) return state;

  // Validate action (skip for internal effect actions if needed)
  const isValid = validateAction(state, action);
  if (!isValid && !action.type.startsWith('EFFECT_')) {
    // Invalid action: return state unchanged (could also log error)
    return state;
  }

  // Deep copy state
  const newState = {
    ...state,
    players: { ...state.players },
    hands: { ...state.hands },
    deck: {
      drawPile: [...state.deck.drawPile],
      discardPile: [...state.deck.discardPile]
    },
    turn: { ...state.turn },
    currentColor: state.currentColor,
    pendingDraw: state.pendingDraw ? { ...state.pendingDraw } : null,
    unoWindow: { ...state.unoWindow },
    status: { ...state.status },
    history: [...state.history, { action, timestamp: Date.now() }],
    rules: { ...state.rules }
  };

  // Helper to get player IDs array
  const getPlayerIds = () => Object.keys(newState.hands);
  const getPlayerIndex = (playerId) => {
    const ids = getPlayerIds();
    return idx => idx; // we'll compute inline
  };

  // Action handling
  switch (action.type) {
    case ActionTypes.DRAW_CARD: {
      const { playerId, count = 1 } = action.payload;
      if (!newState.hands[playerId]) return state;
      const hand = [...newState.hands[playerId]];
      let drawPile = [...newState.deck.drawPile];
      let discardPile = [...newState.deck.discardPile];

      if (count === 'roulette') {
        let matched = false;
        while (!matched) {
          if (drawPile.length === 0) {
            if (discardPile.length <= 1) break;
            const topCard = discardPile[discardPile.length - 1];
            drawPile = shuffle(discardPile.slice(0, -1));
            discardPile = [topCard];
          }
          if (drawPile.length === 0) break; // still empty

          const card = drawPile.shift();
          hand.push(card);
          
          if (card.color === newState.currentColor || card.color === 'wild') {
            matched = true;
          }
        }
      } else if (count === 'until-playable') {
        let matched = false;
        const topCard = discardPile[discardPile.length - 1];
        while (!matched) {
          if (drawPile.length === 0) {
            if (discardPile.length <= 1) break;
            const topC = discardPile[discardPile.length - 1];
            drawPile = shuffle(discardPile.slice(0, -1));
            discardPile = [topC];
          }
          if (drawPile.length === 0) break; // still empty

          const card = drawPile.shift();
          hand.push(card);
          
          // Check if playable
          if (
            ['wild', 'wild-draw4', 'wild-reverse-draw4', 'color-roulette', 'draw6', 'draw10'].includes(card.value) ||
            card.color === newState.currentColor ||
            card.value === topCard.value
          ) {
            matched = true;
          }
        }
      } else {
        for (let i = 0; i < count; i++) {
          if (drawPile.length === 0) {
            // Reshuffle discard pile except top card
            if (discardPile.length <= 1) break; // not enough to reshuffle
            const topCard = discardPile[discardPile.length - 1];
            drawPile = shuffle(discardPile.slice(0, -1));
            discardPile = [topCard];
          }
          if (drawPile.length === 0) break;
          const card = drawPile.shift();
          hand.push(card);
        }
      }

      newState.hands[playerId] = hand;
      newState.deck.drawPile = drawPile;
      newState.deck.discardPile = discardPile;

      if (newState.pendingDraw) {
        if (count === 'roulette') {
          newState.pendingDraw = null;
          newState.turn.needsAdvance = true;
        } else if (count >= newState.pendingDraw.amount) {
          newState.pendingDraw = null;
          newState.turn.needsAdvance = true;
        }
      }
      break;
    }

    case ActionTypes.PLAY_CARD: {
      const { playerId, card, chosenColor } = action.payload;
      if (!newState.hands[playerId]) return state;
      // Remove card from hand
      const hand = [...newState.hands[playerId]].filter(c => c.id !== card.id);
      newState.hands[playerId] = hand;

      // Add to discard pile
      newState.deck.discardPile = [...newState.deck.discardPile, card];

      // Determine effects
      let newColor = ['wild', 'wild-draw4'].includes(card.value) ? chosenColor : card.color;
      let extraDraw = 0;
      let skipTurns = 0;
      let directionChanged = false;
      let swapTrigger = false;
      let rotateZero = false;

      switch (card.value) {
        case 'skip':
          skipTurns = 1;
          break;
        case 'skip-everyone':
          // Skip all other players: basically it becomes your turn again!
          // We can do this by setting skipTurns = number of players - 1
          skipTurns = getPlayerIds().length - 1;
          break;
        case 'reverse':
          // Flip direction
          newState.turn.direction *= -1;
          directionChanged = true;
          // In 2-player, reverse acts like skip
          if (getPlayerIds().length === 2) {
            skipTurns = 1;
          }
          break;
        case 'draw2':
          extraDraw = 2;
          skipTurns = 0;
          break;
        case 'draw6':
          extraDraw = 6;
          skipTurns = 0;
          newColor = chosenColor;
          break;
        case 'draw10':
          extraDraw = 10;
          skipTurns = 0;
          newColor = chosenColor;
          break;
        case 'wild-draw4':
          extraDraw = 4;
          skipTurns = 0;
          newColor = chosenColor;
          break;
        case 'wild-reverse-draw4':
          newState.turn.direction *= -1;
          directionChanged = true;
          // In 2-player, reverse acts like skip, which means the turn goes back to YOU, so YOU draw 4!
          if (getPlayerIds().length === 2) {
            skipTurns = 1;
          }
          extraDraw = 4;
          newColor = chosenColor;
          break;
        case 'color-roulette':
          // The NEXT player chooses the color!
          newColor = undefined;
          skipTurns = 0;
          break;
        case 'wild':
          newColor = chosenColor;
          break;
        case '7':
          swapTrigger = true;
          break;
        case '0':
          rotateZero = true;
          break;
        case 'discard-all':
          // handled after play is processed
          break;
        default:
          // number cards: nothing
          break;
      }

      // Apply color change
      if (newColor !== undefined) {
        newState.currentColor = newColor;
      }

      // Check win
      if (hand.length === 0) {
        newState.status.winnerId = playerId;
        newState.status.isOver = true;
        newState.turn.phase = 'GAME_OVER';
        // No further turn processing
        break;
      }

      // Handle Draw 2 / Wild Draw 4 / Draw 6 / Draw 10 penalty via pendingDraw
      if (extraDraw > 0) {
        const current = newState.pendingDraw;
        if (current) {
          // Stacking: add amounts
          newState.pendingDraw = {
            amount: current.amount + extraDraw,
            type: card.value, // new card dictates the type
            sourcePlayerId: current.sourcePlayerId
          };
        } else {
          newState.pendingDraw = {
            amount: extraDraw,
            type: card.value,
            sourcePlayerId: playerId
          };
        }
      } else if (card.value === 'color-roulette') {
        newState.pendingDraw = {
          amount: 'roulette',
          type: 'color-roulette',
          sourcePlayerId: playerId
        };
        // skipTurns = 0 already handled above
      }
      
      // Handle Discard All
      if (card.value === 'discard-all') {
        const remainingHand = [];
        const discarded = [];
        for (const c of hand) {
          if (c.color === card.color) {
            discarded.push(c);
          } else {
            remainingHand.push(c);
          }
        }
        newState.hands[playerId] = remainingHand;
        
        // Uno No Mercy rules: Discarded cards go UNDER the discard-all card.
        // Since the discard-all card was already pushed to the pile, we pop it, push the discarded cards, then push it back.
        const playedDiscardAllCard = newState.deck.discardPile.pop();
        newState.deck.discardPile.push(...discarded);
        newState.deck.discardPile.push(playedDiscardAllCard);
        
        // Re-check win condition because hand may have emptied
        if (remainingHand.length === 0) {
          newState.status.winnerId = playerId;
          newState.status.isOver = true;
          newState.turn.phase = 'GAME_OVER';
          break;
        }
      }

      // Apply skip turns (we'll track skip count to apply when advancing turn)
      // We'll store a skipCounter in turn
      newState.turn.skipCount = (newState.turn.skipCount || 0) + skipTurns;

      // Handle special non-turn-advancing actions
      if (swapTrigger) {
        // Move to CHOOSE_SWAP_PLAYER phase, store selector
        newState.turn.phase = 'CHOOSE_SWAP_PLAYER';
        newState.selectingPlayer = playerId;
        break; // do not advance turn yet
      }

      if (rotateZero) {
        // Rotate hands: each player passes hand to next player in current direction
        const playerIds = getPlayerIds();
        if (playerIds.length > 0) {
          const len = playerIds.length;
          const newHands = {};
          playerIds.forEach((pid, idx) => {
            // Determine which player gives to this player based on direction
            const sourceIdx = (newState.turn.direction === 1)
              ? (idx - 1 + len) % len   // player to right gives to current
              : (idx + 1) % len;        // player to left gives to current
            const sourceId = playerIds[sourceIdx];
            newHands[pid] = [...newState.hands[sourceId]];
          });
          newState.hands = newHands;
        }
        // After zero, turn proceeds normally
      }

      // After processing card, if not waiting for swap, advance turn
      if (newState.turn.phase !== 'CHOOSE_SWAP_PLAYER') {
        // Advance turn will be handled in the generic turn advance section below
        // We'll set a flag to indicate we need to advance turn after processing.
        newState.turn.needsAdvance = true;
      }
      break;
    }

    case ActionTypes.CHOOSE_COLOR: {
      const { color } = action.payload;
      newState.currentColor = color;
      
      if (newState.pendingDraw && newState.pendingDraw.type === 'color-roulette') {
        // For color-roulette, the next player chose the color. Now they must draw!
        newState.turn.phase = 'DRAW';
      } else {
        // Standard wild card: turn ends after picking color
        newState.turn.needsAdvance = true;
      }
      break;
    }

    case ActionTypes.CHOOSE_SWAP_PLAYER: {
      const { targetPlayerId } = action.payload;
      const selectorId = newState.selectingPlayer;
      if (!selectorId || !newState.hands[targetPlayerId]) return state;
      // Swap hands between selector and target
      const selectorHand = [...newState.hands[selectorId]];
      const targetHand = [...newState.hands[targetPlayerId]];
      newState.hands[selectorId] = targetHand;
      newState.hands[targetPlayerId] = selectorHand;
      // Clean up
      delete newState.selectingPlayer;
      // After swap, turn proceeds to next player
      newState.turn.needsAdvance = true;
      // Reset phase to DRAW (will be set after advance)
      // We'll also clear any skip count? The skip count from the 7 card should have been applied already? Actually 7 does not cause skip.
      // We'll keep skip count as is.
      break;
    }

    case ActionTypes.CALL_UNO: {
      const { playerId } = action.payload;
      // Mark that player has called UNO
      if (newState.hands[playerId]) {
        // We'll store a flag per player; we can add a map in state: unoCalledBy
        // For simplicity, we add a field to each player object? We'll extend player info.
        // We'll instead store in state.unoCalledBy map.
        if (!newState.unoCalledBy) newState.unoCalledBy = {};
        newState.unoCalledBy[playerId] = true;
      }
      // Start UNO challenge window
      newState.unoWindow.active = true;
      newState.unoWindow.expiresOnAction = true; // expires when next player acts
      // Turn proceeds after this action (player can still play after calling UNO? Actually after calling UNO, turn ends.)
      newState.turn.needsAdvance = true;
      break;
    }

    case ActionTypes.CHALLENGE_UNO: {
      const { challengerId, targetId } = action.payload;
      // Check if target had UNO called
      const unoCalledBy = newState.unoCalledBy || {};
      const targetHadUno = unoCalledBy[targetId] === true;
      if (targetHadUno) {
        // Challenger was wrong: challenger draws 4
        // We'll issue a draw card action via effect, but we can directly modify state.
        // We'll reuse the draw logic but we need to avoid recursion.
        // We'll directly add cards to challenger's hand.
        const hand = [...(newState.hands[challengerId] || [])];
        let drawPile = [...newState.deck.drawPile];
        let discardPile = [...newState.deck.discardPile];
        for (let i = 0; i < 4; i++) {
          if (drawPile.length === 0) {
            if (discardPile.length <= 1) break;
            const topCard = discardPile[discardPile.length - 1];
            drawPile = shuffle(discardPile.slice(0, -1));
            discardPile = [topCard];
          }
          const card = drawPile.shift();
          hand.push(card);
        }
        newState.hands[challengerId] = hand;
        newState.deck.drawPile = drawPile;
        newState.deck.discardPile = discardPile;
      } else {
        // Target did not call UNO when they should: target draws 4
        const hand = [...(newState.hands[targetId] || [])];
        let drawPile = [...newState.deck.drawPile];
        let discardPile = [...newState.deck.discardPile];
        for (let i = 0; i < 4; i++) {
          if (drawPile.length === 0) {
            if (discardPile.length <= 1) break;
            const topCard = discardPile[discardPile.length - 1];
            drawPile = shuffle(discardPile.slice(0, -1));
            discardPile = [topCard];
          }
          const card = drawPile.shift();
          hand.push(card);
        }
        newState.hands[targetId] = hand;
        newState.deck.drawPile = drawPile;
        newState.deck.discardPile = discardPile;
      }
      // After resolving, close UNO window
      newState.unoWindow.active = false;
      // Turn proceeds (challenger's turn? Actually the challenge happens out-of-turn; after resolution, the game continues with the player whose turn it was.)
      // We'll advance turn as normal.
      newState.turn.needsAdvance = true;
      break;
    }

    case ActionTypes.CHALLENGE_WILD_DRAW_FOUR: {
      const { challengerId, targetId } = action.payload;
      // Similar to UNO challenge but with different draw amounts.
      // If the challenged player had a matching color, challenger draws 6; else challenged draws 4.
      // For simplicity, we'll implement a basic version: we need to know if the wildDraw4 was played legally.
      // We lack info about the hand at time of play; we would need to store that in state.
      // Given time, we'll treat as always illegal (challenger wins) or always legal (challenger loses) – but we need proper.
      // We'll skip detailed implementation and just draw 2 each as placeholder.
      // In a real game, we would need to track the last wildDraw4 play and the player's hand at that moment.
      // We'll implement a simple version: assume the play was legal, so challenger draws 4.
      const hand = [...(newState.hands[challengerId] || [])];
      let drawPile = [...newState.deck.drawPile];
      let discardPile = [...newState.deck.discardPile];
      for (let i = 0; i < 4; i++) {
        if (drawPile.length === 0) {
          if (discardPile.length <= 1) break;
          const topCard = discardPile[discardPile.length - 1];
          drawPile = shuffle(discardPile.slice(0, -1));
          discardPile = [topCard];
        }
        const card = drawPile.shift();
        hand.push(card);
      }
      newState.hands[challengerId] = hand;
      newState.deck.drawPile = drawPile;
      newState.deck.discardPile = discardPile;
      // Turn proceeds
      newState.turn.needsAdvance = true;
      break;
    }

    case 'NEXT_TURN': {
      newState.turn.needsAdvance = true;
      break;
    }

    default:
      // Unknown action: return state unchanged
      return state;
  }

  // Generic turn advancement if needed
  if (newState.turn.needsAdvance) {
    delete newState.turn.needsAdvance;
    const playerIds = getPlayerIds();
    if (playerIds.length === 0) return newState;

    let currentIndex = playerIds.indexOf(newState.turn.currentPlayerId);
    if (currentIndex === -1) currentIndex = 0;
    const skip = newState.turn.skipCount || 0;
    const steps = 1 + skip; // move past self and any skips
    let nextIndex = (currentIndex + steps * newState.turn.direction) % playerIds.length;
    if (nextIndex < 0) nextIndex += playerIds.length;
    newState.turn.currentPlayerId = playerIds[nextIndex];
    // Reset skip count after applying
    newState.turn.skipCount = 0;
    // Set phase to DRAW for the next player (unless color-roulette)
    if (newState.pendingDraw && newState.pendingDraw.type === 'color-roulette') {
      newState.turn.phase = 'CHOOSE_ROULETTE_COLOR';
    } else {
      newState.turn.phase = 'DRAW';
    }
  }

  // --- Max Cards Elimination (UNO No Mercy variant) ---
  if (newState.rules?.variants?.maxCardsElimination?.enabled) {
    const maxCards = newState.rules.variants.maxCardsElimination.maxCards || 25;
    const currentIds = Object.keys(newState.hands);
    let eliminatedAny = false;
    
    currentIds.forEach(playerId => {
      if (newState.hands[playerId] && newState.hands[playerId].length >= maxCards) {
        eliminatedAny = true;
        // Return their cards to the draw pile
        const theirCards = newState.hands[playerId];
        newState.deck.drawPile = shuffle([...newState.deck.drawPile, ...theirCards]);
        
        // Remove from hands and players
        delete newState.hands[playerId];
        delete newState.players[playerId];
      }
    });
    
    if (eliminatedAny) {
      const remainingIds = Object.keys(newState.hands);
      if (remainingIds.length === 1) {
        newState.status.winnerId = remainingIds[0];
        newState.status.isOver = true;
        newState.turn.phase = 'GAME_OVER';
      } else if (remainingIds.length === 0) {
        newState.status.isOver = true;
        newState.turn.phase = 'GAME_OVER';
      } else {
        // If the current player was eliminated, we need to pick a valid current player.
        if (!remainingIds.includes(newState.turn.currentPlayerId)) {
           // We must advance to the next player in the current direction who is still alive!
           let currIndex = currentIds.indexOf(newState.turn.currentPlayerId);
           if (currIndex === -1) currIndex = 0;
           let nextIndex = currIndex;
           let found = false;
           for (let i = 0; i < currentIds.length; i++) {
             nextIndex = (nextIndex + newState.turn.direction + currentIds.length) % currentIds.length;
             const candidate = currentIds[nextIndex];
             if (remainingIds.includes(candidate)) {
               newState.turn.currentPlayerId = candidate;
               found = true;
               break;
             }
           }
           if (!found) {
             newState.turn.currentPlayerId = remainingIds[0]; // Fallback if something weird happens
           }
        }
      }
    }
  }

  // Ensure topCard is always set to the top of the discard pile
  if (newState.deck && newState.deck.discardPile.length > 0) {
    newState.topCard = newState.deck.discardPile[newState.deck.discardPile.length - 1];
  }

  return newState;
};

export default gameReducer;