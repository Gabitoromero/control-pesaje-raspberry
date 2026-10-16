# Raspberry (RB) scale reader

Reads weight frames from the scale over a serial port and forwards them to the
central server through Socket.IO.

```bash
pnpm dev     # run from source
pnpm test    # unit tests
```

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyUSB0` | Serial device path. |
| `SERIAL_BAUD_RATE` | `9600` | Serial baud rate. |
| `SERVER_URL` | `http://localhost:3000` | Central server URL. |
| `SERIAL_IDLE_TIMEOUT_MS` | off | Serial idle watchdog, see below. |

### `SERIAL_IDLE_TIMEOUT_MS`

- Unset, empty, `0` or an invalid value: the watchdog is **off**. No timer runs and
  the process never restarts because of serial silence.
- A positive number: the watchdog is **on**, in milliseconds. If valid frames were
  flowing and then none arrive for that long, the process exits so the service
  manager restarts it with a fresh serial handle.

Enable it only where the scale transmits continuously. A scale that only sends
when the weight changes would make the service restart whenever it stays idle.

With the watchdog off, the `Sin tramas válidas desde el inicio` log lines do not
appear either, because they are emitted by the watchdog.

## Serial port supervisor

The RB never exits because of the serial port. If the port cannot be opened
(for example the USB adapter disappeared), errors or closes, the RB stays
connected to the server and keeps retrying to open it: after 2 s, 5 s, 10 s and
then every 30 s, forever. A successful open resets the backoff, so a USB
re-enumeration recovers without restarting the service.

While the port is down, the diagnostic and the "No veo el peso" report show
`serial` as closed (`abierto: false`) together with `ultimoError`,
`ultimoErrorHaceMs` and `intentosFallidos`. The journal logs the first failure,
at most one reminder every 10 minutes, and always the recovery
(`[serial] Puerto abierto`).

## Version

At boot the RB reads the git short sha once (`git rev-parse --short HEAD`, no
shell) and logs it as `[setup] Versión: <sha>`. If git is unavailable or fails the
version is `unknown` and the RB starts normally.

## On-demand diagnostics

The server can ask the RB for its state with the socket event
`diagnostico-solicitud` (payload `{ v: 1 }`). The RB answers through the ack:

```json
{
  "v": 1,
  "version": "abc1234",
  "serial": { "abierto": true, "path": "/dev/ttyUSB0", "baud": 9600, "ultimoByteHaceMs": 120, "ultimoError": null, "ultimoErrorHaceMs": null, "intentosFallidos": 0 },
  "contadores": { "bytes": 0, "validas": 0, "descartadas": 0, "ultimaDescartada": null },
  "tramasCrudas": [{ "t": 1700000000000, "raw": "..." }],
  "logs": ["2026-01-01T00:00:00.000Z LOG ..."]
}
```

- `tramasCrudas`: last 100 raw frames from the serial parser, oldest first, each
  truncated to 80 characters.
- `logs`: last 50 console lines (`log`, `warn`, `error`), each truncated to 200
  characters. Console output to the journal is unchanged.
- An unknown request `v` is still answered with this RB's own `v: 1`.
- The RB never receives, stores or sends operator data.
- An old RB without this handler never answers; the server treats that as a timeout.
