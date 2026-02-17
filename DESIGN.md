# Sake Saturday — Design Reference

## Base Aesthetic: open.jaen Terminal + Japanese Cyberpunk Izakaya

Take the open.jaen computer terminal / ASCII / retro-hacker dashboard aesthetic and infuse it with Japanese cyberpunk izakaya energy.

## Core Design DNA (from open.jaen)

### Font
- **VT323** (Google Font) — monospace retro terminal font. This is THE font. Use it for everything.
- Import: `import { VT323 } from 'next/font/google'`
- Apply to body: `className={vt323.className}`

### Layout Pattern
- **Full-screen black background** (`bg-black`)
- **Outer frame** with thin border (`border border-primary`) and a centered title label that sits on top of the border with black background behind it
- **Grid-based content** using CSS Grid (`grid-cols-12 grid-rows-12`) with bordered sections
- Each section is a `GridArea` — a bordered box with a title label that overlaps the top border

### GridArea Component Pattern
```
┌──── Title ──────────────────┐
│                             │
│  Content here               │
│                             │
└─────────────────────────────┘
```
- Title sits on the top border, offset with `-translate-y-1/2`
- Title has vertical pipe decorators: `|Title|`
- First letter of title is highlighted in accent color
- Border: `border border-primary` (muted purple `#5C588D`)
- Highlight border on focus/select: `border-primary-highlight` (bright purple `#9694FF`)

### Data Display Components
- **BlockGauge**: Score bars made of `■` characters with color gradients. Each block is a Unicode square.
- **NumberScramble**: Numbers that scramble/reveal like a slot machine when loading. Letters randomize then resolve left-to-right.
- Horizontal data rows with dotted/dashed line separators (`border-dashed border-[#303030]`)
- Label on left, value on right, connected by a dashed line

### Color Palette (open.jaen base)
- Background: `#000000` (pure black)
- Primary border: `#5C588D` (muted purple)
- Primary highlight: `#9694FF` (bright purple)
- Text: `#FFFFFF` (white)
- Muted text: `rgba(255,255,255,0.8)`
- Money/positive: `#79C39A` (green)
- Inactive blocks: `#2A2A2A`
- Divider lines: `#303030`

## Japanese Cyberpunk Layer (NEW for Sake Saturday)

### Color Additions
Keep the black base but shift the accent palette to sake/izakaya colors:
- **Sake Gold**: `#C4A35A` — primary accent (replaces purple highlight for key elements)
- **Neon Pink**: `#FF0080` — hot accent for scores, rankings, important data
- **Electric Cyan**: `#00D4FF` — secondary accent for links, interactive elements
- **Warm Red**: `#E84545` — low scores, warnings
- Keep `#5C588D` as border color — it works with the Japanese palette

### Japanese Typography
- Add **Noto Sans JP** for Japanese characters (section titles get kanji subtitles)
- Section titles: English + small kanji subtitle below. E.g., "SAKE RANKINGS" with "酒ランキング" below
- Decorative kanji watermarks at very low opacity (`opacity-[0.03]`) as background texture in sections
- Use Japanese bracket decorators instead of pipes: `【Title】` or `「Title」`

### Terminal Japanese Fusion Elements
- Section titles formatted like: `【S】ake Rankings ── 酒ランキング`
- Score display as terminal readout: `SCORE: 8.5 ■■■■■■■■■░░ EXCELLENT`
- Use BlockGauge for all score visualizations with sake-themed gradients:
  - Score gauge: `#E84545` (red/low) → `#C4A35A` (gold/mid) → `#79C39A` (green/high)
- Taster names displayed with monospace formatting: `> JAEN .............. 7.5`
- Sake stats displayed as key-value terminal output:
  ```
  PREFECTURE: Akita
  GRADE:      Daiginjo
  RICE:       Yamada Nishiki
  POLISH:     45%
  ABV:        15.5%
  SMV:        +3
  ```

### Frame
- Outer frame title: `【 SAKE SATURDAY 酒の土曜日 】`
- Controls bar (top-left): `← Nav → | ↑ Scroll ↓ | ⏎ Select`
- Status indicator (top-right): Show total sakes / tastings / tasters count

### Specific Page Layouts

#### Home Page (Grid Dashboard)
Like open.jaen — a single-screen grid dashboard:
- `【S】ake Rankings 酒ランキング` — grid area, list of sakes with BlockGauge scores
- `【T】aster Board 利酒師` — grid area, leaderboard with NumberScramble stats
- `【R】ecent 最近の利酒` — grid area, recent tastings timeline
- `【S】tats 統計` — grid area, total counts with NumberScramble

#### Sake Detail Page
- Sake name large at top with kanji if available
- Stats in terminal key-value format
- Score breakdown using BlockGauge per taster
- Tastings list below

#### Tasting Detail Page
- Sake info header
- Each taster's score as a row with BlockGauge
- Notes displayed in monospace

#### Taster Profile Page
- Name + stats (NumberScramble for counts)
- Score history list

### Animations
- NumberScramble on all numeric values (scores, counts, percentages)
- Subtle scanline overlay (optional, very low opacity CSS repeating-linear-gradient)
- Cursor blink on selected/active elements

### Responsive
- Desktop: Full grid layout like open.jaen
- Mobile: Stack grid areas vertically, single column

## Key Components to Build/Port from open.jaen
1. `Frame` — outer border with title and controls
2. `GridArea` — bordered section with overlapping title (adapt with Japanese brackets)
3. `BlockGauge` — block character score bars (already exists in open.jaen, copy it)
4. `NumberScramble` — scrambling number display (already exists, copy it)
5. `ScoreBadge` — keep but style as terminal output
6. `SakeCard` — sake name + grade + BlockGauge score in a compact row
7. `TasterRow` — taster name + dotted line + score (terminal ls style)

## NPM Dependencies Needed
- VT323 font (via next/font/google, already available)
- Noto Sans JP (via next/font/google)
- No new packages needed — this is all CSS + monospace characters
