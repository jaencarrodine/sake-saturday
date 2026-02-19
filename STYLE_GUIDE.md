# Sake Saturday — AI Image Style Guide

## Chosen Direction: Cyberpunk Edo Pixel Art

All AI-generated images in the app should follow this unified aesthetic.

### Base Style Prefix (STATIC — always included)
This is the foundation for ALL generated images. Never omit or change these elements:

```
Pixel art, cyberpunk Edo period fusion, neon glow on traditional Japanese elements, 
dark background with digital rain and glitch effects, 8-bit meets vaporwave, 
cherry blossom glitch particles, neon kanji accents, cyan and magenta color palette
```

### Prompt Generation Strategy

**Static + Dynamic prompts.** The base style prefix and rank/type-specific core scene are always the same. But the AI generates variation elements each time to make every image unique.

#### How it works:

1. **Static layer** (never changes): Base style prefix + rank/type core scene
2. **Dynamic layer** (AI-generated variation): The AI picks from variation categories below to add unique flavor

#### Variation Categories (AI picks 2-3 per generation):

**Weather/Atmosphere:**
- heavy rain with neon reflections
- light snow with pixel flakes
- thick fog with cyan glow bleeding through
- clear night with pixel stars and a glitch moon
- storm with lightning illuminating the scene
- sakura petal storm (glitched)

**Lighting:**
- single neon sign casting hard shadows
- dual-tone lighting (cyan left, magenta right)
- backlit silhouette with rim glow
- overhead fluorescent flicker
- fire/lantern light mixed with neon
- holographic light scatter

**Background Details:**
- towering pagoda with neon signage
- busy pixel marketplace with vendors
- quiet bridge over a glitch-water stream
- rooftop overlooking a neon cityscape
- bamboo forest with circuit-pattern leaves
- ruined temple overgrown with neon vines
- sake bar interior with glowing bottles

**Pose/Action (for characters):**
- standing stoic, arms crossed
- mid-stride walking through rain
- seated in meditation
- looking over shoulder
- drawing/sheathing weapon
- raising a sake cup
- leaning against a wall

**Small Details:**
- pixel birds/cranes in the background
- floating kanji characters (random real kanji)
- holographic wanted posters
- steam rising from a ramen stand
- a pixel cat sitting nearby
- sake bottles lined up on a shelf
- glitch artifacts at the edges

#### Prompt Template:
```
{base style prefix}, {rank/type core scene}, {variation_1}, {variation_2}, {variation_3}
```

#### Example — Two Ronin profile pics with same rank but different vibes:
```
Pixel art, cyberpunk Edo period fusion, neon glow on traditional Japanese elements, 
dark background with digital rain and glitch effects, 8-bit meets vaporwave,
cherry blossom glitch particles, neon kanji accents, cyan and magenta color palette,
lone wandering swordsman in rain, tattered cloak with glowing seams, 
neon-tinted puddle reflections, misty cyberpunk alley,
heavy rain with neon reflections, backlit silhouette with rim glow, a pixel cat sitting nearby
```

```
Pixel art, cyberpunk Edo period fusion, neon glow on traditional Japanese elements,
dark background with digital rain and glitch effects, 8-bit meets vaporwave,
cherry blossom glitch particles, neon kanji accents, cyan and magenta color palette,
lone wandering swordsman in rain, tattered cloak with glowing seams,
neon-tinted puddle reflections, misty cyberpunk alley,
clear night with pixel stars and a glitch moon, seated in meditation, sake bottles lined up on a shelf
```

### Profile Pictures by Rank (Core Scene — STATIC)

| Rank | Key | Core Scene (always included) |
|------|-----|------------------------------|
| Murabito (Villager) | `murabito` | `humble rice farmer in a neon-lit village, simple clothes with faint circuit patterns, lantern glow, rain puddles reflecting neon signs` |
| Ashigaru (Foot Soldier) | `ashigaru` | `foot soldier with bamboo spear and light cyber-armor, training grounds with holographic targets, green neon accents` |
| Ronin (Ronin) | `ronin` | `lone wandering swordsman in rain, tattered cloak with glowing seams, neon-tinted puddle reflections, misty cyberpunk alley` |
| Samurai (Samurai) | `samurai` | `full cyber-armored samurai warrior, holographic katana drawn, cherry blossom glitch storm, castle silhouette with neon windows` |
| Daimyō (Feudal Lord) | `daimyo` | `noble lord in ornate robes with circuit-thread embroidery, seated in grand hall with holographic maps, gold and cyan neon` |
| Shōgun (Shogun) | `shogun` | `commanding warlord in mech-enhanced yoroi armor, war room with floating tactical displays, red and cyan neon, imposing presence` |
| Tennō (Emperor) | `tenno` | `divine emperor figure on golden throne, radiant with holographic divine light, floating neon kanji orbit, ultimate power, purple and gold neon` |

### Bottle Art (Core Scene — STATIC)
```
sake bottle portrait, dramatic lighting, the bottle rendered as a glowing artifact 
with neon label, circuit-pattern condensation, cyberpunk bar counter setting
```
AI adds variation from: Lighting, Background Details, Small Details categories.

### Group Photo Transform (Core Scene — STATIC)
```
group portrait reimagined as cyberpunk Edo warriors, each person in rank-appropriate 
cyber-armor, neon dojo or izakaya setting, sake cups glowing with neon liquid, 
team portrait composition
```
AI adds variation from: Weather/Atmosphere, Lighting, Background Details categories.

### Implementation Notes

When generating an image, the AI agent should:
1. Start with the base style prefix (static)
2. Add the rank/type core scene (static)  
3. Pick 2-3 variations from the categories above (AI chooses based on what feels right — randomized each time)
4. Compose the final prompt
5. Store the full prompt in `tasting_images.prompt_used` or equivalent for reproducibility
6. If regenerating (e.g., rank-up), ALWAYS pick new variations — never reuse the old prompt

### Technical Notes
- Resolution: 1K default (square for profile pics)
- Model: Gemini (nano-banana-pro)
- When source photo available: use as input image for edit mode
- When no source photo: generate from prompt only (silhouette/stylized)
- Store prompt used for reproducibility
- Re-generate profile pic on every rank-up with fresh variations
- Send generated images via Twilio MMS in WhatsApp chat
