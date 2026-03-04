import sys
import os
import torch
import spacy
import numpy as np
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import shap
import lime
from lime.lime_text import LimeTextExplainer
from sklearn.feature_extraction.text import TfidfVectorizer

# --- 0. SETUP LOGGING ---
# This helps us see errors in the terminal clearly
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# --- 1. CONFIGURATION ---
# Ensure this matches the folder name exactly
MODEL_PATH = "./models" 

# --- 2. LOAD SPACY (For Location Extraction) ---
logger.info("Loading Spacy for location extraction...")
try:
    nlp = spacy.load("en_core_web_sm")
    logger.info("Spacy loaded successfully.")
except OSError:
    logger.warning("Spacy model 'en_core_web_sm' not found. Downloading now...")
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")
    logger.info("Spacy downloaded and loaded.")

# --- 3. LOAD BERT MODEL & LABELS ---
logger.info(f"Loading Model from: {MODEL_PATH}")

# Global variables for model and tokenizer
model = None
tokenizer = None
LABELS = []

try:
    # A. Check if folder exists
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model directory not found at {MODEL_PATH}")

    # B. Load Tokenizer & Model
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
    model.eval() # Set to evaluation mode (faster, no training)
    
    # C. Load Labels from classes.npy
    # C. Load Labels (FORCE FIX)
    # We are IGNORING classes.npy because it has typos ("netural") and extra words ("sentiment").
    # We force the standard 3 labels that the Frontend expects.
    
    # Standard DistilBERT Order: 0=Negative, 1=Neutral, 2=Positive
    LABELS = ["negative", "neutral", "positive"]
    logger.info(f"FORCE-LOADED CLEAN LABELS: {LABELS}")

    # --- 3.5. INITIALIZING EXPLAINERS ---
    logger.info("Initializing SHAP and LIME explainers...")
    try:
        # Initialize SHAP explainer - use a different approach for transformers
        def model_predict(texts):
            inputs = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
            inputs.pop("token_type_ids", None)
            with torch.no_grad():
                outputs = model(**inputs)
                probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
            return probs.numpy()
        
        # Use a simpler SHAP explainer approach
        background_data = ["", "positive", "negative", "neutral"]
        explainer = shap.KernelExplainer(model_predict, background_data)
        logger.info("SHAP explainer initialized successfully.")
    except Exception as e:
        logger.warning(f"Failed to initialize SHAP explainer: {e}")
        explainer = None
    
    try:
        # Initialize LIME explainer as backup
        lime_explainer = LimeTextExplainer(class_names=['negative', 'neutral', 'positive'])
        logger.info("LIME explainer initialized successfully.")
    except Exception as e:
        logger.warning(f"Failed to initialize LIME explainer: {e}")
        lime_explainer = None

except Exception as e:
    logger.critical(f"Failed to load model: {e}")
    print("\n[CRITICAL ERROR] Could not load the model.")
    print(f"Details: {str(e)}")
    print("Please check that 'model.safetensors' and 'config.json' are in the 'models' folder.\n")
    sys.exit(1)

# --- 4. HELPER FUNCTIONS ---

def get_shap_explanation(text, sentiment, prediction_idx):
    """Generate SHAP-based word importance explanation"""
    try:
        if explainer is None:
            return [], []
        
        # Get SHAP values using the explainer
        shap_values = explainer.shap_values([text])
        
        if shap_values is not None and len(shap_values) > 0:
            # Get the SHAP values for the predicted class
            if isinstance(shap_values, list):
                # Multi-class case
                class_shap_values = shap_values[prediction_idx]
            else:
                # Single output case
                class_shap_values = shap_values[0]
            
            # Tokenize the text to get word mappings
            inputs = tokenizer(text, padding=True, truncation=True, max_length=512, return_tensors="pt")
            inputs.pop("token_type_ids", None)
            tokens = tokenizer.convert_ids_to_tokens(inputs['input_ids'][0])
            
            # Remove special tokens and get clean tokens
            clean_tokens = []
            clean_values = []
            
            for i, token in enumerate(tokens):
                if token not in ['[CLS]', '[SEP]', '[PAD]'] and i < len(class_shap_values):
                    clean_tokens.append(token.replace('##', ''))
                    clean_values.append(class_shap_values[i])
            
            # Pair tokens with their importance scores
            token_importance = list(zip(clean_tokens, clean_values))
            
            # Sort by absolute importance
            token_importance.sort(key=lambda x: abs(x[1]), reverse=True)
            
            # Get top contributing tokens
            top_tokens = token_importance[:10]
            
            return token_importance, top_tokens
        
        return [], []
        
    except Exception as e:
        logger.error(f"Error in SHAP explanation: {e}")
        return [], []

