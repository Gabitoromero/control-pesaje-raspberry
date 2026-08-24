#!/bin/bash

echo "=== 1. Actualizando sistema ==="
sudo apt update && sudo apt upgrade -y

echo "=== 2. Instalando git ==="
sudo apt install git -y

echo "=== 3. Instalando fnm ==="
curl -fsSL https://fnm.vercel.app/install | bash

# Cargar fnm manualmente — source ~/.bashrc no funciona en scripts
# porque .bashrc tiene un guard que aborta en shells no interactivas
export FNM_PATH="$HOME/.local/share/fnm"
export PATH="$FNM_PATH:$PATH"
eval "$(fnm env --shell bash)"

echo "=== 4. Clonando repositorio ==="
git clone https://github.com/Gabitoromero/control-pesaje-raspberry.git
cd control-pesaje-raspberry

echo "=== 5. Instalando Node.js (version del proyecto) ==="
fnm install
fnm use

echo "=== 6. Instalando pnpm (via corepack) ==="
# corepack ya viene con Node — más liviano que el instalador standalone
# de get.pnpm.io, que ejecuta su propio bundle de JS y puede disparar
# el OOM killer en placas con poca RAM (ej: Raspberry con ~1GB)
corepack enable
corepack prepare pnpm@latest --activate

echo "=== 7. Instalando dependencias ==="
pnpm install

echo "=== 8. Escribiendo .env ==="
cat > .env << 'EOF'
# Puerto serie de la balanza
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUD_RATE=9600

# URL del backend (ej: http://tu-ip-local:3000)
SERVER_URL=http://10.250.2.2:3000
EOF
echo "Editá el .env con los valores de tu entorno antes de arrancar la app"

echo "=== 9. Agregando usuario al grupo dialout (puerto serial) ==="
sudo usermod -aG dialout $USER

echo "=== Listo! Reiniciá la sesión SSH para que tome efecto el grupo dialout o ejecuta 'source ~/.bashrc' ==="
