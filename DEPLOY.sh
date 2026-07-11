#!/bin/bash

# Ellines Haven - Deployment Script
# Deploys: Cloud Functions + Firestore Rules + Frontend Hosting
# Usage: ./DEPLOY.sh

set -e

echo "🚀 Ellines Haven - Complete Deployment"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Firebase CLI not found. Install it first:${NC}"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "firebase.json" ]; then
    echo -e "${YELLOW}⚠️  firebase.json not found. Are you in the project root?${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Building frontend...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend build successful${NC}"
else
    echo -e "${YELLOW}⚠️  Build had warnings but completed${NC}"
fi
echo ""

echo -e "${BLUE}Step 2: Deploying Cloud Functions...${NC}"
echo "This will deploy the updated trackVisitor function with full geo data."
firebase deploy --only functions
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
else
    echo -e "${YELLOW}⚠️  Cloud Functions deployment may have issues${NC}"
fi
echo ""

echo -e "${BLUE}Step 3: Deploying Firestore Rules...${NC}"
echo "This enables the user_presence collection for online user tracking."
firebase deploy --only firestore:rules
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Firestore Rules deployed${NC}"
else
    echo -e "${YELLOW}⚠️  Firestore Rules deployment may have issues${NC}"
fi
echo ""

echo -e "${BLUE}Step 4: Deploying Frontend to Hosting...${NC}"
firebase deploy --only hosting
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend deployed to hosting${NC}"
else
    echo -e "${YELLOW}⚠️  Hosting deployment may have issues${NC}"
fi
echo ""

echo -e "${GREEN}======================================"
echo "🎉 Deployment Complete!"
echo "======================================"
echo ""
echo "New features now live:"
echo "✅ Online Users tracking (Admin → Online Users)"
echo "✅ Receipt editing (Admin → All Receipts)"
echo "✅ God Mode (Admin → God Mode - Super Admin only)"
echo "✅ Site Visitors with geo data (Admin → Site Visitors)"
echo ""
echo "📍 Test the system:"
echo "1. Log in as a user → Check Admin → Online Users"
echo "2. Verify your IP and location appear correctly"
echo "3. Go to Admin → All Receipts → Edit an order"
echo "4. Try force logout on a user"
echo ""
echo "📖 For detailed info, see:"
echo "• ADMIN_SYSTEM_COMPLETE.md - Full technical documentation"
echo "• ADMIN_QUICK_START.md - Quick reference guide"
echo ""

echo -e "${BLUE}Dashboard:${NC} https://console.firebase.google.com"
echo -e "${BLUE}Site URL:${NC} https://ellines-haven.web.app"
echo ""
