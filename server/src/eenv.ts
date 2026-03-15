# Vercel Production Environment Variables
# Copy these to your Vercel Project Settings (Settings > Environment Variables)

# Server Configuration
NODE_ENV=production
PORT=3001
CLIENT_URL=https://scrg-peach.vercel.app

# Database
# IMPORTANT: Replace with your production MongoDB connection string (e.g. MongoDB Atlas)
MONGODB_URI=mongodb+srv://gopalk:Gopal1234@cluster0.stdt1sf.mongodb.net/?appName=Cluster0

# Security - JWT Secrets (Generated for Production)
ACCESS_TOKEN_SECRET=/BXf29j4yys/3rUjfDDOr8ytPvV/sYOQrqptBEY7O7s=
REFRESH_TOKEN_SECRET=vHa9WxXp4we3GA/NyV7vjiKX8o1bi9KIfKgUpeMKSeg=

# JWT Expiry Settings
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# File Storage (Defaults for Vercel Ephemeral Storage)
UPLOAD_DIR=/tmp/uploads
REPORT_DIR=/tmp/reports
MAX_FILE_SIZE_MB=50

# Logging
LOG_LEVEL=info
