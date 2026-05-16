import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrentTimePakistan, formatActivityTime } from '@/lib/dateUtils';
import { useToast } from '@/hooks/use-toast';
import { useInvestigation } from '@/contexts/InvestigationContext';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface RedditActivity {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body?: string;
  subreddit: string;
  timestamp: string;
  created_utc: number;
  url: string;
  author?: string;
}

export interface ProfileData {
  username?: string;
  accountAge?: string;
  totalKarma?: number;
  activeSubreddits?: number;
  communityName?: string;
  memberCount?: string;
  description?: string;
  createdDate?: string;
  weeklyVisitors?: number;
  weeklyContributors?: number;
  bannerImg?: string;
  iconImg?: string;
  isPrivateProfile?: boolean;
  dataSource?: string;
}

export interface MonitoringTarget {
  id: string;
  name: string;
  type: 'user' | 'community';
  profileData: ProfileData;
  activities: RedditActivity[];
  wordCloudData: any[];
  isMonitoring: boolean;
  isFetching: boolean;
  lastFetchTime: string;
  newActivityCount: number;
  startedAt: string;
}

export const MAX_TARGETS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────
const STOP_WORDS = ['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'what', 'when', 'where'];

// Decode HTML entities in URLs (&amp; -> &)
const decodeUrl = (url: string | undefined): string => {
  if (!url) return '';
  return url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
};

const generateWordCloudWithCategories = (words: { word: string; frequency: number }[]) => {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => b.frequency - a.frequency);
  const total = sorted.length;
  const highThreshold = Math.ceil(total / 3);
  const mediumThreshold = Math.ceil((total * 2) / 3);
  return sorted.map((w, index) => {
    let category: 'high' | 'medium' | 'low';
    if (index < highThreshold) category = 'high';
    else if (index < mediumThreshold) category = 'medium';
    else category = 'low';
    return { ...w, category };
  });
};

const buildActivities = (posts: any[], comments: any[]): RedditActivity[] => {
  const acts: RedditActivity[] = [];
  (posts || []).forEach((post: any) => {
    acts.push({
      id: post.id || Math.random().toString(),
      type: 'post',
      title: post.title || '(no title)',
      body: post.selftext || post.body || post.content || '',
      subreddit: `r/${post.subreddit || 'unknown'}`,
      timestamp: formatActivityTime(post.created_utc),
      created_utc: post.created_utc || 0,
      url: post.permalink ? `https://reddit.com${post.permalink}` : (post.url || '#'),
      author: post.author,
    });
  });
  (comments || []).forEach((comment: any) => {
    const body = comment.body || comment.selftext || '';
    const commentUrl = comment.permalink
      ? `https://reddit.com${comment.permalink}`
      : comment.context
        ? `https://reddit.com${comment.context}`
        : comment.link_permalink
          ? `https://reddit.com${comment.link_permalink}`
          : '#';
    acts.push({
      id: comment.id || Math.random().toString(),
      type: 'comment',
      title: comment.link_title || (body.substring(0, 100) + (body.length > 100 ? '...' : '')),
      body,
      subreddit: `r/${comment.subreddit || 'unknown'}`,
      timestamp: formatActivityTime(comment.created_utc),
      created_utc: comment.created_utc || 0,
      url: commentUrl,
      author: comment.author,
    });
  });
  acts.sort((a, b) => b.created_utc - a.created_utc);
  return acts;
};

