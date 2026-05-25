# Chit Mafia Online

A small online hidden-role game for 1-10 players. One player creates a room, shares the invite link, and each player reveals only their own chit from their own device.

## Run Locally

```sh
npm start
```

Open `http://localhost:3000`.

## Play Online

For players who are far apart, deploy this folder to a Node hosting service such as Render, Railway, Fly.io, or a VPS.

Use:

```sh
npm start
```

The host must provide a public HTTPS URL. `localhost` works only on the same computer, so distant players need the deployed URL.

## Deploy On Render

1. Put this folder in a GitHub repository.
2. In Render, choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Render will read `render.yaml` and create the free web service.
5. After deploy, share the `https://...onrender.com` URL with players.

Render settings if you create a normal Web Service instead of a Blueprint:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Instance type: Free

## Privacy Model

Roles are assigned and stored on the server. The room list shows only player names and whether a chit has been seen. A player receives their role only after calling reveal with their private player token saved in their browser.

Each player also gets a private reconnect code. If they refresh, switch devices, or lose their browser session, they can enter the room code, their name, and that reconnect code to recover the same seat and chit.

## Game Loop

After the host starts, the app runs the Mafia flow:

- Night: Mafia attacks, Detective checks, Doctor protects.
- Voting starts right after night is resolved, so players discuss quickly while voting.
- Vote: alive players vote one player out.
- The app marks eliminated players and announces when Mafia or Civilians win.
- Night and voting phases have countdown timers. The host can resolve early or add 30 seconds.
- Mafia get a private night chat. Eliminated players get Dead Chat, which alive players cannot see.
- The side Game Log records public events, and the end screen reveals every player's role.
- Hosts can set timers, max rounds, role counts, auto-resolve, and an optional room password before starting.
- Players mark themselves ready before the host starts. Hosts can kick lobby players and mute chat.
- Spectators can watch read-only with the room password, without taking a player slot.
- Vote results, private notes, themes, sound effects, QR sharing, role guide, and last 5 game history are built in.