def get_lime_explanation(text, sentiment):
    """Generate LIME-based explanation as backup"""
    try:
        if lime_explainer is None:
            return None
        
        # Create prediction function for LIME
        def predict_fn(texts):
            inputs = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
            inputs.pop("token_type_ids", None)
            with torch.no_grad():
                outputs = model(**inputs)
                probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
            return probs.numpy()
        
        # Get LIME explanation
        explanation = lime_explainer.explain_instance(
            text, 
            predict_fn, 
            num_features=10, 
            num_samples=100
        )
        
        # Extract word contributions
        word_contributions = []
        for feature, contribution in explanation.as_list():
            word_contrib = {
                'word': feature,
                'contribution': contribution,
                'sentiment_impact': 'positive' if contribution > 0 else 'negative'
            }
            word_contributions.append(word_contrib)
        
        return word_contributions
        
    except Exception as e:
        logger.error(f"Error in LIME explanation: {e}")
        return []

def generate_advanced_explanation(text, sentiment, confidence):
    """Generate advanced explanation using SHAP/LIME insights"""
    # Get SHAP explanation
    shap_importance, top_tokens = get_shap_explanation(text, sentiment, 
                                                     0 if sentiment == 'negative' else 
                                                     1 if sentiment == 'neutral' else 2)
    
    # Get LIME explanation as backup
    lime_contributions = get_lime_explanation(text, sentiment)
    
    # Choose the best available explanation
    if shap_importance and len(shap_importance) > 0:
        # Use SHAP results
        top_positive = [token for token, score in top_tokens[:5] if score > 0]
        top_negative = [token for token, score in top_tokens[:5] if score < 0]
        
        explanation = f"Classified as {sentiment} with high confidence ({confidence:.2f}). "
        
        if top_positive:
            explanation += f"Strong positive contributors: {', '.join(top_positive[:3])}. "
        if top_negative:
            explanation += f"Negative influences: {', '.join(top_negative[:3])}. "
        
        explanation += f"SHAP analysis shows {len(top_positive)} positive and {len(top_negative)} negative word-level contributions."
        
        # Include word contributions in explanation
        word_contributions = []
        for token, score in top_tokens[:8]:
            word_contributions.append({
                'word': token,
                'sentiment': 'positive' if score > 0 else 'negative',
                'importance': abs(score)
            })
        
        return explanation, word_contributions, shap_importance
        
    elif lime_contributions:
        # Use LIME results as backup
        top_contributions = lime_contributions[:5]
        explanation = f"Classified as {sentiment} with moderate confidence ({confidence:.2f}). "
        
        pos_words = [c['word'] for c in top_contributions if c['sentiment_impact'] == 'positive']
        neg_words = [c['word'] for c in top_contributions if c['sentiment_impact'] == 'negative']
        
        if pos_words:
            explanation += f"LIME analysis identifies positive contributors: {', '.join(pos_words[:3])}. "
        if neg_words:
            explanation += f"Negative contributors detected: {', '.join(neg_words[:3])}. "
        
        explanation += "Local feature importance analysis reveals key sentiment drivers."
        
        return explanation, lime_contributions, lime_contributions
    
    else:
        # Fallback to original explanation
        return generate_explanation(text, sentiment, confidence), [], []

