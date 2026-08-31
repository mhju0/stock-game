# Stock Game UI System

## Direction

**Midnight Market** is a dark-first trading workspace that feels credible enough
for a portfolio demo without pretending to be a brokerage. The interface should
be energetic at decision points and quiet around data.

The visual system uses a deep ink background, solid elevated surfaces, cobalt
for navigation and primary actions, mint/coral only for positive and negative
financial states, and tabular figures for money and percentages.

## Product principles

1. **Keep the game in context.** Once a game is selected, its name, status, and
   navigation remain visible without repeating a large context card above every
   page.
2. **Make the next action obvious.** Each page has one primary action. Secondary
   actions stay visually quieter and destructive actions stay separated.
3. **Separate orientation from tools.** Core game destinations and supporting
   utilities have different navigation hierarchy.
4. **Explain state changes.** Loading, empty, success, error, ended, and disabled
   states say what happened and what the user can do next.
5. **Use motion to preserve continuity.** Route content enters once, menus and
   dialogs move from their source, and press feedback is immediate. Motion never
   delays input or carries financial meaning by itself.

## Information architecture

### Game-independent

- **My Games** — choose, create, archive, or review a game.
- **Market** — browse market data without requiring a selected game.

### Selected-game primary navigation

- **Overview** — game return, time remaining, and benchmark comparison.
- **Trade** — search, inspect, and buy or sell a stock.
- **Portfolio** — balances, allocation, and positions.
- **Analysis** — deeper performance and diversification review.

### Selected-game utilities

- Watchlist
- Market
- FX Exchange
- Transactions

The legacy Dashboard route remains available for deep links but is not a second
top-level overview destination. Mobile uses five destinations: My Games,
Overview, Trade, Portfolio, and More. Analysis and utilities live in More.

## Theme tokens

### Dark default

| Role | Value | Purpose |
|---|---|---|
| Canvas | `#080b12` | Page background |
| Sidebar | `#0c111b` | Persistent navigation |
| Surface | `#111824` | Cards and controls |
| Raised surface | `#172131` | Dialogs and selected controls |
| Primary text | `#f4f7fb` | Headings and key values |
| Secondary text | `#9ba8bb` | Supporting copy |
| Border | `rgba(255, 255, 255, 0.09)` | Surface separation |
| Cobalt | `#6f8cff` | Navigation and primary actions |
| Mint | `#47d6a0` | Positive financial state |
| Coral | `#ff776d` | Negative/destructive state |

Light mode is an explicit user choice, not an operating-system side effect. It
uses the same semantic roles and preserves contrast independently.

## Typography and numbers

- Outfit is the display face for navigation and headings.
- DM Sans is the body and data face.
- Body copy starts at 16px on compact screens and uses at least 1.5 line height.
- Money, dates, percentages, and chart values use tabular figures.
- Headings describe structure; visual styling must not skip heading levels.

## Spacing, shape, and elevation

- Spacing follows a 4/8px rhythm: 4, 8, 12, 16, 24, 32, 48.
- Controls have a minimum 44px hit area.
- Cards use 16-20px radii; pills use a full radius.
- Three elevation levels are allowed: canvas, surface, overlay.
- Shadows and gradients clarify depth; they are not decoration on every card.

## Motion contract

| Token | Duration | Use |
|---|---:|---|
| Fast | 140ms | Press, hover, focus |
| Standard | 220ms | Menus, tabs, small state changes |
| Enter | 320ms | Route content and dialogs |

- Entering content uses opacity plus at most 12px of vertical translation.
- Exits are faster than entrances.
- Only transform and opacity are animated for layout movement.
- Stagger is limited to the first four peer cards at 35ms intervals.
- `prefers-reduced-motion: reduce` removes spatial movement and nonessential
  transitions while keeping content immediately available.

## Responsive contract

- **375px:** fixed bottom navigation, compact header, one-column content, no
  horizontal page scroll.
- **768px:** mobile navigation remains; two-column metrics are allowed.
- **1024px:** persistent sidebar appears and bottom navigation is removed.
- **1440px:** content width expands to 1200px while readable text remains
  constrained.

Fixed navigation must reserve content space. Dialogs remain operable in a short
landscape viewport and scroll internally when necessary.

## Accessibility acceptance

- WCAG AA text contrast and visible `:focus-visible` rings.
- Semantic links/buttons and associated form labels.
- Icon-only controls include accessible names.
- Current navigation exposes `aria-current` through `NavLink`.
- Dialogs close with Escape, return focus, and keep keyboard focus inside.
- Dynamic success/error text uses an appropriate live region.
- Charts retain text summaries and never communicate change by color alone.
- Keyboard, 200% zoom, reduced motion, and 375px overflow are release checks.

## Showcase acceptance

- The unauthenticated screen explains the product and exposes the demo path.
- My Games communicates active versus historical sessions at a glance.
- Overview makes return, progress, benchmark, and the next trade action visible
  above the fold at 1440x900.
- Trade reads as a search-to-decision flow rather than an empty search field.
- Portfolio makes total value, daily movement, allocation, and positions easy to
  scan without repeating labels.
- Desktop and mobile screenshots are captured from deterministic demo fixtures
  and contain no production user data.
