# Sake Saturday — AI Image Style Guide

## Chosen Direction: Cyberpunk Edo Pixel Art

All AI-generated images in the app should follow this unified aesthetic.

### Base Style Prefix
Use this as the foundation for ALL generated images (profile pics, bottle art, group transforms):

```
Pixel art, cyberpunk Edo period fusion, neon glow on traditional Japanese elements, 
dark background with digital rain and glitch effects, 8-bit meets vaporwave, 
cherry blossom glitch particles, neon kanji accents, cyan and magenta color palette
```

### Profile Pictures by Rank

| Rank | Key | Prompt Suffix |
|------|-----|---------------|
| Murabito (Villager) | `murabito` | `humble rice farmer in a neon-lit village, simple clothes with faint circuit patterns, lantern glow, rain puddles reflecting neon signs` |
| Ashigaru (Foot Soldier) | `ashigaru` | `foot soldier with bamboo spear and light cyber-armor, training grounds with holographic targets, green neon accents` |
| Ronin (Ronin) | `ronin` | `lone wandering swordsman in rain, tattered cloak with glowing seams, neon-tinted puddle reflections, misty cyberpunk alley` |
| Samurai (Samurai) | `samurai` | `full cyber-armored samurai warrior, holographic katana drawn, cherry blossom glitch storm, castle silhouette with neon windows` |
| Daimyō (Feudal Lord) | `daimyo` | `noble lord in ornate robes with circuit-thread embroidery, seated in grand hall with holographic maps, gold and cyan neon` |
| Shōgun (Shogun) | `shogun` | `commanding warlord in mech-enhanced yoroi armor, war room with floating tactical displays, red and cyan neon, imposing presence` |
| Tennō (Emperor) | `tenno` | `divine emperor figure on golden throne, radiant with holographic divine light, floating neon kanji orbit, ultimate power, purple and gold neon` |

### Bottle Art
```
{base style prefix}, sake bottle portrait, dramatic lighting, 
the bottle rendered as a glowing artifact with neon label, 
circuit-pattern condensation, cyberpunk bar counter setting
```

### Group Photo Transform
```
{base style prefix}, group portrait reimagined as cyberpunk Edo warriors,
each person in rank-appropriate cyber-armor, neon dojo or izakaya setting,
sake cups glowing with neon liquid, team portrait composition
```

### Technical Notes
- Resolution: 1K default (square for profile pics)
- Model: Gemini (nano-banana-pro) 
- When source photo available: use as input image for edit mode
- When no source photo: generate from prompt only (silhouette/stylized)
- Store prompt used in `tasting_images.prompt_used` for reproducibility
- Re-generate profile pic on every rank-up
