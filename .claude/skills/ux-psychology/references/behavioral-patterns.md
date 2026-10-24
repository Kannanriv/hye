# Behavioral Patterns

Psychological patterns for understanding and guiding user behavior.

## Table of Contents
1. [Cognitive Load](#cognitive-load)
2. [Decision Fatigue](#decision-fatigue)
3. [Default Effect](#default-effect)
4. [Foot-in-the-Door Effect](#foot-in-the-door-effect)
5. [Goal Gradient Effect](#goal-gradient-effect)
6. [Intentional Friction](#intentional-friction)
7. [Nudge Effect](#nudge-effect)
8. [Progressive Disclosure](#progressive-disclosure)
9. [Reactance](#reactance)
10. [Reactive Onboarding](#reactive-onboarding)
11. [Selective Attention](#selective-attention)
12. [Temptation Bundling](#temptation-bundling)
13. [Zeigarnik Effect](#zeigarnik-effect)

---

## Cognitive Load

The mental energy required to process information. Lower is better for usability.

### UI Patterns
```
Ways to reduce cognitive load:
- Chunk information (Miller's Law: 7±2 items)
- Visual grouping
- Progressive information presentation
- Clear labeling
```

### Implementation Examples
```jsx
// ❌ High cognitive load
<form>
  {allFields.map(f => <Input {...f} />)} // 20 fields at once
</form>

// ✅ Low cognitive load
<Wizard steps={['Basic Info', 'Details', 'Confirm']} />
```

---

## Decision Fatigue

Repeated decision-making degrades judgment quality.

### UI Patterns
- Limit choices to 3-5 options
- Provide default selections
- Use "Recommended" tags
- Progressive selection flows

### Implementation Examples
```
Plan selection:
[Basic] [Pro ★Recommended] [Enterprise]
         ↑ Highlighted by default
```

---

## Default Effect

People tend to accept pre-set default values.

### UI Patterns
- Set recommended settings as defaults
- Opt-out format (uncheck if unwanted)
- Pre-selected checkboxes

### Ethical Consideration
Avoid defaults that harm user interests (dark pattern).

---

## Foot-in-the-Door Effect

Starting with small requests makes larger requests more acceptable.

### UI Patterns
```
Step 1: Enter email only (easy)
Step 2: Add profile details (medium)
Step 3: Consider paid plan (commitment)
```

### Implementation Examples
- Free trial → Paid plan
- Guest checkout → Create account
- Like → Follow → Share

---

## Goal Gradient Effect

People accelerate behavior as they approach a goal.

### UI Patterns
```
[████████░░] 80% complete! Almost there!

Loyalty card: ●●●●●●●●○○ (8 of 10 stamps)
```

### Implementation Examples
- Progress bars
- Step indicators
- Points/badge systems
- "X more points until reward"

---

## Intentional Friction

Adding deliberate barriers for important actions.

### UI Patterns
```jsx
// Delete confirmation dialog
<Dialog>
  <p>Are you sure you want to delete?</p>
  <p>This action cannot be undone.</p>
  <Input placeholder="Type 'DELETE' to confirm" />
</Dialog>
```

### Use Cases
- Irreversible operations (delete, account closure)
- High-value transactions
- Security setting changes

---

## Nudge Effect

Guiding toward desired outcomes while preserving choice freedom.

### UI Patterns
- Default selections
- Social proof displays
- Well-timed suggestions
- Visual emphasis

### Implementation Examples
```
"Most users choose this option"
"Recommended settings for you"
```

---

## Progressive Disclosure

Show information only when needed.

### UI Patterns
```jsx
// Expand details on demand
<Accordion>
  <Summary>Basic Info</Summary>
  <Details>Advanced settings...</Details>
</Accordion>

// Tooltips for supplementary info
<Label>
  Discount code <Tooltip>10% off for first-time users</Tooltip>
</Label>
```

---

## Reactance

Psychological resistance to restrictions or coercion.

### UI Patterns
```
❌ "You must do X"
✅ "You can also do X"

❌ Popup bombardment
✅ Subtle suggestions
```

### Guidelines
- Avoid forced modals
- Make "close" buttons obvious
- Give users choice

---

## Reactive Onboarding

Context-aware guidance based on user behavior.

### UI Patterns
```jsx
// Show tooltip on first interaction with feature
if (isFirstTime('export')) {
  showTooltip('You can export from here');
}
```

### vs Proactive
- Proactive: Explain everything upfront (tour format)
- Reactive: Explain when needed (contextual)

---

## Selective Attention

Users focus on goal-relevant information despite overload.

### UI Patterns
- Robust search and filter features
- Clear information hierarchy
- Prioritize relevant content

---

## Temptation Bundling

Combining enjoyable activities with tedious tasks.

### UI Patterns
- Gamification elements
- Rewards paired with tasks
- Fun UI for boring workflows

### Implementation Examples
```
"Complete survey for 100 points!"
"Finish your profile for exclusive badge"
```

---

## Zeigarnik Effect

Incomplete tasks are remembered better than completed ones.

### UI Patterns
```
Profile completion: 75%
[ ] Profile picture
[ ] Bio
[✓] Email
[✓] Name
```

### Implementation Examples
- Incomplete task lists
- "Continue where you left off" buttons
- Draft saving features
