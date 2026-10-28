# Localization review — 0.0.11

The game ships 20 offline catalogs in `public/translations.js`. Each catalog contains the same Portuguese source keys and numbered placeholders. Keep UI text in its Portuguese source form; the DOM and canvas renderer apply the selected language. Never save translated strings as identifiers, room codes, player names, or campaign data.

This release received an AI-assisted editorial pass on Portuguese and English, corrections to 18 locale glossaries (campaign map, daily challenge, tutorial, controls, touch controls, audio, mute, master volume, music, sound effects, practice, and reserved slot), and targeted phrase corrections. Examples include replacing incorrect automatic translations of “Mute” that meant death, seagull, mothers, or bees, and correcting “campaign” in the Chinese map label.

Version 0.0.10 adds 43 messages per locale (636 total), including diagnostics, graphics settings, combos, boss stages, and online rankings. Portuguese/English received an editorial pass; new core terms in 18 other locales were corrected after local automatic translation.

Version 0.0.11 adds 82 Singleplayer messages per locale (718 total). New core labels for mastery, ranks, elemental routes, objectives, and New Game+ received terminology corrections after local translation. Portuguese and English include an editorial pass on the nine narrative scenes and the new instructions.

**Independent native-speaker review has not been performed.** Longer passages in other locales still include automatic translations. Catalog completeness and automated tests establish technical coverage; they do not establish native fluency.

## Review checklist for contributors

1. Check the menu, playable tutorial, campaign map, daily challenge, controls, audio settings, pause menu, and reconnect messages in context.
2. Keep elemental names and terms for pressure plates, relics, traps, cooldowns, and reserved multiplayer slots consistent.
3. Preserve every `{0}`, `{1}`, and other numbered placeholder exactly, including repeated occurrences.
4. Check clipping on a mobile landscape viewport and right-to-left presentation for Arabic. Physical control keys and canvas geometry stay unchanged.
5. Switch back to Portuguese and then to the reviewed language; dynamic records and instructions should not retain text from the previous language.
6. Run `npm run test:i18n` and record the locale, reviewer, and reviewed scope in the contribution.

No external translation service is contacted while playing. Procedural audio contains no spoken dialogue.
