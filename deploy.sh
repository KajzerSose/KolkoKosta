#!/bin/bash

# ============================================
# KOLKO KOSTA - VPS Deployment Script
# ============================================
#
# Prerequisites:
# 1. A VPS with SSH access (port 22)
# 2. RSA key authentication set up
# 3. Bun will be installed automatically
#
# Before running, edit these values:
VPS_HOST="YOUR_VPS_IP_HERE"        # e.g., 192.168.1.100
VPS_PORT="22"                      # SSH port (default 22)
VPS_USER="root"                     # SSH username
SSH_KEY="~/.ssh/id_rsa"             # Path to your RSA private key

# ============================================

set -e

echo "🚀 Deploying Kolko Kosta to VPS..."
echo "   Server: $VPS_HOST:$VPS_PORT"
echo "   User: $VPS_USER"

# Check if VPS_HOST is set
if [ "$VPS_HOST" = "YOUR_VPS_IP_HERE" ]; then
    echo "❌ Error: Please edit deploy.sh and set your VPS IP address!"
    exit 1
fi

# Step 1: Test SSH connection
echo "🔐 Testing SSH connection..."
ssh -p $VPS_PORT -i $SSH_KEY -o ConnectTimeout=5 $VPS_USER@$VPS_HOST "echo 'SSH connection OK'" \
    || { echo "❌ SSH connection failed! Check IP, port, and key."; exit 1; }

echo "✅ SSH connection successful!"

# Step 2: Upload files via SFTP
echo "📤 Uploading files..."
mkdir -p dist

# Copy essential files for deployment
cp -r src dist/
cp package.json dist/
cp tsconfig.json dist/
cp next.config.ts dist/
cp postcss.config.mjs dist/
cp -r .kilocode dist/ 2>/dev/null || true
cp -r node_modules dist/ 2>/dev/null || true

# Upload via SFTP
sftp -P $VPS_PORT -i $SSH_KEY $VPS_USER@$VPS_HOST <<EOF
mkdir -p /home/kolkokosta
put -r dist/* /home/kolkokosta/
bye
EOF

echo "✅ Files uploaded!"

# Step 3: Install and run on server
echo "📦 Installing and building on server..."
ssh -p $VPS_PORT -i $SSH_KEY $VPS_USER@$VPS_HOST << 'EOF'
cd /home/kolkokosta

# Install bun if not present
if ! command -v bun &> /dev/null; then
    echo "📥 Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Install dependencies (using lockfile)
echo "📦 Installing dependencies..."
bun install

# Build the app
echo "🏗️ Building Next.js app..."
bun run build

# Start the server in background
echo "🚀 Starting server..."
bun run start &
sleep 3

echo "✅ Deployment complete!"
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Deployment successful!"
    echo "Your Kolko Kosta app should be live at http://$VPS_HOST:3000"
else
    echo "❌ Deployment failed!"
    exit 1
fi
