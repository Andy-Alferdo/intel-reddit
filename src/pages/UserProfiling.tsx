import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { analyzeDeep, analyzeWithHuggingFace, analyzeWithTimeout } from '@/integrations/huggingface/client';
import { extractLocationsFromContent, filterHfLocations, mergeLocations } from '@/utils/locationExtractor';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronDown, MessageSquare, Search, User, Zap, X, ArrowLeft,
  Calendar, ThumbsUp, Activity, MapPin, Info, MessageCircle, ExternalLink,
  Clock, AlertCircle, Trash2, TrendingUp, Hash, BarChart3,
  Brain, Target, Globe, Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, Treemap, Legend
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toZonedTime, format } from 'date-fns-tz';
import { useInvestigation } from '@/contexts/InvestigationContext';
import { useTheme } from '@/contexts/ThemeContext';

const INITIAL_VISIBLE = 10;

// Helpers
const formatRelativeTime = (utc?: number) => {
  if (!utc) return '';
  const diff = (Date.now() / 1000) - utc;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
};

// Format timestamp to display: Apr 18, 2026 / 08:42 PM PKT / 03:42 PM UTC
const formatTimestamp = (utc?: number): string => {
  if (!utc) return '';
  const date = new Date(utc * 1000);
  const dateStr = format(date, 'MMM d, yyyy');
  const pktTime = format(toZonedTime(date, 'Asia/Karachi'), 'hh:mm a');
  const utcTime = format(toZonedTime(date, 'UTC'), 'hh:mm a');
  return `${dateStr} | ${pktTime} PKT | ${utcTime} UTC`;
};

const sentimentTone = (s?: string) => {
  if (s === 'positive') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'negative') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-muted text-muted-foreground border-border';
};

const SENT_COLORS = { positive: '#10b981', neutral: '#94a3b8', negative: '#ef4444' };

// Color palette for Treemap
const TREEMAP_COLORS = [
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
];

// XAI Deep Analysis Component — matches keyword analysis design
const XAIDeepAnalysis = ({
  sentiment,
  explanation,
  contributions = [],
  isExpanded,
  onToggleExpand,
  isAnalyzing
}: {
  sentiment: 'positive' | 'negative' | 'neutral';
  explanation?: string;
  contributions?: any[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  isAnalyzing?: boolean;
}) => {
  const filterTokens = (tokens: any[]) => {
    const stopWords = new Set(['is', 'in', 'the', 'a', 'an', 'we', 'this', 'that', 'has', 'are', 'was', 'were', 'been', 'have', 'had', 'do', 'does', 'did', 'but', 'or', 'and', 'for', 'to', 'of', 'with', 'by', 'at', 'on']);
    return tokens
      .filter(token => {
        const score = Math.abs(token.contribution || token.score || token.weight || token.value || 0);
        return !stopWords.has(token.word?.toLowerCase()) || score > 0.005;
      })
      .map(token => {
        const score = token.contribution || token.score || token.weight || token.value || 0;
        if (Math.abs(score) > 0.15) {
          return { ...token, contribution: Math.sign(score) * 0.15, original_score: score };
        }
        return { ...token, contribution: score, original_score: score };
      })
      .sort((a, b) => Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0));
  };

  const getSentimentColor = (sent: string) => {
    switch (sent?.toLowerCase()) {
      case 'positive': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'negative': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getBarColor = (contribution: number) => {
    if (contribution > 0) return 'bg-green-500';
    if (contribution < 0) return 'bg-red-500';
    return 'bg-slate-500';
  };

  const getPullDirection = (contribution: number) => {
    if (contribution > 0) return 'pull positive';
    if (contribution < 0) return 'pull negative';
    return 'neutral';
  };

  const getPullColor = (contribution: number) => {
    if (contribution > 0) return 'text-green-400';
    if (contribution < 0) return 'text-red-400';
    return 'text-slate-500';
  };

  const filteredTokens = filterTokens(contributions);
  const topTokens = filteredTokens.slice(0, 5);
  const displaySentiment = sentiment || 'neutral';
  const maxContribution = topTokens.length > 0
    ? Math.max(...topTokens.map(t => Math.abs(t.contribution || 0)))
    : 1;

  if (isAnalyzing) {
    return (
      <div className="bg-card/50 border border-border rounded-lg overflow-hidden mt-2">
        <div className="px-3 py-3 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Analyzing with AI...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card/50 border border-border rounded-lg overflow-hidden mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs font-semibold text-foreground">Sentiment analysis</div>
      </div>

      {/* Content */}
      <div className="px-3 py-3 space-y-3">
        {/* Sentiment Badge */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${getSentimentColor(displaySentiment)}`}>
            {displaySentiment.charAt(0).toUpperCase() + displaySentiment.slice(1)}
          </span>
        </div>

        {/* WORD SIGNALS */}
        {topTokens.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">WORD SIGNALS</div>
            <div className="space-y-2">
              {topTokens.map((token, i) => {
                const score = token.contribution || 0;
                const barWidth = maxContribution > 0 ? (Math.abs(score) / maxContribution) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground w-16 truncate">{token.word}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getBarColor(score)}`}
                        style={{ width: `${Math.min(100, barWidth)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] ${getPullColor(score)}`}>
                      {getPullDirection(score)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          This analysis identifies key words that influence the sentiment prediction.
        </p>

        {/* Toggle Button */}
        <Button
          size="sm"
          variant="outline"
          className="h-5 px-2 text-[10px] border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          {isExpanded ? (
            <><Eye className="h-2.5 w-2.5 mr-1" /> Hide Details</>
          ) : (
            <><Brain className="h-2.5 w-2.5 mr-1" /> Show Details</>
          )}
        </Button>
      </div>
    </div>
  );
};

// Custom Treemap component for Top Communities
const CommunitiesTreemap = ({ data }: { data: any[] }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-xs text-slate-400 text-center">No community data</p>
      </div>
    );
  }

  // Transform data for Treemap and sort by count (largest first)
  const treemapData = data
    .sort((a, b) => b.count - a.count)
    .map((item, index) => {
      const displayName = item.name.startsWith('r/') ? item.name : `r/${item.name}`;
      return {
        name: displayName,
        size: item.count,
        fill: TREEMAP_COLORS[index % TREEMAP_COLORS.length]
      };
    });

  // Custom content renderer for Treemap
  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, name, size, fill } = props;

    // Hide labels if block is too small - lowered thresholds to show all community names
    const showLabel = width > 25 && height > 20;
    const showCount = width > 35 && height > 30;

    // Calculate font sizes based on block size
    const nameFontSize = Math.max(8, Math.min(14, width / 8));
    const countFontSize = Math.max(7, Math.min(11, width / 10));

    // Handle click to open Reddit URL
    const handleRectClick = () => {
      const cleanName = name.replace(/^r\//, '');
      window.open(`https://www.reddit.com/r/${cleanName}`, '_blank');
    };

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          stroke="#fff"
          strokeWidth={2}
          rx={4}
          className="transition-all duration-300 hover:brightness-110 hover:stroke-white hover:stroke-[3px]"
          style={{ cursor: 'pointer' }}
          onClick={handleRectClick}
        />
        {showLabel && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - (showCount ? 8 : 0)}
              fill="white"
              fontSize={nameFontSize}
              fontWeight={400}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none"
              style={{ fontWeight: 400 }}
            >
              {name}
            </text>
            {showCount && (
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 8}
                  fill="rgba(255,255,255,0.8)"
                  fontSize={countFontSize}
                  fontWeight={400}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none"
                  style={{ fontWeight: 400 }}
                >
                  {size} posts
                </text>
            )}
          </>
        )}
      </g>
    );
  };

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={[{ children: treemapData }]}
          dataKey="size"
          aspectRatio={4 / 3}
          stroke="#fff"
          content={<CustomTreemapContent />}
          animationBegin={0}
          animationDuration={800}
          animationEasing="ease-in-out"
        >
          <RTooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-card px-3 py-2 rounded-lg shadow-lg border border-border text-sm">
                    <div className="font-semibold text-foreground">{data.name}</div>
                    <div className="text-muted-foreground">{data.size} posts</div>
                  </div>
                );
              }
              return null;
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
};

