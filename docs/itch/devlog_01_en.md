# Devlog #1: The first playtest, and why the dead won't stay down

Hi everyone, this is the first playtest build of **Doodle Battlefield**, a turn-based tactics game you play right in the browser. This post covers what is in the game, a few design decisions worth sharing, and what comes next.

## The core idea: no dice

I love tactics games but hate losing to a missed 95% roll. So from day one, Doodle Battlefield has **no randomness in combat**. Before every attack you see exactly how much damage you will deal, how much you will take back, and whether the target falls. The challenge is not luck but positioning: high ground, forests, flanking, and keeping your troops from breaking.

## Three factions, three ways to fight

- **Humans** draw strength from structures. Villages, towers and strongholds give full defense; nature only helps half as much. Marines can cut timber, build boats and shoot from the river.
- **Orcs** are the opposite: forests and hills are home, structures only help half as much. Goblins hide in the woods, invisible to humans, and ambush anyone who walks by.
- **The Undead** are the corpses of fallen warriors from both sides, still in their old uniforms. They have no morale and never flee, but they are slower and hit softer than in life. The whole host depends on a single necromancer: bring him down and everything collapses.

There is also morale (eager troops hit harder, wavering troops may break and flee), fortifying, merging and splitting squads, veterans that level up, and 4 missions: Skirmish, Hold out, Raze the camp, and Escort.

## Newest feature: graves of the fallen

The Undead started out fairly tame; the necromancer just stood at the back casting bolts. This build gives him a necromancer's real job: **raising the enemy dead**.

- A fallen human squad leaves a grave where it died.
- If the grave is within **7 tiles** of the necromancer, after **2 turns** it rises as undead of the same unit type, at half strength.
- Undead that fall are gone for good; they cannot be raised twice.
- To stop it, spend a squad's turn next to the grave to **bury the fallen**: the soldiers are laid to rest and the necromancer can no longer call them back.

During design, the first proposed radius was 15 to 20 tiles. That sounds like a limit, but the small map is only 16×20, so a 15-tile reach covers almost the whole battlefield. Seven tiles covers the fight itself and forces the necromancer to move up close to the front, where he is easier to hunt. Every battle now has an extra question: push forward, or fall back and bury your friends?

Graves within the necromancer's reach glow with a pale green ring and a turn countdown. Select the necromancer to see his raising zone tinted purple.

## Balancing by letting the AI fight itself

Balance is measured by running dozens of AI-vs-AI games per setup. A few numbers on the small map:

- Skirmish against the Undead: Undead win rate went from 48% before graves to 57% after.
- Hold out against the Undead used to be the easiest mission in the game, with humans holding over 90% of the time. The problem was not that the Undead were weak but that they were **slow** and could not reach the stronghold in time. The fix: Undead reinforcements now rise at the map edge beside your stronghold, marked by flags from the start so you can prepare. The Undead now win about 28%, close to the Orcs (30%).

The AI does not play like a person, so these numbers are only a starting point. That is exactly why this playtest exists.

## Visuals

The map uses pixel-art terrain with shimmering water, or you can switch to a hand-drawn paper style from the toolbar. Unit portraits and character sheets use a painterly 2D style and serve as material for upcoming trailers.

## What's next

- Rebalance Hold out against the Undead on large maps (still too hard for the Undead)
- Proper sprites for graves
- AI that uses boats and actively attacks camps
- A multi-mission campaign that carries veteran squads between battles
- A trailer for each faction

## I need you

Play a match or two and leave a comment: what was confusing, which missions felt too easy or too hard, any bugs you hit (with device and browser if you can). Every piece of feedback gets read.

Thanks for playing!
