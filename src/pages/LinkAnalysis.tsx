import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInvestigation } from "@/contexts/InvestigationContext";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Network, Share2, Users, Search, X, ArrowLeft, ExternalLink,
  MessageSquare, MessageCircle, Clock, TrendingUp, Activity,
  Target, Hash, BarChart3, Brain, Globe, ThumbsUp, MapPin,
  Zap, Eye, Trash2, User, ChevronDown
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { UserCommunityNetworkGraph } from "@/components/UserCommunityNetworkGraph";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { toZonedTime, format } from 'date-fns-tz';
import { analyzeWithHuggingFace, SentimentItem as HFSentimentItem } from '@/integrations/huggingface/client';

type LinkAnalysisPayload = {
  primaryUser: string;
  totalKarma?: number;
  posts?: any[];
  comments?: any[];
  userToCommunities?: Array<{
    community: string;
    posts: number;
    comments: number;
    totalActivity?: number;
    engagement?: number;
    activity?: number;
  }>;
  communityCrossover?: Array<{
    from: string;
    to: string;
    strength: number;
    relationType?: string;
  }>;
  communityDistribution?: Array<{ name: string; value: number }>;
  communityRelations?: Array<{ subreddit: string; relatedTo: string[] }>;
  networkMetrics?: {
    totalCommunities: number;
    avgActivityScore?: number;
    crossCommunityLinks: number;
    totalPosts: number;
    totalComments: number;
  };
  analyzedAt?: string;
  // Enhanced fields for unified feed
  postSentiments?: Array<{
    text: string;
    body?: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    explanation?: string;
    subreddit: string;
    created_utc: number;
    score: number;
    permalink: string;
    word_contributions?: any[];
  }>;
  commentSentiments?: Array<{
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    explanation?: string;
    subreddit: string;
    created_utc: number;
    score: number;
    permalink: string;
    word_contributions?: any[];
  }>;
  activityHeatmap?: Array<{ hour: number; day: string; value: number }>;
};

// Helper functions
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
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const SENT_COLORS = { positive: '#10b981', neutral: '#94a3b8', negative: '#ef4444' };

const INITIAL_VISIBLE = 10;