def generate_explanation(text, sentiment, confidence):
    """Generate human-readable explanation for sentiment classification"""
    if confidence > 0.9:
        confidence_level = "very high"
    elif confidence > 0.7:
        confidence_level = "high"
    elif confidence > 0.5:
        confidence_level = "moderate"
    else:
        confidence_level = "low"
    
    # Sentiment indicator words
    positive_words = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'awesome', 'fantastic', 'wonderful', 'perfect', 'brilliant', 'outstanding', 'superb', 'terrific', 'delightful']
    negative_words = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'dreadful', 'appalling', 'atrocious', 'lousy', 'abysmal', 'ghastly', 'hideous', 'repulsive']
    neutral_indicators = ['okay', 'fine', 'alright', 'decent', 'acceptable', 'reasonable', 'moderate', 'average', 'standard', 'typical', 'normal', 'usual']
    
    text_lower = text.lower()
    pos_count = sum(1 for word in positive_words if word in text_lower)
    neg_count = sum(1 for word in negative_words if word in text_lower)
    neu_count = sum(1 for word in neutral_indicators if word in text_lower)
    
    # Build explanation
    explanation = f"Classified as {sentiment} with {confidence_level} confidence ({confidence:.2f}). "
    
    if sentiment == "positive":
        if pos_count > 0:
            explanation += f"Detected {pos_count} positive sentiment indicators like '{', '.join([w for w in positive_words if w in text_lower][:3])}'. "
        if neg_count > 0:
            explanation += f"Despite {neg_count} negative indicators, overall sentiment remains positive. "
        explanation += "The text expresses favorable emotions or approval."
    elif sentiment == "negative":
        if neg_count > 0:
            explanation += f"Detected {neg_count} negative sentiment indicators like '{', '.join([w for w in negative_words if w in text_lower][:3])}'. "
        if pos_count > 0:
            explanation += f"Despite {pos_count} positive indicators, overall sentiment remains negative. "
        explanation += "The text expresses unfavorable emotions or disapproval."
    else:  # neutral
        if neu_count > 0:
            explanation += f"Detected {neu_count} neutral indicators like '{', '.join([w for w in neutral_indicators if w in text_lower][:3])}'. "
        explanation += "The text appears balanced with minimal emotional language or mixed sentiments."
    
    return explanation

def extract_sentiment_keywords(text):
    """Extract keywords that influenced sentiment classification"""
    positive_words = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'awesome', 'fantastic', 'wonderful', 'perfect']
    negative_words = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'dreadful', 'appalling', 'atrocious']
    neutral_words = ['okay', 'fine', 'alright', 'decent', 'acceptable', 'reasonable', 'moderate', 'average']
    
    text_lower = text.lower()
    words = text_lower.split()
    
    found_words = []
    for word in words:
        clean_word = word.strip('.,!?;:"()[]')
        if clean_word in positive_words:
            found_words.append((clean_word, 'positive'))
        elif clean_word in negative_words:
            found_words.append((clean_word, 'negative'))
        elif clean_word in neutral_words:
            found_words.append((clean_word, 'neutral'))
    
    return found_words[:5]  # Return top 5 keywords

def get_sentiment(text):
    if not text or not text.strip():
        return "neutral", {"confidence": "0.00", "reasoning": "No text provided", "key_words": []}

    try:
        inputs = tokenizer(text, padding=True, truncation=True, max_length=512, return_tensors="pt")
        inputs.pop("token_type_ids", None)  # FIX: DistilBERT doesn't support this

        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)

        prediction_idx = torch.argmax(probs).item()
        confidence = probs[0][prediction_idx].item()

        if prediction_idx < len(LABELS):
            sentiment = LABELS[prediction_idx]
        else:
            sentiment = f"LABEL_{prediction_idx}"

        print(f"DEBUG: Index={prediction_idx} | Conf={confidence:.2f} | Mapped='{sentiment}' | Text='{text[:20]}...'")

        # Generate advanced explanation using SHAP/LIME
        advanced_reasoning, word_contributions, importance_scores = generate_advanced_explanation(text, sentiment, confidence)
        
        # Enhanced explanation with multiple components
        explanation = {
            "confidence": f"{confidence:.2f}",
            "reasoning": advanced_reasoning,
            "key_words": extract_sentiment_keywords(text),
            "word_contributions": word_contributions,
            "importance_scores": importance_scores,
            "explanation_method": "SHAP" if importance_scores else "LIME" if word_contributions else "Rule-based",
            "text_length": len(text.split()),
            "prediction_confidence": confidence
        }
        
        return sentiment, explanation

    except Exception as e:
        logger.error(f"Error in get_sentiment: {e}")
        return "neutral", {"confidence": "0.00", "reasoning": "Error processing text", "key_words": []}

