---
name: ""
bottling co: ""
Prefecture: ""
Grade: ""
Type: ""
alc%: ""
SMV: ""
Rice: ""
Polishing Ratio: ""
Opacity: ""
profile: ""
Serving Temp: ""
date: ""
Average score: ""
tags:
  - sake
---

> [!note] This is a design document for a sake review app, not a sake review.

## Sake Uploader App Design

### Input
- Images of front and back of sake bottle
- Use image model to extract key details and run research to fill fields
- Uses device location as metadata for tasting

### Rater System
- Access generated when another user adds you to their tasting

### Tasting Flow
1. Take image of front and back of sake
2. Give your rating
3. Add tasters
   - Choose from list of existing tasters or add new
     - Name
     - Profile picture - nano banana AI prompt optional
     - Email (optional, creates account, links invited by tasting creator)
     - Optional invite link with QR code for self-service score entry
   - Taster score and notes
4. Add images (optional AI prompt)
5. Tasting page generates: images, summary of scores and notes, AI bottle image

### Home Page
- Sake list (top/bottom, filters: location/type/score, sort)
- Tasters list (top/bottom taster, filters, sort)
- Tastings list (filter: sake/date/score/location)
- Tastings stats (count, tasters count, locations map)

### Sake Page
- Image (3JS bottle render?)
- All scores, average score
- Profile and details
- Tastings list

### Tasting Page
- Scores and notes by taster
- Sake details, avg score

### Taster Page
- All scores and notes
- Profile pic, aura, top sakes

### MVP
- Hardcoded tasting flow
- Sake list sorted by top sake
- Tasting page
- Basic sake page
- Collect all data needed for future features
