# Infinity Castle Elements — INSANITY 0.0.11

## Solo Expedition Update

- **40 authored Singleplayer rooms:** four challenge families at levels 20, 40, 60, and 80 in each region, with ordered power runes, fragment collection, ascending paths, and platform challenges. Region finales remain guardians.
- **Elemental side routes:** Earth creates a bridge, Air rides an updraft, Light reveals steps, and Darkness phases through a veil. Every special room keeps a main route for all four elements.
- **Element mastery:** unique clears, routes, and optional objectives earn XP independently for each element. Titles and cosmetic outfit/cloak/aura tiers unlock at 60, 180, and 360 XP. Repeated achievements do not farm mastery; practice and daily activities award none.
- **Optional objectives:** finish a level visit without deaths, avoid powers in the winning attempt where possible, beat a target time, find secrets, or explore an elemental route. A collapsible panel tracks current conditions.
- **Practice ghosts:** display your best recorded route for the same level, element, and campaign variant. Ghosts use actual player positions and never affect collisions, traps, plates, or scores. Runs up to three minutes can be recorded; the device keeps 24 recent best recordings.
- **Memories between regions:** nine short scenes offer persistent decisions that influence three narrative endings. Pending choices survive returning to the menu and reloading. Existing campaigns retain their current level.
- **New Game+:** unlocked by finishing the original solo campaign, including legacy completed solo saves. Faster patrols/mechanisms, crosswinds, and altered guardian attacks use separate campaign saves, deaths, unlocks, records, ghosts, and story choices. Cosmetic mastery, coins, and inventory remain shared.
- **20 offline languages:** 82 new messages per catalog, with editorial corrections to new core terminology. Independent native-speaker review remains pending.
- English README, refreshed in-engine screenshots, and Windows/Android downloads at the beginning of the README.

No preactivation clues were added to hidden traps. Tutorial, daily challenge, and campaign-map activities remain under Singleplayer. Multiplayer and Chaos layouts and daily replay physics retain their existing behavior. Multiplayer protocol stays **4**.

## Save and recording notes

Original campaign progress remains intact when starting New Game+. This release provides one NG+ campaign, with completed levels available for practice; it does not add endless NG+ cycles. Mastery rewards are cosmetic. Previous best times cannot display a ghost until a run is recorded in 0.0.11. Runs over three minutes retain their records but do not create a ghost.

## Validation

The suite audits the 1,000 base levels and all 40 authored rooms, traverses 320 authored main routes with real physics (four elements, original/NG+, enemy damage disabled for traversal), and verifies the four powered side routes, ordered rune/fragment gates, XP deduplication, ghost bounds, save migration, alternative NG+ boss patterns, and narrative endings. Browser tests cover live key input, campaign/activity isolation, cosmetics, ghost toggles, pending decisions through reload, and separate NG+ saves, records, and story. Existing language, graphics, audio, controls, updater, multiplayer, reconnect, and daily replay checks remain in place.

Online daily leaderboard persistence still requires a Railway volume mounted at `/data`, as documented in the README. Existing online session/reconnect reservations live in server memory and do not survive a server restart.