const UserProfiling = () => {
  const { theme } = useTheme();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [profileData, setProfileData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [visiblePosts, setVisiblePosts] = useState(INITIAL_VISIBLE);
  const [visibleComments, setVisibleComments] = useState(INITIAL_VISIBLE);
  const [isAnalyzingMorePosts, setIsAnalyzingMorePosts] = useState(false);
  const [isAnalyzingMoreComments, setIsAnalyzingMoreComments] = useState(false);
  const [postsSort, setPostsSort] = useState<'all' | 'recent' | 'top'>('all');
  const [commentsSort, setCommentsSort] = useState<'all' | 'recent' | 'top'>('all');
  const [sentimentFilter, setSentimentFilter] = useState<'positive' | 'negative' | 'neutral' | null>(null);
  const [postSentimentFilter, setPostSentimentFilter] = useState<'positive' | 'negative' | 'neutral' | null>(null);
  const [commentSentimentFilter, setCommentSentimentFilter] = useState<'positive' | 'negative' | 'neutral' | null>(null);
  const { toast } = useToast();
  const { addUserProfile, saveUserProfileToDb, saveRedditContentToDb, currentCase } = useInvestigation();
  const [savedProfiles, setSavedProfiles] = useState<any[]>([]);
  const [detectedLocations, setDetectedLocations] = useState<string[]>([]);

  const [previewItem, setPreviewItem] = useState<any | null>(null);

  // Per-item deep analysis state
  const [deepAnalysisStates, setDeepAnalysisStates] = useState<Map<string, { isAnalyzing: boolean; result: any; showDeep: boolean; analysisType?: 'lime' | 'shap' }>>(new Map());
  const [xaiPanelOpen, setXaiPanelOpen] = useState<Set<string>>(new Set());

  const handleDeepAnalysis = async (text: string, itemKey: string) => {
    // Update state for this specific item
    setDeepAnalysisStates(prev => new Map(prev.set(itemKey, {
      isAnalyzing: true,
      result: null,
      showDeep: false,
      analysisType: 'lime'
    })));

    try {
      const hfResult = await analyzeDeep(text);

      // Map hfResult to the expected format
      const result = {
        deep_explanation: {
          word_contributions: hfResult.word_importance.map((w: any) => ({
            word: w.word,
            contribution: w.importance
          }))
        },
        confidence: hfResult.confidence
      };

      // Update state with result
      setDeepAnalysisStates(prev => new Map(prev.set(itemKey, {
        isAnalyzing: false,
        result,
        showDeep: true,
        analysisType: 'lime'
      })));

      toast({
        title: "Deep Analysis Complete",
        description: "Advanced Deep Analysis analysis has been performed on this text.",
      });
    } catch (error) {
      console.error('Deep analysis error:', error);

      // Reset state for this item on error
      setDeepAnalysisStates(prev => {
        const newMap = new Map(prev);
        newMap.delete(itemKey);
        return newMap;
      });

      toast({
        title: "Deep Analysis Failed",
        description: "Could not perform deep analysis. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleDeepAnalysis = useCallback((itemKey: string) => {
    setDeepAnalysisStates(prev => {
      const current = prev.get(itemKey);
      if (current) {
        return new Map(prev.set(itemKey, {
          ...current,
          showDeep: !current.showDeep
        }));
      }
      return prev;
    });
  }, []);

  // Fetch saved profiles for current case (or all recent if no case)
  const fetchSavedProfiles = useCallback(async () => {
    try {
      let data, error;

      if (currentCase?.id) {
        // Filter by case_id if a case is selected
        const result = await supabase
          .from('user_profiles_analyzed')
          .select('id, username, total_karma, account_age, analyzed_at')
          .eq('case_id', currentCase.id)
          .order('analyzed_at', { ascending: false })
          .limit(20);
        data = result.data;
        error = result.error;
      } else {
        // Get all recent profiles if no case selected
        const result = await supabase
          .from('user_profiles_analyzed')
          .select('id, username, total_karma, account_age, analyzed_at')
          .order('analyzed_at', { ascending: false })
          .limit(20);
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('Error fetching profiles:', error);
      }

      // Fetch avatars for each profile
      if (data) {
        const profilesWithAvatars = await Promise.all(
          data.map(async (profile) => {
            let avatarUrl = null;
            try {
              const redditResponse = await fetch(`https://www.reddit.com/user/${profile.username}/about.json`);
              if (redditResponse.ok) {
                const redditData = await redditResponse.json();
                avatarUrl = redditData.data?.icon_img
                  || redditData.data?.subreddit?.icon_img
                  || redditData.data?.snoovatar_img
                  || null;
                if (avatarUrl) {
                  avatarUrl = avatarUrl.replace(/&amp;/g, '&');
                }
              }
            } catch (e) {
              // Silently fail if we can't fetch avatar
            }
            return { ...profile, avatar: avatarUrl };
          })
        );
        setSavedProfiles(profilesWithAvatars);
      } else {
        setSavedProfiles([]);
      }
    } catch (e) {
      console.error('Exception fetching profiles:', e);
    }
  }, [currentCase?.id]);

  useEffect(() => { fetchSavedProfiles(); }, [fetchSavedProfiles]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.caseId === currentCase?.id && detail?.kind === 'userProfiles') fetchSavedProfiles();
    };
    window.addEventListener('case-data-updated', handler);
    return () => window.removeEventListener('case-data-updated', handler);
  }, [currentCase?.id, fetchSavedProfiles]);

  const loadSavedProfile = async (profileId: string) => {
    setIsLoading(true);
    setError(null);
    setVisiblePosts(INITIAL_VISIBLE);
    setVisibleComments(INITIAL_VISIBLE);
    try {
      const { data, error: err } = await supabase
        .from('user_profiles_analyzed')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();
      if (err) throw err;
      if (!data) throw new Error('Profile not found');

      console.log('Loading saved profile data:', data);

      setUsername(data.username || '');
      const postSentiments = (data.post_sentiments as any[]) || [];
      const commentSentiments = (data.comment_sentiments as any[]) || [];

      // Try to fetch fresh avatar from Reddit API
      let avatarUrl = null;
      try {
        const redditResponse = await fetch(`https://www.reddit.com/user/${data.username}/about.json`);
        if (redditResponse.ok) {
          const redditData = await redditResponse.json();
          avatarUrl = redditData.data?.icon_img
            || redditData.data?.subreddit?.icon_img
            || redditData.data?.snoovatar_img
            || null;
          if (avatarUrl) {
            avatarUrl = avatarUrl.replace(/&amp;/g, '&');
          }
        }
      } catch (e) {
        // Silently fail if we can't fetch avatar
      }

      // Calculate sentiment analysis from post and comment sentiments if not in database
      const calculateSentimentAnalysis = (posts: any[], comments: any[]) => {
        const allSentiments = [...posts, ...comments];
        const positive = allSentiments.filter(s => s.sentiment === 'positive').length;
        const negative = allSentiments.filter(s => s.sentiment === 'negative').length;
        const neutral = allSentiments.filter(s => s.sentiment === 'neutral').length;
        const total = allSentiments.length;

        if (total === 0) return { positive: 33, neutral: 34, negative: 33 };

        return {
          positive: Math.round((positive / total) * 100),
          neutral: Math.round((neutral / total) * 100),
          negative: Math.round((negative / total) * 100)
        };
      };

      // Calculate sentiment breakdowns for posts and comments
      const calculateSentimentBreakdown = (items: any[]) => {
        const positive = items.filter(s => s.sentiment === 'positive').length;
        const negative = items.filter(s => s.sentiment === 'negative').length;
        const neutral = items.filter(s => s.sentiment === 'neutral').length;
        const total = items.length;

        if (total === 0) return { positive: 33, neutral: 34, negative: 33 };

        return {
          positive: Math.round((positive / total) * 100),
          neutral: Math.round((neutral / total) * 100),
          negative: Math.round((negative / total) * 100)
        };
      };

      // Generate monthly activity from saved posts and comments
      const generateMonthlyActivity = (posts: any[], comments: any[]) => {
        const monthMap = new Map<string, { posts: number; comments: number }>();

        // Process posts
        posts.forEach(post => {
          if (post.created_utc) {
            const date = new Date(post.created_utc * 1000);
            const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const existing = monthMap.get(monthKey) || { posts: 0, comments: 0 };
            existing.posts++;
            monthMap.set(monthKey, existing);
          }
        });

        // Process comments
        comments.forEach(comment => {
          if (comment.created_utc) {
            const date = new Date(comment.created_utc * 1000);
            const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const existing = monthMap.get(monthKey) || { posts: 0, comments: 0 };
            existing.comments++;
            monthMap.set(monthKey, existing);
          }
        });

        // Convert to sorted array (most recent first)
        const monthlyActivity = Array.from(monthMap.entries())
          .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
          .slice(-12) // Last 12 months
          .map(([name, counts]) => ({ name, posts: counts.posts, comments: counts.comments }));

        return monthlyActivity;
      };

      const profileDataToSet = {
        username: data.username || 'Unknown',
        avatar: avatarUrl,
        postsCount: (data as any).posts_count || postSentiments.length || 0,
        commentsCount: (data as any).comments_count || commentSentiments.length || 0,
        accountAge: data.account_age || 'Unknown',
        totalKarma: data.total_karma || 0,
        postKarma: data.post_karma || 0,
        commentKarma: data.comment_karma || 0,
        activeSubreddits: (data.active_subreddits as any[]) || [],
        activityPattern: (data.activity_pattern as any) || { mostActiveHour: 'N/A', mostActiveDay: 'N/A', timezone: 'PKT' },
        sentimentAnalysis: (data.sentiment_analysis as any) || calculateSentimentAnalysis(postSentiments, commentSentiments),
        postSentiments: postSentiments || [],
        commentSentiments: commentSentiments || [],
        postSentimentBreakdown: (data as any).post_sentiment_breakdown || calculateSentimentBreakdown(postSentiments),
        commentSentimentBreakdown: (data as any).comment_sentiment_breakdown || calculateSentimentBreakdown(commentSentiments),
        locationIndicators: (data.location_indicators as any[]) || [],
        behaviorPatterns: (data.behavior_patterns as any[]) || [],
        wordCloud: (data.word_cloud as any[]) || [],
        monthlyActivity: (data as any).monthly_activity || generateMonthlyActivity(postSentiments, commentSentiments),
        isPrivateProfile: (data as any).is_private_profile || false,
        dataSource: (data as any).data_source || 'oauth',
      };

      console.log('Setting profile data:', profileDataToSet);
      setProfileData(profileDataToSet);
    } catch (e: any) {
      setError(e?.message || 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSavedProfile = async (profileId: string) => {
    try {
      const { error: err } = await supabase
        .from('user_profiles_analyzed')
        .delete()
        .eq('id', profileId);
      if (err) throw err;
      setSavedProfiles(prev => prev.filter(p => p.id !== profileId));
      toast({ title: 'Profile removed', description: 'Saved profile has been deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Could not delete profile', variant: 'destructive' });
    }
  };

  useEffect(() => {
    const prefillUsername = (location.state as any)?.prefillUsername as string | undefined;
    if (prefillUsername) {
      setUsername(prefillUsername);

      // Check if profile already exists
      const existingProfile = savedProfiles.find(p =>
        p.username.toLowerCase() === prefillUsername.toLowerCase()
      );

      if (existingProfile) {
        // User already analyzed - show message and load existing profile
        toast({
          title: "Profile already analyzed",
          description: `u/${prefillUsername} has already been analyzed. Showing existing profile.`,
        });

        // Load the existing profile
        setTimeout(() => {
          loadSavedProfile(existingProfile.id);
        }, 100);
      } else {
        // User not analyzed - trigger new analysis
        setTimeout(() => {
          const searchBtn = document.querySelector<HTMLButtonElement>('[data-profiling-search]');
          searchBtn?.click();
        }, 100);
      }
    }
  }, [location.state, savedProfiles]);

  // Load saved profile when navigating from Dashboard
  useEffect(() => {
    const loadProfileId = (location.state as any)?.loadProfileId as string | undefined;
    if (!loadProfileId) return;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setVisiblePosts(INITIAL_VISIBLE);
      setVisibleComments(INITIAL_VISIBLE);
      try {
        const { data, error } = await supabase
          .from('user_profiles_analyzed')
          .select('*')
          .eq('id', loadProfileId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Profile not found');

        if (cancelled) return;

        setUsername(data.username || '');
        const postSentiments = (data.post_sentiments as any[]) || [];
        const commentSentiments = (data.comment_sentiments as any[]) || [];
        setProfileData({
          username: data.username,
          avatar: (data as any).avatar,
          postsCount: (data as any).posts_count || postSentiments.length,
          commentsCount: (data as any).comments_count || commentSentiments.length,
          accountAge: data.account_age,
          totalKarma: data.total_karma,
          postKarma: data.post_karma,
          commentKarma: data.comment_karma,
          activeSubreddits: (data.active_subreddits as any[]) || [],
          activityPattern: (data.activity_pattern as any) || {},
          sentimentAnalysis: (data.sentiment_analysis as any) || {},
          postSentiments: postSentiments,
          commentSentiments: commentSentiments,
          locationIndicators: (data.location_indicators as any[]) || [],
          behaviorPatterns: (data.behavior_patterns as any[]) || [],
          wordCloud: (data.word_cloud as any[]) || [],
          monthlyActivity: (data as any).monthly_activity || [],
          isPrivateProfile: (data as any).is_private_profile || false,
          dataSource: (data as any).data_source || 'oauth',
        });

        toast({
          title: 'Loaded saved profile',
          description: `Showing saved results for u/${data.username}`,
        });
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: 'Failed to load profile',
            description: e?.message || 'Could not load saved profile',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.state, toast]);

  // Sample data for visualizations
  const userWordCloud = [
    { word: "technology", frequency: 89, category: "high" as const },
    { word: "programming", frequency: 76, category: "high" as const },
    { word: "javascript", frequency: 65, category: "medium" as const },
    { word: "react", frequency: 58, category: "medium" as const },
    { word: "coding", frequency: 45, category: "medium" as const },
    { word: "developer", frequency: 42, category: "low" as const },
    { word: "python", frequency: 38, category: "low" as const },
    { word: "software", frequency: 71, category: "high" as const },
  ];

  const activityTimelineData = [
    { name: 'Mon', value: 23 },
    { name: 'Tue', value: 45 },
    { name: 'Wed', value: 38 },
    { name: 'Thu', value: 52 },
    { name: 'Fri', value: 67 },
    { name: 'Sat', value: 34 },
    { name: 'Sun', value: 28 },
  ];

  const sentimentChartData = [
    { name: 'Positive', value: 45 },
    { name: 'Neutral', value: 35 },
    { name: 'Negative', value: 20 },
  ];

  const subredditActivityData = [
    { name: 'r/technology', value: 156 },
    { name: 'r/programming', value: 89 },
    { name: 'r/science', value: 67 },
    { name: 'r/worldnews', value: 45 },
  ];

  const handleAnalyzeUser = async () => {
    if (!username.trim()) return;

    // Clean username (remove u/ prefix if present)
    const cleanUsername = username.replace(/^u\//, '');

    // Check if profile already exists
    const existingProfile = savedProfiles.find(p =>
      p.username.toLowerCase() === cleanUsername.toLowerCase()
    );

    if (existingProfile) {
      // Profile already analyzed - show message and load it
      toast({
        title: "Profile Already Analyzed",
        description: `Profile for u/${cleanUsername} was already analyzed. Loading existing analysis...`,
        action: (
          <Button
            size="sm"
            onClick={() => loadSavedProfile(existingProfile.id)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            View Profile
          </Button>
        ),
      });

      // Load the existing profile
      loadSavedProfile(existingProfile.id);
      return;
    }

    setIsLoading(true);
    setError(null);
    setProfileData(null);
    setDetectedLocations([]);
    setVisiblePosts(INITIAL_VISIBLE);
    setVisibleComments(INITIAL_VISIBLE);
    setLoadingProgress(0);
    setTargetProgress(0);

    try {
      const perfStart = performance.now();
      console.log(`[Perf] Starting analysis for user: ${cleanUsername}`);
      setTargetProgress(30);

      // Fetch user data from Reddit
      const { data: redditData, error: redditError } = await supabase.functions.invoke('reddit-scraper', {
        body: {
          username: cleanUsername,
          type: 'user'
        }
      });

      if (redditError) throw redditError;

      if (redditData?.error === 'not_found') {
        setError(redditData.message);
        toast({
          title: "User Not Found",
          description: redditData.message,
          variant: "destructive",
        });
        setIsLoading(false);
        setTargetProgress(0);
        return;
      }

      const perfReddit = performance.now();
      console.log(`[Perf] Reddit data fetched successfully in ${(perfReddit - perfStart).toFixed(2)}ms`);
      setTargetProgress(60);

      // ── Local Location Extraction (instant, runs on ALL data) ──────────
      const localLocations = extractLocationsFromContent(
        redditData.posts || [],
        redditData.comments || []
      );
      console.log(`[Perf] Local location extraction found: ${localLocations.join(', ') || 'none'}`);
      setDetectedLocations(localLocations);

      // ── HF Sentiment Analysis (30-second timer batching) ──────────────
      let analysisData: any = null;
      let initialVisiblePosts = INITIAL_VISIBLE;
      let initialVisibleComments = INITIAL_VISIBLE;
      
      try {
        console.log(`[Perf] Starting HF sentiment analysis with 30s timer limit...`);
        const hfStart = performance.now();
        
        const timedResult = await analyzeWithTimeout(
          redditData.posts || [],
          redditData.comments || [],
          30000, // 30 seconds max
          // Progressive location callback — merge HF locations into state as they arrive
          (hfLocations) => {
            const filtered = filterHfLocations(hfLocations);
            setDetectedLocations(prev => {
              const merged = mergeLocations(prev, filtered);
              return merged.length !== prev.length ? merged : prev;
            });
          }
        );
        
        // Final merge: local + all filtered HF locations
        const finalHfLocations = filterHfLocations(timedResult.locations || []);
        const mergedLocations = mergeLocations(localLocations, finalHfLocations);
        setDetectedLocations(mergedLocations);

        analysisData = {
          postSentiments: timedResult.postSentiments,
          commentSentiments: timedResult.commentSentiments,
          locations: mergedLocations
        };
        
        initialVisiblePosts = Math.max(INITIAL_VISIBLE, timedResult.lastPostIdx);
        initialVisibleComments = Math.max(INITIAL_VISIBLE, timedResult.lastCommentIdx);
        
        const hfEnd = performance.now();
        console.log(`[Perf] HF sentiment analysis completed in ${(hfEnd - hfStart).toFixed(2)}ms. Analyzed ${timedResult.lastPostIdx} posts and ${timedResult.lastCommentIdx} comments.`);
      } catch (analysisError) {
        console.error('[Perf] HF analysis error (continuing without sentiment):', analysisError);
        // Even if HF fails, we still have local locations
        analysisData = { locations: localLocations };
      }

      setTargetProgress(90);

      // Calculate account age
      const accountCreated = new Date(redditData.user.created_utc * 1000);
      const now = new Date();
      const ageInYears = (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24 * 365);
      const years = Math.floor(ageInYears);
      const months = Math.floor((ageInYears - years) * 12);
      const accountAge = `${years} years, ${months} months`;

      // Calculate activity patterns
      const allContent = [...(redditData.posts || []), ...(redditData.comments || [])];
      const hourCounts: { [key: number]: number } = {};
      const dayCounts: { [key: string]: number } = {};

      allContent.forEach((item: any) => {
        const date = new Date(item.created_utc * 1000);
        const pakistanDate = toZonedTime(date, 'Asia/Karachi');
        const hour = pakistanDate.getHours();
        const day = pakistanDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Karachi' });

        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });

      const mostActiveHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];
      const mostActiveDay = Object.entries(dayCounts).sort(([, a], [, b]) => b - a)[0];

      // Generate word cloud from content
      const textContent = [
        ...(redditData.posts || []).map((p: any) => `${p.title} ${p.selftext}`),
        ...(redditData.comments || []).map((c: any) => c.body)
      ].join(' ');

      const words = textContent.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const wordFreq: { [key: string]: number } = {};
      words.forEach(word => {
        if (!['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'what', 'when', 'where'].includes(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });

      const wordCloudData = Object.entries(wordFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 40)
        .map(([word, freq]) => ({
          word,
          frequency: freq,
          category: freq > 20 ? 'high' as const : freq > 8 ? 'medium' as const : 'low' as const
        }));

      // Store raw posts/comments with their timestamps for timeline
      const rawPosts = redditData.posts || [];
      const rawComments = redditData.comments || [];

      // Calculate monthly activity for timeline
      const monthlyActivity: { name: string; posts: number; comments: number }[] = [];
      const monthMap = new Map<string, { posts: number; comments: number }>();

      [...rawPosts, ...rawComments].forEach((item: any) => {
        const date = new Date(item.created_utc * 1000);
        const monthKey = format(date, 'MMM yyyy');
        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, { posts: 0, comments: 0 });
        }
        const entry = monthMap.get(monthKey)!;
        if (rawPosts.includes(item)) {
          entry.posts++;
        } else {
          entry.comments++;
        }
      });

      // Convert to sorted array (most recent first)
      Array.from(monthMap.entries())
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .slice(-12) // Last 12 months
        .forEach(([name, counts]) => {
          monthlyActivity.push({ name, posts: counts.posts, comments: counts.comments });
        });

      // Extract avatar from multiple possible sources
      const avatarUrl = redditData.user?.icon_img
        || redditData.user?.subreddit?.icon_img
        || redditData.user?.snoovatar_img
        || null;

      // Fix any URL encoding issues (Reddit sometimes returns escaped URLs)
      const cleanAvatarUrl = avatarUrl ? avatarUrl.replace(/&amp;/g, '&') : null;

      const profileResult = {
        username: cleanUsername,
        avatar: cleanAvatarUrl,
        postsCount: rawPosts.length,
        commentsCount: rawComments.length,
        accountAge,
        totalKarma: redditData.user.link_karma + redditData.user.comment_karma,
        postKarma: redditData.user.link_karma,
        commentKarma: redditData.user.comment_karma,
        activeSubreddits: (() => {
          // Compute top subreddits from raw posts/comments since HF doesn't return topSubreddits
          const subCounts: Record<string, number> = {};
          [...rawPosts, ...rawComments].forEach((item: any) => {
            if (item.subreddit) subCounts[item.subreddit] = (subCounts[item.subreddit] || 0) + 1;
          });
          return Object.entries(subCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([name, count]) => ({ name: `r/${name}`, count }));
        })(),
        activityPattern: {
          mostActiveHour: mostActiveHour ? `${mostActiveHour[0]}:00-${parseInt(mostActiveHour[0]) + 1}:00 PKT` : 'N/A',
          mostActiveDay: mostActiveDay?.[0] || 'N/A',
          timezone: 'PKT (Pakistan Standard Time)',
        },
        sentimentAnalysis: (() => {
          // Compute sentiment percentages from the HF sentimentBreakdown (decimal 0-1)
          const bd = analysisData?.sentimentBreakdown;
          if (bd) {
            return {
              positive: Math.round((bd.positive || 0) * 100),
              neutral: Math.round((bd.neutral || 0) * 100),
              negative: Math.round((bd.negative || 0) * 100),
            };
          }
          return { positive: 33, neutral: 34, negative: 33 };
        })(),
        postSentiments: (redditData.posts || []).map((p: any, i: number) => {
          const s = analysisData?.postSentiments?.[i] || { sentiment: 'neutral' };
          return {
            ...s,
            body: p.selftext || '',
            permalink: p.permalink || null,
            score: p.score || 0,
            created_utc: p.created_utc || 0,
            num_comments: p.num_comments || 0,
            subreddit: p.subreddit || '',
            title: p.title || '',
            _isAnalyzed: !!analysisData?.postSentiments?.[i]
          };
        }),
        commentSentiments: (redditData.comments || []).map((c: any, i: number) => {
          const s = analysisData?.commentSentiments?.[i] || { sentiment: 'neutral' };
          return {
            ...s,
            body: c.body || '',
            text: c.body || '',
            permalink: c.permalink || c.context || c.link_permalink || null,
            link_title: c.link_title || null,
            created_utc: c.created_utc,
            subreddit: c.subreddit,
            score: c.score ?? s.score ?? 0,
            _isAnalyzed: !!analysisData?.commentSentiments?.[i]
          };
        }),
        postSentimentBreakdown: (() => {
          const posts = analysisData?.postSentiments || [];
          if (posts.length === 0) return null;
          const pos = posts.filter((s: any) => s.sentiment === 'positive').length;
          const neg = posts.filter((s: any) => s.sentiment === 'negative').length;
          const neu = posts.filter((s: any) => s.sentiment === 'neutral').length;
          const total = posts.length;
          return { positive: Math.round((pos/total)*100), neutral: Math.round((neu/total)*100), negative: Math.round((neg/total)*100) };
        })(),
        commentSentimentBreakdown: (() => {
          const comments = analysisData?.commentSentiments || [];
          if (comments.length === 0) return null;
          const pos = comments.filter((s: any) => s.sentiment === 'positive').length;
          const neg = comments.filter((s: any) => s.sentiment === 'negative').length;
          const neu = comments.filter((s: any) => s.sentiment === 'neutral').length;
          const total = comments.length;
          return { positive: Math.round((pos/total)*100), neutral: Math.round((neu/total)*100), negative: Math.round((neg/total)*100) };
        })(),
        locationIndicators: (analysisData?.locations?.length > 0) ? analysisData.locations : ['No specific locations detected'],
        behaviorPatterns: (() => {
          // Derive topic interests from subreddit activity
          const subCounts: Record<string, number> = {};
          [...rawPosts, ...rawComments].forEach((item: any) => {
            if (item.subreddit) subCounts[item.subreddit] = (subCounts[item.subreddit] || 0) + 1;
          });
          const tops = Object.entries(subCounts).sort(([,a],[,b]) => (b as number) - (a as number)).slice(0, 5);
          return tops.length > 0 ? tops.map(([sub]) => `Active in r/${sub}`) : ['No patterns detected'];
        })(),
        wordCloud: wordCloudData,
        stats: {},
        emotions: {},
        monthlyActivity,
        isPrivateProfile: redditData.isPrivateProfile || false,
        dataSource: redditData.dataSource || 'oauth',
      };

      const perfMapping = performance.now();
      console.log(`[Perf] Data mapping & local heuristics completed in ${(perfMapping - (perfReddit ?? performance.now())).toFixed(2)}ms`);

      setProfileData(profileResult);
      setVisiblePosts(initialVisiblePosts);
      setVisibleComments(initialVisibleComments);
      setTargetProgress(100);

      // Save to investigation context for report generation
      const profileToSave = {
        username: cleanUsername,
        avatar: profileResult.avatar,
        postsCount: profileResult.postsCount,
        commentsCount: profileResult.commentsCount,
        accountAge,
        totalKarma: profileResult.totalKarma,
        postKarma: profileResult.postKarma,
        commentKarma: profileResult.commentKarma,
        activeSubreddits: profileResult.activeSubreddits,
        activityPattern: profileResult.activityPattern,
        sentimentAnalysis: profileResult.sentimentAnalysis,
        postSentiments: profileResult.postSentiments,
        commentSentiments: profileResult.commentSentiments,
        locationIndicators: profileResult.locationIndicators,
        behaviorPatterns: profileResult.behaviorPatterns,
        wordCloud: profileResult.wordCloud,
        monthlyActivity: profileResult.monthlyActivity,
        isPrivateProfile: profileResult.isPrivateProfile,
        dataSource: profileResult.dataSource,
      };

      addUserProfile(profileToSave);

      // Also save to database if there's an active case
      if (currentCase?.id) {
        try {
          // Check if profile already exists in database
          const { data: existingProfile } = await supabase
            .from('user_profiles_analyzed')
            .select('id')
            .eq('case_id', currentCase.id)
            .eq('username', cleanUsername)
            .maybeSingle();

          if (existingProfile) {
            // Update existing profile
            const { error: updateError } = await supabase
              .from('user_profiles_analyzed')
              .update({
                username: cleanUsername,
                comment_karma: profileResult.commentKarma,
                post_karma: profileResult.postKarma,
                total_karma: profileResult.totalKarma,
                account_age: profileResult.accountAge,
                active_subreddits: profileResult.activeSubreddits,
                activity_pattern: profileResult.activityPattern,
                sentiment_analysis: profileResult.sentimentAnalysis,
                post_sentiments: profileResult.postSentiments,
                comment_sentiments: profileResult.commentSentiments,
                location_indicators: profileResult.locationIndicators,
                behavior_patterns: profileResult.behaviorPatterns,
                word_cloud: profileResult.wordCloud,
                analyzed_at: new Date().toISOString(),
              })
              .eq('id', existingProfile.id);

            if (updateError) throw updateError;
            console.log('Updated existing profile in database');
          } else {
            // Create new profile
            await saveUserProfileToDb(profileToSave);
            console.log('Created new profile in database');
          }

          // Also save individual posts and comments to database
          // Save posts and comments to database using shared saver
          try {
            const result = await saveRedditContentToDb(
              redditData.posts || [],
              redditData.comments || [],
              'user_profile'
            );
            console.log(`User Profiling: Saved ${result.totalInserted} Reddit items to database`);
          } catch (error: any) {
            console.error('User Profiling: Failed to save Reddit content:', error);
            // Don't block the UI, just log the error
          }

          // Refresh saved profiles list to show updated data
          fetchSavedProfiles();
        } catch (dbErr) {
          console.error('Failed to save profile to database:', dbErr);
        }
      }

      toast({
        title: "Analysis Complete",
        description: `Successfully analyzed profile for u/${cleanUsername}`,
      });
      
      const perfDb = performance.now();
      console.log(`[Perf] Database save & context update completed in ${(perfDb - perfMapping).toFixed(2)}ms`);
      console.log(`[Perf] TOTAL ANALYSIS TIME: ${(perfDb - perfStart).toFixed(2)}ms`);

    } catch (err: any) {
      console.error('Error analyzing user:', err);
      setError(err.message || 'Failed to analyze user profile');
      setTargetProgress(0);
      toast({
        title: "Analysis Failed",
        description: err.message || 'Failed to analyze user profile. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      // Don't reset progress here - let it stay at 100% if successful, or 0 if error
    }
  };

  // Derived intelligence metrics
  const intel = useMemo(() => {
    if (!profileData) return null;
    const sa = profileData.sentimentAnalysis || {};
    const negPct = sa.negative ?? 0;
    const posPct = sa.positive ?? 0;
    // Risk: based on negative sentiment %
    let risk: 'Low' | 'Medium' | 'High' = 'Low';
    if (negPct > 40) risk = 'High'; else if (negPct > 20) risk = 'Medium';
    // Influence: karma + activity (clamped)
    const k = profileData.totalKarma || 0;
    const act = (profileData.postsCount || 0) + (profileData.commentsCount || 0);
    const influence = Math.min(100, Math.round(Math.log10(Math.max(k, 1)) * 18 + Math.min(act, 100) * 0.4));
    return { risk, influence, negPct, posPct };
  }, [profileData]);

  // Base sorted/limited items for graphs (NOT filtered by sentiment)
  const baseSortedPosts = useMemo(() => {
    let arr = [...(profileData?.postSentiments || [])];
    if (postsSort === 'top') {
      arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return arr.slice(0, 20);
    } else if (postsSort === 'recent') {
      arr.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0));
      return arr.slice(0, 20);
    }
    return arr;
  }, [profileData?.postSentiments, postsSort]);

  const baseSortedComments = useMemo(() => {
    let arr = [...(profileData?.commentSentiments || [])];
    if (commentsSort === 'top') {
      arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return arr.slice(0, 20);
    } else if (commentsSort === 'recent') {
      arr.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0));
      return arr.slice(0, 20);
    }
    return arr;
  }, [profileData?.commentSentiments, commentsSort]);

  // Dynamic sentiment breakdown for graphs
  const dynamicPostSentimentBreakdown = useMemo(() => {
    if (!baseSortedPosts.length) return { positive: 0, neutral: 0, negative: 0 };
    const pos = baseSortedPosts.filter(s => s.sentiment === 'positive').length;
    const neg = baseSortedPosts.filter(s => s.sentiment === 'negative').length;
    const neu = baseSortedPosts.filter(s => s.sentiment === 'neutral').length;
    const total = baseSortedPosts.length;
    return {
      positive: Math.round((pos/total)*100),
      neutral: Math.round((neu/total)*100),
      negative: Math.round((neg/total)*100)
    };
  }, [baseSortedPosts]);

  const dynamicCommentSentimentBreakdown = useMemo(() => {
    if (!baseSortedComments.length) return { positive: 0, neutral: 0, negative: 0 };
    const pos = baseSortedComments.filter(s => s.sentiment === 'positive').length;
    const neg = baseSortedComments.filter(s => s.sentiment === 'negative').length;
    const neu = baseSortedComments.filter(s => s.sentiment === 'neutral').length;
    const total = baseSortedComments.length;
    return {
      positive: Math.round((pos/total)*100),
      neutral: Math.round((neu/total)*100),
      negative: Math.round((neg/total)*100)
    };
  }, [baseSortedComments]);

  // Final sorted/filtered feeds for display - now filtering first, then sorting, then slicing
  const sortedPosts = useMemo(() => {
    let arr = [...(profileData?.postSentiments || [])];
    if (postSentimentFilter) {
      arr = arr.filter(item => item.sentiment === postSentimentFilter);
    }
    if (postsSort === 'top') {
      arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (postsSort === 'recent') {
      arr.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0));
    }
    return arr.slice(0, 20); // Keep top 20 of the filtered results
  }, [profileData?.postSentiments, postSentimentFilter, postsSort]);

  const sortedComments = useMemo(() => {
    let arr = [...(profileData?.commentSentiments || [])];
    if (commentSentimentFilter) {
      arr = arr.filter(item => item.sentiment === commentSentimentFilter);
    }
    if (commentsSort === 'top') {
      arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (commentsSort === 'recent') {
      arr.sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0));
    }
    return arr.slice(0, 20); // Keep top 20 of the filtered results
  }, [profileData?.commentSentiments, commentSentimentFilter, commentsSort]);

  const renderSentimentRow = (item: any, itemKey: string, isPost: boolean) => {
    const deepState = deepAnalysisStates.get(itemKey);

    // Get contributions from deep analysis or basic analysis
    const getContributions = () => {
      if (deepState?.showDeep && deepState.result) {
        return (deepState.analysisType === 'shap'
          ? deepState.result.shap_explanation?.word_contributions
          : deepState.result.deep_explanation?.word_contributions) || [];
      }
      return (item.word_contributions || []) || [];
    };

    // Get correct sentiment label based on highest probability
    const getCorrectSentiment = () => {
      // Check sentiment probabilities first
      if (item.sentiment_probabilities) {
        const probs = item.sentiment_probabilities;
        let maxProb = 0;
        let maxClass = item.sentiment; // fallback to current sentiment

        Object.entries(probs).forEach(([sentiment, prob]) => {
          if (typeof prob === 'number' && prob > maxProb) {
            maxProb = prob;
            maxClass = sentiment;
          }
        });

        return maxClass;
      }

      // Check class probabilities
      if (item.class_probabilities) {
        const probs = item.class_probabilities;
        let maxProb = 0;
        let maxClass = item.sentiment; // fallback

        Object.entries(probs).forEach(([sentiment, prob]) => {
          if (typeof prob === 'number' && prob > maxProb) {
            maxProb = prob;
            maxClass = sentiment;
          }
        });

        return maxClass;
      }

      // Check predict_proba array
      if (item.predict_proba && Array.isArray(item.predict_proba) && item.classes) {
        const probs = item.predict_proba;
        const classes = item.classes;
        let maxProb = 0;
        let maxClass = item.sentiment; // fallback

        probs.forEach((prob, index) => {
          if (typeof prob === 'number' && prob > maxProb && classes[index]) {
            maxProb = prob;
            maxClass = classes[index];
          }
        });

        return maxClass;
      }

      // Return current sentiment as fallback
      return item.sentiment;
    };

    // Get confidence score - ensure it's always between 0 and 1
    const getConfidence = () => {
      let confidence = null;

      // Try to get confidence from deep analysis result
      if (deepState?.result) {
        confidence = deepState.result.confidence ||
          deepState.result.sentiment_confidence ||
          deepState.result.probability ||
          deepState.result.max_probability;
      }

      // Try to get confidence from item itself
      if (confidence === null && item.confidence !== undefined && item.confidence !== null) {
        confidence = item.confidence;
      }

      // Try to get from sentiment probabilities (use max probability)
      if (confidence === null && item.sentiment_probabilities) {
        const probs = Object.values(item.sentiment_probabilities).filter(p => typeof p === 'number') as number[];
        if (probs.length > 0) {
          confidence = Math.max(...probs);
        }
      }

      // Try to get from predict_proba output
      if (confidence === null && item.predict_proba && Array.isArray(item.predict_proba)) {
        const probs = item.predict_proba.filter(p => typeof p === 'number') as number[];
        if (probs.length > 0) {
          confidence = Math.max(...probs);
        }
      }

      // Try to get from class probabilities
      if (confidence === null && item.class_probabilities) {
        const probs = Object.values(item.class_probabilities).filter(p => typeof p === 'number') as number[];
        if (probs.length > 0) {
          confidence = Math.max(...probs);
        }
      }

      // Validate and normalize confidence
      if (confidence !== null && confidence !== undefined) {
        // Ensure confidence is between 0 and 1
        confidence = Math.max(0, Math.min(1, confidence));
        return confidence;
      }

      return null; // Return null if no valid confidence found
    };

    const handleToggleExpand = () => {
      if (deepState?.showDeep) {
        toggleDeepAnalysis(itemKey);
      } else {
        handleDeepAnalysis(item.text, itemKey);
      }
    };

    const handleShowOriginal = () => {
      if (deepState?.showDeep) {
        toggleDeepAnalysis(itemKey);
      }
    };

    // Debug validation - verify card data before rendering
    const debugValidateCard = () => {
      const confidence = getConfidence();
      const correctSentiment = getCorrectSentiment();
      const contributions = getContributions();

      // Validate confidence
      if (confidence !== null && (confidence < 0 || confidence > 1)) {
        console.warn('Invalid confidence detected:', confidence, 'for item:', itemKey);
      }

      // Validate sentiment consistency
      if (correctSentiment !== item.sentiment) {
        console.log('Sentiment correction applied:', item.sentiment, '->', correctSentiment, 'for item:', itemKey);
      }

      // Validate contributions
      contributions.forEach((token, index) => {
        const score = token.contribution || token.score || token.weight || token.value || 0;
        if (Math.abs(score) > 0.15) {
          console.log('Large contribution value normalized:', token.word, score, '->', Math.sign(score) * 0.15);
        }
      });

      return { confidence, correctSentiment, contributions };
    };

    return (
      <div
        key={itemKey}
        className="group relative rounded-lg border border-border bg-card p-3 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
        onClick={() => setPreviewItem({ ...item, isPost })}
      >
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mt-0.5">
            {isPost ? <MessageSquare className="h-3.5 w-3.5 text-orange-600" /> : <MessageCircle className="h-3.5 w-3.5 text-orange-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                <span className="font-medium text-foreground truncate">u/{profileData.username}</span>
                {item.subreddit && <span className="text-slate-400">in r/{item.subreddit}</span>}
              </div>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sentimentTone(item.sentiment)}`}>
                {item.sentiment}
              </Badge>
            </div>
            <div className="text-[10px] text-slate-400 mb-1.5">
              {formatTimestamp(item.created_utc)}
            </div>
            {!isPost && item.link_title && (
              <p className="text-xs text-slate-500 line-clamp-1 mb-1">{item.link_title}</p>
            )}
            {isPost && item.title ? (
              <p className="text-sm text-foreground line-clamp-2 mb-1.5 group-hover:text-blue-400 transition-colors font-medium">
                {item.title}
              </p>
            ) : (
              <p className="text-sm text-foreground line-clamp-2 mb-1.5 group-hover:text-blue-400 transition-colors">
                {item.text || item.body || (isPost ? '(no text)' : '(comment unavailable)')}
              </p>
            )}
            {isPost && item.body && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.body}</p>
            )}

            {/* XAI Deep Analysis Panel — only shows when toggled */}
            {(xaiPanelOpen.has(itemKey) || deepState?.showDeep) && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <XAIDeepAnalysis
                  sentiment={getCorrectSentiment()}
                  explanation={typeof item.explanation === 'string' ? item.explanation : item.explanation?.reasoning}
                  contributions={getContributions()}
                  isExpanded={deepState?.showDeep || false}
                  onToggleExpand={handleToggleExpand}
                  isAnalyzing={deepState?.isAnalyzing}
                />
              </div>
            )}

            {/* Action Bar — XAI button + voting + Open Reddit */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                {/* XAI Brain Button */}
                <Button
                  size="sm"
                  variant={xaiPanelOpen.has(itemKey) || deepState?.showDeep ? 'secondary' : 'ghost'}
                  className={`h-6 px-2 text-[10px] ${
                    xaiPanelOpen.has(itemKey) || deepState?.showDeep
                      ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const hasDeep = !!deepState?.result;
                    const isOpen = xaiPanelOpen.has(itemKey);
                    if (!hasDeep && !isOpen) {
                      // First click — request deep analysis + open panel
                      const text = item.text || item.body || '';
                      if (text.trim()) handleDeepAnalysis(text, itemKey);
                      setXaiPanelOpen(prev => new Set(prev).add(itemKey));
                    } else if (isOpen || deepState?.showDeep) {
                      // Close the panel
                      setXaiPanelOpen(prev => {
                        const next = new Set(prev);
                        next.delete(itemKey);
                        return next;
                      });
                      if (deepState?.showDeep) toggleDeepAnalysis(itemKey);
                    } else {
                      // Re-open the panel
                      setXaiPanelOpen(prev => new Set(prev).add(itemKey));
                      if (hasDeep && !deepState?.showDeep) toggleDeepAnalysis(itemKey);
                    }
                  }}
                  disabled={deepState?.isAnalyzing}
                >
                  {deepState?.isAnalyzing ? (
                    <><div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-1" /> Analyzing...</>
                  ) : (
                    <><Brain className="h-3 w-3 mr-1" /> {deepState?.result ? (deepState?.showDeep ? 'Hide' : 'XAI') : 'XAI'}</>
                  )}
                </Button>

                {/* Score */}
                <div className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5">
                  <svg className="w-3 h-3 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-8 8h16l-8-8z" />
                  </svg>
                  <span className="text-[10px] font-semibold text-foreground min-w-[1.2rem] text-center">
                    {item.score >= 1000 ? (item.score / 1000).toFixed(1) + 'K' : item.score || 0}
                  </span>
                  <svg className="w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 20l8-8H4l8 8z" />
                  </svg>
                </div>
              </div>

              {item.permalink && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-blue-400 hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`https://www.reddit.com${item.permalink}`, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open Reddit
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const sentimentPieData = (b: any) => {
    if (!b) return [];
    return [
      { name: 'Positive', value: b.positive || 0, color: SENT_COLORS.positive },
      { name: 'Neutral', value: b.neutral || 0, color: SENT_COLORS.neutral },
      { name: 'Negative', value: b.negative || 0, color: SENT_COLORS.negative },
    ].filter(item => item.value > 0);
  };

  const handleLoadMorePosts = async () => {
    const unanalyzedPosts = sortedPosts.filter((p: any) => !p._isAnalyzed);
    
    if (unanalyzedPosts.length > 0) {
      setIsAnalyzingMorePosts(true);
      try {
        const timedResult = await analyzeWithTimeout(
          unanalyzedPosts,
          [],
          30000 // 30 seconds timer
        );
        
        if (timedResult.lastPostIdx > 0) {
          setProfileData((prev: any) => {
            if (!prev) return prev;
            const newPostSentiments = [...prev.postSentiments];
            
            for (let i = 0; i < timedResult.lastPostIdx; i++) {
              const up = unanalyzedPosts[i];
              const hfResult = timedResult.postSentiments[i];
              if (hfResult) {
                const origIndex = newPostSentiments.findIndex(p => p.permalink === up.permalink && p.created_utc === up.created_utc);
                if (origIndex !== -1) {
                  newPostSentiments[origIndex] = { ...newPostSentiments[origIndex], ...hfResult, _isAnalyzed: true };
                }
              }
            }
            
            const pos = newPostSentiments.filter(s => s.sentiment === 'positive').length;
            const neg = newPostSentiments.filter(s => s.sentiment === 'negative').length;
            const neu = newPostSentiments.filter(s => s.sentiment === 'neutral').length;
            const total = newPostSentiments.length || 1;
            
            return {
              ...prev,
              postSentiments: newPostSentiments,
              postSentimentBreakdown: { 
                positive: Math.round((pos/total)*100), 
                neutral: Math.round((neu/total)*100), 
                negative: Math.round((neg/total)*100) 
              },
            };
          });
          
          setVisiblePosts(prev => prev + timedResult.lastPostIdx);
        } else {
          // If couldn't analyze any, just show 10 neutral ones
          setVisiblePosts(prev => prev + 10);
        }
      } catch (e) {
        console.error("Failed to analyze more posts:", e);
        setVisiblePosts(prev => prev + 10);
      } finally {
        setIsAnalyzingMorePosts(false);
      }
    } else {
      setVisiblePosts(prev => prev + 10);
    }
  };

  const handleLoadMoreComments = async () => {
    const unanalyzedComments = sortedComments.filter((c: any) => !c._isAnalyzed);
    
    if (unanalyzedComments.length > 0) {
      setIsAnalyzingMoreComments(true);
      try {
        const timedResult = await analyzeWithTimeout(
          [],
          unanalyzedComments,
          30000 // 30 seconds timer
        );
        
        if (timedResult.lastCommentIdx > 0) {
          setProfileData((prev: any) => {
            if (!prev) return prev;
            const newCommentSentiments = [...prev.commentSentiments];
            
            for (let i = 0; i < timedResult.lastCommentIdx; i++) {
              const uc = unanalyzedComments[i];
              const hfResult = timedResult.commentSentiments[i];
              if (hfResult) {
                const origIndex = newCommentSentiments.findIndex(c => c.permalink === uc.permalink && c.created_utc === uc.created_utc);
                if (origIndex !== -1) {
                  newCommentSentiments[origIndex] = { ...newCommentSentiments[origIndex], ...hfResult, _isAnalyzed: true };
                }
              }
            }
            
            const pos = newCommentSentiments.filter(s => s.sentiment === 'positive').length;
            const neg = newCommentSentiments.filter(s => s.sentiment === 'negative').length;
            const neu = newCommentSentiments.filter(s => s.sentiment === 'neutral').length;
            const total = newCommentSentiments.length || 1;
            
            return {
              ...prev,
              commentSentiments: newCommentSentiments,
              commentSentimentBreakdown: { 
                positive: Math.round((pos/total)*100), 
                neutral: Math.round((neu/total)*100), 
                negative: Math.round((neg/total)*100) 
              },
            };
          });
          
          setVisibleComments(prev => prev + timedResult.lastCommentIdx);
        } else {
          setVisibleComments(prev => prev + 10);
        }
      } catch (e) {
        console.error("Failed to analyze more comments:", e);
        setVisibleComments(prev => prev + 10);
      } finally {
        setIsAnalyzingMoreComments(false);
      }
    } else {
      setVisibleComments(prev => prev + 10);
    }
  };



  return (
    <TooltipProvider>
      <div className="p-6 space-y-5 relative bg-background min-h-screen">
        {isLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
            <div className="flex flex-col items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-8 py-6">
              <LoadingSpinner text="Analyzing user profile..." size="md" targetProgress={targetProgress} />
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">User Profiling</h2>
          <p className="text-muted-foreground">
            Open-Source Reddit User Intelligence, Profiling & Behavior Mapping
          </p>
        </div>

        {/* Search Bar */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Input
                  id="username"
                  placeholder="Enter Reddit username (e.g. spez or u/spez)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAnalyzeUser()}
                  className="pr-10 h-10 border-border"
                />
                {username && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setUsername('')}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Button
                onClick={handleAnalyzeUser}
                disabled={isLoading || !username.trim()}
                data-profiling-search
                className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Search className="h-4 w-4 mr-1.5" /> Analyze
              </Button>
            </div>
          </CardContent>
        </Card>

        {profileData && (
          <>
            <Button variant="ghost" size="sm" className="gap-2 text-slate-600" onClick={() => { setProfileData(null); setError(null); }}>
              <ArrowLeft className="h-4 w-4" /> Back to Overview
            </Button>

            {/* === PREMIUM PROFILE HEADER === */}
            <Card className="border-border shadow-sm overflow-hidden bg-card">
              <CardContent className="p-5">
                <div className="flex items-center gap-6">
                  {/* LEFT: Avatar + name */}
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full border-2 border-blue-100 shadow-sm overflow-hidden bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center">
                      {profileData.avatar ? (
                        <img
                          src={profileData.avatar}
                          alt={profileData.username}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <User className="h-7 w-7 text-white" />
                      )}
                    </div>
                    <div>
                      <a
                        href={`https://www.reddit.com/user/${profileData.username}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-lg font-bold text-foreground hover:text-blue-600 inline-flex items-center gap-1.5"
                      >
                        u/{profileData.username}
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </a>
                    </div>
                  </div>

                  <Separator orientation="vertical" className="h-14" />

                  {/* CENTER: Metrics - clean and balanced */}
                  <div className="flex-1 flex items-center justify-around">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">
                        <ThumbsUp className="h-3 w-3" /> Karma
                      </div>
                      <div className="text-lg font-bold text-foreground">{(profileData.totalKarma || 0).toLocaleString()}</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">
                        <Calendar className="h-3 w-3" /> Account Age
                      </div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{profileData.accountAge}</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">
                        <MessageSquare className="h-3 w-3" /> Posts
                      </div>
                      <div className="text-lg font-bold text-foreground">{(profileData.postsCount || 0).toLocaleString()}</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-0.5">
                        <MessageCircle className="h-3 w-3" /> Comments
                      </div>
                      <div className="text-lg font-bold text-foreground">{(profileData.commentsCount || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* === MAIN GRID: 70/30 === */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
              {/* === LEFT: UNIFIED INTELLIGENCE FEED (70%) === */}
              <div className="lg:col-span-7">
                <Card className="border-border shadow-sm h-full">
                  <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3 flex-wrap">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Target className="h-4 w-4 text-blue-600" />
                          Unified Intelligence Feed
                        </CardTitle>
                        
                        <div className="flex items-center gap-2 ml-auto">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Posts</span>
                            <Select value={postsSort} onValueChange={(v) => setPostsSort(v as any)}>
                              <SelectTrigger className="h-8 w-[90px] text-[10px] border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all" className="text-xs">All</SelectItem>
                                <SelectItem value="recent" className="text-xs">Recent 20</SelectItem>
                                <SelectItem value="top" className="text-xs">Top 20</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Comments</span>
                            <Select value={commentsSort} onValueChange={(v) => setCommentsSort(v as any)}>
                              <SelectTrigger className="h-8 w-[90px] text-[10px] border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all" className="text-xs">All</SelectItem>
                                <SelectItem value="recent" className="text-xs">Recent 20</SelectItem>
                                <SelectItem value="top" className="text-xs">Top 20</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Posts */}
                      <div>
                        <div className="flex items-center justify-between mb-2.5 px-1">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                            {postsSort === 'top' ? 'Top 20 Posts' : postsSort === 'recent' ? 'Recent 20 Posts' : 'All Posts'}
                          </h4>
                          <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500 px-1.5 py-0">
                            {sortedPosts.length}
                          </Badge>
                        </div>
                        <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
                          {sortedPosts.length > 0 ? (
                            <>
                              {sortedPosts.slice(0, visiblePosts).map((item: any, i: number) => renderSentimentRow(item, `post-${postsSort}-${i}`, true))}
                              {sortedPosts.length > visiblePosts && (
                                <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleLoadMorePosts} disabled={isAnalyzingMorePosts}>
                                  {isAnalyzingMorePosts ? <LoadingSpinner size="sm" text="Analyzing..." /> : <><ChevronDown className="h-3 w-3 mr-1" /> See {sortedPosts.length - visiblePosts} more</>}
                                </Button>
                              )}
                            </>
                          ) : (
                            <div className="text-center text-xs text-slate-400 py-8 border border-dashed border-slate-200 rounded">
                              No posts available
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Comments */}
                      <div>
                        <div className="flex items-center justify-between mb-2.5 px-1">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                            {commentsSort === 'top' ? 'Top 20 Comments' : commentsSort === 'recent' ? 'Recent 20 Comments' : 'All Comments'}
                          </h4>
                          <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500 px-1.5 py-0">
                            {sortedComments.length}
                          </Badge>
                        </div>
                        <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
                          {sortedComments.length > 0 ? (
                            <>
                              {sortedComments.slice(0, visibleComments).map((item: any, i: number) => renderSentimentRow(item, `comment-${commentsSort}-${i}`, false))}
                              {sortedComments.length > visibleComments && (
                                <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleLoadMoreComments} disabled={isAnalyzingMoreComments}>
                                  {isAnalyzingMoreComments ? <LoadingSpinner size="sm" text="Analyzing..." /> : <><ChevronDown className="h-3 w-3 mr-1" /> See {sortedComments.length - visibleComments} more</>}
                                </Button>
                              )}
                            </>
                          ) : profileData?.isPrivateProfile ? (
                            <div className="text-center text-xs text-amber-600 py-8 border border-dashed border-amber-200 rounded bg-amber-50/50">
                              <AlertCircle className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                              Comments not fetched due to Reddit's Security Policy
                            </div>
                          ) : (
                            <div className="text-center text-xs text-slate-400 py-8 border border-dashed border-slate-200 rounded">
                              No comments available
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* === RIGHT SIDEBAR (30%) === */}
              <div className="lg:col-span-3 space-y-5">
                {/* Behavioral Intelligence */}
                <Card className="border-border shadow-sm">
                  <CardHeader className="pb-2.5 border-b border-slate-100">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-blue-600" /> Behavioral Intelligence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2.5 text-xs">
                    {[
                      { label: 'Most Active Hour', value: profileData.activityPattern.mostActiveHour, icon: Clock },
                      { label: 'Most Active Day', value: profileData.activityPattern.mostActiveDay, icon: Calendar },
                      { label: 'Posting Frequency', value: `${(((profileData.postsCount || 0) + (profileData.commentsCount || 0)) / Math.max(1, (profileData.monthlyActivity?.length || 1))).toFixed(1)} / month`, icon: TrendingUp },
                      { label: 'Avg Engagement', value: `${Math.round((profileData.totalKarma || 0) / Math.max(1, (profileData.postsCount || 0) + (profileData.commentsCount || 0)))} karma/item`, icon: ThumbsUp },
                      { label: 'Estimated Timezone', value: profileData.activityPattern.timezone, icon: Globe },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <row.icon className="h-3 w-3" />
                          <span>{row.label}</span>
                        </div>
                        <span className="font-semibold text-foreground text-right truncate max-w-[55%]">{row.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Possible Location Indicators */}
                <Card className="border-border shadow-sm">
                  <CardHeader className="pb-2.5 border-b border-slate-100">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-blue-600" /> Possible Location Indicators
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-slate-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Locations are extracted from subreddit names, post titles, and comment text. Results update progressively as more content is analyzed by the AI model.</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-1.5">
                    {(profileData.locationIndicators || []).slice(0, 6).map((loc: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-muted border border-border">
                        <MapPin className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <span className="text-foreground truncate">{loc}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Dual Sentiment Charts */}
                <Card className="border-border shadow-sm">
                  <CardHeader className="pb-2.5 border-b border-slate-100">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <BarChart3 className="h-4 w-4 text-blue-600" /> Sentiment Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Posts Chart */}
                      <div className="text-center">
                        <div className="text-[10px] font-semibold text-slate-600 uppercase mb-1">Posts</div>
                        {sentimentPieData(dynamicPostSentimentBreakdown).length > 0 ? (
                          <ResponsiveContainer width="100%" height={110}>
                            <PieChart>
                              <Pie
                                data={sentimentPieData(dynamicPostSentimentBreakdown)}
                                dataKey="value"
                                cx="50%"
                                cy="50%"
                                innerRadius={26}
                                outerRadius={45}
                                paddingAngle={2}
                                className="cursor-pointer"
                              >
                                {sentimentPieData(dynamicPostSentimentBreakdown).map((d, i) => {
                                  const sentiment = d.name.toLowerCase() as 'positive' | 'negative' | 'neutral';
                                  const isActive = postSentimentFilter === sentiment;
                                  return (
                                    <Cell
                                      key={`cell-post-${i}`}
                                      fill={d.color}
                                      stroke={isActive ? (theme === 'dark' ? '#60a5fa' : '#1e40af') : 'none'}
                                      strokeWidth={isActive ? 3 : 0}
                                      opacity={postSentimentFilter && !isActive ? 0.4 : 1}
                                      className="transition-all duration-300"
                                      onClick={() => setPostSentimentFilter(prev => prev === sentiment ? null : sentiment)}
                                    />
                                  );
                                })}
                              </Pie>
                              <RTooltip formatter={(v: any) => `${v}%`} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[110px] flex items-center justify-center text-[10px] text-slate-400">No data</div>
                        )}
                        {postSentimentFilter && (
                          <div className="text-[9px] text-blue-600 font-medium mt-1">
                            Filter: {postSentimentFilter}
                            <button
                              onClick={() => setPostSentimentFilter(null)}
                              className="ml-1 text-slate-400 hover:text-slate-600 underline"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Comments Chart */}
                      <div className="text-center">
                        <div className="text-[10px] font-semibold text-slate-600 uppercase mb-1">Comments</div>
                        {sentimentPieData(dynamicCommentSentimentBreakdown).length > 0 ? (
                          <ResponsiveContainer width="100%" height={110}>
                            <PieChart>
                              <Pie
                                data={sentimentPieData(dynamicCommentSentimentBreakdown)}
                                dataKey="value"
                                cx="50%"
                                cy="50%"
                                innerRadius={26}
                                outerRadius={45}
                                paddingAngle={2}
                                className="cursor-pointer"
                              >
                                {sentimentPieData(dynamicCommentSentimentBreakdown).map((d, i) => {
                                  const sentiment = d.name.toLowerCase() as 'positive' | 'negative' | 'neutral';
                                  const isActive = commentSentimentFilter === sentiment;
                                  return (
                                    <Cell
                                      key={`cell-comment-${i}`}
                                      fill={d.color}
                                      stroke={isActive ? (theme === 'dark' ? '#60a5fa' : '#1e40af') : 'none'}
                                      strokeWidth={isActive ? 3 : 0}
                                      opacity={commentSentimentFilter && !isActive ? 0.4 : 1}
                                      className="transition-all duration-300"
                                      onClick={() => setCommentSentimentFilter(prev => prev === sentiment ? null : sentiment)}
                                    />
                                  );
                                })}
                              </Pie>
                              <RTooltip formatter={(v: any) => `${v}%`} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[110px] flex items-center justify-center text-[10px] text-slate-400">No data</div>
                        )}
                        {commentSentimentFilter && (
                          <div className="text-[9px] text-blue-600 font-medium mt-1">
                            Filter: {commentSentimentFilter}
                            <button
                              onClick={() => setCommentSentimentFilter(null)}
                              className="ml-1 text-slate-400 hover:text-slate-600 underline"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 text-center mt-2">Click a color to filter each chart independently</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* === BOTTOM ANALYTICS ROW === */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Top Communities */}
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2.5 border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4 text-blue-600" /> Top Communities
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4" style={{ height: '400px' }}>
                  <CommunitiesTreemap data={profileData.activeSubreddits || []} />
                </CardContent>
              </Card>

              {/* Keyword Intelligence */}
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2.5 border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Brain className="h-4 w-4 text-blue-600" /> Keyword Intelligence
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {(profileData.wordCloud || []).length > 0 ? (
                    <div className="space-y-1.5">
                      {profileData.wordCloud.slice(0, 10).map((w: any, i: number) => {
                        const max = Math.max(...profileData.wordCloud.map((x: any) => x.frequency || 0));
                        const pct = max > 0 ? (w.frequency / max) * 100 : 0;
                        return (
                          <div
                            key={i}
                            className="transition-all duration-150 ease-in-out hover:bg-white/5 hover:border-l-[3px] hover:border-[#6366f1] border-l-[3px] border-transparent"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="truncate text-foreground"
                                style={{
                                  fontWeight: '600',
                                  fontSize: '15px',
                                  letterSpacing: '0.025em'
                                }}
                              >
                                {w.word}
                              </span>
                              <span
                                className="font-mono"
                                style={{
                                  background: theme === 'dark' ? '#1e293b' : '#eff6ff',
                                  color: theme === 'dark' ? '#60a5fa' : '#3b82f6',
                                  borderRadius: '999px',
                                  padding: '1px 8px',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}
                              >
                                {w.frequency}
                              </span>
                            </div>
                            <div
                              className="overflow-hidden"
                              style={{
                                height: '5px',
                                borderRadius: '999px',
                                background: '#e2e8f0'
                              }}
                            >
                              <div
                                className="h-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  background: 'linear-gradient(to right, #6366f1, #3b82f6)',
                                  animation: 'slideIn 0.5s ease-out'
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-6">No keyword data</p>
                  )}
                </CardContent>
              </Card>

              {/* Posting Activity Timeline */}
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2.5 border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-blue-600" /> Posting Activity Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3" style={{ height: '400px' }}>
                  {(profileData.monthlyActivity || []).length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={profileData.monthlyActivity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" fontSize={10} stroke="#94a3b8" />
                          <YAxis fontSize={10} stroke="#94a3b8" />
                          <RTooltip
                            contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e2e8f0' }}
                            formatter={(value: any, name: string, props: any) => {
                              const dataKey = props?.dataKey;
                              return [value, dataKey === 'posts' ? 'Posts' : 'Comments'];
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="posts"
                            name="Posts"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={{ fill: '#f97316', r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="comments"
                            name="Comments"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={{ fill: '#3b82f6', r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                          Posts
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                          Comments
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-12">No timeline data</p>
                  )}
                </CardContent>
              </Card>
            </div>

          </>
        )}

        {error && !profileData && (
          <Card className="border-red-200 bg-red-50 shadow-sm">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-700 font-medium mb-2">Analysis Failed</p>
              <p className="text-sm text-red-600">{error}</p>
            </CardContent>
          </Card>
        )}

        {!profileData && !isLoading && !error && (
          <div className="space-y-6">
            {savedProfiles.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-slate-600">Previously Analyzed Profiles</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {savedProfiles.map((p) => (
                    <Card
                      key={p.id}
                      className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:-translate-y-1"
                      onClick={() => loadSavedProfile(p.id)}
                    >
                      <div className="relative bg-gradient-to-br from-orange-500 via-red-500 to-rose-600 px-4 pt-4 pb-10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white font-bold text-sm truncate">u/{p.username}</span>
                          <span className="flex items-center gap-1 text-white/90 text-[11px] font-semibold bg-white/20 rounded-full px-2 py-0.5 backdrop-blur-sm shrink-0">
                            <Zap className="h-3 w-3" />
                            {(p.total_karma ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/80 font-medium">{p.account_age || 'Unknown age'}</span>
                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                        <div className="absolute bottom-0 left-0 w-14 h-14 bg-white/5 rounded-full translate-y-6 -translate-x-4" />
                      </div>
                      <div className="flex justify-center -mt-8 relative z-10">
                        <div className="w-16 h-16 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-orange-500 via-red-500 to-rose-600">
                          {p.avatar ? (
                            <img src={p.avatar} alt={p.username} className="w-full h-full object-cover" />
                          ) : (
                            <User className="h-7 w-7 text-white" />
                          )}
                        </div>
                      </div>
                      <div className="px-4 pt-2 pb-3 text-center">
                        <a
                          href={`https://www.reddit.com/user/${p.username}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-bold text-foreground hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          u/{p.username}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {p.analyzed_at ? new Date(p.analyzed_at).toLocaleString() : 'Unknown date'}
                        </p>
                      </div>
                      <div className="flex border-t border-border/50">
                        <Button variant="ghost" size="sm" className="flex-1 rounded-none text-xs h-9 hover:bg-muted/80"
                          onClick={(e) => { e.stopPropagation(); loadSavedProfile(p.id); }}>
                          <Search className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                        <div className="w-px bg-border/50" />
                        <Button variant="ghost" size="sm" className="rounded-none text-xs h-9 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); deleteSavedProfile(p.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
            <Card className="border-dashed border-border bg-card">
              <CardContent className="py-12 text-center">
                <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground">Enter a username to perform detailed profile analysis</p>
                <p className="text-xs text-muted-foreground mt-2">Real-time data fetched from Reddit API</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Item Preview Dialog - matching Keyword Analysis design */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col rounded-xl border-blue-100 shadow-xl">
          <DialogHeader className="border-b border-blue-50 pb-3">
            <DialogTitle className="text-base leading-snug flex items-center gap-2">
              <span className="p-1 bg-blue-50 rounded text-blue-600">
                {previewItem?.isPost ? '📄' : '💬'}
              </span>
              {previewItem?.isPost ? 'Post Preview' : 'Comment Preview'}
            </DialogTitle>
              <DialogDescription className="flex items-center gap-2 pt-1">
                <Badge variant="outline" className="text-[10px] bg-slate-50 border-blue-100 text-blue-600">
                  r/{previewItem?.subreddit}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {previewItem?.created_utc ? formatTimestamp(previewItem.created_utc) : ''}
                </span>
              </DialogDescription>
            </DialogHeader>
            <p className="sr-only">Detailed preview of the selected {previewItem?.isPost ? 'post' : 'comment'}.</p>
            <ScrollArea className="flex-1 max-h-[50vh] mt-4">
              <div className="space-y-4 pr-4">
                {previewItem?.isPost && (
                  <h3 className="font-bold text-sm text-foreground leading-relaxed">{previewItem?.title}</h3>
                )}
                {!previewItem?.isPost && previewItem?.link_title && (
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    On post: {previewItem.link_title}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground font-medium">by</span>
                  <span className="text-blue-600 font-semibold">u/{profileData?.username || 'user'}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto bg-slate-100">
                  ▲ {previewItem?.score}
                </Badge>
              </div>
              <div className="text-sm text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                {previewItem?.isPost && previewItem?.body ? previewItem.body : (previewItem?.text || previewItem?.body || (previewItem?.isPost ? '(no text)' : '(comment unavailable)'))}
              </div>
            </div>
          </ScrollArea>
          <div className="pt-4 mt-2 border-t border-slate-100">
            <Button 
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition-all shadow-blue-200"
              onClick={() => previewItem?.permalink && window.open(`https://reddit.com${previewItem.permalink}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              View on Reddit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default UserProfiling;