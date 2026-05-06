# Vercel Deployment Guide

This guide will help you deploy the Intel Reddit application to Vercel.

## Prerequisites

1. A Vercel account (https://vercel.com)
2. GitHub repository connected to Vercel
3. Environment variables configured

## Deployment Steps

### 1. Push to GitHub

```bash
git add .
git commit -m "Update for Vercel deployment with Hugging Face integration"
git push origin main
```

### 2. Connect to Vercel

1. Go to https://vercel.com/dashboard
2. Click "Add New Project"
3. Import your GitHub repository: `Andy-Alferdo/intel-reddit`
4. Vercel will auto-detect the Vite framework

### 3. Configure Environment Variables

Add these environment variables in Vercel Project Settings:

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://askszqcuajalewwuwzvc.supabase.co` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Supabase anon key |
| `VITE_HF_SPACE_URL` | `https://takeda-shingen-intel-reddit-analyzer.hf.space` | Hugging Face model URL |

### 4. Deploy

Vercel will automatically deploy when you push to the main branch.

## Hugging Face Model Integration

The application connects to the deployed model at:
- **Space URL**: https://huggingface.co/spaces/Takeda-Shingen/intel-reddit-analyzer
- **API Endpoint**: https://takeda-shingen-intel-reddit-analyzer.hf.space

### Available API Endpoints

1. **`/analyze_reddit_content`** - Batch analysis of posts and comments
2. **`/analyze_sentiment`** - Single text sentiment analysis
3. **`/deep_analyze`** - Word-level sentiment analysis
4. **`/predict`** - Unified prediction endpoint

### Features

- **Automatic wake-up**: The client automatically wakes up the Hugging Face Space if it's sleeping
- **Retry logic**: Built-in retry for model loading states
- **Error handling**: Comprehensive error messages for debugging

## Troubleshooting

### Build Failures

If you see TypeScript errors during build:
```bash
npm install
npm run build
```

### Hugging Face Space Sleeping

The application will automatically try to wake up the Hugging Face Space. First requests may take 30-60 seconds while the space loads.

### CORS Issues

The Hugging Face Space API supports CORS for browser requests. No additional configuration needed.

## Project Structure

```
intel-reddit/
├── src/
│   ├── integrations/
│   │   └── huggingface/
│   │       └── client.ts     # HF Space API client
│   ├── pages/
│   │   └── Analysis.tsx      # Uses HF integration
│   └── lib/
│       └── dateUtils.ts      # Date utilities
├── vercel.json               # Vercel configuration
├── .vercelignore             # Files to ignore
└── package.json              # Dependencies & scripts
```

## Local Development

```bash
npm install
npm run dev
```

The app will be available at http://localhost:8080

## Production URL

After deployment, your app will be available at:
`https://intel-reddit.vercel.app` (or your custom domain)
