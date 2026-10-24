# Gym assignment, isolation, and leaderboards

PlayFit already had `Gym`, `SeatAllocation`, `Subscription`, and a single `GymMembership` row per user and gym. This change keeps those tables. A player is the existing `User` (`displayName`, `accountStatus`). There is no second player identity and no second price list.

## Data model

| Spec field | Where it lives |
| --- | --- |
| Gym id, name, owner | `Gym.id`, `Gym.name`, `Gym.ownerId` |
| Gym status | `Gym.subscriptionStatus` (`ACTIVE`, `TRIALING`, `EXPIRED`) |
| Subscription start and end | Latest `Subscription.startsAt` / `endsAt` for that gym |
| Member limit | `SeatAllocation.seatLimit` (Gym Starter up to 49, Gym Pro 51–99). Pending invites still reserve a seat |
| Player | `User` |
| Membership history | `GymMembership.id`, `userId`, `gymId`, `assignedBy`, `assignedAt`, `endedAt`, `status` (`ACTIVE` or `ENDED`), plus the existing `role` |

`GymMembership_one_active_player` is a partial unique index on `userId` where `status = ACTIVE` and `role = MEMBER`. Staff and owner rows are separate access seats. A player cannot hold two active member seats, including under concurrent requests: the assignment transaction locks the user row and the gym row with `SELECT … FOR UPDATE`, recounts seats, and the unique index rejects a second insert.

Ending a membership sets `status = ENDED` and `endedAt`. Rows are not deleted. Workout rows are not rewritten.

## Who can do what

Server session role is the authority. Hiding a button is not.

- Super Admin (`SUPER_ADMIN` or `ADMIN`) assigns, transfers, and unassigns on `/api/admin/assignments`.
- A gym owner sees only the gym whose `ownerId` is their user id. `/api/gym/floor`, `/api/gym/directory`, and `/api/gym/leaderboard` do not read a gym id from the query string.
- A player sees the gym of their active `MEMBER` seat. `/api/me/gym` accepts a `gymId` query only to ignore it.
- The public `/api/leaderboard` no longer accepts a gym id. It is the existing list of stored TV results (name, game, score), not a gym XP board.
- Leaderboard payloads are display name, rank, gym XP, and best score.

Socket.IO rooms stay `session:{sessionId}`. Creating a TV session still resolves a gym slug through `authorizeGymSession` for that host. There is no gym-wide room and no cross-gym roster on the socket.

## Play access

`playDecisionForUser` only includes `ACTIVE` memberships, so an ended seat cannot keep granting or blocking play. The existing rules are unchanged:

- An `ACTIVE` gym flag still allows play when no paid subscription rows exist.
- An expired paid gym subscription blocks members of that gym, including the demo path.
- An unassigned player follows their individual subscription. With no paid individual subscription, they stay on the demo path.

Seat limits are enforced when a seat is created. They are not a second price.

## Scores and transfers

FitRunner V2 still stores a workout in `WorkoutSession`. On completion the server computes the score and XP with the existing `summarizeWorkout` path. In that same transaction it locks the user, reads membership history, and sets:

- `gymIdAtSession` from `gymAtCompletion`
- `gameId` from the `fitrunner` game row, or null if that row is missing

The phone and TV cannot submit a gym id or a final score for this board.

A membership covers `completedAt` when it is a `MEMBER` seat and `assignedAt <= completedAt < endedAt` (`endedAt` null means it is still open). Transfer writes the old `endedAt` and the new `assignedAt` as the same timestamp, so a workout that finishes at that instant counts for the new gym. A workout that finished earlier keeps the gym stored on the row. If no member seat covers the instant, `gymIdAtSession` stays null and the workout is personal only.

`User.xpTotal` and `XpEntry` remain lifetime personal XP, including mission grants. Gym boards sum `WorkoutSession.xpAwarded` and take the best `WorkoutSession.score` where `gymIdAtSession` is that gym. Mission XP is not gym XP. Transfer does not move old rows.

TV `GameResult` rows are not on the gym board. The old server FitRunner simulation is gone, and those results are not the server-accepted FitRunner V2 workout summary. That gap is intentional.

## Leaderboard windows

Bounds use Asia/Kolkata (UTC+5:30, no daylight saving). Each window starts at the local midnight and ends at the next boundary, exclusive:

- Day: that calendar day
- Week: Monday through the next Monday
- Month: the first of the month through the first of the next month
- All time: no bound

Per-game boards filter `gameId`. Overall boards include every attributed workout.

Tie-break, in order: higher gym XP, higher best score, earlier time of that best score, then `userId` ascending. Ranks are unique.

## What an owner and a player see

The owner floor lists that gym’s profile, subscription window, capacity, active or ended players, recent attributed workouts, and the board. The directory is paginated and searched by display name. It does not include email.

An assigned player sees the gym name, membership, personal XP, gym XP, all-time rank, and the same board. An unassigned player is an individual player and does not receive a gym board.
