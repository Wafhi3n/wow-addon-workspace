---
name: curseforge-copy
description: "Write or revise an addon's player-facing copy (the CurseForge page description first, also CHANGELOG entries and the README) in a human voice instead of AI filler: a list of banned words, phrasings and structures, a style (contractions, concrete examples), and a checklist before publishing. Use whenever writing or updating a CurseForge description, a changelog entry, or any text that presents an addon to players."
---

You're writing or revising **copy for players** (CurseForge page, changelog, README). The goal: it
should read like a developer describing their addon, not like an AI. Rules adapted from
`willfrancis.com/how-to-stop-claude-writing-like-an-ai`.

## Rule number one (the most recognizable tell)

**Kill the `**Bold term**: explanation` pattern repeated section after section.** It's THE marker
of AI text. Write prose that flows, or bullets that are plain sentences. A section heading now and
then is fine; a string of "bold heading + paragraph" isn't.

## Banned words

delve, dive into, navigate (figurative), underscore, bolster, foster, harness, leverage, unpack,
shed light on, pave the way, pivotal, groundbreaking, cutting-edge, transformative,
game-changing, innovative, robust, comprehensive, seamless, intricate, nuanced, vibrant,
multifaceted, holistic, testament, landscape, realm (figurative: it's a real word in WoW, keep it
for servers), powerful, exciting, incredible. On the marketing side: "never miss", "does the work
for you" and other slogans.

## Banned phrasings

- Grand openings: "In today's [fast-paced/digital] world...", "At its core...", "When it comes
  to...".
- Filler and fake authority: "It's important/worth noting that...", "plays a crucial role", "it
  cannot be overstated", "underscoring the importance".
- Signposting: "Let's explore", "Now let's turn to", "Let's break it down".
- Restating the question before answering; closing on a grand summary.

## Banned structures (fake depth)

- "It's not just X, it's Y"
- "Not only X, but Y"
- "This isn't about X. It's about Y."
- "No X. No Y. Just Z."
- The automatic rule of three (three adjectives, three examples, everywhere).

## Style

- **Contractions**: it's, don't, won't, you'll, isn't.
- **One em dash (—) at most** on the whole page; otherwise commas or parentheses.
- **English punctuation**: no space before a colon (a French habit); fix " : " wherever you find it.
- **Concrete over abstract**: show what it does with an example (`3 stacks (60)` rather than "smart
  stack display"), not with adjectives.
- **Vary sentence and paragraph length**: no uniform blocks.
- No preamble ("Great question!"), no needless caveats.
- Keep names as they are (the addon's name, its slash command); don't translate proper nouns.

## Checklist before handing it over or publishing

1. Search for `**` followed by `:` or `—`: are there "bold + explanation" sections in a row? Break
   them up.
2. Count the em dashes: more than one? Replace them.
3. Search for " : " (space, colon, space): fix any left.
4. Read one section out loud: would a person say that, or is it marketing filler?
5. No banned word survived.
6. The text opens straight on the subject and doesn't close on a summary.

## Scope

The CurseForge description is the main target (keep it in `CURSEFORGE.md` in the addon's repo,
ignored by the packager). The same rules apply to `CHANGELOG.md` entries and the `README.md`. They
don't apply to in-game strings that go through the locale table: those are interface text, not
marketing copy.
