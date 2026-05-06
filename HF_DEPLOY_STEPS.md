# 🚀 Hugging Face Deployment Steps

## Current Status
✅ **Models folder is complete** (255 MB - perfect for free tier!)
- `model.safetensors` (255 MB) - Model weights
- Tokenizer + config files

---

## Step-by-Step Deployment

### STEP 1: Create Hugging Face Account (if not done)
1. Go to [huggingface.co](https://huggingface.co)
2. Sign up with GitHub
3. Verify your email
4. Get access token: [Settings → Access Tokens](https://huggingface.co/settings/tokens)

---

### STEP 2: Create Space on Hugging Face

1. Visit [huggingface.co/spaces](https://huggingface.co/spaces)
2. Click **"Create new Space"**
3. Fill in the form:
   ```
   Owner: your-username
   Space name: intel-reddit-analyzer
   License: mit
   Space SDK: Gradio
   Space Hardware: CPU Basic (Free)
   Public
   ```
4. Click **Create Space**

---

### STEP 3: Deploy Using PowerShell Script

Open PowerShell and run:

```powershell
cd "d:\Books & Notes\FYP 2\Development\intel-reddit"
.\DEPLOY_TO_HF.ps1
```

Enter your Hugging Face username when prompted.

**Alternative - Manual Git Push:**
```powershell
# 1. Copy models to hf_space folder
cd "d:\Books & Notes\FYP 2\Development\intel-reddit\hf_space"
Copy-Item -Recurse "..\models" ".\models"

# 2. Initialize and push
git init
git remote add origin https://huggingface.co/spaces/YOUR_USERNAME/intel-reddit-analyzer
git add .
git commit -m "Initial deployment"
git push -u origin main
```

---

### STEP 4: Wait for Build (2-5 minutes)

After pushing:
1. Go to `https://huggingface.co/spaces/YOUR_USERNAME/intel-reddit-analyzer`
2. Watch the "Building" indicator
3. Once complete, you'll see the Gradio interface
4. **First request will be slow** (cold start: 10-30 seconds)

---

### STEP 5: Test the API

**Test via browser:**
Visit `https://YOUR_USERNAME-intel-reddit-analyzer.hf.space`

**Test via curl:**
```bash
curl -X POST "https://YOUR_USERNAME-intel-reddit-analyzer.hf.space/api/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      "[{\"title\": \"Great product!\", \"selftext\": \"I love it\"}]",
      "[{\"body\": \"This is amazing\"}]"
    ]
  }'
```

---

### STEP 6: Update Your Frontend

1. Add environment variable to `.env.local`:
```env
VITE_HF_SPACE_URL=https://YOUR_USERNAME-intel-reddit-analyzer.hf.space
```

2. Update your analysis code to use the new client:
```typescript
// Instead of calling local server or analyze-content edge function,
// use the Hugging Face client:

import { analyzeWithHuggingFace } from "@/integrations/huggingface/client";

const result = await analyzeWithHuggingFace(posts, comments);
```

---

### STEP 7: Update Netlify Environment Variables

1. Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
2. Add:
   ```
   VITE_HF_SPACE_URL=https://YOUR_USERNAME-intel-reddit-analyzer.hf.space
   ```
3. Redeploy your site (or it will auto-deploy on next git push)

---

## 🔄 Alternative: Keep Using Supabase Edge Function

If you want to keep your existing architecture (edge function calling HF), update the `analyze-content` function:

```typescript
// supabase/functions/analyze-content/index.ts
const HF_SPACE_URL = Deno.env.get("HF_SPACE_URL")!;

const response = await fetch(`${HF_SPACE_URL}/api/predict`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: [postsJson, commentsJson] }),
});
```

Then set Supabase secret:
```bash
supabase secrets set HF_SPACE_URL=https://YOUR_USERNAME-intel-reddit-analyzer.hf.space --project-ref askszqcuajalewwuwzvc
```

---

## ⚠️ Important Notes

### Cold Starts
- Free tier Spaces **sleep after 48 hours of inactivity**
- First request after sleep takes **10-30 seconds**
- Subsequent requests are fast (~100ms)
- To prevent sleep: visit the Space once per day, or upgrade to Pro ($7/month)

### Rate Limits
- Free tier: ~30,000 input tokens/month
- If exceeded, you'll get 429 errors
- Upgrade to Pro for higher limits

### API Token (Not Required for Public Spaces)
Since your Space is public, no authentication token is needed!

---

## 🆘 Troubleshooting

### "Building" takes forever
- Normal for first deployment (installs PyTorch + models)
- If stuck >15 minutes, check logs on Space page

### "Model is loading" error
- Space is cold. Wait 30 seconds and retry
- Or add retry logic in your frontend

### CORS errors
- Already handled in the Gradio app
- If issues persist, check Space logs

### Out of memory
- Your model is 255 MB, should fit in 2GB free tier
- If OOM, reduce batch size or upgrade hardware

---

## 📊 Cost Comparison

| Option | Monthly Cost | Cold Start | Best For |
|--------|-------------|------------|----------|
| **HF Spaces (Free)** | $0 | 10-30s | Testing, low traffic |
| **HF Pro** | $7 | None | Production, always-on |
| **Railway** | $5-20 | None | Full control |
| **Render** | $7-25 | None | Always-on |

---

## ✅ Quick Checklist

- [ ] Created HF account
- [ ] Created Space "intel-reddit-analyzer"
- [ ] Ran `DEPLOY_TO_HF.ps1` or manual git push
- [ ] Space shows "Running" status
- [ ] Tested API with curl
- [ ] Updated `VITE_HF_SPACE_URL` in Netlify
- [ ] Tested from your live Netlify site
