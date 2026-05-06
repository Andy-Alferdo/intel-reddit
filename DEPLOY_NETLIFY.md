# Deploy to Netlify - Quick Guide

## Project Structure

This is a **Vite + React + TypeScript** project (copied from `reddit-sleuth-forensics-web-main`).

## Prerequisites

- Node.js 20+
- npm or yarn
- Git

## Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```

## Deploy to Netlify

### Option 1: Via Netlify CLI (Recommended)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize your site
netlify init

# Deploy
netlify deploy --prod
```

### Option 2: Via GitHub + Netlify Dashboard

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Setup for Netlify deployment"
   git push origin main
   ```

2. **Go to [netlify.com](https://netlify.com)** and sign in

3. **Click "Add new site" → "Import from Git"**

4. **Select your repository**

5. **Build settings:**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: `20`

6. **Add Environment Variables in Netlify Dashboard:**
   - Go to Site settings → Environment variables
   - Add:
     - `VITE_SUPABASE_URL`: `https://askszqcuajalewwuwzvc.supabase.co`
     - `VITE_SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFza3N6cWN1YWphbGV3d3V3enZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTEyNzAsImV4cCI6MjA4ODE4NzI3MH0.eqWswOWDRXg-_ays0e-c53B_E6ViuQfIOCvwmTPTeck`

7. **Click Deploy**

## Environment Variables

The project uses these environment variables:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

## Important Files

- `netlify.toml` - Netlify configuration
- `_redirects` - SPA redirect rules (all routes to index.html)
- `vite.config.ts` - Vite build configuration

## Troubleshooting

### Build fails?
- Check that Node.js version is 20+
- Ensure all dependencies are installed: `npm install`

### 404 errors on refresh?
- The `_redirects` file should handle this
- Check that `netlify.toml` has the redirect rules

### Supabase connection fails?
- Verify environment variables are set in Netlify dashboard
- Check that Supabase URL and key are correct
- Ensure RLS policies are properly configured in Supabase

## Database Status

The online Supabase database has been reverted to its original state (before problematic migrations).

Original migrations preserved:
- `create_profiles_table`
- `create_investigation_tables`

Reverted migrations removed:
- All sync migrations from local project
- All problematic user credentials and RLS migrations

## Need Help?

- Check Netlify docs: https://docs.netlify.com/
- Check Supabase docs: https://supabase.com/docs
