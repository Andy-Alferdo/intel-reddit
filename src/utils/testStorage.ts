// Test function to verify Reddit storage is working
import { supabase } from '@/integrations/supabase/client';

export async function testRedditStorage() {
  console.log('🧪 Testing Reddit storage functionality...');
  
  try {
    // Test 1: Direct database insert for posts
    console.log('📝 Testing direct post insert...');
    const testPost = {
      case_id: '00000000-0000-0000-0000-000000000000', // You'll need to replace with a real case ID
      post_id: 'test_post_' + Date.now(),
      author: 'test_author',
      subreddit: 'test_subreddit',
      title: 'Test Post Title',
      selftext: 'Test post content',
      score: 10,
      num_comments: 5,
      permalink: '/r/test/comments/test123/',
      created_utc: new Date().toISOString(),
      stored_by_function: 'test_function',
      investigator_username: 'test_user',
      storage_session_id: 'test_session_' + Date.now(),
    };

    const { data: postResult, error: postError } = await supabase
      .from('reddit_posts')
      .insert(testPost)
      .select()
      .single();

    if (postError) {
      console.error('❌ Post insert failed:', postError);
      return { success: false, error: postError.message };
    } else {
      console.log('✅ Post insert successful:', postResult);
    }

    // Test 2: Direct database insert for comments
    console.log('📝 Testing direct comment insert...');
    const testComment = {
      case_id: '00000000-0000-0000-0000-000000000000', // You'll need to replace with a real case ID
      comment_id: 'test_comment_' + Date.now(),
      author: 'test_commenter',
      body: 'Test comment content',
      subreddit: 'test_subreddit',
      score: 3,
      permalink: '/r/test/comments/test123/test_comment/',
      created_utc: new Date().toISOString(),
      stored_by_function: 'test_function',
      investigator_username: 'test_user',
      storage_session_id: 'test_session_' + Date.now(),
    };

    const { data: commentResult, error: commentError } = await supabase
      .from('reddit_comments')
      .insert(testComment)
      .select()
      .single();

    if (commentError) {
      console.error('❌ Comment insert failed:', commentError);
      return { success: false, error: commentError.message };
    } else {
      console.log('✅ Comment insert successful:', commentResult);
    }

    // Test 3: Test data-store edge function
    console.log('🌐 Testing data-store edge function...');
    const edgeFunctionTest = await supabase.functions.invoke('data-store', {
      body: {
        operation: 'savePosts',
        caseId: '00000000-0000-0000-0000-000000000000', // You'll need to replace with a real case ID
        data: {
          posts: [{
            id: 'edge_test_post_' + Date.now(),
            title: 'Edge Function Test Post',
            author: 'edge_test_author',
            subreddit: 'edge_test',
            selftext: 'Edge function test content',
            score: 15,
            num_comments: 2,
            permalink: '/r/edgetest/comments/edge123/',
            created_utc: Date.now() / 1000, // Reddit API uses timestamp
          }],
          functionName: 'edge_function_test'
        }
      }
    });

    if (edgeFunctionTest.error) {
      console.error('❌ Edge function failed:', edgeFunctionTest.error);
      return { success: false, error: edgeFunctionTest.error.message };
    } else {
      console.log('✅ Edge function successful:', edgeFunctionTest.data);
    }

    // Test 4: Verify data appears in admin dashboard queries
    console.log('🔍 Testing admin dashboard queries...');
    const { data: posts, error: postsQueryError } = await supabase
      .from('reddit_posts')
      .select('*')
      .order('scraped_at', { ascending: false })
      .limit(5);

    if (postsQueryError) {
      console.error('❌ Posts query failed:', postsQueryError);
      return { success: false, error: postsQueryError.message };
    } else {
      console.log('✅ Posts query successful, found', posts?.length, 'posts');
      console.log('📊 Recent posts:', posts);
    }

    const { data: comments, error: commentsQueryError } = await supabase
      .from('reddit_comments')
      .select('*')
      .order('scraped_at', { ascending: false })
      .limit(5);

    if (commentsQueryError) {
      console.error('❌ Comments query failed:', commentsQueryError);
      return { success: false, error: commentsQueryError.message };
    } else {
      console.log('✅ Comments query successful, found', comments?.length, 'comments');
      console.log('📊 Recent comments:', comments);
    }

    return { 
      success: true, 
      message: 'All storage tests passed!',
      results: { postResult, commentResult, edgeFunctionTest, posts, comments }
    };

  } catch (error: any) {
    console.error('❌ Test failed with exception:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to get a valid case ID for testing
export async function getTestCaseId() {
  const { data: cases } = await supabase
    .from('investigation_cases')
    .select('id')
    .limit(1);
  
  return cases?.[0]?.id || null;
}
