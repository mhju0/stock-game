# Stock Game

Stock Game is a virtual trading simulator for US and Korean equities. A user can run multiple independent Game Sessions while retaining one user-level Watchlist.

## Game sessions

**Game Session**:
A user-owned, time-bounded virtual trading run with its own cash, holdings, transactions, snapshots, and lifecycle state.
_Avoid_: Game, account, portfolio

**Session Portfolio**:
The cash, holdings, transactions, and snapshots that belong to one Game Session.
_Avoid_: User portfolio, global portfolio

**Lifecycle State**:
The canonical state of a Game Session: active, expired, completed, or archived. It determines whether the Session Portfolio is tradeable or review-only.
_Avoid_: is active flag, game mode

**Active Session**:
A Game Session whose Lifecycle State permits trading and exchange.
_Avoid_: Current account, live portfolio

**Ended Session**:
A Game Session whose Lifecycle State is expired, completed, or archived and is available only for review and replay.
_Avoid_: Deleted game, inactive account

## Portfolio history

**Legacy Portfolio**:
Pre-session user-level portfolio data retained solely for compatibility while older routes and records remain supported.
_Avoid_: Current portfolio, shared portfolio

**Watchlist**:
A user-level collection of equities to monitor. It is intentionally not scoped to a Game Session.
_Avoid_: Session watchlist

## Performance

**Benchmark**:
An external market index used to compare a Game Session's return over the same elapsed window.
_Avoid_: Ranking, leaderboard
