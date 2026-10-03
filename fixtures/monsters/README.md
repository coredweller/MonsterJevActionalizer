# Monster fixtures

Put real monster JSONs here. They should use the DandDTemplateParser template format (`blankGeneralTemplate.json` / `blankLegendaryTemplate.json`).

The `extract.ts` tests read every `*.json` file in this folder.

New fixtures must pass `npm run check:monsters` with zero changes.

## Naming
`<MonsterName>.CR<n>.<edition>.json`, where the name is PascalCase, `<n>` is the challenge rating and edition is `2014` or `2024`:

- `TunnelWasp.CR5.2014.json`
- `MaestroDrazzuk.CR10.2014.json`

The edition in the filename tells the tests which statblock wording to expect. The normalizer reads `ChallengeRating` from the `.CR<n>.` part when the JSON doesn't have one.

## Authored test monsters
Most fixtures are real monsters supplied by the DM. Two were written for test coverage. Each one says so in its `Notes`:

- `AshenWarpriest.CR5.2014.json`: leveled bonus-action spells next to leveled action spells (one leveled spell per turn), a bonus attack that depends on taking the Attack action, a trait-granted bonus action, and concentration spells.
- `BriarthornHag.CR7.2024.json`: the only 2024-wording fixture. It has attack rolls and saving throws in 2024 wording, Spellcasting as an action with no slots, an X/Day bonus-action spell, a Trigger/Response reaction, 2024 Legendary Resistance wording, and one non-SRD spell that must be marked unknown.

## Most useful monsters
- A general monster whose bonus action is in `SpecialTraits` (e.g. *Nimble Escape*)
- A legendary monster with a recharge ability (e.g. a breath weapon) and legendary actions
- A spellcaster with spell slots (2014) or at-will / X/day spells (2024)
- Anything with Multiattack, an area effect, or an X/day ability
