# 🤗 Hugging Face Deployment Guide - AI Model Server

This guide helps you migrate your local Python AI model server to Hugging Face and connect it to your Netlify site.

---

## 🎯 Recommended Approach: Hugging Face Inference API (Serverless)

**Best for:** Models < 10GB, simple REST API calls

### Step 1: Choose Your Deployment Method

#### Option A: Hugging Face Inference API (Easiest)
Deploy your model to Hugging Face Hub and get an instant API endpoint.

#### Option B: Hugging Face Spaces (More Control)
Deploy a full Gradio/Streamlit app with your model.

#### Option C: Hugging Face Inference Endpoints (Paid)
Dedicated GPU instance for production use.

---

## 🚀 Option A: Deploy Model to Hugging Face Hub

### 1. Create Hugging Face Account
- Sign up at [huggingface.co](https://huggingface.co)
- Get your access token: [Settings → Access Tokens](https://huggingface.co/settings/tokens)

### 2. Install Dependencies Locally
```bash
pip install huggingface_hub transformers torch
```

### 3. Prepare Your Model

If you have a custom model (PyTorch/TensorFlow), upload it:

```python
# upload_model.py
from huggingface_hub import HfApi, create_repo

# Your model details
model_name = "your-username/intel-reddit-analyzer"  # Change this!
local_model_path = "./path/to/your/model"

# Create repo
api = HfApi()
create_repo(model_name, exist_ok=True)

# Upload model
api.upload_folder(
    folder_path=local_model_path,
    repo_id=model_name,
    repo_type="model"
)

print(f"Model uploaded to: https://huggingface.co/{model_name}")
```

### 4. Create Inference API Handler

Create `app.py` for the inference API:

```python
# app.py - Hugging Face Inference API handler
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch
import json

# Load model and tokenizer (cached after first load)
model_name = "your-username/intel-reddit-analyzer"  # Your model
model = AutoModelForSequenceClassification.from_pretrained(model_name)
tokenizer = AutoTokenizer.from_pretrained(model_name)

def predict(text):
    """Run inference on text"""
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
        predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
    return predictions.tolist()[0]

# Hugging Face Inference API format
def handler(event, context):
    """
    Hugging Face Inference API handler
    event: {"body": "{\"text\": \"...\"}", "headers": {...}}
    """
    try:
        # Parse input
        body = json.loads(event.get("body", "{}"))
        text = body.get("text", "")
        
        if not text:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No text provided"})
            }
        
        # Run prediction
        result = predict(text)
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"  # CORS for Netlify
            },
            "body": json.dumps({
                "sentiment": result,
                "text_preview": text[:100] + "..." if len(text) > 100 else text
            })
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

# For local testing
if __name__ == "__main__":
    test_event = {"body": json.dumps({"text": "This is a test message"})}
    print(handler(test_event, None))
```

---

## 🚀 Option B: Hugging Face Spaces (Recommended for Full App)

### 1. Create a Space
- Go to [huggingface.co/spaces](https://huggingface.co/spaces)
- Click "Create new Space"
- Name: `intel-reddit-analyzer`
- SDK: `Gradio` or `Streamlit` or `Docker`
- Visibility: `Public` (or Private with paid plan)

### 2. Upload Your Model Server Code

Create `app.py` for Gradio interface:

```python
import gradio as gr
from transformers import pipeline
import json

# Load your model
# Option 1: Load from Hugging Face Hub
classifier = pipeline("sentiment-analysis", model="your-username/your-model")

# Option 2: If you have a custom model, load it here
# from your_model import YourModel
# model = YourModel.load("path/to/weights")

def analyze_text(text, analysis_type="sentiment"):
    """Analyze Reddit text"""
    if analysis_type == "sentiment":
        result = classifier(text)
        return {
            "label": result[0]["label"],
            "score": result[0]["score"],
            "explanation": f"Sentiment: {result[0]['label']} (confidence: {result[0]['score']:.2%})"
        }
    elif analysis_type == "profile":
        # Your custom profile analysis logic
        return {"profile_summary": "...", "behavior_patterns": "..."}
    
    return {"error": "Unknown analysis type"}

# Create Gradio interface
interface = gr.Interface(
    fn=analyze_text,
    inputs=[
        gr.Textbox(label="Reddit Content", lines=5),
        gr.Radio(["sentiment", "profile", "entity_extraction"], label="Analysis Type")
    ],
    outputs=gr.JSON(label="Analysis Result"),
    title="Intel Reddit AI Analyzer",
    description="Analyze Reddit content for OSINT investigations"
)

# Launch
interface.launch()
```

### 3. Create Requirements File

Create `requirements.txt`:
```
transformers>=4.30.0
torch>=2.0.0
gradio>=3.40.0
numpy
pandas
requests
```

### 4. Create README.md
```markdown
---
title: Intel Reddit AI Analyzer
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: 3.40.0
app_file: app.py
pinned: false
license: mit
---

# Intel Reddit AI Analyzer

AI-powered analysis for Reddit OSINT investigations.
```

### 5. Push to Space

```bash
# Install Hugging Face CLI
pip install huggingface_hub

# Login
huggingface-cli login

# Clone your space
git clone https://huggingface.co/spaces/YOUR_USERNAME/intel-reddit-analyzer
cd intel-reddit-analyzer

# Copy your files
copy /path/to/your/model/* ./
copy /path/to/requirements.txt ./
copy /path/to/README.md ./

# Push
git add .
git commit -m "Initial model deployment"
git push
```

---

## 🔗 Connect to Your Netlify Site

### Option 1: Direct API Calls to Hugging Face

Update your frontend to call Hugging Face directly:

```typescript
// src/services/huggingface.ts
const HF_API_URL = "https://api-inference.huggingface.co/models/YOUR_USERNAME/YOUR_MODEL";
const HF_TOKEN = import.meta.env.VITE_HF_API_TOKEN;  // Add to Netlify env vars

export async function analyzeWithHuggingFace(text: string) {
  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: text })
  });
  
  if (!response.ok) {
    throw new Error(`HF API error: ${response.status}`);
  }
  
  return response.json();
}
```

### Option 2: Call Hugging Face Spaces API

```typescript
// Call your Gradio Space
const SPACE_API_URL = "https://YOUR_USERNAME-intel-reddit-analyzer.hf.space/api/predict";

export async function analyzeWithSpace(text: string, type: string) {
  const response = await fetch(SPACE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [text, type]  // Matches Gradio inputs order
    })
  });
  
  return response.json();
}
```

### Option 3: Use Supabase Edge Function as Proxy (Recommended)

Keep using your existing `analyze-content` edge function, but modify it to call Hugging Face:

```typescript
// supabase/functions/analyze-content/index.ts
const HF_API_URL = Deno.env.get("HF_API_URL")!;
const HF_API_TOKEN = Deno.env.get("HF_API_TOKEN")!;

async function analyzeWithHuggingFace(text: string) {
  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: text })
  });
  
  return response.json();
}
```

Then set secrets:
```bash
supabase secrets set HF_API_URL=https://api-inference.huggingface.co/models/YOUR_USERNAME/YOUR_MODEL --project-ref askszqcuajalewwuwzvc
supabase secrets set HF_API_TOKEN=hf_xxxxxxxx --project-ref askszqcuajalewwuwzvc
```

---

## 🔧 Environment Variables for Netlify

Add these to your Netlify site settings:

```
VITE_HF_API_TOKEN=hf_xxxxxxxx  # Your Hugging Face token (read-only recommended)
VITE_HF_SPACE_URL=https://YOUR_USERNAME-intel-reddit-analyzer.hf.space
```

**Important:** Create a read-only token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) with minimal permissions.

---

## 📊 Comparison Table

| Method | Cost | Setup | Speed | Best For |
|--------|------|-------|-------|----------|
| **HF Inference API** | Free tier (rate limited) | Easy | Cold start ~2-5s | Occasional analysis |
| **HF Spaces** | Free tier (sleep after idle) | Medium | Cold start ~10-30s | Demo/development |
| **HF Inference Endpoints** | $0.06-0.60/hour | Easy | Always on | Production |
| **Custom Server (Railway/Render)** | $5-20/month | Medium | Always on | Full control |

---

## 🚀 Quick Start Recommendation

For your use case, I recommend:

1. **Deploy to Hugging Face Spaces** (free tier with auto-sleep)
2. **Update your Supabase Edge Function** to call the Space API
3. **Add CORS handling** in your Space
4. **Set HF_TOKEN in Supabase secrets** (not frontend)

This keeps your API token secure (in Supabase, not exposed to frontend) and gives you a working solution for free.

---

## ⚠️ Important Notes

1. **API Token Security**: Never put `HF_API_TOKEN` in frontend code. Use Supabase Edge Functions as proxy.

2. **Cold Start**: Free tier Spaces sleep after inactivity. First request may take 10-30s to wake up.

3. **Rate Limits**: 
   - Free tier: ~30k input tokens/month
   - Upgrade to Pro for higher limits

4. **Model Size**: Free tier supports models up to ~10GB. Larger models need paid Inference Endpoints.

5. **CORS**: Hugging Face Spaces have CORS enabled by default, but add explicit headers for safety.

---

## 🆘 Troubleshooting

### "Model is loading" Error
Free tier models go to sleep. Wait 30-60 seconds and retry.

### CORS Errors
Add in your Space's `app.py`:
```python
import gradio as gr
gr.Interface(...).launch(server_name="0.0.0.0", server_port=7865)
```

### Timeout Errors
If analysis takes >30s, consider:
- Using smaller model
- Batching requests
- Upgrading to paid tier
