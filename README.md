# Field Reports (React Native)

An Android app for field inspectors to file photo reports (a description plus 1-5 photos) that are guaranteed to reach the server, even on 2G, through dropped connections and force-quits.

## Run it

**Requirements:** Node 20+, JDK 17, Android Studio with an emulator.

```
npm install
cd server && npm install && cd ..
```

1. Start the backend (leave it running): `npm run server`
2. Start an emulator, then run the app: `npx react-native run-android`

The emulator reaches the server at `http://10.0.2.2:3000` (set in `src/api/config.ts`).
On a real phone: `adb reverse tcp:3000 tcp:3000`, then use `http://localhost:3000`.

Tests: `npx jest` and `npx tsc --noEmit`.

## Backend

A small Express server in `server/` that stores reports on disk. Nothing is hosted, so you run it locally.

| Endpoint | Purpose |
|---|---|
| `PUT /reports/:id` | Create/update report metadata (idempotent) |
| `PUT /reports/:id/images/:index` | Store one photo; the same index overwrites |
| `POST /reports/:id/commit` | Marks the report complete only if every photo is present |
| `GET /reports` | Lists committed reports (what the "On the server" screen shows) |

## Making it fail

Open these URLs in a browser. `times=N` limits a failure to the next N requests.

| URL | Effect |
|---|---|
| `/admin/set?mode=error500&times=3` | Server errors (should be retried) |
| `/admin/set?mode=drop&times=2` | Connection cut mid-photo |
| `/admin/set?mode=lose-response&times=2` | Data saved, response never arrives |
| `/admin/set?mode=hang&times=1` | Request never answered |
| `/admin/set?mode=reject400` / `reject413` | Permanent refusal (must NOT be retried) |
| `/admin/set?mode=delay&delayMs=10000` | Slow responses |
| `/admin/set?bytesPerSec=20000` | Simulated 2G (0 turns it off) |
| `/admin/set?mode=normal` | Back to normal |
| `/admin/status`, `/admin/clear` | Inspect state / wipe server data |

## How delivery works

1. **Saved before anything else.** On submit, photos are shrunk and copied into the app's own folder, and the report is written to disk as `queued`. Only then does the UI say "Saved on this phone".
2. **Idempotent protocol.** The phone creates the report id. Every request is keyed by it, and re-sending a photo overwrites the same slot, so retries and lost responses cannot create duplicates. The server only lists a report once `commit` confirms every photo is present.
3. **Resumable.** Each photo is marked `uploaded` only after a 2xx response. After a failure or force-quit, only the missing photos are sent. Reports left in `uploading` after a crash are reset to `queued` on startup.
4. **Retry policy.** Network errors, timeouts, 408, 429 and 5xx are retried with exponential backoff and jitter. Any other 4xx is permanent: the report shows a clear message with Try again / Discard, and is never retried automatically.
5. **Timeouts that suit 2G.** A request is only killed if no bytes move for 45 seconds (20 s for small JSON calls), so slow uploads continue and silent ones don't block the queue.
6. **Triggers.** The engine runs at app start, when a report is saved, when connectivity returns, and when the app returns to the foreground. One run at a time; extra triggers schedule another pass.
7. **Images.** Photos are resized (max 2048 px) and compressed, then the real file size is measured. If still over 4.5 MB, quality and dimensions are lowered step by step. Nothing over 5 MB is ever sent. Compression runs natively, so the UI does not freeze.

## Architecture

- `src/services/uploadEngine.ts`: all delivery logic, with no React Native imports. Dependencies (storage, API, network, clock) are injected, so it is tested without a screen (`__tests__/uploadEngine.test.ts`).
- `src/services/storage.ts`: durable storage with serialized read/modify/write.
- `src/services/images.ts`: compression and file handling.
- `src/api/`: HTTP client and error classification.
- `src/ui/`: screens, which only read state and call engine methods.

## UX decisions

- "Saved on this phone" and "Uploaded to server" are always different states and never share a sentence.
- A banner always says whether work is safe, moving, offline or needs attention.
- Submit is never blocked by the network, and a disabled button always says why.
- Camera permission denied has its own state, with Open Settings, and re-checks when the app returns to the foreground. Gallery works regardless.
- The server screen has loading, empty, error and stale-data states.

## Reset ("Start over")

Deletes all local reports, queue state and stored photos, and warns first if any report has not uploaded. **Data already on the server is not touched.** [Describe what your testing showed survives, if anything.]

## Test results

[Fill in honestly, one line each: main scenario, repeated force-quits, airplane toggling, large photo, input limits, permissions, backend failures, background, reset.]

## Known gaps

- **No true background upload.** Uploads continue only while the app process is alive. When Android suspends it, they resume on return to the foreground. A production fix would use a native upload service such as WorkManager.
- [Add anything else you did not finish or test.]
- iOS was not built or tested.
- The server is a local test server with no authentication.
- [If you ran out of time on the UI, say so here.]

## With another day

- Native background upload service.
- Upload photos in parallel on good connections.
- Resume partial photo uploads (chunked or ranged uploads).
- End-to-end tests driven by the failure modes.