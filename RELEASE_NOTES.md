# Infinity Castle Elements — INSANITY 0.0.9

## Player Experience Update

- A playable tutorial teaches movement, jumping, elemental powers, and pressure-plate cooperation with a demonstration partner and safe checkpoints.
- Multiplayer and Chaos reserve disconnected players' slots for 30 seconds. The room waits and restores the same element, position, traps, seals, defeated enemies, and power cooldowns. Reloading the same browser tab can resume the session. Leaving through the menu frees the slot immediately.
- A campaign map opens practice on reached levels, including bosses, with separate campaign and practice best times. Old saves retain their progress.
- Keyboard actions can be rebound with conflict checks. Touch buttons have saved size and position settings and a layout preview. Short jump taps are buffered for the next physics frame.
- Original procedural elemental sounds and adaptive music respond to exploration, bosses, and pursuits. Master, music, effects, and mute preferences persist.
- A UTC daily challenge gives everyone the same level and element. Relics, boosts, and adaptive traps are disabled. Local daily results are kept separately from campaign saves.
- Elemental motion trails, articulated running and jumping, shaded metal traps, falling debris, impact dust, and animated hazard pools improve visual feedback. Reduced animation settings disable the added trails and impact particles.
- All 20 offline language catalogs include the new text. Portuguese and English received editorial corrections, along with core terminology in 18 other locales. Independent native-speaker review is still pending.

## Online compatibility

This release uses multiplayer protocol **3**. Deploy the 0.0.9 server before using 0.0.9 clients online. Reservations last 30 seconds in server memory; they cannot survive a server restart. After expiry, players can create or join a room and continue a saved campaign.

Practice and daily play do not overwrite campaign saves, spend campaign boosts, or farm campaign rewards. Daily results are local; no online leaderboard is included. The existing 1,000-level campaign, two-player mode, four-player Chaos, shop, achievements, and offline localization remain available.

## Validation

The validation suite covers all 1,000 levels, 20 translation catalogs and dynamic language switching, visual effect lifecycles, deterministic daily challenges, control configuration, WebAudio scheduling, live multiplayer and Chaos, real 30-second reconnection expiry, and Chromium player flows including offline play and mobile touch controls.
