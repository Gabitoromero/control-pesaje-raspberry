#!/usr/bin/env bash
# Updates a Raspberry (RB) to the latest `main` of control-pesaje-raspberry.
#
# What it does, in order:
#   1. git pull --ff-only (aborts if the repo has local changes to tracked files)
#   2. systemd drop-in: RestartSec=1 and StartLimitIntervalSec=0
#   3. adds SERIAL_IDLE_TIMEOUT_MS=0 to .env ONLY if the variable is missing
#      (never overwrites an existing value; 0 = serial watchdog off)
#   4. restarts the service and checks that it came up
#
# Safe to run more than once. Run it as the normal RB user (the one that runs
# the service, e.g. "monthelado"), NOT as root. It asks for the sudo password.
#
# Usage:  bash update-rb.sh
# Optional overrides: APP_DIR=/path/to/repo SERVICE=control-pesaje.service

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/control-pesaje-raspberry}"
SERVICE="${SERVICE:-control-pesaje.service}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.d"
DROPIN_FILE="${DROPIN_DIR}/override.conf"
PREV_COMMIT_FILE="$HOME/.rb-update-prev-commit"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Adds NAME=VALUE to an env file only when NAME is not defined yet.
ensure_env_var() {
  local file="$1" name="$2" value="$3"
  if grep -q "^${name}=" "$file"; then
    echo "  ${name} ya existe en .env, no se modifica: $(grep "^${name}=" "$file" | tail -1)"
    return 0
  fi
  # Make sure the last line ends with a newline before appending.
  if [ -s "$file" ] && [ -n "$(tail -c1 "$file")" ]; then
    printf '\n' >> "$file"
  fi
  printf '%s=%s\n' "$name" "$value" >> "$file"
  echo "  ${name}=${value} agregado a .env"
}

main() {
  trap 'echo "ERROR: el script se detuvo en la línea $LINENO" >&2' ERR

  [ "$(id -u)" -ne 0 ] || fail "No lo ejecutes como root. Usá el usuario normal de la RB."
  [ -d "$APP_DIR/.git" ] || fail "No encuentro el repositorio en $APP_DIR (podés indicar APP_DIR=...)."
  [ -f "$APP_DIR/.env" ] || fail "No existe $APP_DIR/.env. Esta RB no está configurada; no lo creo yo."

  log "Pidiendo permisos de administrador (sudo)"
  sudo -v

  cd "$APP_DIR"

  log "Estado actual"
  local prev_commit
  prev_commit="$(git rev-parse --short HEAD)"
  echo "  Commit actual: $prev_commit"
  echo "$prev_commit" > "$PREV_COMMIT_FILE"
  echo "  (guardado en $PREV_COMMIT_FILE para volver atrás si hace falta)"

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no
    fail "Hay cambios locales sin commitear en archivos del repositorio. No actualizo para no pisarlos."
  fi

  log "1/4 Traer el código (git pull --ff-only)"
  git pull --ff-only origin main
  local new_commit
  new_commit="$(git rev-parse --short HEAD)"
  echo "  Commit ahora: $new_commit"
  # This script does not run `pnpm install`; warn if dependencies changed.
  if git diff --name-only "$prev_commit" HEAD | grep -Eq '^(package\.json|pnpm-lock\.yaml)$'; then
    echo "  AVISO: cambiaron las dependencias (package.json o pnpm-lock.yaml). Hace falta correr 'pnpm install' en $APP_DIR antes de usar la RB."
  fi

  log "2/4 Archivo de reinicio de systemd (reinicio de 1 s, sin límite de arranques)"
  sudo mkdir -p "$DROPIN_DIR"
  printf '[Unit]\nStartLimitIntervalSec=0\n\n[Service]\nRestartSec=1\n' | sudo tee "$DROPIN_FILE" > /dev/null
  sudo systemctl daemon-reload
  echo "  Escrito $DROPIN_FILE"

  log "3/4 Variable SERIAL_IDLE_TIMEOUT_MS en .env"
  ensure_env_var "$APP_DIR/.env" "SERIAL_IDLE_TIMEOUT_MS" "0"

  log "4/4 Reiniciar el servicio"
  sudo systemctl restart "$SERVICE"
  sleep 8

  log "Verificación"
  systemctl is-active --quiet "$SERVICE" || {
    journalctl -u "$SERVICE" -n 20 --no-pager || true
    fail "El servicio $SERVICE no quedó activo."
  }
  echo "  Servicio activo: OK"

  local props
  props="$(systemctl show "$SERVICE" -p RestartUSec -p StartLimitIntervalUSec)"
  echo "$props" | sed 's/^/  /'
  echo "$props" | grep -q '^RestartUSec=1s$' || echo "  AVISO: RestartUSec no es 1s"
  echo "$props" | grep -q '^StartLimitIntervalUSec=0$' || echo "  AVISO: StartLimitIntervalUSec no es 0"

  local recent
  recent="$(journalctl -u "$SERVICE" --since "-40 sec" --no-pager 2>/dev/null || true)"
  for pattern in "Versión" "Puerto abierto" "Conectado al servidor"; do
    if echo "$recent" | grep -q "$pattern"; then
      echo "  Log: encontré \"$pattern\": OK"
    else
      echo "  AVISO: no vi \"$pattern\" en el log de los últimos 40 s (mirá: journalctl -u $SERVICE -f)"
    fi
  done

  log "Listo"
  echo "  Versión instalada: $new_commit (antes: $prev_commit)"
  echo "  Para volver atrás:  git -C $APP_DIR reset --hard $prev_commit && sudo systemctl restart $SERVICE"
  echo "  Después de pesar algo, comprobá que salen las líneas [balanza] Emitido y que la RB figura Conectada en el admin."
}

# Only run when executed, not when sourced (lets the helpers be tested).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
