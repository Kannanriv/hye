# Engagement Concepts

Psychological patterns for increasing user interest, involvement, and retention.

## Table of Contents
1. [Curiosity Gap](#curiosity-gap)
2. [Decoy Effect](#decoy-effect)
3. [Doherty Threshold](#doherty-threshold)
4. [Empathy Gap](#empathy-gap)
5. [Endowment Effect](#endowment-effect)
6. [Gamification](#gamification)
7. [Hawthorne Effect](#hawthorne-effect)
8. [Labor Illusion](#labor-illusion)
9. [Peak-End Rule](#peak-end-rule)
10. [Pygmalion Effect](#pygmalion-effect)
11. [Scarcity](#scarcity)
12. [Social Proof](#social-proof)
13. [User Delight](#user-delight)
14. [Variable Reward](#variable-reward)

---

## Curiosity Gap

Information gaps drive action.

### UI Patterns
```
❌ "Product A details"
✅ "Why 100,000 people chose Product A"

❌ "View results"
✅ "Your results are... (click to reveal)"
```

### Caution
Avoid clickbait—deliver value that matches expectations.

---

## Decoy Effect

A third option makes a specific choice more attractive.

### UI Patterns
```
Plan comparison:
┌─────────┬─────────┬─────────┐
│  Basic  │ Standard│   Pro   │
├─────────┼─────────┼─────────┤
│   $5    │   $12   │   $15   │
│   5GB   │   50GB  │  100GB  │
└─────────┴─────────┴─────────┘
            ↑ Decoy (similar price to Pro, fewer features)
               → Pro looks like better value
```

---

## Doherty Threshold

Response delays over 400ms reduce focus.

### UI Patterns
```jsx
// Immediate feedback
<Button onClick={handleClick}>
  {isLoading ? <Spinner /> : 'Submit'}
</Button>

// Optimistic UI
const handleLike = () => {
  setLiked(true);  // Update UI immediately
  api.like();      // Send in background
};
```

### Performance Targets
| Time | User Experience |
|------|-----------------|
| < 100ms | Feels instant |
| < 400ms | Feels smooth |
| < 1s | Feels like waiting |
| > 1s | Loading indicator needed |

---

## Empathy Gap

Designers fail to imagine user situations accurately.

### Countermeasures
- Conduct user testing
- Create personas
- Customer journey mapping
- Prioritize error state design

### Checklist
```
□ Can first-time users understand this?
□ Can hurried users still use it?
□ Is it clear what to do on errors?
□ Is it usable on different devices?
```

---

## Endowment Effect

People overvalue things they own.

### UI Patterns
```
Free trial strategy:
1. Give full access for 14 days free
2. User customizes and accumulates data
3. At trial end: "Continue where you left off?"
→ Sense of ownership increases retention
```

### Implementation Examples
- Free trials
- Freemium models
- Customization features
- "Your [X]" language

---

## Gamification

Using game elements to increase motivation.

### Key Elements
```
Points
└─ Immediate feedback for actions

Badges
└─ Achievement visibility and collection drive

Leaderboard
└─ Competition and social comparison

Challenges
└─ Goal setting and accomplishment

Levels
└─ Progress visibility and growth sense
```

### Implementation Examples
```jsx
<AchievementBadge
  title="First Post"
  icon="🎉"
  unlocked={hasFirstPost}
/>

<ProgressBar
  level={userLevel}
  progress={expToNextLevel}
  label={`Level ${userLevel}`}
/>
```

---

## Hawthorne Effect

Being observed changes behavior.

### UI Patterns
- "X people viewing now" display
- Progress visibility
- Team activity sharing

### Caution
Privacy considerations needed. Avoid surveillance feeling.

---

## Labor Illusion

Showing work being done increases perceived value.

### UI Patterns
```jsx
// Search results display
<SearchResults>
  <ProcessingAnimation duration={2000}>
    Analyzing over 1 million records...
    Extracting optimal results...
  </ProcessingAnimation>
  <Results data={results} />
</SearchResults>
```

### Use Cases
- Search/analysis results
- Quote calculations
- Personalized recommendations
- Report generation

---

## Peak-End Rule

Experiences are judged by their peak moment and ending.

### UI Patterns
```
Checkout flow:
1. Product selection ─────────────┐
2. Shipping info                  │
3. Payment                        │ Minimize friction
4. Confirmation ──────────────────┘
5. Complete ★ ← Peak (celebration)
   "Thank you for your order! 🎉"
   "Arriving in 3 days"
```

### Implementation Examples
- Celebration animations on completion
- Surprise bonuses
- Positive summary displays

---

## Pygmalion Effect

Expectations become self-fulfilling.

### UI Patterns
```
Onboarding:
"You can become an expert in [X]"
"Most users see results within a week"

Progress feedback:
"Amazing! You're 20% ahead of average"
```

---

## Scarcity

Rare items are perceived as more valuable.

### UI Patterns
```jsx
// Stock display
<StockIndicator>
  Only 3 left!
</StockIndicator>

// Time limit
<CountdownTimer>
  Sale ends in 02:34:56
</CountdownTimer>

// Limited badges
<Badge>Limited Time</Badge>
<Badge>First 100 Only</Badge>
```

### Ethical Consideration
Avoid false scarcity claims (dark pattern).

---

## Social Proof

Others' actions influence our decisions.

### UI Patterns
```jsx
// Reviews and ratings
<Rating stars={4.8} reviews={2847} />

// User count
<Badge>100,000+ users</Badge>

// Real-time activity
<Notification>
  John from NYC just purchased (2 min ago)
</Notification>

// Expert endorsement
<Testimonial
  quote="Revolutionary service"
  author="Professor, University"
/>
```

---

## User Delight

Joy from experiences exceeding expectations.

### UI Patterns
```jsx
// Micro-interactions
<LikeButton
  animation="confetti"
  sound="pop"
/>

// Surprises
if (isSpecialOccasion) {
  showCelebration('🎂 Happy Birthday!');
}

// Easter eggs
// Hidden feature via Konami code
```

### Implementation Points
- Unexpected timing
- Subtle but memorable
- Reflects brand personality

---

## Variable Reward

Unpredictable rewards increase engagement.

### UI Patterns
```
Fixed reward: 10 points every time
Variable reward: 5-50 points (random)
              ↑ Higher retention rate

Examples:
- Gacha/lottery mechanics
- Daily bonuses (variable amounts)
- Surprise rewards
- Random recommended content
```

### Ethical Consideration
Balance to avoid promoting addictive behavior.
