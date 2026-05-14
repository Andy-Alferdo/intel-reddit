// Hugging Face Space API Client using official @gradio/client
// Connects to deployed model at: https://takeda-shingen-intel-reddit-analyzer.hf.space

import { Client } from "@gradio/client";

const HF_SPACE_URL = import.meta.env?.VITE_HF_SPACE_URL || "https://takeda-shingen-intel-reddit-analyzer.hf.space";

// Cached client instance
let gradioClient: any = null;

async function getClient(): Promise<any> {
  if (!gradioClient) {
    console.log('[HF Client] Connecting to:', HF_SPACE_URL);
    gradioClient = await Client.connect(HF_SPACE_URL);
    console.log('[HF Client] Connected successfully');
  }
  return gradioClient;
}

interface RedditPost {
  title: string;
  selftext: string;
  subreddit?: string;
}

interface RedditComment {
  body: string;
  subreddit?: string;
}

// Format expected by frontend (matches old supabase edge function)
export interface SentimentItem {
  sentiment: string;
  confidence?: number;
  all_probabilities?: Record<string, number>;
  text_preview?: string;
  explanation?: string | { reasoning?: string; key_words?: string[] };
}

export interface AnalysisResult {
  postSentiments: SentimentItem[];
  commentSentiments: SentimentItem[];
  postCount: number;
  commentCount: number;
  sentimentBreakdown: Record<string, number>;
  locations: string[];
  dominantSentiment: string;
}

export interface DeepAnalysisResult {
  text: string;
  overall_sentiment: string;
  confidence: number;
  word_importance: Array<{
    word: string;
    importance: number;
    sentiment_contribution: string;
  }>;
  explanation: string;
}

/**
 * Analyze Reddit content using Hugging Face Space
 * @param posts Array of Reddit posts
 * @param comments Array of Reddit comments
 * @returns Analysis results in frontend-compatible format (camelCase)
 */
export async function analyzeWithHuggingFace(
  posts: RedditPost[],
  comments: RedditComment[]
): Promise<AnalysisResult> {
  try {
    const client = await getClient();
    const result = await client.predict("/analyze_reddit_content", {
      posts_json: JSON.stringify(posts),
      comments_json: JSON.stringify(comments)
    });

    // Model returns array with one object, unwrap it
    const hfResult = Array.isArray(result.data) ? result.data[0] : result.data;
    console.log('[HF Client] Raw result from model:', result.data);
    console.log('[HF Client] Unwrapped result:', hfResult);
    console.log('[HF Client] Post sentiments raw:', hfResult?.post_sentiments?.slice(0, 3));
    console.log('[HF Client] Comment sentiments raw:', hfResult?.comment_sentiments?.slice(0, 3));

    // Transform snake_case to camelCase and add explanation field
    const transformSentiment = (item: any): SentimentItem => ({
      sentiment: item.sentiment,
      confidence: item.confidence,
      all_probabilities: item.all_probabilities,
      text_preview: item.text_preview,
      explanation: `Sentiment: ${item.sentiment} (confidence: ${Math.round((item.confidence || 0) * 100)}%). Key indicators: ${Object.entries(item.all_probabilities || {})
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 2)
        .map(([label, prob]) => `${label}: ${Math.round((prob as number) * 100)}%`)
        .join(', ')}`
    });

    return {
      postSentiments: (hfResult.post_sentiments || []).map(transformSentiment),
      commentSentiments: (hfResult.comment_sentiments || []).map(transformSentiment),
      postCount: hfResult.post_count || 0,
      commentCount: hfResult.comment_count || 0,
      sentimentBreakdown: hfResult.sentiment_breakdown || { negative: 0, neutral: 0, positive: 0 },
      locations: hfResult.locations || [],
      dominantSentiment: hfResult.dominant_sentiment || 'neutral'
    };
  } catch (error: any) {
    console.error('[HF Client] Analysis failed:', error);
    throw error;
  }
}

/**
 * Analyze single text sentiment
 * @param text Text to analyze
 * @returns Sentiment result
 */
export async function analyzeSingleText(text: string): Promise<{
  sentiment: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  text_preview: string;
}> {
  const client = await getClient();
  const result = await client.predict("/analyze_sentiment", {
    text: text
  });
  return result.data;
}

/**
 * Deep analysis with word-level sentiment contributions
 * @param text Text for deep analysis
 * @returns Detailed analysis with word importance scores
 */
export async function analyzeDeep(text: string): Promise<DeepAnalysisResult> {
  if (!text || !text.trim()) {
    return {
      text: '',
      overall_sentiment: 'neutral',
      confidence: 0,
      word_importance: [],
      explanation: 'No text provided for analysis.',
    };
  }
  const client = await getClient();
  const result = await client.predict("/deep_analyze", {
    text: text
  });
  // Gradio returns result.data as an array; unwrap the first element
  const hfResult = Array.isArray(result.data) ? result.data[0] : result.data;
  return hfResult;
}

/**
 * Unified predict API - batch analysis or deep analysis
 * If deep_text is provided, returns deep analysis
 * Otherwise, returns batch analysis of posts and comments
 * @param posts_json JSON string with array of posts
 * @param comments_json JSON string with array of comments
 * @param deep_text Optional text for deep analysis
 * @returns Analysis results
 */
export async function predict(
  posts_json: string,
  comments_json: string,
  deep_text?: string
): Promise<any> {
  const client = await getClient();
  const result = await client.predict("/predict", {
    posts_json: posts_json,
    comments_json: comments_json,
    deep_text: deep_text || ""
  });
  return result.data;
}

/**
 * Check if Hugging Face Space is awake
 * Returns true if space is ready, false if still loading
 */
export async function checkSpaceStatus(): Promise<boolean> {
  try {
    const response = await fetch(HF_SPACE_URL, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wake up the Hugging Face Space (call this before first analysis)
 * HF Spaces go to sleep after inactivity
 */
export async function wakeUpSpace(): Promise<boolean> {
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    const isReady = await checkSpaceStatus();
    if (isReady) {
      console.log('[HF Client] Space is awake and ready');
      return true;
    }
    console.log(`[HF Client] Space waking up... attempt ${attempts + 1}/${maxAttempts}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  throw new Error('Hugging Face Space failed to wake up after maximum attempts');
}