// Premium Explanation Component (adapted from UserProfiling)
const PremiumExplanation = ({ 
  sentiment, 
  confidence, 
  explanation, 
  contributions = [], 
  isExpanded, 
  onToggleExpand, 
  onShowOriginal,
  isAnalyzing 
}: {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence?: number;
  explanation?: string;
  contributions?: any[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onShowOriginal: () => void;
  isAnalyzing?: boolean;
}) => {
  const getShortExplanation = (sent: string) => {
    switch (sent) {
      case 'positive':
        return 'Text expresses favorable/supportive sentiment.';
      case 'negative':
        return 'Text contains criticism, hostility, complaint, or unfavorable tone.';
      default:
        return 'Text appears informational, discussion-based, or emotionally balanced.';
    }
  };

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
          const normalized = Math.sign(score) * 0.15;
          return { ...token, contribution: normalized, original_score: score };
        }
        return { ...token, contribution: score, original_score: score };
      })
      .sort((a, b) => {
        const scoreA = Math.abs(a.contribution || 0);
        const scoreB = Math.abs(b.contribution || 0);
        return scoreB - scoreA;
      });
  };

  const getChipColor = (token: any) => {
    const score = token.contribution || token.score || token.weight || token.value || 0;
    if (Math.abs(score) < 0.005) {
      return 'bg-gray-50 text-gray-600 border-gray-200';
    }
    if (score > 0) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
  };

  const filteredTokens = filterTokens(contributions);
  const topTokens = filteredTokens.slice(0, isExpanded ? 8 : 3);
  const confidenceValue = confidence;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-gray-900">xAI Deep Analysis</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' :
              sentiment === 'negative' ? 'bg-rose-100 text-rose-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
            </span>
            {confidenceValue !== null && confidenceValue !== undefined && (
              <span className="text-xs text-gray-500">
                {confidenceValue.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs text-gray-700 mb-2 leading-relaxed">
          {getShortExplanation(sentiment)}
        </p>

        {topTokens.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {topTokens.map((token, i) => (
              <span
                key={i}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${getChipColor(token)}`}
              >
                {token.word}
              </span>
            ))}
          </div>
        )}

        {isExpanded && filteredTokens.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-900 mb-2">Word Contribution Evidence</div>
            <div className="space-y-1">
              {filteredTokens.slice(0, 8).map((token, i) => {
                const score = token.contribution || token.score || token.weight || token.value || 0;
                const supportsPrediction = score > 0;
                const isWeak = Math.abs(score) < 0.005;
                const maxScore = Math.max(...filteredTokens.map(t => Math.abs(t.contribution || t.score || t.weight || t.value || 0)));
                const barWidth = maxScore > 0 ? (Math.abs(score) / maxScore) * 100 : 0;
                
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono bg-gray-50 px-1 py-0.5 rounded border border-gray-200 min-w-[3rem] text-center">
                      {token.word}
                    </span>
                    <span className={`font-mono min-w-[2.5rem] text-right ${
                      isWeak ? 'text-gray-500' : score > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {score > 0 ? '+' : ''}{score.toFixed(3)}
                    </span>
                    <span className={`text-xs ${
                      isWeak ? 'text-gray-500' : supportsPrediction ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {isWeak ? 'Weak signal' : supportsPrediction ? 'Supports prediction' : 'Opposes prediction'}
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isWeak ? 'bg-gray-400' : supportsPrediction ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, barWidth)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Zap className="h-3 w-3 mr-1 animate-pulse" />
                Analyzing...
              </>
            ) : isExpanded ? (
              <>
                <Eye className="h-3 w-3 mr-1" />
                Hide Details
              </>
            ) : (
              <>
                <BarChart3 className="h-3 w-3 mr-1" />
                Show Detailed Evidence
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-gray-600 hover:bg-gray-50"
            onClick={(e) => {
              e.stopPropagation();
              onShowOriginal();
            }}
          >
            Show Original
          </Button>
        </div>
      </div>
    </div>
  );
};

const LinkAnalysis = () => {
  const { saveRedditContentToDb } = useInvestigation();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [linkData, setLinkData] = useState<LinkAnalysisPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [visiblePosts, setVisiblePosts] = useState(INITIAL_VISIBLE);
  const [visibleComments, setVisibleComments] = useState(INITIAL_VISIBLE);
  const [feedFilter, setFeedFilter] = useState<'all' | 'posts' | 'comments' | 'high_score' | 'recent'>('all');
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<any[]>([]);

  // Per-item deep analysis state
  const [deepAnalysisStates, setDeepAnalysisStates] = useState<Map<string, { isAnalyzing: boolean; result: any; showDeep: boolean }>>(new Map());

  // Load saved link analyses
  const fetchSavedAnalyses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('analysis_results')
        .select('id, analysis_type, target, result_data, analyzed_at')
        .eq('analysis_type', 'link')
        .order('analyzed_at', { ascending: false })
        .limit(20);
      
      if (error) console.error('Error fetching saved analyses:', error);
      else setSavedAnalyses(data || []);
    } catch (e) {
      console.error('Exception fetching analyses:', e);
    }
  }, []);

  useEffect(() => { fetchSavedAnalyses(); }, [fetchSavedAnalyses]);

  // Deep analysis handler
  const handleDeepAnalysis = async (text: string, itemKey: string) => {
    setDeepAnalysisStates(prev => new Map(prev.set(itemKey, { isAnalyzing: true, result: null, showDeep: false })));

    try {
      const response = await fetch(`${import.meta.env?.VITE_HF_SPACE_URL || "https://takeda-shingen-intel-reddit-analyzer.hf.space"}/gradio_api/deep_analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error(`Deep analysis failed: ${response.statusText}`);

      const result = await response.json();
      
      setDeepAnalysisStates(prev => new Map(prev.set(itemKey, { 
        isAnalyzing: false, 
        result, 
        showDeep: true 
      })));
    } catch (error) {
      console.error('Deep analysis error:', error);
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
        return new Map(prev.set(itemKey, { ...current, showDeep: !current.showDeep }));
      }
      return prev;
    });
  }, []);

  // Load saved analysis when navigating
  useEffect(() => {
    const loadAnalysisId = (location.state as any)?.loadAnalysisId as string | undefined;
    if (!loadAnalysisId) return;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("analysis_results")
          .select("*")
          .eq("id", loadAnalysisId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Analysis not found");
        if (cancelled) return;

        const resultData = (data.result_data || {}) as LinkAnalysisPayload;
        setUsername(data.target || "");
        setLinkData(resultData);
        toast({ title: "Loaded saved analysis", description: `Showing saved link analysis for "${data.target}"` });
      } catch (e: any) {
        if (!cancelled) toast({ title: "Failed to load analysis", description: e?.message || "Could not load saved analysis", variant: "destructive" });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [location.state, toast]);

  const handleAnalyzeLinks = async () => {
    if (!username.trim()) return;
    setIsLoading(true);
    setLoadingProgress(0);
    setTargetProgress(0);
    setLinkData(null);
    setVisiblePosts(INITIAL_VISIBLE);
    setVisibleComments(INITIAL_VISIBLE);
    setSelectedCommunity(null);

    const cleanUsername = username.replace(/^u\//, "").trim();

    try {
      setTargetProgress(30);
      const { data: redditData, error } = await supabase.functions.invoke('reddit-scraper', {
        body: { username: cleanUsername, type: 'user' },
      });

      if (error || redditData?.error) {
        toast({ title: "Analysis failed", description: redditData?.message || error?.message || "Could not fetch Reddit data", variant: "destructive" });
        setIsLoading(false);
        setTargetProgress(0);
        return;
      }
      setTargetProgress(60);

      const posts = redditData.posts || [];
      const comments = redditData.comments || [];
      const user = redditData.user || {};
      
      // Save Reddit content
      try { await saveRedditContentToDb(posts, comments, 'link_analysis'); } catch (error: any) { console.error('Failed to save Reddit content:', error); }

      // Analyze content for sentiment
      let postSentiments: any[] = [];
      let commentSentiments: any[] = [];
      try {
        const analysisData = await analyzeWithHuggingFace(
          posts.slice(0, 40).map((p: any) => ({ title: p.title || '', selftext: p.selftext || '', subreddit: p.subreddit || '' })),
          comments.slice(0, 40).map((c: any) => ({ body: c.body || '', subreddit: c.subreddit || '' }))
        );
        if (analysisData) {
          postSentiments = (analysisData.postSentiments || []).map((s: any, i: number) => ({
            ...s,
            subreddit: posts[i]?.subreddit || '',
            created_utc: posts[i]?.created_utc || 0,
            score: posts[i]?.score || 0,
            permalink: posts[i]?.permalink || '',
            body: posts[i]?.selftext || ''
          }));
          commentSentiments = (analysisData.commentSentiments || []).map((s: any, i: number) => ({
            ...s,
            subreddit: comments[i]?.subreddit || '',
            created_utc: comments[i]?.created_utc || 0,
            score: comments[i]?.score || 0,
            permalink: comments[i]?.permalink || ''
          }));
        }
      } catch (err) { console.error('Sentiment analysis error:', err); }
      setTargetProgress(80);

      // Build community activity
      const communityMap = new Map<string, { posts: number; comments: number; totalScore: number }>();
      posts.forEach((p: any) => {
        const entry = communityMap.get(p.subreddit) || { posts: 0, comments: 0, totalScore: 0 };
        entry.posts++;
        entry.totalScore += p.score || 0;
        communityMap.set(p.subreddit, entry);
      });
      comments.forEach((c: any) => {
        const entry = communityMap.get(c.subreddit) || { posts: 0, comments: 0, totalScore: 0 };
        entry.comments++;
        entry.totalScore += c.score || 0;
        communityMap.set(c.subreddit, entry);
      });

      const communities = Array.from(communityMap.entries())
        .map(([name, data]) => {
          const totalActivity = data.posts + data.comments;
          return {
            community: `r/${name}`,
            posts: data.posts,
            comments: data.comments,
            totalActivity,
            engagement: data.totalScore,
            activity: 0,
          };
        })
        .sort((a, b) => b.totalActivity - a.totalActivity);

      const maxActivity = communities[0]?.totalActivity || 1;
      communities.forEach(c => { c.activity = Math.round((c.totalActivity / maxActivity) * 100); });

      const communityDistribution = communities.slice(0, 8).map(c => ({ name: c.community, value: c.totalActivity }));

      // Generate activity heatmap
      const hourCounts: { [key: string]: { [key: number]: number } } = {};
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      days.forEach(d => hourCounts[d] = {});
      
      [...posts, ...comments].forEach((item: any) => {
        if (item.created_utc) {
          const date = new Date(item.created_utc * 1000);
          const pakDate = toZonedTime(date, 'Asia/Karachi');
          const day = days[pakDate.getDay()];
          const hour = pakDate.getHours();
          hourCounts[day][hour] = (hourCounts[day][hour] || 0) + 1;
        }
      });

      const activityHeatmap: any[] = [];
      days.forEach(day => {
        for (let h = 0; h < 24; h++) {
          activityHeatmap.push({ day, hour: h, value: hourCounts[day][h] || 0 });
        }
      });

      // Network score calculation
      const networkScore = Math.min(100, Math.round(
        (communities.length * 2) + 
        (posts.length + comments.length) * 0.1 +
        ((user.link_karma || 0) + (user.comment_karma || 0)) * 0.001
      ));

      const analysisResult: LinkAnalysisPayload = {
        primaryUser: cleanUsername,
        totalKarma: (user.link_karma || 0) + (user.comment_karma || 0),
        posts,
        comments,
        userToCommunities: communities,
        communityDistribution,
        communityRelations: redditData.communityRelations || [],
        networkMetrics: {
          totalCommunities: communities.length,
          avgActivityScore: communities.length > 0 ? Math.round(communities.reduce((s, c) => s + c.totalActivity, 0) / communities.length) : 0,
          crossCommunityLinks: 0,
          totalPosts: posts.length,
          totalComments: comments.length,
        },
        postSentiments,
        commentSentiments,
        activityHeatmap,
        analyzedAt: new Date().toISOString(),
      };

      setLinkData(analysisResult);
      setTargetProgress(100);
      fetchSavedAnalyses();
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err?.message || "An unexpected error occurred", variant: "destructive" });
      setTargetProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSavedAnalysis = async (id: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('analysis_results').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Analysis not found');
      
      setUsername(data.target || '');
      setLinkData(data.result_data as LinkAnalysisPayload);
    } catch (e: any) {
      toast({ title: 'Failed to load analysis', description: e?.message || 'Could not load analysis', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSavedAnalysis = async (id: string) => {
    try {
      const { error } = await supabase.from('analysis_results').delete().eq('id', id);
      if (error) throw error;
      setSavedAnalyses(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Analysis removed', description: 'Saved analysis has been deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Could not delete analysis', variant: 'destructive' });
    }
  };

  // Filtered feed items
  const filteredFeedItems = useMemo(() => {
    if (!linkData) return [];
    
    let items: any[] = [];
    if (feedFilter === 'all' || feedFilter === 'posts') {
      items = [...items, ...(linkData.postSentiments || []).map((p: any) => ({ ...p, type: 'post' }))];
    }
    if (feedFilter === 'all' || feedFilter === 'comments') {
      items = [...items, ...(linkData.commentSentiments || []).map((c: any) => ({ ...c, type: 'comment' }))];
    }
    
    // Apply community filter
    if (selectedCommunity) {
      items = items.filter(item => item.subreddit === selectedCommunity.replace('r/', ''));
    }
    
    // Apply feed filter sorting
    if (feedFilter === 'high_score') {
      items.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (feedFilter === 'recent') {
      items.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
    } else {
      // Default: recent
      items.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
    }
    
    return items;
  }, [linkData, feedFilter, selectedCommunity]);

  // Render feed item
  const renderFeedItem = (item: any, index: number) => {
    const itemKey = `${item.type}-${index}`;
    const deepState = deepAnalysisStates.get(itemKey);
    const isPost = item.type === 'post';

    const getContributions = () => {
      if (deepState?.showDeep && deepState.result) {
        return deepState.result.deep_explanation?.word_contributions || [];
      }
      return item.word_contributions || [];
    };

    return (
      <div
        key={itemKey}
        className="group relative rounded-lg border border-slate-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
        onClick={() => item.permalink && window.open(`https://www.reddit.com${item.permalink}`, '_blank')}
      >
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mt-0.5">
            {isPost ? <MessageSquare className="h-3.5 w-3.5 text-orange-600" /> : <MessageCircle className="h-3.5 w-3.5 text-orange-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                <span className="font-medium text-slate-900 truncate">r/{item.subreddit}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500">{isPost ? 'Post' : 'Comment'}</span>
              </div>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sentimentTone(item.sentiment)}`}>
                {item.sentiment}
              </Badge>
            </div>
            <div className="text-[10px] text-slate-400 mb-1.5">
              {formatTimestamp(item.created_utc)} • {item.score?.toLocaleString()} pts
            </div>

            <p className="text-sm text-slate-800 line-clamp-2 mb-2 group-hover:text-blue-700 transition-colors">
              {item.text}
            </p>
            {isPost && item.body && (
              <p className="text-xs text-slate-500 line-clamp-2 mb-2">{item.body}</p>
            )}

            <PremiumExplanation
              sentiment={item.sentiment}
              confidence={item.confidence}
              explanation={typeof item.explanation === 'string' ? item.explanation : item.explanation?.reasoning}
              contributions={getContributions()}
              isExpanded={deepState?.showDeep || false}
              onToggleExpand={() => {
                if (deepState?.showDeep) {
                  toggleDeepAnalysis(itemKey);
                } else {
                  handleDeepAnalysis(item.text, itemKey);
                }
              }}
              onShowOriginal={() => toggleDeepAnalysis(itemKey)}
              isAnalyzing={deepState?.isAnalyzing}
            />

            {/* Reddit-style Voting Bar */}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1 bg-slate-100 rounded-full px-2 py-1">
                <button 
                  className="p-0.5 rounded hover:bg-white text-slate-400 hover:text-orange-500 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-8 8h16l-8-8z"/>
                  </svg>
                </button>
                <span className="text-[11px] font-semibold text-slate-700 min-w-[1.5rem] text-center">
                  {item.score >= 1000 ? (item.score / 1000).toFixed(1) + 'K' : item.score || 0}
                </span>
                <button 
                  className="p-0.5 rounded hover:bg-white text-slate-400 hover:text-blue-500 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 20l8-8H4l8 8z"/>
                  </svg>
                </button>
              </div>
              
              {item.permalink && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`https://www.reddit.com${item.permalink}`, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open on Reddit
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Calculate network score for display
  const networkScore = useMemo(() => {
    if (!linkData) return 0;
    return Math.min(100, Math.round(
      ((linkData.networkMetrics?.totalCommunities || 0) * 2) + 
      ((linkData.networkMetrics?.totalPosts || 0) + (linkData.networkMetrics?.totalComments || 0)) * 0.1 +
      (linkData.totalKarma || 0) * 0.001
    ));
  }, [linkData]);

  return (
    <TooltipProvider>
    <div className="p-6 space-y-5 relative bg-slate-50/50 min-h-screen">
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-8 py-6">
            <LoadingSpinner text="Analyzing links..." size="md" targetProgress={targetProgress} />
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Link Analysis</h2>
        <p className="text-muted-foreground">Cross-community behavioral mapping and relationship intelligence</p>
      </div>

      {/* Search Bar */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Input
                id="username"
                placeholder="Enter Reddit username (e.g. spez or u/spez)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAnalyzeLinks()}
                className="pr-10 h-10 border-slate-200"
              />
              {username && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setUsername('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              onClick={handleAnalyzeLinks}
              disabled={isLoading || !username.trim()}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Search className="h-4 w-4 mr-1.5" /> Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {linkData && (
        <>
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600" onClick={() => { setLinkData(null); setSelectedCommunity(null); }}>
            <ArrowLeft className="h-4 w-4" /> Back to Overview
          </Button>

          {/* === PREMIUM METRIC CARDS === */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Total Communities */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-blue-50 to-white">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Share2 className="h-4 w-4 text-blue-600" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Communities</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{linkData.networkMetrics?.totalCommunities ?? 0}</div>
                <p className="text-[10px] text-slate-500">Total Communities</p>
              </CardContent>
            </Card>

            {/* Network Score */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Network className="h-4 w-4 text-emerald-600" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Network</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{networkScore}</div>
                <p className="text-[10px] text-slate-500">Network Score</p>
              </CardContent>
            </Card>

            {/* Total Posts */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-orange-50 to-white">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <MessageSquare className="h-4 w-4 text-orange-600" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Posts</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{(linkData.networkMetrics?.totalPosts ?? 0).toLocaleString()}</div>
                <p className="text-[10px] text-slate-500">Total Posts</p>
              </CardContent>
            </Card>

            {/* Total Comments */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-purple-50 to-white">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <MessageCircle className="h-4 w-4 text-purple-600" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Comments</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{(linkData.networkMetrics?.totalComments ?? 0).toLocaleString()}</div>
                <p className="text-[10px] text-slate-500">Total Comments</p>
              </CardContent>
            </Card>

            {/* Total Karma */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-rose-50 to-white">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ThumbsUp className="h-4 w-4 text-rose-600" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Karma</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{(linkData.totalKarma || 0).toLocaleString()}</div>
                <p className="text-[10px] text-slate-500">Total Karma</p>
              </CardContent>
            </Card>
          </div>

          {/* === MAIN GRID: 70/30 SPLIT === */}
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
            {/* === LEFT SIDE: Network Graph (70%) === */}
            <div className="lg:col-span-7">
              <UserCommunityNetworkGraph
                title="User to Community Network Graph"
                primaryUserId="user1"
                nodes={[
                  { id: 'user1', label: `u/${linkData.primaryUser}`, type: 'user' as const },
                  ...(linkData.userToCommunities || []).slice(0, 12).map((item: any, index: number) => ({
                    id: `community-${index}`,
                    label: item.community,
                    type: 'community' as const,
                  })),
                ]}
                links={(linkData.userToCommunities || []).slice(0, 12).map((item: any, index: number) => ({
                  source: 'user1',
                  target: `community-${index}`,
                  weight: Math.min(4, Math.ceil((item.totalActivity || 1) / 10)),
                }))}
                onCommunityClick={(communityName) => {
                  setSelectedCommunity(communityName === selectedCommunity ? null : communityName);
                }}
              />
              {selectedCommunity && (
                <div className="mt-2 text-center">
                  <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200">
                    Filtering by: {selectedCommunity}
                    <button 
                      className="ml-2 text-blue-600 hover:text-blue-800"
                      onClick={() => setSelectedCommunity(null)}
                    >
                      ×
                    </button>
                  </Badge>
                </div>
              )}
            </div>

            {/* === RIGHT SIDE: Analytics Cards (30%) === */}
            <div className="lg:col-span-3 space-y-5">
              {/* Community Distribution Donut Chart */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2.5 border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <BarChart3 className="h-4 w-4 text-blue-600" /> Community Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {(linkData.communityDistribution || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={linkData.communityDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {linkData.communityDistribution?.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={[
                              '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'
                            ][index % 8]} />
                          ))}
                        </Pie>
                        <RTooltip formatter={(value: any, name: any) => [`${value} posts`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">No distribution data</div>
                  )}
                </CardContent>
              </Card>

              {/* Top Communities Ranked */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2.5 border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4 text-blue-600" /> Top Communities
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {(linkData.userToCommunities || []).length > 0 ? (
                    <div className="space-y-3">
                      {(linkData.userToCommunities || []).slice(0, 6).map((item: any, index: number) => (
                        <div 
                          key={index} 
                          className={`cursor-pointer transition-colors ${selectedCommunity === item.community ? 'bg-blue-50 rounded-lg p-2 -mx-2' : ''}`}
                          onClick={() => setSelectedCommunity(item.community === selectedCommunity ? null : item.community)}
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-slate-700">{item.community}</span>
                            <span className="text-slate-500 font-mono">{item.totalActivity}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                              style={{ width: `${item.activity}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                            <span>{item.posts} posts</span>
                            <span>{item.comments} comments</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4">No community data</p>
                  )}
                </CardContent>
              </Card>

              {/* Activity Heatmap */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2.5 border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-blue-600" /> Activity Pattern
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {(linkData.activityHeatmap || []).length > 0 ? (
                    <div className="space-y-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                        const dayData = (linkData.activityHeatmap || []).filter((d: any) => d.day === day);
                        const total = dayData.reduce((sum: number, d: any) => sum + d.value, 0);
                        const maxVal = Math.max(...(linkData.activityHeatmap || []).map((d: any) => d.value), 1);
                        const percentage = (total / maxVal) * 100;
                        return (
                          <div key={day} className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-slate-600 w-8">{day}</span>
                            <div className="flex-1 h-3 bg-slate-100 rounded-sm overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                                style={{ width: `${Math.min(100, percentage)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 w-6 text-right">{total}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4">No activity data</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* === BOTTOM: UNIFIED LINK INTELLIGENCE FEED === */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-blue-600" />
                  Unified Link Intelligence Feed
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={feedFilter} onValueChange={(v) => setFeedFilter(v as any)}>
                    <SelectTrigger className="h-8 w-[120px] text-xs border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All</SelectItem>
                      <SelectItem value="posts" className="text-xs">Posts</SelectItem>
                      <SelectItem value="comments" className="text-xs">Comments</SelectItem>
                      <SelectItem value="high_score" className="text-xs">High Score</SelectItem>
                      <SelectItem value="recent" className="text-xs">Recent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {['all', 'posts', 'comments', 'high_score', 'recent'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setFeedFilter(filter as any)}
                    className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                      feedFilter === filter 
                        ? 'bg-blue-100 text-blue-700 font-medium' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1).replace('_', ' ')}
                  </button>
                ))}
                {selectedCommunity && (
                  <Badge variant="outline" className="text-[10px] bg-blue-50 border-blue-200 ml-auto">
                    Filtered: {selectedCommunity}
                    <button className="ml-1 text-blue-600 hover:text-blue-800" onClick={() => setSelectedCommunity(null)}>×</button>
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {filteredFeedItems.length > 0 ? (
                  <>
                    {filteredFeedItems.slice(0, visiblePosts + visibleComments).map((item, i) => renderFeedItem(item, i))}
                    {filteredFeedItems.length > (visiblePosts + visibleComments) && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full text-xs mt-2" 
                        onClick={() => { setVisiblePosts(p => p + 10); setVisibleComments(p => p + 10); }}
                      >
                        <ChevronDown className="h-3 w-3 mr-1" /> 
                        Show {filteredFeedItems.length - (visiblePosts + visibleComments)} more
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="text-center text-xs text-slate-400 py-12 border border-dashed border-slate-200 rounded">
                    No items match the current filters
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Saved Analyses Overview */}
      {!linkData && !isLoading && (
        <div className="space-y-6">
          {savedAnalyses.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-slate-600">Previously Analyzed Users</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {savedAnalyses.map((analysis) => (
                  <Card
                    key={analysis.id}
                    className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:-translate-y-1"
                    onClick={() => loadSavedAnalysis(analysis.id)}
                  >
                    <div className="relative bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 px-4 pt-4 pb-10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-bold text-sm truncate">u/{analysis.target}</span>
                        <Network className="h-4 w-4 text-white/80" />
                      </div>
                      <span className="text-[10px] text-white/80 font-medium">
                        {(analysis.result_data?.networkMetrics?.totalCommunities || 0)} communities
                      </span>
                      <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                      <div className="absolute bottom-0 left-0 w-14 h-14 bg-white/5 rounded-full translate-y-6 -translate-x-4" />
                    </div>
                    <div className="flex justify-center -mt-8 relative z-10">
                      <div className="w-16 h-16 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
                        <User className="h-7 w-7 text-white" />
                      </div>
                    </div>
                    <div className="px-4 pt-2 pb-3 text-center">
                      <a
                        href={`https://www.reddit.com/user/${analysis.target}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-bold text-foreground hover:text-primary transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        u/{analysis.target}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {analysis.analyzed_at ? new Date(analysis.analyzed_at).toLocaleString() : 'Unknown date'}
                      </p>
                    </div>
                    <div className="flex border-t border-border/50">
                      <Button variant="ghost" size="sm" className="flex-1 rounded-none text-xs h-9 hover:bg-muted/80"
                        onClick={(e) => { e.stopPropagation(); loadSavedAnalysis(analysis.id); }}>
                        <Search className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                      <div className="w-px bg-border/50" />
                      <Button variant="ghost" size="sm" className="rounded-none text-xs h-9 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); deleteSavedAnalysis(analysis.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
          
          <Card className="border-dashed border-gray-300 bg-white">
            <CardContent className="py-12 text-center">
              <Network className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Enter a username to analyze cross-community behavior</p>
              <p className="text-xs text-gray-500 mt-2">Discover community connections and relationship intelligence</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

export default LinkAnalysis;
