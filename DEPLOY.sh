#!/bin/bash

# Ellines Haven - Deployment Script
# Frontend → Cloudflare Pages (Wrangler)
# Backend  → Firebase Cloud Functions + Firestore rules
# Usage: ./DEPLOY.sh

set -e

echo "🚀 Ellines Haven - Complete Deployment"
echo "======================================"
echo ""

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f "wrangler.toml" ]; then
    echo -e "${YELLOW}⚠️  wrangler.toml not found. Are you in the project root?${NC}"
    exit 1
fi

if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Firebase CLI not found. Install: npm install -g firebase-tools${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Building frontend...${NC}"
npm run build
echo -e "${GREEN}✅ Frontend build successful${NC}"
echo ""

echo -e "${BLUE}Step 2: Deploying frontend to Cloudflare Pages...${NC}"
npx wrangler pages deploy dist --project-name=ellines-haven
echo -e "${GREEN}✅ Cloudflare Pages deploy complete${NC}"
echo ""

echo -e "${BLUE}Step 3: Deploying Cloud Functions...${NC}"
firebase deploy --only functions --project ellines-haven-web
echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
echo ""

echo -e "${BLUE}Step 4: Deploying Firestore Rules...${NC}"
firebase deploy --only firestore:rules --project ellines-haven-web
echo -e "${GREEN}✅ Firestore Rules deployed${NC}"
echo ""

echo -e "${GREEN}======================================"
echo "🎉 Deployment Complete!"
echo "======================================"
echo ""
echo -e "${BLUE}Site:${NC} https://haven.ellines.co.ke"
echo -e "${BLUE}Firebase:${NC} https://console.firebase.google.com/project/ellines-haven-web"
echo ""
