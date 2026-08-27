# Crazy Cue Golf

Low-poly tabletop golf. Cue, club, or trebuchet. Stroke play and Trick Chain.
40 holes across Easy, Medium, Hard, and Expert. Star every sink.

Inspired by [Crazy Cue Golf on Face For Games](https://www.faceforgames.com). Built with React Three Fiber, Box3D, and Liquid Glass UI.

## Tours

- **Easy** — wide cups, open greens, generous kits
- **Medium** — ramps, banks, the mill
- **Hard** — gates and chicanes
- **Expert** — tiny cups, stingy kits

Ten named holes each, with their own green, theme, and cup size. Pick a tee from the menu grid. Ace = 3 stars, par or under = 2, finish = 1. Stars stay in the browser.

## Modes

- **Stroke Play** — hit the ball, then hit it again from where it stops.
- **Trick Chain** — lock shots at each predicted rest, press **Hit ball**, and the combo replays after a 1s settle. Tap a shot number or landing ghost to go back and retune that shot. Later shots are cleared because their landings moved.

## Determinism

Every locked shot stores `{ origin, velocity, rest, path }`. Preview and live share the same Box3D solver. Playback calls `launch(origin, velocity)` — a full body reset plus the frozen vector — so the ghost you aimed is the ball you watch. The windmill is frozen during a flying shot. After a chain shot sleeps, the body snaps to the stored rest and waits 1s before the next hit.

## Edit previous shots

In Trick Chain, tap a shot number or a landing ghost to jump back. Uses for that shot and every later shot are refunded, later landings are dropped, and the ball parks on the edited shot’s origin with its old aim/power loaded. Set shot to lock the retune, then Hit ball to replay the chain exactly.

## Run

```bash
npm install
npm run dev
```

## Controls

- Click the ball to focus
- Drag around the ball to aim, pull away for power
- Drag empty space to orbit
- **Hit now** / **Set shot** / **Hit ball**
- Keys `1` `2` `3` switch weapons (when uses remain)
- Tap a chain number or landing ghost to edit that shot

## Physics

Box3D WASM is vendored at `src/vendor/box3d.inline.mjs` (box3d.js 0.0.2, MIT). The engine loads from that file — no CDN and no Vite `node_modules/.vite/deps` fetch.
