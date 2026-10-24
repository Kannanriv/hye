# Cognitive Biases

Biases that influence user cognition and decision-making, and how to apply them ethically.

## Table of Contents
1. [Anchoring Effect](#anchoring-effect)
2. [Confirmation Bias](#confirmation-bias)
3. [Expectation Bias](#expectation-bias)
4. [Familiarity Bias](#familiarity-bias)
5. [Framing Effect](#framing-effect)
6. [Halo Effect](#halo-effect)
7. [Loss Aversion](#loss-aversion)
8. [Sunk Cost Effect](#sunk-cost-effect)
9. [Survey Bias](#survey-bias)

---

## Anchoring Effect

The first piece of information presented becomes the reference point for subsequent judgments.

### UI Patterns
```
❌ Bad: $30
✅ Good: $50 → $30 (40% OFF)
```

### Implementation Examples
- Show original price before discounted price
- Display highest-priced plan first in comparisons
- "Usually valued at $XX" messaging

---

## Confirmation Bias

People prefer information that confirms their existing beliefs.

### UI Patterns
- Provide affirming feedback for user choices
- Personalized recommendations
- "Recommended for you" sections

### Caution
Balance is important to avoid filter bubbles (showing only similar content).

---

## Expectation Bias

Prior expectations influence actual experience evaluation.

### UI Patterns
- Set expectations through branding
- Communicate feature value during onboarding
- Display expectation-building messages during loading

---

## Familiarity Bias

Users feel comfortable with designs and features they've experienced before.

### UI Patterns
- Adopt industry-standard UI patterns
- Maintain familiar layouts for existing users
- Use common icons (🔍=search, 🏠=home)

### Implementation Guide
```
// Navigation placement conventions
- Logo: top-left
- Search: top-center or top-right
- User menu: top-right
- Main nav: left sidebar or top
```

---

## Framing Effect

The same information creates different impressions depending on how it's presented.

### UI Patterns
```
Positive frame: "98% customer satisfaction"
Negative frame: "2% dissatisfaction"
→ Same data, different perception
```

### Implementation Examples
- Success rate > Failure rate
- "You'll gain X" > "You won't lose X"
- Time remaining > Time elapsed (when short)

---

## Halo Effect

One positive trait elevates the overall perception.

### UI Patterns
- Showcase CSR activities and sustainability
- Display awards and certification badges
- Show partnerships with trusted brands

---

## Loss Aversion

People feel losses approximately twice as strongly as equivalent gains.

### UI Patterns
```
❌ "Sign up now to get rewards"
✅ "Rewards expire in 24 hours"
```

### Implementation Examples
- Countdown timers
- "Low stock on your favorites"
- Free trial expiration notices

---

## Sunk Cost Effect

People continue investing to justify past investments of time or effort.

### UI Patterns
- Progress indicators: "X% to completion"
- Loyalty program point displays
- "X-day streak" notifications

### Caution
Can easily become a dark pattern. Balance with genuine user value.

---

## Survey Bias

Survey design that skews results.

### UI Patterns
- Use neutral question wording
- Randomize option order
- Avoid leading language

### Implementation Examples
```
❌ "How amazing was our service?"
✅ "How would you rate our service?"
```
