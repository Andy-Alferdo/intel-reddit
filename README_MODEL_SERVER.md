# Reddit Sleuth Model Server

This Flask application provides sentiment analysis and location extraction services for the Reddit Sleuth platform.

## Features

- **Sentiment Analysis**: Uses BERT-based model for accurate sentiment classification
- **Explainable AI**: SHAP and LIME explanations for model decisions
- **Location Extraction**: Spacy-based geographical entity recognition
- **REST API**: Clean JSON API for integration with frontend

## Model Architecture

- **Base Model**: DistilBERT fine-tuned for sentiment analysis
- **Labels**: Negative, Neutral, Positive
- **Explainability**: SHAP (primary) and LIME (backup) for interpretability
- **Location NER**: Spacy en_core_web_sm for GPE/LOC extraction

## API Endpoints

### POST /predict
Analyzes Reddit posts and comments for sentiment and locations.

**Request Body:**
```json
{
  "posts": [
    {
      "title": "Post title",
      "selftext": "Post content"
    }
  ],
  "comments": [
    {
      "body": "Comment content"
    }
  ]
}
```

**Response:**
```json
{
  "postSentiments": [...],
  "commentSentiments": [...],
  "sentiment": {
    "postBreakdown": {"positive": 0.3, "negative": 0.4, "neutral": 0.3},
    "commentBreakdown": {"positive": 0.2, "negative": 0.5, "neutral": 0.3}
  },
  "locations": ["New York", "California"],
  "patterns": {
    "topicInterests": ["General Reddit Activity"]
  }
}
```

## Local Development

1. **Install Dependencies:**
```bash
pip install -r requirements.txt
```

2. **Download Spacy Model:**
```bash
python -m spacy download en_core_web_sm
```

3. **Run the Server:**
```bash
python model_server.py
```

The server will start on `http://localhost:5000`

## Production Deployment

### Railway (Recommended)

1. Push this repository to GitHub
2. Connect Railway to your GitHub account
3. Select this repository
4. Railway will automatically detect the Flask app
5. Set environment variables if needed

### Render

1. Connect Render to GitHub
2. Create a new Web Service
3. Point to this repository
4. Use the following settings:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn model_server:app`
   - Runtime: Python 3.10

### Environment Variables

- `PORT`: 5000 (usually set automatically)
- `PYTHONUNBUFFERED`: 1 (for better logging)

## Model Files

The `models/` directory contains:
- `model.safetensors`: Trained BERT model weights
- `config.json`: Model configuration
- `tokenizer.json`: Tokenizer configuration
- `vocab.txt`: Model vocabulary
- `special_tokens_map.json`: Special token mappings

## Performance

- **Inference Time**: ~100ms per text
- **Memory Usage**: ~500MB (model loaded once)
- **Batch Processing**: Supports multiple texts in single request
- **Concurrent Requests**: Handles multiple simultaneous connections

## Monitoring

The server provides detailed logging:
- Model loading status
- Request processing metrics
- Error tracking
- Performance indicators

## Troubleshooting

### Model Loading Issues
- Ensure `models/` directory contains all required files
- Check file permissions
- Verify Python version compatibility

### Memory Issues
- Reduce batch size if experiencing OOM errors
- Consider using smaller model variant
- Monitor memory usage in production

### API Errors
- Check request JSON format
- Verify all required fields are present
- Review server logs for detailed error messages

## Dependencies

- `flask`: Web framework
- `flask-cors`: Cross-origin resource sharing
- `transformers`: BERT model and tokenizer
- `torch`: PyTorch for model inference
- `spacy`: Natural language processing
- `shap`: Model explainability
- `lime`: Local interpretable model explanations
- `scikit-learn`: Machine learning utilities

## Security Notes

- CORS enabled for frontend integration
- Input validation on API endpoints
- Error handling prevents information leakage
- No sensitive data logged

## Scaling

For high-traffic deployments:
- Use load balancer for multiple instances
- Consider GPU acceleration for faster inference
- Implement request queuing for batch processing
- Monitor resource usage and auto-scale accordingly