def extract_locations(text_list):
    """
    Extracts unique GPE (Geopolitical Entity) and LOC (Location) entities 
    from a list of texts using Spacy.
    """
    locations = set()
    try:
        # Combine first 20 items to speed up processing (batching)
        combined_text = " ".join(text_list[:25]) 
        doc = nlp(combined_text)
        
        for ent in doc.ents:
            if ent.label_ in ["GPE", "LOC"]:
                locations.add(ent.text)
        
        result = list(locations)
        return result if result else ["No specific locations detected"]
    except Exception as e:
        logger.error(f"Error in extract_locations: {e}")
        return ["Location detection failed"]

# --- 5. THE API ENDPOINT ---

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # A. Parse Request
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data received", "success": False}), 400

        posts = data.get('posts', [])
        comments = data.get('comments', [])
        
        logger.info(f"Received Request: {len(posts)} posts, {len(comments)} comments")

        post_sentiments = []
        comment_sentiments = []
        all_texts_for_loc = []

        # B. Process Posts
        for p in posts:
            # Combine title and body for better context
            title = p.get('title', '')
            body = p.get('selftext', '')
            text = f"{title} {body}"
            
            all_texts_for_loc.append(text)
            
            sent, exp = get_sentiment(text)
            post_sentiments.append({
                "text": text[:100], # Send back snippet
                "sentiment": sent,
                "explanation": exp
            })

        # C. Process Comments
        for c in comments:
            text = c.get('body', '')
            all_texts_for_loc.append(text)
            
            sent, exp = get_sentiment(text)
            comment_sentiments.append({
                "text": text[:100],
                "sentiment": sent,
                "explanation": exp
            })

        # D. Calculate Statistics (Percentages)
        all_results = post_sentiments + comment_sentiments
        total = len(all_results)
        
        # Initialize with 0 to ensure the Frontend Chart works even if empty
        stats = {label: 0 for label in LABELS} 
        
        if total > 0:
            for item in all_results:
                s = item['sentiment']
                if s in stats:
                    stats[s] += 1
                else:
                    # Handle unexpected labels safely
                    if s not in stats: stats[s] = 0
                    stats[s] += 1
            
            # Convert counts to percentages (0.00 - 1.00)
            for k in stats:
                stats[k] /= total

        # E. Extract Locations
        locations = extract_locations(all_texts_for_loc)

        # F. Construct Final JSON Response
        response = {
            "postSentiments": post_sentiments,
            "commentSentiments": comment_sentiments,
            "sentiment": {
                "postBreakdown": stats,
                "commentBreakdown": stats 
            },
            "locations": locations,
            "patterns": {
                "topicInterests": ["General Reddit Activity"]
            }
        }
        
        return jsonify(response)

    except Exception as e:
        logger.error(f"CRITICAL API ERROR: {e}")
        # Return a JSON error so the frontend doesn't just hang
        return jsonify({"error": str(e), "success": False}), 500

if __name__ == '__main__':
    print("\n" + "="*50)
    print(" PYTHON MODEL SERVER STARTED ")
    print(f" Listening on port 5000")
    print(f" Model Path: {MODEL_PATH}")
    print("="*50 + "\n")
    app.run(host='0.0.0.0', port=5000)