const buildWordCloud = (posts: any[], comments: any[]) => {
const textContent = [
  ...(posts || []).map((p: any) => `${p.title || ''} ${p.selftext || ''}`),
  ...(comments || []).map((c: any) => c.body || ''),
].join(' ');
  const words = textContent.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordFreq: Record<string, number> = {};
  words.forEach((word) => {
    if (!STOP_WORDS.includes(word)) wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  const sorted = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 60)
    .map(([word, freq]) => ({ word, frequency: freq }));
  return generateWordCloudWithCategories(sorted);
};

// ── Context ────────────────────────────────────────────────────────────────────
interface MonitoringContextType {
  targets: MonitoringTarget[];
  selectedTargetId: string | null;
  setSelectedTargetId: (id: string | null) => void;
  selectedTarget: MonitoringTarget | null;
  isSearching: boolean;
  loadingProgress: number;
  targetProgress: number;
  handleSearch: (query: string, type: 'user' | 'community') => Promise<void>;
  handleStopTarget: (targetId: string) => Promise<void>;
  handleRestartTarget: (targetId: string) => void;
  handleRemoveTarget: (targetId: string) => void;
  loadSavedSession: (sessionId: string) => Promise<void>;
}

const MonitoringContext = createContext<MonitoringContextType | undefined>(undefined);

export const MonitoringProvider = ({ children }: { children: ReactNode }) => {
  const { currentCase, saveRedditContentToDb, addMonitoringSession, saveMonitoringSessionToDb } = useInvestigation();
  const { toast } = useToast();

  const [targets, setTargets] = useState<MonitoringTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const intervalsRef = useRef<Map<string, number>>(new Map());

  const selectedTarget = targets.find((t) => t.id === selectedTargetId) || null;

  const updateTarget = useCallback((id: string, updates: Partial<MonitoringTarget>) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  // ── Start interval for a target ───────────────────────────────────────────
  const startInterval = useCallback(
    (targetId: string, cleanQuery: string, searchType: 'user' | 'community') => {
      const existing = intervalsRef.current.get(targetId);
      if (existing) clearInterval(existing);

      const intervalId = window.setInterval(async () => {
        try {
          const { data: rd, error: re } = await supabase.functions.invoke('reddit-scraper', {
            body: {
              username: searchType === 'user' ? cleanQuery : undefined,
              subreddit: searchType === 'community' ? cleanQuery : undefined,
              type: searchType,
            },
          });
          if (re || !rd) return;

          const acts = buildActivities(rd.posts, rd.comments);
          const wc = buildWordCloud(rd.posts, rd.comments);

          // Save monitoring activities to database
          try {
            await saveRedditContentToDb(rd.posts || [], rd.comments || [], 'monitoring');
            console.log(`Monitoring: Saved Reddit content for ${cleanQuery}`);
          } catch (error: any) {
            console.error('Monitoring: Failed to save Reddit content:', error);
            // Don't block monitoring, just log the error
          }

          setTargets((prev) =>
            prev.map((t) => {
              if (t.id !== targetId) return t;
              const existingIds = new Set(t.activities.map((a) => a.id));
              const newItems = acts.filter((a) => !existingIds.has(a.id));
              return {
                ...t,
                activities: acts,
                wordCloudData: wc,
                newActivityCount: t.newActivityCount + newItems.length,
                lastFetchTime: formatCurrentTimePakistan(),
                isFetching: false,
              };
            })
          );
        } catch (err) {
          console.error('Interval fetch error:', err);
        }
      }, 15000);

      intervalsRef.current.set(targetId, intervalId);
    },
    []
  );

  // ── Search & add target ───────────────────────────────────────────────────
  const handleSearch = useCallback(
    async (query: string, searchType: 'user' | 'community') => {
      if (!query.trim()) return;

      const activeCount = targets.filter((t) => t.isMonitoring).length;
      if (activeCount >= MAX_TARGETS) {
        toast({
          title: 'Maximum Active Targets Reached',
          description: `You can have up to ${MAX_TARGETS} active monitors. Stop one to add another.`,
          variant: 'destructive',
        });
        return;
      }
      // Evict oldest stopped if all slots full
      if (targets.length >= MAX_TARGETS) {
        const oldestStopped = targets.find((t) => !t.isMonitoring);
        if (oldestStopped) {
          setTargets((prev) => prev.filter((t) => t.id !== oldestStopped.id));
        } else {
          toast({
            title: 'Maximum Targets Reached',
            description: `Stop one to add another.`,
            variant: 'destructive',
          });
          return;
        }
      }

      const cleanQuery = searchType === 'user' ? query.replace(/^u\//, '') : query.replace(/^r\//, '');
      const displayName = searchType === 'user' ? `u/${cleanQuery}` : `r/${cleanQuery}`;

      if (targets.some((t) => t.name.toLowerCase() === displayName.toLowerCase())) {
        toast({ title: 'Already Monitoring', description: `${displayName} is already being monitored.`, variant: 'destructive' });
        return;
      }

      setIsSearching(true);
      setLoadingProgress(0);
      setTargetProgress(0);

      try {
        setTargetProgress(40);
        const { data: redditData, error: redditError } = await supabase.functions.invoke('reddit-scraper', {
          body: {
            username: searchType === 'user' ? cleanQuery : undefined,
            subreddit: searchType === 'community' ? cleanQuery : undefined,
            type: searchType,
          },
        });

        if (redditError) throw redditError;

        if (redditData?.error === 'not_found') {
          toast({
            title: `${searchType === 'user' ? 'User' : 'Community'} Not Found`,
            description: redditData.message,
            variant: 'destructive',
          });
          setTargetProgress(0);
          return;
        }
        setTargetProgress(80);

        let profileData: ProfileData;

        if (searchType === 'user') {
          const user = redditData.user;
          const accountCreated = new Date(user.created_utc * 1000);
          const now = new Date();
          const ageInYears = (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24 * 365);
          const years = Math.floor(ageInYears);
          const months = Math.floor((ageInYears - years) * 12);
          const subreddits = new Set([
            ...(redditData.posts || []).map((p: any) => p.subreddit),
            ...(redditData.comments || []).map((c: any) => c.subreddit),
          ]);
          // Extract icon from multiple possible Reddit API locations
          const rawIconImg = user.subreddit?.icon_img 
            || user.subreddit?.community_icon
            || user.snoovatar_img 
            || user.icon_img 
            || '';
          // Decode HTML entities (&amp; -> &) in the URL
          const iconImg = decodeUrl(rawIconImg);
          profileData = {
            username: displayName,
            accountAge: `${years} years, ${months} months`,
            totalKarma: user.link_karma + user.comment_karma,
            activeSubreddits: subreddits.size,
            iconImg,
            isPrivateProfile: redditData.isPrivateProfile || false,
            dataSource: redditData.dataSource || 'oauth',
          };
        } else {
          const sub = redditData.subreddit;
          const createdDate = new Date(sub.created_utc * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
          const oneWeekAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
          const weeklyPosts = (redditData.posts || []).filter((p: any) => p.created_utc >= oneWeekAgo);
          const uniqueAuthors = new Set(weeklyPosts.map((p: any) => p.author));
          const rawBannerImg = sub.banner_img || sub.banner_background_image || sub.mobile_banner_image || '';
          const rawCommunityIcon = sub.icon_img || sub.community_icon || sub.header_img || '';
          profileData = {
            communityName: displayName,
            memberCount: sub.subscribers / 1000000 >= 1 ? `${(sub.subscribers / 1000000).toFixed(1)}M` : `${(sub.subscribers / 1000).toFixed(1)}K`,
            description: sub.public_description || sub.description || 'No description available',
            createdDate,
            weeklyVisitors: redditData.weeklyVisitors || 0,
            weeklyContributors: uniqueAuthors.size,
            bannerImg: decodeUrl(rawBannerImg),
            iconImg: decodeUrl(rawCommunityIcon),
          };
        }

        const initialActivities = buildActivities(redditData.posts, redditData.comments);
        const wordCloudData = buildWordCloud(redditData.posts, redditData.comments);

        // Save initial monitoring activities to database
        try {
          await saveRedditContentToDb(redditData.posts || [], redditData.comments || [], 'monitoring');
          console.log(`Monitoring: Saved initial Reddit content for ${cleanQuery}`);
        } catch (error: any) {
          console.error('Monitoring: Failed to save initial Reddit content:', error);
          // Don't block monitoring, just log the error
        }

        const targetId = crypto.randomUUID();
        const newTarget: MonitoringTarget = {
          id: targetId,
          name: displayName,
          type: searchType,
          profileData,
          activities: initialActivities,
          wordCloudData,
          isMonitoring: true,
          isFetching: false,
          lastFetchTime: formatCurrentTimePakistan(),
          newActivityCount: 0,
          startedAt: new Date().toISOString(),
        };

        setTargets((prev) => [...prev, newTarget]);
        setSelectedTargetId(targetId);
        setTargetProgress(100);

        startInterval(targetId, cleanQuery, searchType);

        toast({ title: 'Monitoring Started', description: `Now monitoring ${displayName}. Live scraping every 15 seconds.` });
      } catch (error: any) {
        console.error('Error searching Reddit:', error);
        setTargetProgress(0);
        toast({ title: 'Search Failed', description: error.message || 'Failed to search.', variant: 'destructive' });
      } finally {
        setIsSearching(false);
      }
    },
    [targets, toast, startInterval]
  );

  // ── Stop target ───────────────────────────────────────────────────────────
  const handleStopTarget = useCallback(
    async (targetId: string) => {
      console.log('[handleStopTarget] Stopping target:', targetId);
      const target = targets.find((t) => t.id === targetId);
      if (!target) {
        console.log('[handleStopTarget] Target not found');
        return;
      }

      let savedToDb = false;
      let saveError = '';

      console.log('[handleStopTarget] Target found:', target.name, 'currentCase:', currentCase?.id);

      if (target.profileData && target.type) {
        const sessionData = {
          searchType: target.type,
          targetName: target.profileData.username || target.profileData.communityName || target.name,
          profileData: target.profileData,
          activities: target.activities,
          wordCloudData: target.wordCloudData,
          startedAt: target.startedAt,
          newActivityCount: target.newActivityCount,
        };

        console.log('[handleStopTarget] Session data prepared:', sessionData.targetName);
        addMonitoringSession(sessionData);

        if (currentCase?.id) {
          console.log('[handleStopTarget] Saving to DB for case:', currentCase.id);
          try {
            await saveMonitoringSessionToDb(sessionData);
            console.log('[handleStopTarget] Successfully saved to DB');
            savedToDb = true;
          } catch (dbErr: any) {
            console.error('[handleStopTarget] Failed to save session to database:', dbErr);
            saveError = dbErr?.message || 'Database error';
          }
        } else {
          console.log('[handleStopTarget] No current case, skipping DB save');
        }
      } else {
        console.log('[handleStopTarget] No profileData or type, skipping save');
      }

      const intervalId = intervalsRef.current.get(targetId);
      if (intervalId) {
        clearInterval(intervalId);
        intervalsRef.current.delete(targetId);
      }

      updateTarget(targetId, { isMonitoring: false, isFetching: false });

      if (savedToDb) {
        toast({ title: 'Monitoring Stopped & Saved', description: `${target.name} monitoring stopped. Session saved to case.` });
      } else if (saveError) {
        toast({
          title: 'Monitoring Stopped',
          description: `${target.name} monitoring stopped, but failed to save to database: ${saveError}. Data is available in this session only.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Monitoring Stopped', description: `${target.name} monitoring stopped. ${currentCase?.id ? 'Session saved locally.' : 'No case selected - data not persisted.'}` });
      }
    },
    [targets, addMonitoringSession, saveMonitoringSessionToDb, currentCase, updateTarget, toast]
  );

  // ── Restart stopped target ─────────────────────────────────────────────
  const handleRestartTarget = useCallback(
    (targetId: string) => {
      const target = targets.find((t) => t.id === targetId);
      if (!target || target.isMonitoring) return;

      const activeCount = targets.filter((t) => t.isMonitoring).length;
      if (activeCount >= MAX_TARGETS) {
        toast({
          title: 'Maximum Active Targets Reached',
          description: `Stop one to restart another.`,
          variant: 'destructive',
        });
        return;
      }

      updateTarget(targetId, { isMonitoring: true, isFetching: false, newActivityCount: 0 });
      const cleanQuery = target.type === 'user' ? target.name.replace(/^u\//, '') : target.name.replace(/^r\//, '');
      startInterval(targetId, cleanQuery, target.type);
      toast({ title: 'Monitoring Restarted', description: `${target.name} is live again.` });
    },
    [targets, toast, updateTarget, startInterval]
  );

  // ── Remove (dismiss) ─────────────────────────────────────────────────────
  const handleRemoveTarget = useCallback(
    (targetId: string) => {
      setTargets((prev) => prev.filter((t) => t.id !== targetId));
      if (selectedTargetId === targetId) setSelectedTargetId(null);
    },
    [selectedTargetId]
  );

  // ── Load saved session ────────────────────────────────────────────────────
  const loadSavedSession = useCallback(
    async (sessionId: string) => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('monitoring_sessions')
          .select('*, profile_data')
          .eq('id', sessionId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Session not found');

        const loadedProfile = data.profile_data as ProfileData | null;
        
                        
        // Build profile based on search type - only set the appropriate fields
        const baseProfile: ProfileData = loadedProfile || {};
        let parsedProfile: ProfileData;
        
        if (data.search_type === 'user') {
          // User session: only set username, NOT communityName
          parsedProfile = {
            ...baseProfile,
            username: baseProfile.username || data.target_name,
            iconImg: decodeUrl(baseProfile.iconImg),
            accountAge: baseProfile.accountAge || 'N/A',
            totalKarma: baseProfile.totalKarma || 0,
            activeSubreddits: baseProfile.activeSubreddits || 0,
            // Explicitly NOT setting communityName for users
          };
        } else {
          // Community session: only set communityName, NOT username
          parsedProfile = {
            ...baseProfile,
            communityName: baseProfile.communityName || data.target_name,
            iconImg: decodeUrl(baseProfile.iconImg),
            bannerImg: decodeUrl(baseProfile.bannerImg),
            memberCount: baseProfile.memberCount || 'N/A',
            description: baseProfile.description || 'No description available',
            createdDate: baseProfile.createdDate || 'N/A',
            weeklyVisitors: baseProfile.weeklyVisitors || 0,
            weeklyContributors: baseProfile.weeklyContributors || 0,
            // Explicitly NOT setting username for communities
          };
        }

        if (!parsedProfile) return;

        const targetId = crypto.randomUUID();
        // Format activities to ensure consistent subreddit display with "r/" prefix
        const formattedActivities = Array.isArray(data.activities) 
          ? (data.activities as unknown as RedditActivity[]).map(activity => ({
              ...activity,
              subreddit: activity.subreddit.startsWith('r/') ? activity.subreddit : `r/${activity.subreddit}`
            }))
          : [];

        const newTarget: MonitoringTarget = {
          id: targetId,
          name: data.target_name || '',
          type: (data.search_type as 'user' | 'community') || 'user',
          profileData: parsedProfile,
          activities: formattedActivities,
          wordCloudData: Array.isArray(data.word_cloud_data) ? (data.word_cloud_data as any) : [],
          isMonitoring: false,
          isFetching: false,
          lastFetchTime: '',
          newActivityCount: data.new_activity_count || 0,
          startedAt: data.started_at || '',
        };

        setTargets((prev) => [...prev, newTarget]);
        setSelectedTargetId(targetId);
        toast({ title: 'Loaded past session', description: `Showing saved results for ${data.target_name}` });
      } catch (e: any) {
        toast({ title: 'Failed to load session', description: e?.message || 'Could not load saved session', variant: 'destructive' });
      } finally {
        setIsSearching(false);
      }
    },
    [toast]
  );

  // ── Auto-load saved sessions from DB on case change ────────────────────────
  const loadedCaseRef = useRef<string | null>(null);
  const isLoadingRef = useRef<boolean>(false);

  useEffect(() => {
    const caseId = currentCase?.id;
    console.log('[AutoLoad] Effect triggered. caseId:', caseId, 'loadedCaseRef:', loadedCaseRef.current, 'isLoading:', isLoadingRef.current);

    if (!caseId) {
      // Reset on logout / case cleared so re-login triggers a fresh load
      console.log('[AutoLoad] No caseId, resetting');
      loadedCaseRef.current = null;
      setTargets([]);
      return;
    }
    // Prevent duplicate loads for the same case while already loading
    if (loadedCaseRef.current === caseId || isLoadingRef.current) {
      console.log('[AutoLoad] Skipping load - already loaded or loading');
      return;
    }

    const loadAllSaved = async () => {
      console.log('[AutoLoad] Starting load for case:', caseId);
      isLoadingRef.current = true;
      try {
        // Clear previous targets when switching to a different case
        setTargets([]);

        console.log('[AutoLoad] Querying monitoring_sessions for case_id:', caseId);
        const { data, error } = await supabase
          .from('monitoring_sessions')
          .select('*, profile_data')
          .eq('case_id', caseId)
          .order('ended_at', { ascending: false })
          .limit(MAX_TARGETS);

        console.log('[AutoLoad] Query result - data:', data?.length, 'error:', error);

        if (error) {
          console.error('[AutoLoad] Error loading monitoring sessions:', error);
          loadedCaseRef.current = null; // Allow retry on error
          return;
        }

        // Mark this case as loaded only after successful fetch
        loadedCaseRef.current = caseId;

        if (!data || data.length === 0) {
          console.log('[AutoLoad] No saved sessions found for this case');
          // No saved sessions - this is a valid state, keep the ref set
          return;
        }

        console.log('[AutoLoad] Found', data.length, 'sessions, processing...');

        // Deduplicate by target_name, keeping only the latest (already sorted by ended_at desc)
        const seen = new Set<string>();
        const uniqueSessions = data.filter(session => {
          const key = session.target_name?.toLowerCase() || '';
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, MAX_TARGETS);

        // Build new targets array fresh (not using functional update to avoid stale data)
        const newTargets: MonitoringTarget[] = uniqueSessions
          .map(session => {
            const loadedProfile = session.profile_data as ProfileData | null;
            
            // Build profile based on search type - only set the appropriate fields
            const baseProfile: ProfileData = loadedProfile || {};
            let parsedProfile: ProfileData;
            
            if (session.search_type === 'user') {
              // User session: only set username, NOT communityName
              parsedProfile = {
                ...baseProfile,
                username: baseProfile.username || session.target_name,
                iconImg: decodeUrl(baseProfile.iconImg),
                accountAge: baseProfile.accountAge || 'N/A',
                totalKarma: baseProfile.totalKarma || 0,
                activeSubreddits: baseProfile.activeSubreddits || 0,
                // Explicitly NOT setting communityName for users
              };
            } else {
              // Community session: only set communityName, NOT username
              parsedProfile = {
                ...baseProfile,
                communityName: baseProfile.communityName || session.target_name,
                iconImg: decodeUrl(baseProfile.iconImg),
                bannerImg: decodeUrl(baseProfile.bannerImg),
                memberCount: baseProfile.memberCount || 'N/A',
                description: baseProfile.description || 'No description available',
                createdDate: baseProfile.createdDate || 'N/A',
                weeklyVisitors: baseProfile.weeklyVisitors || 0,
                weeklyContributors: baseProfile.weeklyContributors || 0,
                // Explicitly NOT setting username for communities
              };
            }

            // Format activities to ensure consistent subreddit display with "r/" prefix
            const formattedActivities = Array.isArray(session.activities) 
              ? (session.activities as unknown as RedditActivity[]).map(activity => ({
                  ...activity,
                  subreddit: activity.subreddit.startsWith('r/') ? activity.subreddit : `r/${activity.subreddit}`
                }))
              : [];

            return {
              id: crypto.randomUUID(),
              name: session.target_name || '',
              type: (session.search_type as 'user' | 'community') || 'user',
              profileData: parsedProfile,
              activities: formattedActivities,
              wordCloudData: Array.isArray(session.word_cloud_data) ? (session.word_cloud_data as any) : [],
              isMonitoring: false,
              isFetching: false,
              lastFetchTime: '',
              newActivityCount: session.new_activity_count || 0,
              startedAt: session.started_at || '',
            };
          });

        setTargets(newTargets);
        
        // Don't auto-select targets on page load - let user choose
        // This prevents showing previous profile on refresh
      } catch (err) {
        console.error('Failed to auto-load monitoring sessions:', err);
        loadedCaseRef.current = null; // Allow retry on error
      } finally {
        isLoadingRef.current = false;
      }
    };

    loadAllSaved();
  }, [currentCase?.id]);

  return (
    <MonitoringContext.Provider
      value={{
        targets,
        selectedTargetId,
        setSelectedTargetId,
        selectedTarget,
        isSearching,
        loadingProgress,
        targetProgress,
        handleSearch,
        handleStopTarget,
        handleRestartTarget,
        handleRemoveTarget,
        loadSavedSession,
      }}
    >
      {children}
    </MonitoringContext.Provider>
  );
};

export const useMonitoring = () => {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error('useMonitoring must be used within a MonitoringProvider');
  }
  return context;
};
