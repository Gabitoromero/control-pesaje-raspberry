#!/bin/bash

# Este script configura systemd en la Raspberry para que el proceso arranque solo al encender.
# ATENCIÓN: Debe ejecutarse SIN sudo, el script pide sudo cuando lo necesita.

APP_DIR="$HOME/control-pesaje-raspberry"
USER_NAME=$USER
SERVICE_NAME="control-pesaje.service"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"

echo "=== 1. Creando script de arranque (start.sh) ==="
cat > "$APP_DIR/start.sh" << INNER_EOF
#!/bin/bash
# Cargar el entorno de fnm para tener Node disponible
export FNM_PATH="\$HOME/.local/share/fnm"
export PATH="\$FNM_PATH:\$PATH"
eval "\$(fnm env --shell bash)"

cd "$APP_DIR"
pnpm start
INNER_EOF

chmod +x "$APP_DIR/start.sh"

echo "=== 2. Creando archivo de servicio systemd ==="
sudo bash -c "cat > $SERVICE_PATH" << INNER_EOF
[Unit]
Description=Controlador de Pesaje Monthelado
After=network.target

[Service]
Type=simple
User=$USER_NAME
ExecStart=/bin/bash $APP_DIR/start.sh
Restart=always
RestartSec=60

[Install]
WantedBy=multi-user.target
INNER_EOF

echo "=== 3. Configurando journal persistente (para no perder logs si se reinicia la Raspberry) ==="
sudo mkdir -p /etc/systemd/journald.conf.d
sudo bash -c "cat > /etc/systemd/journald.conf.d/persistent.conf" << INNER_EOF
[Journal]
Storage=persistent
SystemMaxUse=200M
MaxRetentionSec=2week
INNER_EOF
sudo systemctl restart systemd-journald

echo "=== 4. Habilitando e iniciando el servicio ==="
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

echo "=== ¡Listo! El proceso ahora arrancará con la Raspberry. ==="
echo "Para ver los logs en vivo, ejecutá: journalctl -u $SERVICE_NAME -f"
