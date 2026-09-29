# Telegram Mini App Frontend

This is a dependency-free frontend for the uploaded Express/Telegraf backend.

## Files

- `index.html` — app shell
- `style.css` — responsive Telegram-style UI
- `app.js` — Telegram WebApp integration and API calls

## Install

Your backend already serves `public/`:

```js
app.use(express.static(path.join(__dirname, 'public')));

app.get('/miniapp', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

Copy these 3 files into the backend's `public/` directory.

Then your Mini App is available at:

```text
https://YOUR-DOMAIN/miniapp
```

Your backend's `WEB_APP_URL` should point to that URL.

## API calls used

- `GET /api/user/profile?userId=...`
- `POST /api/bingo/pick`
- `GET /api/bingo/status`
- `POST /api/bingo/timeout` (not needed by default in this UI)
- `POST /api/deposit`
- `POST /api/withdraw`
- `POST /api/keno/play`

The frontend sends the Telegram `initData` in:

```text
X-Telegram-Init-Data
```

and uses `Telegram.WebApp.initDataUnsafe.user.id` for the current Telegram user.

## Important Bingo limitation

The supplied backend has Bingo marking and the final `check_bingo` logic inside Telegram bot callback handlers, not HTTP endpoints. The frontend can therefore:

1. Join a Bingo room.
2. Poll `/api/bingo/status`.
3. Display the generated card.
4. Display called numbers.
5. Locally mark called cells.

But it cannot securely submit the final Bingo claim through the supplied HTTP API.

For a completely independent Mini App Bingo flow, add backend endpoints such as:

- `POST /api/bingo/mark`
- `POST /api/bingo/claim`

that operate on the server-side `activeGames` / `roomSessions` state and run the same `checkWinCondition()` and prize logic as the existing bot handler.

## Security note

The supplied `/api/user/profile` endpoint can accept `userId` as a query parameter. The frontend passes it for compatibility with your current backend. For production money/gaming use, the backend should validate Telegram WebApp `initData` cryptographically and derive the Telegram user ID from the validated data instead of trusting a client-supplied `userId`.
