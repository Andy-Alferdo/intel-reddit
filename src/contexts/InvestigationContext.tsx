import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Types for the investigation data
interface SentimentItem {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

interface UserProfileData {
  username: string;
  accountAge: string;
  totalKarma: number;
  postKarma: number;
  commentKarma: number;
  activeSubreddits: any[];
  activityPattern: {
    mostActiveHour: string;
    mostActiveDay: string;
    timezone: string;
  };
  sentimentAnalysis: { positive: number; neutral: number; negative: number };
  postSentiments: SentimentItem[];
  commentSentiments: SentimentItem[];
  locationIndicators: string[];
  behaviorPatterns: string[];
  wordCloud: any[];
  analyzedAt?: string;
}

interface MonitoringData {
  searchType: 'user' | 'community';
  targetName: string;
  profileData: any;
  activities: any[];
  wordCloudData: any[];
  startedAt: string;
  newActivityCount: number;
}

interface KeywordAnalysisData {
  keyword: string;
  totalMentions: number;
  topSubreddits: any[];
  wordCloud: any[];
  trendData: any[];
  recentPosts?: any[];
  allPosts?: any[];
  recent10Posts?: any[];
  top10Posts?: any[];
  sentimentChartData: any[];
  postSentiments: SentimentItem[];
  analyzedAt: string;
}

interface CommunityAnalysisData {
  name: string;
  subscribers: number;
  activeUsers: number;
  description: string;
  created: string;
  iconImg?: string;
  bannerImg?: string;
  wordCloud: any[];
  topAuthors: any[];
  activityData: any[];
  recentPosts?: any[];
  allPosts?: any[];
  recent10Posts?: any[];
  top10Posts?: any[];
  sentimentChartData: any[];
  postSentiments: SentimentItem[];
  stats: any;
  analyzedAt: string;
}

interface LinkAnalysisData {
  primaryUser: string;
  totalKarma: number;
  userToCommunities: any[];
  communityCrossover?: any[];
  communityDistribution: any[];
  networkMetrics: any;
  analyzedAt: string;
}

interface CaseData {
  id: string;
  case_number: string;
  case_name: string;
  description?: string;
  lead_investigator?: string;
  department?: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface InvestigationContextType {
  // Case management
  currentCase: CaseData | null;
  setCurrentCase: (caseData: CaseData | null) => void;
  cases: CaseData[];
  loadCases: () => Promise<void>;
  createCase: (caseData: any) => Promise<CaseData | null>;
  isLoadingCases: boolean;
  
  // Investigation metadata (backward compatibility)
  caseNumber: string;
  setCaseNumber: (num: string) => void;
  investigator: string;
  setInvestigator: (name: string) => void;
  
  // User profiling data
  userProfiles: UserProfileData[];
  addUserProfile: (profile: UserProfileData) => void;
  saveUserProfileToDb: (profile: UserProfileData) => Promise<void>;
  clearUserProfiles: () => void;
  
  // Monitoring data
  monitoringSessions: MonitoringData[];
  addMonitoringSession: (session: MonitoringData) => void;
  saveMonitoringSessionToDb: (session: MonitoringData) => Promise<void>;
  clearMonitoringSessions: () => void;
  
  // Keyword analysis data
  keywordAnalyses: KeywordAnalysisData[];
  addKeywordAnalysis: (analysis: KeywordAnalysisData) => void;
  saveKeywordAnalysisToDb: (analysis: KeywordAnalysisData) => Promise<void>;
  clearKeywordAnalyses: () => void;
  
  // Community analysis data
  communityAnalyses: CommunityAnalysisData[];
  addCommunityAnalysis: (analysis: CommunityAnalysisData) => void;
  saveCommunityAnalysisToDb: (analysis: CommunityAnalysisData) => Promise<void>;
  clearCommunityAnalyses: () => void;
  
  // Link analysis data
  linkAnalyses: LinkAnalysisData[];
  addLinkAnalysis: (analysis: LinkAnalysisData) => void;
  saveLinkAnalysisToDb: (analysis: LinkAnalysisData) => Promise<void>;
  clearLinkAnalyses: () => void;
  
  // Summary stats
  getTotalUsersAnalyzed: () => number;
  getTotalPostsReviewed: () => number;
  getTotalCommunitiesAnalyzed: () => number;
  
  // Load case data from DB
  loadCaseData: (caseId: string) => Promise<void>;
  
  // Clear all data
  clearAllData: () => void;
  
  // Helper to call data-store function
  callDataStore: (operation: string, data?: any, caseId?: string) => Promise<any>;
  
  // Shared Reddit content saver
  saveRedditContentToDb: (posts: any[], comments: any[], source: string) => Promise<any>;
}

const InvestigationContext = createContext<InvestigationContextType | undefined>(undefined);

export const InvestigationProvider = ({ children }: { children: ReactNode }) => {
  const [currentCase, setCurrentCase] = useState<CaseData | null>(null);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  
  const [caseNumber, setCaseNumber] = useState(`CASE-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
  const [investigator, setInvestigator] = useState('');
  const [userProfiles, setUserProfiles] = useState<UserProfileData[]>([]);
  const [monitoringSessions, setMonitoringSessions] = useState<MonitoringData[]>([]);
  const [keywordAnalyses, setKeywordAnalyses] = useState<KeywordAnalysisData[]>([]);
  const [communityAnalyses, setCommunityAnalyses] = useState<CommunityAnalysisData[]>([]);
  const [linkAnalyses, setLinkAnalyses] = useState<LinkAnalysisData[]>([]);

  // Helper to call data-store backend function
  const callDataStore = useCallback(async (operation: string, data?: any, caseId?: string) => {
    const { data: session } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.session?.access_token) {
      headers['Authorization'] = `Bearer ${session.session.access_token}`;
    }

    const { data: result, error } = await supabase.functions.invoke('data-store', {
      body: { operation, data, caseId },
      headers,
    });

    if (error) {
      console.error('Data store error:', error);
      throw error;
    }

    return result;
  }, []);

  const emitCaseDataUpdated = useCallback((caseId: string, kind: string) => {
    window.dispatchEvent(
      new CustomEvent('case-data-updated', {
        detail: { caseId, kind, ts: Date.now() },
      })
    );
  }, []);

  // Shared function to save Reddit content to database
  const saveRedditContentToDb = useCallback(async (posts: any[], comments: any[], source: string) => {
    if (!currentCase?.id) {
      console.log('No current case, skipping Reddit content save');
      return;
    }

    if (!posts.length && !comments.length) {
      console.log('No Reddit content to save');
      return;
    }

    try {
      console.log(`[InvestigationContext] Saving Reddit content: ${posts.length} posts, ${comments.length} comments, source: ${source}`);
      
      let postsInserted = 0;
      let commentsInserted = 0;

      // Save posts directly using Supabase client
      if (posts.length > 0) {
        const postsToInsert = posts.map((post: any) => ({
          post_id: post.id || post.name,
          case_id: currentCase.id,
          author: post.author,
          subreddit: post.subreddit,
          title: post.title,
          selftext: post.selftext,
          permalink: post.permalink,
          created_utc: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
          score: post.score,
          num_comments: post.num_comments,
          url: post.url,
          over_18: post.over_18 || false,
          is_original_content: post.is_original_content || false,
          stored_by_function: 'frontend',
          investigator_username: source || 'unknown',
        }));

        const { data: insertedPosts, error: postsError } = await supabase
          .from('reddit_posts')
          .insert(postsToInsert, { onConflict: 'do_nothing' })
          .select('id');

        if (postsError) {
          console.error('[InvestigationContext] Insert posts error:', postsError);
        } else {
          postsInserted = insertedPosts?.length || 0;
        }
      }

      // Save comments directly using Supabase client
      if (comments.length > 0) {
        const commentsToInsert = comments.map((comment: any) => ({
          comment_id: comment.id || comment.name,
          case_id: currentCase.id,
          author: comment.author,
          body: comment.body,
          subreddit: comment.subreddit,
          link_title: comment.link_title,
          permalink: comment.permalink,
          created_utc: comment.created_utc ? new Date(comment.created_utc * 1000).toISOString() : null,
          score: comment.score,
          parent_id: comment.parent_id,
          is_submitter: comment.is_submitter || false,
          stored_by_function: 'frontend',
          investigator_username: source || 'unknown',
        }));

        const { data: insertedComments, error: commentsError } = await supabase
          .from('reddit_comments')
          .insert(commentsToInsert, { onConflict: 'do_nothing' })
          .select('id');

        if (commentsError) {
          console.error('[InvestigationContext] Insert comments error:', commentsError);
        } else {
          commentsInserted = insertedComments?.length || 0;
        }
      }

      const totalInserted = postsInserted + commentsInserted;

      console.log(`[InvestigationContext] Reddit content saved: ${totalInserted} items inserted (${postsInserted} posts, ${commentsInserted} comments)`);

      // Emit update to refresh admin dashboard
      emitCaseDataUpdated(currentCase.id, 'redditContent');
      
      return { postsResult: { inserted: postsInserted }, commentsResult: { inserted: commentsInserted }, totalInserted };
    } catch (error: any) {
      console.error('[InvestigationContext] Failed to save Reddit content:', error);
      throw error;
    }
  }, [currentCase, emitCaseDataUpdated]);

  // Keep current case in sync with localStorage selection (single-tab safe)
  useEffect(() => {
    const syncFromStorage = () => {
      const raw = localStorage.getItem('selectedCase');
      if (!raw) {
        setCurrentCase(null);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.id) setCurrentCase(parsed);
      } catch {
        // ignore
      }
    };

    syncFromStorage();
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  // Load all cases for current user
  const loadCases = useCallback(async () => {
    setIsLoadingCases(true);
    try {
      const casesData = await callDataStore('getCases');
      setCases(casesData || []);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setIsLoadingCases(false);
    }
  }, [callDataStore]);

  // Create a new case
  const createCase = useCallback(async (caseData: any): Promise<CaseData | null> => {
    try {
      const newCase = await callDataStore('createCase', caseData);
      setCases(prev => [newCase, ...prev]);
      setCurrentCase(newCase);
      setCaseNumber(newCase.case_number);
      setInvestigator(newCase.lead_investigator || '');
      
      // Clear all previous case data when creating a new case
      setUserProfiles([]);
      setMonitoringSessions([]);
      setKeywordAnalyses([]);
      setCommunityAnalyses([]);
      setLinkAnalyses([]);
      
      // Store in localStorage for persistence
      localStorage.setItem('selectedCase', JSON.stringify(newCase));
      
      return newCase;
    } catch (err) {
      console.error('Failed to create case:', err);
      return null;
    }
  }, [callDataStore]);

  // Load full case data from DB
  const loadCaseData = useCallback(async (caseId: string) => {
    try {
      const fullData = await callDataStore('getCaseFullData', undefined, caseId);
      
      if (fullData.case) {
        setCurrentCase(fullData.case);
        setCaseNumber(fullData.case.case_number);
        setInvestigator(fullData.case.lead_investigator || '');
      }
      
      // Transform DB data back to local state format
      if (fullData.profiles) {
        setUserProfiles(fullData.profiles.map((p: any) => ({
          username: p.username,
          accountAge: p.account_age,
          totalKarma: p.total_karma,
          postKarma: p.post_karma,
          commentKarma: p.comment_karma,
          activeSubreddits: p.active_subreddits || [],
          activityPattern: p.activity_pattern || {},
          sentimentAnalysis: p.sentiment_analysis || {},
          postSentiments: p.post_sentiments || [],
          commentSentiments: p.comment_sentiments || [],
          locationIndicators: p.location_indicators || [],
          behaviorPatterns: p.behavior_patterns || [],
          wordCloud: p.word_cloud || [],
          analyzedAt: p.analyzed_at,
        })));
      }
      
      if (fullData.sessions) {
        setMonitoringSessions(fullData.sessions.map((s: any) => ({
          searchType: s.search_type,
          targetName: s.target_name,
          profileData: s.profile_data,
          activities: s.activities || [],
          wordCloudData: s.word_cloud_data || [],
          startedAt: s.started_at,
          newActivityCount: s.new_activity_count,
        })));
      }
      
      if (fullData.analyses) {
        const keyword = fullData.analyses.filter((a: any) => a.analysis_type === 'keyword');
        const community = fullData.analyses.filter((a: any) => a.analysis_type === 'community');
        const link = fullData.analyses.filter((a: any) => a.analysis_type === 'link');
        
        setKeywordAnalyses(keyword.map((k: any) => ({
          ...k.result_data,
          analyzedAt: k.analyzed_at,
        })));
        
        setCommunityAnalyses(community.map((c: any) => ({
          ...c.result_data,
          analyzedAt: c.analyzed_at,
        })));
        
        setLinkAnalyses(link.map((l: any) => ({
          ...l.result_data,
          analyzedAt: l.analyzed_at,
        })));
      }
    } catch (err) {
      console.error('Failed to load case data:', err);
    }
  }, [callDataStore]);

  // Local state management (for in-memory tracking)
  const addUserProfile = (profile: UserProfileData) => {
    setUserProfiles(prev => {
      const existing = prev.findIndex(p => p.username === profile.username);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...profile, analyzedAt: new Date().toISOString() };
        return updated;
      }
      return [...prev, { ...profile, analyzedAt: new Date().toISOString() }];
    });
  };

  // Save to database
  const saveUserProfileToDb = useCallback(async (profile: UserProfileData) => {
    if (!currentCase?.id) return;
    try {
      const { error } = await supabase
        .from('user_profiles_analyzed')
        .upsert({
          case_id: currentCase.id,
          username: profile.username,
          comment_karma: profile.commentKarma,
          post_karma: profile.postKarma,
          total_karma: profile.totalKarma,
          account_age: profile.accountAge,
          active_subreddits: profile.activeSubreddits,
          activity_pattern: profile.activityPattern,
          analyzed_at: new Date().toISOString(),
          behavior_patterns: profile.behaviorPatterns,
          comment_sentiments: profile.commentSentiments,
          location_indicators: profile.locationIndicators,
          post_sentiments: profile.postSentiments,
          sentiment_analysis: profile.sentimentAnalysis,
          word_cloud: profile.wordCloud,
        });
      
      if (error) {
        console.error('[InvestigationContext] Save user profile error:', error);
        throw error;
      }
      
      emitCaseDataUpdated(currentCase.id, 'userProfiles');
    } catch (error) {
      console.error('[InvestigationContext] Failed to save user profile:', error);
      throw error;
    }
  }, [currentCase, emitCaseDataUpdated]);

  const addMonitoringSession = (session: MonitoringData) => {
    setMonitoringSessions(prev => [...prev, session]);
  };

  const saveMonitoringSessionToDb = useCallback(async (session: MonitoringData) => {
    if (!currentCase?.id) {
      console.warn('[InvestigationContext] No current case - cannot save monitoring session');
      throw new Error('No case selected');
    }
    try {
      console.log('[InvestigationContext] Saving monitoring session:', session.targetName, 'to case:', currentCase.id);
      const { error } = await supabase
        .from('monitoring_sessions')
        .upsert({
          case_id: currentCase.id,
          target_name: session.targetName,
          created_by: session.profileData?.userId || null,
          search_type: session.searchType,
          activities: session.activities,
          profile_data: session.profileData,
          started_at: session.startedAt,
          ended_at: session.endedAt,
          new_activity_count: session.newActivityCount,
          word_cloud_data: session.wordCloudData,
        });
      
      if (error) {
        console.error('[InvestigationContext] Save monitoring session error:', error);
        throw error;
      }
      
      emitCaseDataUpdated(currentCase.id, 'monitoringSessions');
      console.log('[InvestigationContext] Monitoring session saved successfully');
    } catch (err: any) {
      console.error('[InvestigationContext] Failed to save monitoring session:', err);
      throw err;
    }
  }, [currentCase, emitCaseDataUpdated]);

  const addKeywordAnalysis = (analysis: KeywordAnalysisData) => {
    setKeywordAnalyses(prev => {
      const existing = prev.findIndex(a => a.keyword === analysis.keyword);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...analysis, analyzedAt: new Date().toISOString() };
        return updated;
      }
      return [...prev, { ...analysis, analyzedAt: new Date().toISOString() }];
    });
  };

  const saveKeywordAnalysisToDb = useCallback(async (analysis: KeywordAnalysisData) => {
    if (!currentCase?.id) return;
    try {
      const { error } = await supabase
        .from('analysis_results')
        .insert({
          case_id: currentCase.id,
          analysis_type: 'keyword',
          target: analysis.keyword,
          result_data: analysis,
          sentiment_data: analysis.sentimentChartData,
        });
      
      if (error) {
        console.error('[InvestigationContext] Save keyword analysis error:', error);
        throw error;
      }
      
      emitCaseDataUpdated(currentCase.id, 'keywordAnalyses');
    } catch (error) {
      console.error('[InvestigationContext] Failed to save keyword analysis:', error);
      throw error;
    }
  }, [currentCase, emitCaseDataUpdated]);

  const addCommunityAnalysis = (analysis: CommunityAnalysisData) => {
    setCommunityAnalyses(prev => {
      const existing = prev.findIndex(a => a.name === analysis.name);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...analysis, analyzedAt: new Date().toISOString() };
        return updated;
      }
      return [...prev, { ...analysis, analyzedAt: new Date().toISOString() }];
    });
  };

  const saveCommunityAnalysisToDb = useCallback(async (analysis: CommunityAnalysisData) => {
    if (!currentCase?.id) return;
    try {
      const { error } = await supabase
        .from('analysis_results')
        .insert({
          case_id: currentCase.id,
          analysis_type: 'community',
          target: analysis.name,
          result_data: analysis,
          sentiment_data: analysis.sentimentChartData,
        });
      
      if (error) {
        console.error('[InvestigationContext] Save community analysis error:', error);
        throw error;
      }
      
      emitCaseDataUpdated(currentCase.id, 'communityAnalyses');
    } catch (error) {
      console.error('[InvestigationContext] Failed to save community analysis:', error);
      throw error;
    }
  }, [currentCase, emitCaseDataUpdated]);

  const addLinkAnalysis = (analysis: LinkAnalysisData) => {
    setLinkAnalyses(prev => {
      const existing = prev.findIndex(a => a.primaryUser === analysis.primaryUser);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...analysis, analyzedAt: new Date().toISOString() };
        return updated;
      }
      return [...prev, { ...analysis, analyzedAt: new Date().toISOString() }];
    });
  };

  const saveLinkAnalysisToDb = useCallback(async (analysis: LinkAnalysisData) => {
    if (!currentCase?.id) return;
    try {
      const { error } = await supabase
        .from('analysis_results')
        .insert({
          case_id: currentCase.id,
          analysis_type: 'link',
          target: analysis.primaryUser,
          result_data: analysis,
        });
      
      if (error) {
        console.error('[InvestigationContext] Save link analysis error:', error);
        throw error;
      }
      
      emitCaseDataUpdated(currentCase.id, 'linkAnalyses');
    } catch (error) {
      console.error('[InvestigationContext] Failed to save link analysis:', error);
      throw error;
    }
  }, [currentCase, emitCaseDataUpdated]);

  const clearUserProfiles = () => setUserProfiles([]);
  const clearMonitoringSessions = () => setMonitoringSessions([]);
  const clearKeywordAnalyses = () => setKeywordAnalyses([]);
  const clearCommunityAnalyses = () => setCommunityAnalyses([]);
  const clearLinkAnalyses = () => setLinkAnalyses([]);

  const getTotalUsersAnalyzed = () => {
    const users = new Set([
      ...userProfiles.map(p => p.username),
      ...linkAnalyses.map(l => l.primaryUser),
      ...monitoringSessions.filter(m => m.searchType === 'user').map(m => m.targetName)
    ]);
    return users.size;
  };

  const getTotalPostsReviewed = () => {
    let count = 0;
    keywordAnalyses.forEach(k => count += k.recentPosts?.length || 0);
    communityAnalyses.forEach(c => count += c.recentPosts?.length || 0);
    monitoringSessions.forEach(m => count += m.activities?.filter(a => a.type === 'post').length || 0);
    return count;
  };

  const getTotalCommunitiesAnalyzed = () => {
    const communities = new Set([
      ...communityAnalyses.map(c => c.name),
      ...monitoringSessions.filter(m => m.searchType === 'community').map(m => m.targetName)
    ]);
    return communities.size;
  };

  const clearAllData = () => {
    setCurrentCase(null);
    setUserProfiles([]);
    setMonitoringSessions([]);
    setKeywordAnalyses([]);
    setCommunityAnalyses([]);
    setLinkAnalyses([]);
  };

  return (
    <InvestigationContext.Provider value={{
      currentCase,
      setCurrentCase,
      cases,
      loadCases,
      createCase,
      isLoadingCases,
      caseNumber,
      setCaseNumber,
      investigator,
      setInvestigator,
      userProfiles,
      addUserProfile,
      saveUserProfileToDb,
      clearUserProfiles,
      monitoringSessions,
      addMonitoringSession,
      saveMonitoringSessionToDb,
      clearMonitoringSessions,
      keywordAnalyses,
      addKeywordAnalysis,
      saveKeywordAnalysisToDb,
      clearKeywordAnalyses,
      communityAnalyses,
      addCommunityAnalysis,
      saveCommunityAnalysisToDb,
      clearCommunityAnalyses,
      linkAnalyses,
      addLinkAnalysis,
      saveLinkAnalysisToDb,
      clearLinkAnalyses,
      getTotalUsersAnalyzed,
      getTotalPostsReviewed,
      getTotalCommunitiesAnalyzed,
      loadCaseData,
      clearAllData,
      callDataStore,
      saveRedditContentToDb,
    }}>
      {children}
    </InvestigationContext.Provider>
  );
};

export const useInvestigation = () => {
  const context = useContext(InvestigationContext);
  if (!context) {
    throw new Error('useInvestigation must be used within an InvestigationProvider');
  }
  return context;
};
