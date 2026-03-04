# Model Setup Instructions

The BERT model file (`model.safetensors`) is too large for GitHub (255MB). You need to add it manually before deployment.

## Option 1: Copy from Local Project

1. **Copy the model file:**
```bash
# Copy from your original project
cp "d:\Books & Notes\FYP 2\Development\reddit-sleuth-forensics-web-main\models\model.safetensors" "d:\Books & Notes\FYP 2\Development\intel-reddit\models\"
```

2. **Verify the files:**
```bash
ls -la models/
# Should show:
# - classes.npy
# - config.json  
# - model.safetensors  <-- This file (255MB)
# - special_tokens_map.json
# - tokenizer.json
# - tokenizer_config.json
# - vocab.txt
```

## Option 2: Download from Cloud Storage

If you've uploaded the model to cloud storage:

1. **Download the model:**
```bash
# Replace with your actual download URL
wget https://your-cloud-storage.com/model.safetensors -O models/model.safetensors
```

2. **Verify integrity:**
```bash
# Check file size (should be ~255MB)
ls -lh models/model.safetensors
```

## Option 3: Use Git LFS (Advanced)

If you want to use Git LFS for future development:

1. **Install Git LFS:**
```bash
git lfs install
```

2. **Track the model file:**
```bash
git lfs track "models/model.safetensors"
git add .gitattributes
```

3. **Add and push the model:**
```bash
git add models/model.safetensors
git commit -m "Add model file with LFS"
git push origin main
```

## For Railway Deployment

### Method A: Upload via Railway Dashboard

1. Go to your Railway project
2. Click on "Variables" tab
3. Upload the `model.safetensors` file as a "File" variable
4. Set the path to `models/model.safetensors`

### Method B: Use Build Script

1. **Create `download_model.py`:**
```python
import requests
import os

# Replace with your model download URL
MODEL_URL = "https://your-cloud-storage.com/model.safetensors"
MODEL_PATH = "models/model.safetensors"

os.makedirs("models", exist_ok=True)
response = requests.get(MODEL_URL)
with open(MODEL_PATH, 'wb') as f:
    f.write(response.content)
print("Model downloaded successfully")
```

2. **Update `Procfile`:**
```
web: python download_model.py && gunicorn model_server:app
```

### Method C: Manual Upload (Recommended)

1. **Deploy to Railway first** (without the model)
2. **Access Railway console** and upload the model file
3. **Restart the service** to pick up the model

## For Render Deployment

### Method A: Build Hook

1. **Add to `render.yaml`:**
```yaml
services:
  - type: web
    name: reddit-sleuth-model
    env: python
    buildCommand: |
      pip install -r requirements.txt
      python download_model.py
    startCommand: gunicorn model_server:app
```

### Method B: Direct Upload

1. **Deploy without model** first
2. **Use Render shell** to upload the model
3. **Restart the service**

## Verification

After deployment, test the model server:

```bash
curl -X POST https://your-app.railway.app/predict \
  -H "Content-Type: application/json" \
  -d '{"posts": [{"title": "I love this!", "selftext": ""}], "comments": []}'
```

Expected response should include sentiment analysis results.

## Troubleshooting

### Model Not Found Error
- Verify the model file exists in `models/` directory
- Check file permissions
- Ensure the path is correct in `model_server.py`

### Memory Issues
- Railway free tier has limited RAM
- Consider using a smaller model if needed
- Monitor resource usage

### Slow Loading
- Model loading takes 30-60 seconds
- Railway may timeout during cold starts
- Consider using Railway's paid tier for better performance

## Model Details

- **Architecture**: DistilBERT for sentiment analysis
- **Size**: 255MB (model.safetensors)
- **Classes**: negative, neutral, positive
- **Framework**: PyTorch + Transformers
- **Explainability**: SHAP and LIME
