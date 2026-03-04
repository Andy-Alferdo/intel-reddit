# Reddit Sleuth Deployment Guide

## Overview
This guide covers deploying the Reddit Sleuth OSINT platform to production using Vercel and Supabase.

## Prerequisites
- GitHub repository with the code
- Vercel account
- Supabase project (already set up)
- Python model server (for analysis features)

## 1. Model Server Deployment Options

### Option A: Deploy to Railway/Render (Recommended)
1. Fork your `python_ml` folder to a separate repository
2. Deploy to [Railway](https://railway.app) or [Render](https://render.com)
3. Get the production URL (e.g., `https://your-model-server.railway.app`)
4. Update your environment variables

### Option B: Deploy to Google Cloud Run
1. Containerize your Flask app
2. Deploy to Cloud Run
3. Get the service URL

### Option C: Use Hugging Face Spaces
1. Deploy your model to Hugging Face Spaces
2. Get the Spaces URL

## 2. Environment Variables Setup

Create `.env.local` in your project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://askszqcuajalewwuwzvc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFza3N6cWN1YWphbGV3d3V3enZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTEyNzAsImV4cCI6MjA4ODE4NzI3MH0.eqWswOWDRXg-_ays0e-c53B_E6ViuQfIOCvwmTPTeck
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Reddit API Configuration
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

# Email Configuration (Resend)
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=noreply@yourdomain.com

# Model Server Configuration
MODEL_SERVER_URL=https://your-model-server-domain.com
```

## 3. Vercel Deployment

### Step 1: Connect to GitHub
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository

### Step 2: Configure Build Settings
Vercel will automatically detect Next.js. Ensure these settings:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install"
}
```

### Step 3: Add Environment Variables
In Vercel dashboard → Project Settings → Environment Variables:
- Add all the variables from your `.env.local`
- **Important**: Don't add `NEXT_PUBLIC_` prefix for server-side variables

### Step 4: Deploy
Click "Deploy" and wait for the build to complete.

## 4. Supabase Edge Functions Environment Variables

You need to set environment variables for your edge functions:

```bash
# Via Supabase Dashboard
supabase secrets set REDDIT_CLIENT_ID=your_client_id
supabase secrets set REDDIT_CLIENT_SECRET=your_client_secret
supabase secrets set RESEND_API_KEY=your_resend_key
supabase secrets set RESEND_FROM=your_email
supabase secrets set MODEL_SERVER_URL=https://your-model-server.com
```

## 5. Post-Deployment Checklist

### Test the Application
1. Visit your Vercel URL
2. Test user registration/login
3. Create a test investigation case
4. Test Reddit scraping functionality
5. Verify analysis features work

### Monitor Logs
- Vercel: Functions → Logs
- Supabase: Edge Functions → Logs

### Set Up Custom Domain (Optional)
1. In Vercel dashboard → Settings → Domains
2. Add your custom domain
3. Update DNS records

## 6. Model Server Deployment

The ML model server is now included in the repository but requires manual setup due to the large model file size.

### Step 1: Add the Model File
The BERT model file (`model.safetensors`, 255MB) is too large for GitHub. Add it manually:

```bash
# Copy from your original project
cp "d:\Books & Notes\FYP 2\Development\reddit-sleuth-forensics-web-main\models\model.safetensors" "d:\Books & Notes\FYP 2\Development\intel-reddit\models\"
```

### Step 2: Deploy to Railway (Recommended)

#### Option A: Direct Deployment
1. **Copy the model file** to the intel-reddit/models folder
2. **Push to GitHub** (the model file is in .gitignore, so you'll need to temporarily remove it)
3. **Deploy to Railway** - it will include all files

#### Option B: Upload After Deployment
1. **Deploy without model** first
2. **Upload model via Railway dashboard** or console
3. **Restart the service**

### Step 3: Alternative Deployment Options

#### Render.com
- Similar process to Railway
- Use build hooks to download model if needed

#### Google Cloud Run
- Containerize the Flask app
- Include model in container image
- Deploy to Cloud Run

### Step 4: Model Server Features
- **BERT-based sentiment analysis** (negative/neutral/positive)
- **SHAP and LIME explanations** for interpretability
- **Spacy location extraction** (GPE/LOC entities)
- **REST API** at `/predict` endpoint
- **Production-ready** with proper error handling

### Step 5: Testing the Model Server
```bash
# Test locally
python model_server.py

# Test API
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"posts": [{"title": "I love this!", "selftext": ""}], "comments": []}'
```

## 7. Complete Production Setup

### 1. Prepare for Railway
```bash
# In your python_ml folder
echo "web: gunicorn app:app" > Procfile
echo "python-3.10.0" > runtime.txt
```

### 2. Railway Deployment
1. Connect Railway to your GitHub
2. Select the python_ml repository
3. Set environment variables:
   - `PORT`: `5000`
   - Any other required variables

### 3. Update Environment
Once deployed, update your `MODEL_SERVER_URL` to the Railway URL.

## 7. Security Considerations

- **Never commit** `.env.local` to Git
- Use **service role keys** only on server-side
- Enable **Row Level Security** in Supabase
- Use **HTTPS** for all endpoints
- Regularly rotate API keys

## 8. Troubleshooting

### Common Issues

**Edge Function Timeouts**
- Increase timeout limits in Supabase settings
- Optimize your Python model server response time

**CORS Issues**
- Ensure your Vercel domain is whitelisted
- Check edge function CORS headers

**Model Server Connection**
- Verify the model server URL is accessible
- Check if the server is running and healthy

**Build Failures**
- Check Vercel build logs
- Ensure all dependencies are in package.json

## 9. Maintenance

- Regular updates to dependencies
- Monitor API usage and limits
- Backup Supabase data regularly
- Update Reddit API credentials if needed

## Support

For issues:
1. Check Vercel build logs
2. Check Supabase edge function logs
3. Verify model server is accessible
4. Test environment variables locally

---

**Your deployed application will be available at:** `https://your-app.vercel.app`
