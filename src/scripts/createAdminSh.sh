#!/bin/sh
echo "🧩 Checking admin user..."
node scripts/createAdmin.js
echo "🚀 Starting main server..."
node server.js