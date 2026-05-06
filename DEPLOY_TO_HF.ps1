# PowerShell script to deploy to Hugging Face Spaces
# Run this after creating your Space on huggingface.co

$HF_USERNAME = Read-Host "Enter your Hugging Face username"
$SPACE_NAME = "intel-reddit-analyzer"
$REPO_URL = "https://huggingface.co/spaces/$HF_USERNAME/$SPACE_NAME"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Deploying Intel Reddit Analyzer to HF Spaces" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Step 1: Copy model files to hf_space folder
Write-Host "`n[1/5] Copying model files..." -ForegroundColor Yellow
$sourceModels = "..\models"
$destModels = ".\models"

if (Test-Path $destModels) {
    Remove-Item -Recurse -Force $destModels
}
Copy-Item -Recurse -Path $sourceModels -Destination $destModels
Write-Host "✓ Models copied (255 MB)" -ForegroundColor Green

# Step 2: Initialize git repo
Write-Host "`n[2/5] Initializing git repository..." -ForegroundColor Yellow
cd hf_space
git init
git remote add origin $REPO_URL 2>$null
Write-Host "✓ Git initialized" -ForegroundColor Green

# Step 3: Configure git (if not already done)
Write-Host "`n[3/5] Git configuration..." -ForegroundColor Yellow
$gitName = git config user.name 2>$null
$gitEmail = git config user.email 2>$null

if (-not $gitName) {
    git config user.name "Intel Reddit Deploy"
}
if (-not $gitEmail) {
    git config user.email "deploy@intel-reddit.local"
}
Write-Host "✓ Git configured" -ForegroundColor Green

# Step 4: Add and commit
Write-Host "`n[4/5] Adding files to git..." -ForegroundColor Yellow
git add .
git commit -m "Initial deployment: DistilBERT sentiment model + spaCy NER"
Write-Host "✓ Files committed" -ForegroundColor Green

# Step 5: Push to Hugging Face
Write-Host "`n[5/5] Pushing to Hugging Face Spaces..." -ForegroundColor Yellow
Write-Host "You may be prompted for your HF access token..." -ForegroundColor Gray

try {
    git push -u origin main --force
    Write-Host "✓ Successfully pushed to Hugging Face!" -ForegroundColor Green
    
    Write-Host "`n=============================================" -ForegroundColor Cyan
    Write-Host "DEPLOYMENT COMPLETE!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "`nYour Space is live at:"
    Write-Host $REPO_URL -ForegroundColor Cyan
    Write-Host "`nAPI Endpoint:"
    Write-Host "$REPO_URL/api/predict" -ForegroundColor Cyan
    Write-Host "`nNext steps:"
    Write-Host "1. Wait 2-5 minutes for the Space to build"
    Write-Host "2. Visit the URL above to test the interface"
    Write-Host "3. Update your frontend to call this API"
    Write-Host "`n"
} catch {
    Write-Host "`n✗ Push failed. Common fixes:" -ForegroundColor Red
    Write-Host "1. Login to Hugging Face CLI:  huggingface-cli login" -ForegroundColor Yellow
    Write-Host "2. Or use git with token:  git push https://USER:TOKEN@huggingface.co/spaces/USER/SPACE_NAME" -ForegroundColor Yellow
    Write-Host "3. Check your Space exists at huggingface.co/spaces" -ForegroundColor Yellow
}

cd ..
