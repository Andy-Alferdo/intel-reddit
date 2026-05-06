import { supabase } from '@/integrations/supabase/client';

// Helper functions for storing Reddit data with tracking information

export interface StorageMetadata {
  function_name: string;
  investigator_username?: string;
  session_id?: string;
}

export interface RedditPostData {
  post_id: string;
  case_id: string;
  author: string;
  subreddit: string;
  title: string;
  selftext?: string;
  permalink: string;
  created_utc: string;
  score: number;
  num_comments?: number;
  url?: string;
  over_18?: boolean;
  is_original_content?: boolean;
  metadata?: any;
  sentiment?: string;
  sentiment_explanation?: string;
}

export interface RedditCommentData {
  comment_id: string;
  case_id: string;
  post_id?: string;
  author: string;
  body: string;
  subreddit: string;
  link_title?: string;
  permalink: string;
  created_utc: string;
  score: number;
  parent_id?: string;
  is_submitter?: boolean;
  metadata?: any;
  sentiment?: string;
  sentiment_explanation?: string;
}

/**
 * Store Reddit post with tracking information
 */
export async function storeRedditPost(
  postData: RedditPostData,
  metadata: StorageMetadata
) {
  try {
    const { data, error } = await supabase
      .from('reddit_posts')
      .insert({
        ...postData,
        stored_by_function: metadata.function_name,
        investigator_username: metadata.investigator_username || null,
        storage_session_id: metadata.session_id || null,
        scraped_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error storing Reddit post:', error);
    throw error;
  }
}

/**
 * Store multiple Reddit posts with tracking information
 */
export async function storeRedditPosts(
  postsData: RedditPostData[],
  metadata: StorageMetadata
) {
  try {
    const postsWithMetadata = postsData.map(post => ({
      ...post,
      stored_by_function: metadata.function_name,
      investigator_username: metadata.investigator_username || null,
      storage_session_id: metadata.session_id || null,
      scraped_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('reddit_posts')
      .insert(postsWithMetadata)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error storing Reddit posts:', error);
    throw error;
  }
}

/**
 * Store Reddit comment with tracking information
 */
export async function storeRedditComment(
  commentData: RedditCommentData,
  metadata: StorageMetadata
) {
  try {
    const { data, error } = await supabase
      .from('reddit_comments')
      .insert({
        ...commentData,
        stored_by_function: metadata.function_name,
        investigator_username: metadata.investigator_username || null,
        storage_session_id: metadata.session_id || null,
        scraped_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error storing Reddit comment:', error);
    throw error;
  }
}

/**
 * Store multiple Reddit comments with tracking information
 */
export async function storeRedditComments(
  commentsData: RedditCommentData[],
  metadata: StorageMetadata
) {
  try {
    const commentsWithMetadata = commentsData.map(comment => ({
      ...comment,
      stored_by_function: metadata.function_name,
      investigator_username: metadata.investigator_username || null,
      storage_session_id: metadata.session_id || null,
      scraped_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('reddit_comments')
      .insert(commentsWithMetadata)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error storing Reddit comments:', error);
    throw error;
  }
}

/**
 * Get current user's username for tracking
 */
export async function getCurrentInvestigatorUsername(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    return profile?.username || null;
  } catch (error) {
    console.error('Error getting current username:', error);
    return null;
  }
}

/**
 * Generate a unique session ID for batch operations
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
