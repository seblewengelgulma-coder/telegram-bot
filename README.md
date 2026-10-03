# Telegram Mini App + Admin Panel (fixed build)

## Included
- `server.patched.js`: your existing backend with the required HTTP/API fixes added.
- `public/`: player Mini App.
- `public/admin/`: separate Admin login/frontend.

## Bingo fixes
- ETB 10/20/50/100 are real stake rooms.
- Players selecting the same stake enter the same waiting room.
- The room has a server-side 30-second countdown.
- After 30 seconds, 2+ players start the same session.
- All players in that session receive the same random 1–75 draw history.
- A new number is drawn every 6 seconds.
- The Mini App keeps polling after the game starts.

## Deposit/payment admin
- `/api/user/payment-admin` returns the player’s assigned active admin and Telebirr/CBE values.
- Assignment remains based on your existing referral/random assignment logic.
- The Mini App has Copy buttons.

## Admin panel
Set these environment variables on the backend:
```
ADMIN_PANEL_PASSWORD=choose-a-strong-password
ADMIN_PANEL_SECRET=use-a-long-random-secret
```
Admin login uses the admin Telegram ID + the panel password. Only IDs already recognized by your backend as owner/sub-admin can log in.

Admin can view pending deposits/withdrawals and approve/reject them. Non-owner admins only see requests assigned to their own `assignedAdminId`.

## Install / run
1. Back up your current server file.
2. Use `server.patched.js` as the updated server file (or merge the marked changes into your existing file).
3. Put `public/` next to the server file so Express serves it.
4. Add the two environment variables above.
5. Restart Node.
6. Player Mini App: `/` or `/miniapp`.
7. Admin panel: `/admin/`.

## Important
The existing backend still trusts the Mini App `userId` for some money/game calls. For production, validate Telegram WebApp `initData` server-side before accepting money operations.
