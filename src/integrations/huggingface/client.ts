// Hugging Face Space API Client
// Connects to deployed model at: https://takeda-shingen-intel-reddit-analyzer.hf.space

const HF_SPACE_URL = import.meta.env?.VITE_HF_SPACE_URL || "https://takeda-shingen-intel-reddit-analyzer.hf.space";

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
 * Call Hugging Face Space API with proper Gradio 4.x format
 * @param endpoint API endpoint name
 * @param data Array of data parameters
 * @returns API response
 */
async function callHuggingFaceAPI(endpoint: string, data: any[]): Promise<any> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  // Try /call/ for async or /run/ for sync - Gradio 4.x uses /call/
  const url = `${HF_SPACE_URL}/call/${cleanEndpoint}`;
  console.log('[HF Client] Calling:', url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HF API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  // Gradio 4.x returns { data: [...] } format
  return result.data ? result.data[0] : result;
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
    const hfResult = await callHuggingFaceAPI("/analyze_reddit_content", [
      JSON.stringify(posts),
      JSON.stringify(comments)
    ]);

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
  return await callHuggingFaceAPI("/analyze_sentiment", [text]);
}

/**
 * Deep analysis with word-level sentiment contributions
 * @param text Text for deep analysis
 * @returns Detailed analysis with word importance scores
 */
export async function analyzeDeep(text: string): Promise<DeepAnalysisResult> {
  return await callHuggingFaceAPI("/deep_analyze", [text]);
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
  return await callHuggingFaceAPI("/predict", [
    posts_json,
    comments_json,
    deep_text || ""
  ]);
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
  const maxAttempts = 30; // Try for ~2.5 minutes (5 seconds * 30)

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
