#!/bin/bash

# This script helps deploy your Next.js app to Vercel

# Step 1: Commit any changes
echo "Committing changes..."
git add .
git commit -m "Deployment update $(date)" || echo "No changes to commit"

# Step 2: Push changes to GitHub
echo "Pushing to GitHub..."
git push

# Step 3: Create a .vercel.env file from .env.local (without overwriting if it exists)
if [ ! -f .vercel.env ]; then
  echo "Creating .vercel.env from .env.local..."
  cp .env.local .vercel.env
  echo "Created .vercel.env - IMPORTANT: This file contains sensitive information and should not be committed to git."
  echo "You may need to edit this file to adjust environment variables for deployment."
fi

# Step 4: Deploy to Vercel with environment variables
echo "Deploying to Vercel..."
npx vercel --prod

echo "Deployment process completed!"
echo "If deployment was successful, your app should be live on Vercel."
echo "If there were errors, check the Vercel dashboard for more details." 