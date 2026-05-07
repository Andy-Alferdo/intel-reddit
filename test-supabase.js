import { supabase } from './src/integrations/supabase/client.js';

// Test Supabase client connection
async function testSupabase() {
  try {
    console.log('Testing Supabase client...');
    
    // Test basic query
    const { data: cases, error: casesError } = await supabase
      .from('investigation_cases')
      .select('*')
      .limit(1);
    
    if (casesError) {
      console.error('Cases query error:', casesError);
      return false;
    }
    
    console.log('Supabase client working! Found cases:', cases?.length || 0);
    return true;
  } catch (error) {
    console.error('Supabase client test failed:', error);
    return false;
  }
}

testSupabase();
