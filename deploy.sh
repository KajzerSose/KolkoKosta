#!/bin/bash

# Kolko Kosta Deployment Script
# Usage: ./deploy.sh

VPS_HOST="10.1.0.4"
VPS_PORT="24612"
VPS_USER="root"

echo "🚀 Deploying Kolko Kosta to VPS..."

# Step 1: Upload files via SFTP
echo "📤 Uploading files..."
sftp -P $VPS_PORT -b sftp_upload.txt $VPS_USER@$VPS_HOST

if [ $? -ne 0 ]; then
    echo "❌ File upload failed!"
    exit 1
fi

echo "✅ Files uploaded successfully!"

# Step 2: Install dependencies and run setup
echo "📦 Installing dependencies..."
ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << 'EOF'
cd /home/container

# Install bun if not present
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Install dependencies
bun install

# Run database migrations
bun run src/db/migrate.ts

# Run initial data ingest (this populates the SQLite database)
bun run src/db/ingest.ts

echo "✅ Deployment complete!"
EOF

if [ $? -eq 0 ]; then
    echo "🎉 Deployment successful!"
    echo "Your Kolko Kosta app is ready at http://your-vps-ip:80"
else
    echo "❌ Deployment failed!"
    exit 1
fi
