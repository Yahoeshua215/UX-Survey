#!/bin/bash

# This script helps deploy your Next.js app to Vercel

# Step 1: Display important information
echo "===== Next.js App Deployment Helper ====="
echo "This script will help you deploy your Next.js app to Vercel."
echo "IMPORTANT: Before proceeding, make sure you:"
echo "1. Have updated the .env.vercel file with your actual API keys"
echo "2. Have logged in to Vercel CLI (run 'npx vercel login' if not)"
echo "3. Have checked that your code builds successfully locally"
echo ""

# Ask for confirmation
read -p "Do you want to continue with deployment? (y/n) " -n 1 -r
echo    # Move to a new line
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment canceled."
    exit 1
fi

# Step 2: Commit any changes
echo "Committing changes..."
git add .
git commit -m "Deployment update $(date)" || echo "No changes to commit"

# Step 3: Push changes to GitHub
echo "Pushing to GitHub..."
git push

# Step 4: Ensure .env.vercel file exists
if [ ! -f .env.vercel ]; then
  echo "ERROR: .env.vercel file not found."
  echo "Please create this file with your environment variables."
  exit 1
fi

echo "Using environment variables from .env.vercel..."

# Step 5: Deploy to Vercel with environment variables from .env.vercel
echo "Deploying to Vercel..."
npx vercel deploy --prod --env-file .env.vercel

echo "Deployment process completed!"
echo "If deployment was successful, your app should be live on Vercel."
echo "If there were errors, check the Vercel dashboard for more details at: https://vercel.com/dashboard" 