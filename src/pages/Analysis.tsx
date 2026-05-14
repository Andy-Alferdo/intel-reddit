import { analyzeDeep, analyzeWithHuggingFace, analyzeWithTimeout } from '@/integrations/huggingface/client';
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, MapPin, Calendar, Users, Network, Share2, AlertTriangle, TrendingUp, Search, Shield, MessageSquare, MessageCircle, Clock, X, Loader2, ExternalLink, Eye, Info, UserPlus, MoreVertical, ArrowLeft, Activity, UserCheck, LineChart, BarChart, Target, Hash, Brain, ThumbsUp, ChevronDown, Zap, User } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { RelatedSubredditsGraph } from '@/components/RelatedSubredditsGraph';
import { WordCloud } from '@/components/WordCloud';
import { AnalyticsChart } from '@/components/AnalyticsChart';
import { UserCommunityNetworkGraph } from '@/components/UserCommunityNetworkGraph';
import { SavedAnalysisCard } from '@/components/SavedAnalysisCard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatActivityTime } from '@/lib/dateUtils';
import { toZonedTime, format } from 'date-fns-tz';
import { useInvestigation } from '@/contexts/InvestigationContext';
import KeywordAnalysisDashboard from '@/components/keyword-analysis/KeywordAnalysisDashboard';

interface SentimentItem {
  text: string;
  body?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

// Helper functions for Link Analysis
const formatTimestampLink = (utc?: number): string => {
  if (!utc) return '';
  const date = new Date(utc * 1000);
  const dateStr = format(date, 'MMM d, yyyy');
  const pktTime = format(toZonedTime(date, 'Asia/Karachi'), 'hh:mm a');
  const utcTime = format(toZonedTime(date, 'UTC'), 'hh:mm a');
  return `${dateStr} | ${pktTime} PKT | ${utcTime} UTC`;
};

const sentimentToneLink = (s?: string) => {
  if (s === 'positive') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'negative') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const SENT_COLORS_LINK = { positive: '#10b981', neutral: '#94a3b8', negative: '#ef4444' };

const Analysis = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [username, setUsername] = useState('');
  const [subreddit, setSubreddit] = useState('');
  const [keywordData, setKeywordData] = useState<any>(null);
  const [communityData, setCommunityData] = useState<any>(null);
  const [linkData, setLinkData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('keyword');
  const [visibleCommunities, setVisibleCommunities] = useState(5);
  const [timePeriod, setTimePeriod] = useState('7d');
  const [feedFilter, setFeedFilter] = useState('recent');
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const { toast } = useToast();
  const { addKeywordAnalysis, addCommunityAnalysis, addLinkAnalysis, saveKeywordAnalysisToDb, saveCommunityAnalysisToDb, saveLinkAnalysisToDb, saveRedditContentToDb, currentCase } = useInvestigation();

  const [savedKeyword, setSavedKeyword] = useState<any[]>([]);
  const [savedCommunity, setSavedCommunity] = useState<any[]>([]);
  const [savedLink, setSavedLink] = useState<any[]>([]);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [selectedKeywordView, setSelectedKeywordView] = useState<'recent20' | 'top20' | null>(null);
  const [selectedCommunityView, setSelectedCommunityView] = useState<'recent20' | 'top20' | null>(null);
  
  // Premium Unified Intelligence Dashboard State
  const [communityPostsFilter, setCommunityPostsFilter] = useState<'recent20' | 'top20'>('recent20');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());
  const [deepAnalysisData, setDeepAnalysisData] = useState<{[key: number]: any}>({});
  const [loadingDeepAnalysis, setLoadingDeepAnalysis] = useState<{[key: number]: boolean}>({});

  const fetchSavedAnalyses = useCallback(async () => {
    if (!currentCase?.id) { setSavedKeyword([]); setSavedCommunity([]); setSavedLink([]); return; }
    try {
      const { data } = await supabase
        .from('analysis_results')
        .select('id, analysis_type, target, result_data, analyzed_at')
        .eq('case_id', currentCase.id)
        .order('analyzed_at', { ascending: false });
      if (data) {
        setSavedKeyword(data.filter(d => d.analysis_type === 'keyword'));
        setSavedCommunity(data.filter(d => d.analysis_type === 'community'));
        setSavedLink(data.filter(d => d.analysis_type === 'link'));
      }
    } catch { /* ignore */ }
  }, [currentCase?.id]);

  // Fetch deep analysis for a post - directly from Python server (like UserProfiling)
  const fetchDeepAnalysis = useCallback(async (postIndex: number, text: string) => {
    if (loadingDeepAnalysis[postIndex] || deepAnalysisData[postIndex]) return;
    
    setLoadingDeepAnalysis(prev => ({ ...prev, [postIndex]: true }));
    try {
      const hfResult = await analyzeDeep(text);

      const result = {
        deep_explanation: {
          word_contributions: hfResult.word_importance.map((w: any) => ({
            word: w.word,
            contribution: w.importance
          }))
        },
        confidence: hfResult.confidence
      };
      
      if (result?.deep_explanation) {
        setDeepAnalysisData(prev => ({ 
          ...prev, 
          [postIndex]: result.deep_explanation 
        }));
      }
    } catch (err) {
      console.error('Deep analysis error:', err);
    } finally {
      setLoadingDeepAnalysis(prev => ({ ...prev, [postIndex]: false }));
    }
  }, [loadingDeepAnalysis, deepAnalysisData]);

  useEffect(() => { fetchSavedAnalyses(); }, [fetchSavedAnalyses]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.caseId === currentCase?.id && ['keywordAnalyses', 'communityAnalyses', 'linkAnalyses'].includes(detail?.kind)) {
        fetchSavedAnalyses();
      }
    };
    window.addEventListener('case-data-updated', handler);
    return () => window.removeEventListener('case-data-updated', handler);
  }, [currentCase?.id, fetchSavedAnalyses]);

  const loadSavedAnalysis = async (item: any) => {
    setIsLoading(true);
    try {
      const rd = item.result_data as any;
      if (item.analysis_type === 'keyword') {
        setActiveTab('keyword');
        setKeyword(item.target);
        setKeywordData(rd);
      } else if (item.analysis_type === 'community') {
        setActiveTab('community');
        setSubreddit(item.target);
        setCommunityData(rd);
      } else if (item.analysis_type === 'link') {
        setActiveTab('link');
        setUsername(item.target);
        setLinkData(rd);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSavedAnalysis = async (id: string, type: string) => {
    try {
      const { error: err } = await supabase
        .from('analysis_results')
        .delete()
        .eq('id', id);
      if (err) throw err;
      if (type === 'keyword') setSavedKeyword(prev => prev.filter(i => i.id !== id));
      else if (type === 'community') setSavedCommunity(prev => prev.filter(i => i.id !== id));
      else if (type === 'link') setSavedLink(prev => prev.filter(i => i.id !== id));
      toast({ title: 'Analysis removed', description: 'Saved analysis has been deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Could not delete analysis', variant: 'destructive' });
    }
  };

  // Load saved analysis when navigating from Dashboard
  useEffect(() => {
    const loadAnalysisId = (location.state as any)?.loadAnalysisId as string | undefined;
    const analysisType = (location.state as any)?.analysisType as string | undefined;
    if (!loadAnalysisId) return;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('analysis_results')
          .select('*')
          .eq('id', loadAnalysisId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Analysis not found');

        if (cancelled) return;

        const resultData = data.result_data as any;

        if (analysisType === 'keyword' || data.analysis_type === 'keyword') {
          setActiveTab('keyword');
          setKeyword(data.target || '');
          setKeywordData(resultData);
        } else if (analysisType === 'community' || data.analysis_type === 'community') {
          setActiveTab('community');
          setSubreddit(data.target || '');
          setCommunityData(resultData);
        }

        toast({
          title: 'Loaded saved analysis',
          description: `Showing saved ${data.analysis_type} analysis for "${data.target}"`,
        });
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: 'Failed to load analysis',
            description: e?.message || 'Could not load saved analysis',
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

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Positive</Badge>;
      case 'negative':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Negative</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-500 border-gray-500/30">Neutral</Badge>;
    }
  };

  const handleKeywordAnalysis = async () => {
    if (!keyword.trim()) return;
    
    setIsLoading(true);
    setLoadingProgress(0);
    setTargetProgress(0);
    setKeywordData(null);
    setSelectedKeywordView(null);

    try {
      setTargetProgress(35);
      // Search for keyword across Reddit using search API
      const { data: redditData, error } = await supabase.functions.invoke('reddit-scraper', {
        body: { 
          keyword: keyword.trim(),
          type: 'search'
        }
      });

      if (error) throw error;

      let posts = redditData.posts || [];

      // Fallback: if scraper returned 0 posts (common with multi-word queries),
      // try the public Reddit JSON API directly
      if (posts.length === 0) {
        try {
          const fallbackUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword.trim())}&limit=100&sort=relevance&t=all`;
          const fallbackRes = await fetch(fallbackUrl, { headers: { 'User-Agent': 'IntelReddit/1.0' } });
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            posts = fallbackData?.data?.children?.map((c: any) => c.data) || [];
            console.log(`Public API fallback found ${posts.length} posts for "${keyword}"`);
          }
        } catch (fbErr) {
          console.warn('Public Reddit fallback failed:', fbErr);
        }
      }

      const matchingPosts = posts;
      setTargetProgress(75);

      // Count subreddit mentions
      const subredditCounts: { [key: string]: number } = {};
      posts.forEach((post: any) => {
        subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
      });

      const topSubreddits = Object.entries(subredditCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, mentions]) => ({ name: `r/${name}`, mentions }));

      // Generate word cloud from matching posts
      const textContent = matchingPosts.map((p: any) => `${p.title} ${p.selftext || ''}`).join(' ');
      const words = textContent.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const wordFreq: { [key: string]: number } = {};
      const stopWords = ['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'what', 'when', 'where', 'just', 'like', 'more', 'would', 'could', 'should', 'about', 'there', 'which', 'them', 'these', 'than', 'then', 'also', 'only'];
      const keywordLower = keyword.toLowerCase();
      words.forEach(word => {
        if (!stopWords.includes(word) && word !== keywordLower) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });

      const wordCloudData = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 60)
        .map(([word, freq]) => ({
          word,
          frequency: freq,
          category: freq > 10 ? 'high' as const : freq > 5 ? 'medium' as const : 'low' as const
        }));

      // Calculate activity by day for past 7 days
      const now = new Date();
      const past7Days: { [key: string]: number } = {};
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        past7Days[dayKey] = 0;
      }

      matchingPosts.forEach((post: any) => {
        const postDate = new Date(post.created_utc * 1000);
        const daysDiff = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 7) {
          const dayKey = postDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
          if (past7Days[dayKey] !== undefined) {
            past7Days[dayKey]++;
          }
        }
      });

      const trendData = Object.entries(past7Days).map(([name, value]) => ({ name, value }));

      // Analyze sentiment for keyword results
      let keywordSentimentData = null;
      let sentimentBreakdown = null;
      let postSentiments: SentimentItem[] = [];
      
      // First, compute the actual posts we'll display (recent 20 + top 20)
      const tempSortedByTime = [...matchingPosts].sort((a: any, b: any) => (b.created_utc || 0) - (a.created_utc || 0));
      const kwLowerPre = keyword.toLowerCase();
      const tempWithKeyword = matchingPosts.filter((p: any) => (p.title || '').toLowerCase().includes(kwLowerPre));
      const tempSortedByScore = [...tempWithKeyword].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      
      // Deduplicate: combine recent20 + top20, removing duplicates
      const recent20Pre = tempSortedByTime.slice(0, 20);
      const top20Pre = tempSortedByScore.slice(0, 20);
      const seenIds = new Set(recent20Pre.map((p: any) => p.id || p.name));
      const uniqueTop = top20Pre.filter((p: any) => !seenIds.has(p.id || p.name));
      const postsForAnalysis = [...recent20Pre, ...uniqueTop];
      
      try {
        const analysisData = await analyzeWithTimeout(
          postsForAnalysis,
          [],
          30000 // 30 seconds
        );

        if (analysisData) {
          postSentiments = analysisData.postSentiments || [];
          
          // Attach sentiment to each post by index (AI returns in same order as sent)
          postsForAnalysis.forEach((post: any, idx: number) => {
            if (postSentiments[idx]) {
              post._sentiment = postSentiments[idx].sentiment;
              // Handle both string and object explanation formats
              const explanation = postSentiments[idx].explanation;
              // Store the full explanation object to preserve word_contributions, key_words, etc.
              post._sentimentExplanation = typeof explanation === 'string' 
                ? { reasoning: explanation } 
                : explanation;
            }
          });
          
          // Calculate chart data from sentiments
          if (postSentiments.length > 0) {
            const counts = { positive: 0, neutral: 0, negative: 0 };
            postSentiments.forEach((s: any) => {
              const label = (s.sentiment || 'neutral').toLowerCase();
              if (label in counts) counts[label as keyof typeof counts]++;
              else counts.neutral++;
            });
            const total = postSentiments.length;
            keywordSentimentData = [
              { name: 'Positive', value: Math.round((counts.positive / total) * 100) },
              { name: 'Neutral', value: Math.round((counts.neutral / total) * 100) },
              { name: 'Negative', value: Math.round((counts.negative / total) * 100) }
            ];
            
            sentimentBreakdown = {
              positive: counts.positive / total,
              neutral: counts.neutral / total,
              negative: counts.negative / total
            };
          }
        }
      } catch (sentimentErr) {
        console.error('Keyword sentiment analysis error:', sentimentErr);
      }

      const analysisResult = {
        keyword,
        totalMentions: matchingPosts.length,
        topSubreddits,
        wordCloud: wordCloudData,
        trendData: trendData.length > 0 ? trendData : [{ name: 'Recent', value: matchingPosts.length }],
        recent20Posts: recent20Pre,
        top20Posts: top20Pre,
        sentimentChartData: keywordSentimentData,
        sentimentBreakdown,
        postSentiments
      };

      setKeywordData(analysisResult);
      setTargetProgress(100);
      
      // Save Reddit content to database
      try {
        await saveRedditContentToDb(matchingPosts, [], 'keyword_analysis');
        console.log(`Keyword Analysis: Saved ${matchingPosts.length} Reddit posts for keyword "${keyword}"`);
      } catch (error: any) {
        console.error('Keyword Analysis: Failed to save Reddit content:', error);
        // Don't block the UI, just log the error
      }
      
      // Save to investigation context
      const analysisToSave = { ...analysisResult, analyzedAt: new Date().toISOString() };
      addKeywordAnalysis(analysisToSave);
      
      // Save to database if active case
      if (currentCase?.id) {
        try { await saveKeywordAnalysisToDb(analysisToSave); } catch (e) { console.error(e); }
      }

      toast({
        title: "Keyword Analysis Complete",
        description: `Found ${matchingPosts.length} mentions of "${keyword}"`,
      });

    } catch (err: any) {
      console.error('Error in keyword analysis:', err);
      setTargetProgress(0);
      toast({
        title: "Analysis Failed",
        description: err.message || 'Failed to analyze keyword',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommunityAnalysis = async (searchTerm?: string) => {
    const term = (searchTerm || subreddit).trim();
    if (!term) return;

    const cleanSubreddit = term.replace(/^r\//, '');
    const displayName = `r/${cleanSubreddit}`;

    // Check if community is already analyzed
    const existingAnalysis = savedCommunity.find(
      (item) => item.target?.toLowerCase() === displayName.toLowerCase() ||
                item.target?.toLowerCase() === cleanSubreddit.toLowerCase()
    );

    if (existingAnalysis) {
      toast({
        title: "Community Already Analyzed",
        description: `Loading existing analysis for ${displayName}`,
      });
      loadSavedAnalysis(existingAnalysis);
      return;
    }

    setSubreddit(term);
    setIsLoading(true);
    setLoadingProgress(0);
    setTargetProgress(0);
    setCommunityData(null);
    setSelectedCommunityView(null);

    try {
      setTargetProgress(35);

      const { data: redditData, error } = await supabase.functions.invoke('reddit-scraper', {
        body: { 
          subreddit: cleanSubreddit,
          type: 'community'
        }
      });

      if (error) throw error;

      if (redditData?.error === 'not_found') {
        toast({
          title: "Subreddit Not Found",
          description: redditData.message,
          variant: "destructive",
        });
        setTargetProgress(0);
        setIsLoading(false);
        return;
      }
      setTargetProgress(75);

      const subredditInfo = redditData.subreddit;
      const posts = redditData.posts || [];

      // Sort posts for different views first to determine which posts need sentiment analysis
      const allPostsSortedByTime = [...posts].sort((a: any, b: any) => (b.created_utc || 0) - (a.created_utc || 0));
      const allPostsSortedByScore = [...posts].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      
      // Get recent20 and top20 posts
      const recent20Posts = allPostsSortedByTime.slice(0, 20);
      const top20Posts = allPostsSortedByScore.slice(0, 20);
      
      // Create a deduplicated set of posts that will be displayed (union of recent20 + top20)
      const seenIds = new Set(recent20Posts.map((p: any) => p.id || p.name));
      const uniqueTopPosts = top20Posts.filter((p: any) => !seenIds.has(p.id || p.name));
      const postsForAnalysis = [...recent20Posts, ...uniqueTopPosts].slice(0, 40);
      
      let postSentiments: SentimentItem[] = [];
      
      try {
        const analysisData = await analyzeWithTimeout(
          postsForAnalysis,
          [],
          30000
        );

        if (analysisData) {
          postSentiments = analysisData.postSentiments || [];
          
          // Attach sentiment to each post by index
          postsForAnalysis.forEach((post: any, idx: number) => {
            if (postSentiments[idx]) {
              post._sentiment = postSentiments[idx].sentiment;
              // Handle both string and object explanation formats
              const explanation = postSentiments[idx].explanation;
              // Store the full explanation object to preserve word_contributions, key_words, etc.
              post._sentimentExplanation = typeof explanation === 'string' 
                ? { reasoning: explanation } 
                : explanation;
            }
          });
        }
      } catch (sentimentErr) {
        console.error('Sentiment analysis error:', sentimentErr);
      }

      // Generate word cloud from posts
      const textContent = posts.map((p: any) => `${p.title} ${p.selftext || ''}`).join(' ');
      const words = textContent.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const wordFreq: { [key: string]: number } = {};
      const stopWords = ['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'what', 'when', 'where', 'just', 'like', 'more', 'would', 'could', 'should', 'about', 'there', 'which', 'them', 'these', 'than', 'then', 'also', 'only'];
      words.forEach(word => {
        if (!stopWords.includes(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });

      const wordCloudData = Object.entries(wordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 60)
        .map(([word, freq]) => ({
          word,
          frequency: freq,
          category: freq > 20 ? 'high' as const : freq > 10 ? 'medium' as const : 'low' as const
        }));

      // Calculate top authors
      const authorCounts: { [key: string]: number } = {};
      posts.forEach((post: any) => {
        if (post.author && post.author !== '[deleted]') {
          authorCounts[post.author] = (authorCounts[post.author] || 0) + 1;
        }
      });

      const topAuthors = Object.entries(authorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([username, posts]) => ({ username: `u/${username}`, posts }));

      // Calculate activity by day of week with dates
      const now = new Date();
      const dayActivityMap: { [key: string]: { count: number; label: string } } = {};
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
        const formattedDate = `${dayName}, ${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
        dayActivityMap[dayKey] = { count: 0, label: formattedDate };
      }
      
      posts.forEach((post: any) => {
        const postDate = new Date(post.created_utc * 1000);
        const dayKey = postDate.toISOString().split('T')[0];
        if (dayActivityMap[dayKey]) {
          dayActivityMap[dayKey].count++;
        }
      });

      const activityData = Object.values(dayActivityMap).map(({ label, count }) => ({ name: label, value: count }));

      // Calculate engagement metrics
      const totalUpvotes = posts.reduce((sum: number, p: any) => sum + (p.score || 0), 0);
      const totalComments = posts.reduce((sum: number, p: any) => sum + (p.num_comments || 0), 0);

      // Note: recent20Posts and top20Posts are already computed above for sentiment analysis

      const analysisResult = {
        name: subredditInfo.display_name_prefixed || `r/${cleanSubreddit}`,
        displayName: subredditInfo.display_name || cleanSubreddit,
        subscribers: subredditInfo.subscribers || 0,
        activeUsers: subredditInfo.accounts_active || 0,
        description: subredditInfo.public_description || subredditInfo.description || 'No description available',
        created: new Date(subredditInfo.created_utc * 1000).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        iconImg: subredditInfo.icon_img || subredditInfo.community_icon?.split('?')[0] || '',
        bannerImg: subredditInfo.banner_background_image?.split('?')[0] || subredditInfo.banner_img || '',
        wordCloud: wordCloudData,
        topAuthors,
        activityData,
        recent20Posts,
        top20Posts,
        postSentiments,
        sentimentChartData: null as any,
        relatedSubreddits: (redditData.relatedSubreddits || []) as { name: string; subscribers?: number; description?: string }[],
        weeklyContributors: (() => {
          const sevenDaysAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
          const recentAuthors = new Set<string>();
          posts.forEach((p: any) => {
            if (p.created_utc >= sevenDaysAgo && p.author && p.author !== '[deleted]') {
              recentAuthors.add(p.author);
            }
          });
          return recentAuthors.size;
        })(),
        stats: {
          totalPosts: posts.length,
          totalUpvotes,
          totalComments,
          avgUpvotes: posts.length > 0 ? Math.round(totalUpvotes / posts.length) : 0
        }
      };

      // Calculate sentiment chart from attached sentiments
      const postsWithSentiment = recent20Posts.filter((p: any) => p._sentiment);
      if (postsWithSentiment.length > 0) {
        const counts = { positive: 0, neutral: 0, negative: 0 };
        postsWithSentiment.forEach((p: any) => {
          const label = (p._sentiment || 'neutral').toLowerCase() as keyof typeof counts;
          if (label in counts) counts[label]++;
          else counts.neutral++;
        });
        const total = postsWithSentiment.length;
        analysisResult.sentimentChartData = [
          { name: 'Positive', value: Math.round((counts.positive / total) * 100) },
          { name: 'Neutral', value: Math.round((counts.neutral / total) * 100) },
          { name: 'Negative', value: Math.round((counts.negative / total) * 100) }
        ];
      }

      setCommunityData(analysisResult);
      setTargetProgress(100);
      
      // Save to investigation context
      const analysisToSave = { ...analysisResult, analyzedAt: new Date().toISOString() };
      addCommunityAnalysis(analysisToSave);
      
      // Save to database if active case
      if (currentCase?.id) {
        try { await saveCommunityAnalysisToDb(analysisToSave); } catch (e) { console.error(e); }
      }

      toast({
        title: "Community Analysis Complete",
        description: `Successfully analyzed r/${cleanSubreddit}`,
      });

    } catch (err: any) {
      console.error('Error in community analysis:', err);
      setTargetProgress(0);
      toast({
        title: "Analysis Failed",
        description: err.message || 'Failed to analyze community',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigation state for prefilling community and setting active tab
  useEffect(() => {
    const state = location.state as any;
    if (state?.prefillCommunity) {
      setSubreddit(state.prefillCommunity);
      if (state?.activeTab) {
        setActiveTab(state.activeTab);
      }

      const cleanSubreddit = state.prefillCommunity.replace(/^r\//, '');
      const displayName = `r/${cleanSubreddit}`;

      // Check if viewOnly mode - load existing analysis without re-analyzing
      if (state?.viewOnly) {
        // Try to find existing analysis
        const existingAnalysis = savedCommunity.find(
          (item) => item.target?.toLowerCase() === displayName.toLowerCase() ||
                    item.target?.toLowerCase() === cleanSubreddit.toLowerCase()
        );

        if (existingAnalysis) {
          toast({
            title: "Community Already Analyzed",
            description: `Loading existing analysis for ${displayName}`,
          });
          loadSavedAnalysis(existingAnalysis);
          return;
        }
      }

      // Auto-trigger community analysis after state is set
      setTimeout(() => {
        handleCommunityAnalysis(state.prefillCommunity);
      }, 100);
    }
  }, [location.state, savedCommunity]);

  const handleLinkAnalysis = async () => {
    if (!username.trim()) return;

    const cleanUsername = username.replace(/^u\//, '');
    const displayName = `u/${cleanUsername}`;

    // Check if user is already analyzed
    const existingAnalysis = savedLink.find(
      (item) => item.target?.toLowerCase() === displayName.toLowerCase() ||
                item.target?.toLowerCase() === cleanUsername.toLowerCase()
    );

    if (existingAnalysis) {
      toast({
        title: "Profile Already Analyzed",
        description: `Loading existing analysis for ${displayName}`,
      });
      loadSavedAnalysis(existingAnalysis);
      return;
    }
    
    setIsLoading(true);
    setLoadingProgress(0);
    setTargetProgress(0);
    setLinkData(null);
    setVisibleCommunities(5);
    setSelectedCommunity(null);

    try {
      setTargetProgress(30);

      const { data: redditData, error } = await supabase.functions.invoke('reddit-scraper', {
        body: { 
          username: cleanUsername,
          type: 'user'
        }
      });

      if (error) throw error;

      if (redditData?.error === 'not_found') {
        toast({
          title: "User Not Found",
          description: redditData.message,
          variant: "destructive",
        });
        setTargetProgress(0);
        setIsLoading(false);
        return;
      }
      setTargetProgress(60);

      const posts = redditData.posts || [];
      const comments = redditData.comments || [];
      const allContent = [...posts, ...comments];

      // Analyze sentiment for posts and comments
      let postSentiments: any[] = [];
      let commentSentiments: any[] = [];
      try {
        const analysisData = await analyzeWithTimeout(
          posts.slice(0, 40).map((p: any) => ({ title: p.title || '', selftext: p.selftext || '', subreddit: p.subreddit || '' })),
          comments.slice(0, 40).map((c: any) => ({ body: c.body || '', subreddit: c.subreddit || '' })),
          30000
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

      // Calculate subreddit activity
      const subredditActivity: { [key: string]: { posts: number; comments: number; totalScore: number } } = {};
      
      posts.forEach((post: any) => {
        if (!subredditActivity[post.subreddit]) {
          subredditActivity[post.subreddit] = { posts: 0, comments: 0, totalScore: 0 };
        }
        subredditActivity[post.subreddit].posts++;
        subredditActivity[post.subreddit].totalScore += post.score || 0;
      });

      comments.forEach((comment: any) => {
        if (!subredditActivity[comment.subreddit]) {
          subredditActivity[comment.subreddit] = { posts: 0, comments: 0, totalScore: 0 };
        }
        subredditActivity[comment.subreddit].comments++;
        subredditActivity[comment.subreddit].totalScore += comment.score || 0;
      });

      // Sort by total activity
      const sortedSubreddits = Object.entries(subredditActivity)
        .map(([name, data]) => ({
          community: `r/${name}`,
          posts: data.posts,
          comments: data.comments,
          totalActivity: data.posts + data.comments,
          engagement: data.totalScore,
          activity: Math.min(100, Math.round((data.posts + data.comments) / allContent.length * 100 * 3))
        }))
        .sort((a, b) => b.totalActivity - a.totalActivity);

      // Community distribution for chart
      const communityDistribution = sortedSubreddits.slice(0, 8).map(s => ({
        name: s.community,
        value: s.totalActivity
      }));

      // Calculate relative activity percentage
      const maxAct = sortedSubreddits[0]?.totalActivity || 1;
      sortedSubreddits.forEach(s => {
        s.activity = Math.round((s.totalActivity / maxAct) * 100);
      });

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

      const analysisResult = {
        primaryUser: cleanUsername,
        totalKarma: (redditData.user?.link_karma || 0) + (redditData.user?.comment_karma || 0),
        posts,
        comments,
        userToCommunities: sortedSubreddits,
        communityDistribution,
        networkMetrics: {
          totalCommunities: Object.keys(subredditActivity).length,
          avgActivityScore: allContent.length > 0 
            ? Math.round(allContent.reduce((sum, item) => sum + (item.score || 0), 0) / allContent.length)
            : 0,
          totalPosts: posts.length,
          totalComments: comments.length
        },
        postSentiments,
        commentSentiments,
        activityHeatmap
      };

      setLinkData(analysisResult);
      setTargetProgress(100);
      
      // Save to investigation context
      const analysisToSave = { ...analysisResult, analyzedAt: new Date().toISOString() };
      addLinkAnalysis(analysisToSave);
      
      // Save to database if active case
      if (currentCase?.id) {
        try { await saveLinkAnalysisToDb(analysisToSave); } catch (e) { console.error(e); }
      }

      toast({
        title: "Link Analysis Complete",
        description: `Analyzed ${Object.keys(subredditActivity).length} community connections for u/${cleanUsername}`,
      });

    } catch (err: any) {
      console.error('Error in link analysis:', err);
      setTargetProgress(0);
      toast({
        title: "Analysis Failed",
        description: err.message || 'Failed to analyze user links',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 relative">
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-8 py-6">
            <LoadingSpinner text="Analyzing..." size="md" targetProgress={targetProgress} />
          </div>
        </div>
      )}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">Analysis Tools</h2>
        <p className="text-muted-foreground">Comprehensive analysis across different dimensions</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setKeywordData(null); setCommunityData(null); setLinkData(null); }} className="w-full">
        {/* Stylish Analysis Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {/* Keyword Analysis Card */}
          <button
            onClick={() => { setActiveTab('keyword'); setKeywordData(null); setCommunityData(null); setLinkData(null); }}
            className={`group relative overflow-hidden rounded-lg border-2 transition-all duration-300 ease-out
              ${activeTab === 'keyword'
                ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-md shadow-primary/20'
                : 'border-border/50 bg-card hover:border-primary/50 hover:shadow-sm hover:shadow-primary/10'
              }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative p-2 flex flex-col items-center text-center space-y-1">
              <div className={`p-1.5 rounded-md transition-all duration-300 ${activeTab === 'keyword' ? 'bg-primary/20 scale-105' : 'bg-muted group-hover:bg-primary/10'}`}>
                <TrendingUp className={`h-4 w-4 transition-colors duration-300 ${activeTab === 'keyword' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
              </div>
              <div>
                <h3 className={`font-semibold text-sm transition-colors duration-300 ${activeTab === 'keyword' ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
                  Keyword Analysis
                </h3>
              </div>
              {activeTab === 'keyword' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-primary/50 to-primary" />
              )}
            </div>
          </button>

          {/* Community Analysis Card */}
          <button
            onClick={() => { setActiveTab('community'); setKeywordData(null); setCommunityData(null); setLinkData(null); }}
            className={`group relative overflow-hidden rounded-lg border-2 transition-all duration-300 ease-out
              ${activeTab === 'community'
                ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-md shadow-primary/20'
                : 'border-border/50 bg-card hover:border-primary/50 hover:shadow-sm hover:shadow-primary/10'
              }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative p-2 flex flex-col items-center text-center space-y-1">
              <div className={`p-1.5 rounded-md transition-all duration-300 ${activeTab === 'community' ? 'bg-primary/20 scale-105' : 'bg-muted group-hover:bg-primary/10'}`}>
                <Users className={`h-4 w-4 transition-colors duration-300 ${activeTab === 'community' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
              </div>
              <div>
                <h3 className={`font-semibold text-sm transition-colors duration-300 ${activeTab === 'community' ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
                  Community Analysis
                </h3>
              </div>
              {activeTab === 'community' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-primary/50 to-primary" />
              )}
            </div>
          </button>

          {/* Link Analysis Card */}
          <button
            onClick={() => { setActiveTab('link'); setKeywordData(null); setCommunityData(null); setLinkData(null); }}
            className={`group relative overflow-hidden rounded-lg border-2 transition-all duration-300 ease-out
              ${activeTab === 'link'
                ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-md shadow-primary/20'
                : 'border-border/50 bg-card hover:border-primary/50 hover:shadow-sm hover:shadow-primary/10'
              }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative p-2 flex flex-col items-center text-center space-y-1">
              <div className={`p-1.5 rounded-md transition-all duration-300 ${activeTab === 'link' ? 'bg-primary/20 scale-105' : 'bg-muted group-hover:bg-primary/10'}`}>
                <Network className={`h-4 w-4 transition-colors duration-300 ${activeTab === 'link' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
              </div>
              <div>
                <h3 className={`font-semibold text-sm transition-colors duration-300 ${activeTab === 'link' ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
                  Link Analysis
                </h3>
              </div>
              {activeTab === 'link' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-primary/50 to-primary" />
              )}
            </div>
          </button>
        </div>

        {/* Keyword Analysis Tab - New Premium Design */}
        <TabsContent value="keyword" className="space-y-6">
          <KeywordAnalysisDashboard />
        </TabsContent>

        {/* Community Analysis Tab */}
        <TabsContent value="community" className="space-y-6">
          <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-forensic-accent" />
                Community Search
              </CardTitle>
              <CardDescription>
                Enter a subreddit name to analyze (e.g., "technology", "AskReddit")
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">r/</span>
                <Input
                  placeholder="subreddit name"
                  value={subreddit}
                  onChange={(e) => setSubreddit(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCommunityAnalysis()}
                  className="pl-8 pr-20"
                />
                {subreddit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-10 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSubreddit('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => handleCommunityAnalysis()}
                  disabled={isLoading || !subreddit.trim()}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {communityData && (
            <div className="space-y-6">
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => setCommunityData(null)}>
                <ArrowLeft className="h-4 w-4" />
                Back to Community Analysis Overview
              </Button>

              {/* KPI Metrics Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-primary/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="text-xl font-bold">{communityData.subscribers >= 1_000_000 ? (communityData.subscribers / 1_000_000).toFixed(1) + 'M' : communityData.subscribers >= 1_000 ? (communityData.subscribers / 1_000).toFixed(1) + 'K' : communityData.subscribers}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-primary/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Activity className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                       <p className="text-xs text-muted-foreground">Weekly Contributors</p>
                       <p className="text-xl font-bold">{communityData.weeklyContributors >= 1_000 ? (communityData.weeklyContributors / 1_000).toFixed(1) + 'K' : communityData.weeklyContributors}</p>
                    </div>
                  </CardContent>
                </Card>
                                <Card className="border-primary/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <TrendingUp className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Posts Collected</p>
                      <p className="text-xl font-bold">{communityData.stats.totalPosts}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Community Information */}
                <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)] overflow-hidden">
                  {communityData.bannerImg && (
                    <div className="relative h-24 w-full bg-muted">
                      <img 
                        src={communityData.bannerImg} 
                        alt={`${communityData.name} banner`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <CardHeader className="relative">
                    <div className={`flex items-start gap-4 ${communityData.bannerImg ? '' : ''}`}>
                      {/* Community Avatar */}
                      <div className={`shrink-0 ${communityData.bannerImg ? '-mt-10' : ''}`}>
                        <div className="w-16 h-16 rounded-full border-4 border-card bg-card shadow-lg overflow-hidden">
                          {communityData.iconImg ? (
                            <img 
                              src={communityData.iconImg} 
                              alt={`${communityData.name} icon`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full bg-primary/20 flex items-center justify-center"><span class="text-primary font-bold text-xl">r/</span></div>`;
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                              <Users className="h-6 w-6 text-primary" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <CardTitle className="flex items-center gap-2">
                          <a
                            href={`https://www.reddit.com/${communityData.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary transition-colors flex items-center gap-1.5 group"
                          >
                            {communityData.name}
                            <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </a>
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge variant="secondary">
                            {communityData.subscribers.toLocaleString()} members
                          </Badge>
                          {communityData.activeUsers > 0 && (
                            <Badge variant="outline">
                              {communityData.activeUsers.toLocaleString()} online
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Created: {communityData.created}
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {communityData.description}
                      </p>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-3 rounded-lg bg-primary/10 border border-primary/30">
                        <div className="font-bold text-primary">{communityData.stats.totalPosts}</div>
                        <p className="text-xs text-muted-foreground">Recent Posts</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-forensic-accent/10 border border-forensic-accent/30">
                        <div className="font-bold text-forensic-accent">{communityData.stats.avgUpvotes}</div>
                        <p className="text-xs text-muted-foreground">Avg Upvotes</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Authors */}
                <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-forensic-accent" />
                      Top Contributors
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Top Contributors Based on Recent 100 Posts</p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {communityData.topAuthors.length > 0 ? (
                      communityData.topAuthors.map((author: any, index: number) => {
                        const cleanUsername = author.username.replace(/^u\//, '');
                        return (
                          <div key={index} className="flex justify-between items-center p-3 rounded-lg bg-card border border-border group">
                            <a
                              href={`https://www.reddit.com/user/${cleanUsername}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              {author.username}
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{author.posts} posts</Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => navigate('/monitoring', { state: { prefillUser: cleanUsername } })}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Add to Monitoring
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate('/user-profiling', { state: { prefillUsername: cleanUsername } })}>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Add to User Profiling
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-muted-foreground text-center py-4">No author data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {communityData.recent20Posts && communityData.recent20Posts.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* LEFT SIDE - Unified Community Intelligence Feed (70%) */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* Unified Intelligence Feed */}
                    <Card className="border border-gray-200 shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Activity className="h-4 w-4 text-forensic-accent" />
                            Unified Intelligence Feed
                          </CardTitle>
                          
                          {/* POSTS FILTER DROPDOWN */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground uppercase tracking-wider">POSTS FILTER:</span>
                            <Select value={communityPostsFilter} onValueChange={(value: 'recent20' | 'top20') => setCommunityPostsFilter(value)}>
                              <SelectTrigger className="w-28 h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="recent20">Recent 20</SelectItem>
                                <SelectItem value="top20">Top 20</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {/* RECENT/TOP POSTS Label */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                            {communityPostsFilter === 'recent20' ? 'RECENT POSTS' : 'TOP POSTS'}
                          </span>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {(() => {
                              const currentPosts = communityPostsFilter === 'recent20'
                                ? communityData.recent20Posts || []
                                : communityData.top20Posts || [];
                              const filteredPosts = sentimentFilter === 'all'
                                ? currentPosts
                                : currentPosts.filter((p: any) => p._sentiment === sentimentFilter);
                              return filteredPosts.length;
                            })()}
                          </span>
                        </div>
                        <ScrollArea className="h-[520px] pr-4">
                          <div className="space-y-4">
                            {(() => {
                              const currentPosts = communityPostsFilter === 'recent20' 
                                ? communityData.recent20Posts || []
                                : communityData.top20Posts || [];

                              // Apply sentiment filter
                              const filteredPosts = sentimentFilter === 'all' 
                                ? currentPosts
                                : currentPosts.filter((post: any) => post._sentiment === sentimentFilter);

                              return filteredPosts.map((post: any, index: number) => {
                                const isExpanded = expandedEvidence.has(index);
                                const explanation = typeof post._sentimentExplanation === 'string' 
                                  ? { reasoning: post._sentimentExplanation } 
                                  : post._sentimentExplanation;
                                
                                // Get key words from explanation for the tag display
                                // word_contributions can be array [{word,contribution}] or object {word: score}
                                const keyWords: string[] = explanation?.key_words ||
                                  (explanation?.word_contributions
                                    ? Array.isArray(explanation.word_contributions)
                                      ? explanation.word_contributions.slice(0, 5).map((t: any) => t.word || '')
                                      : Object.keys(explanation.word_contributions as Record<string, number>).slice(0, 5)
                                    : []);
                                
                                return (
                                  <div key={index} className="p-4 border-b border-border last:border-b-0">
                                    {/* Post Header - Avatar, Username, Subreddit, Badge */}
                                    <div className="flex items-start gap-3">
                                      {/* Avatar */}
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                                        {post.author?.charAt(0).toUpperCase() || 'U'}
                                      </div>
                                      
                                      <div className="flex-1 min-w-0">
                                        {/* Username line */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-semibold text-sm">u/{post.author}</span>
                                          <span className="text-muted-foreground text-sm">in</span>
                                          <span className="font-medium text-sm text-foreground">r/{post.subreddit}</span>
                                          <Badge 
                                            variant={post._sentiment === 'positive' ? 'default' : post._sentiment === 'negative' ? 'destructive' : 'secondary'}
                                            className="text-xs ml-auto capitalize"
                                          >
                                            {post._sentiment || 'Not analyzed'}
                                          </Badge>
                                        </div>
                                        
                                        {/* Timestamp */}
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {(() => {
                                            const date = new Date(post.created_utc * 1000);
                                            const pktTime = date.toLocaleString('en-US', { 
                                              timeZone: 'Asia/Karachi',
                                              month: 'short', 
                                              day: 'numeric', 
                                              year: 'numeric',
                                              hour: '2-digit', 
                                              minute: '2-digit' 
                                            });
                                            const utcTime = date.toLocaleString('en-US', {
                                              timeZone: 'UTC',
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            });
                                            return `${pktTime.split(',')[0]} | ${pktTime.split(',')[1].trim()} PKT | ${utcTime} UTC`;
                                          })()}
                                        </div>
                                        
                                        {/* Post Title - Blue link style */}
                                        <h3 className="text-blue-400 hover:text-blue-300 cursor-pointer mt-2 text-sm font-medium">
                                          {post.title}
                                        </h3>
                                        
                                        {/* Key Word Tags */}
                                        {keyWords.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mt-2">
                                            {keyWords.slice(0, 6).map((word: string, i: number) => (
                                              <span 
                                                key={i} 
                                                className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded border border-border"
                                              >
                                                {word}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        
                                        {/* xAI Deep Analysis Section */}
                                          <div className="mt-3">
                                            <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
                                              {/* Header */}
                                              <div className="px-3 py-2 border-b border-border">
                                                <div className="text-xs font-semibold text-foreground">Sentiment analysis</div>
                                              </div>
                                              
                                              {/* Analysis Content */}
                                              <div className="px-3 py-3 space-y-3">
                                                {/* Sentiment Badge */}
                                                <div className="flex items-center justify-between">
                                                  <Badge 
                                                    variant={post._sentiment === 'positive' ? 'default' : post._sentiment === 'negative' ? 'destructive' : 'secondary'}
                                                    className="text-xs capitalize"
                                                  >
                                                    {post._sentiment || 'Not analyzed'}
                                                  </Badge>
                                                </div>

                                                {/* WORD SIGNALS Section - Only show when expanded */}
                                                {isExpanded && (() => {
                                                  // Use deep analysis data if available, otherwise fall back to regular explanation
                                                  const deepWC = deepAnalysisData[index]?.word_contributions;
                                                  const rawWC = deepWC?.length > 0 ? deepWC : explanation?.word_contributions;
                                                  const normalizedWC: { word: string; contribution: number }[] = rawWC
                                                    ? Array.isArray(rawWC)
                                                      ? rawWC.map((t: any) => ({ word: t.word || '', contribution: t.contribution ?? t.score ?? t.weight ?? t.value ?? 0 }))
                                                      : Object.entries(rawWC as Record<string, number>).map(([word, score]) => ({ word, contribution: score }))
                                                    : [];

                                                  const filteredTokens = normalizedWC.filter(t => Math.abs(t.contribution) >= 0.001);
                                                  const topTokens = filteredTokens.slice(0, 5);
                                                  const maxContribution = topTokens.length > 0 
                                                    ? Math.max(...topTokens.map(t => Math.abs(t.contribution)))
                                                    : 1;

                                                  const getBarColor = (contribution: number) => {
                                                    if (contribution > 0) return 'bg-green-500';
                                                    if (contribution < 0) return 'bg-red-500';
                                                    return 'bg-muted-foreground';
                                                  };

                                                  const getPullDirection = (contribution: number) => {
                                                    if (contribution > 0) return 'pull positive';
                                                    if (contribution < 0) return 'pull negative';
                                                    return 'neutral';
                                                  };

                                                  const getPullColor = (contribution: number) => {
                                                    if (contribution > 0) return 'text-green-600';
                                                    if (contribution < 0) return 'text-red-600';
                                                    return 'text-muted-foreground';
                                                  };

                                                  return (
                                                    <>
                                                      {topTokens.length > 0 && (
                                                        <div>
                                                          <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">WORD SIGNALS</div>
                                                          <div className="space-y-2">
                                                            {topTokens.map((token, i) => {
                                                              const score = token.contribution;
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

                                                      {/* Informational Note */}
                                                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                                                        This analysis identifies key words that influence the sentiment prediction.
                                                      </p>
                                                    </>
                                                  );
                                                })()}
                                                
                                                {/* Action Buttons */}
                                                <div className="flex items-center gap-2 pt-2 border-t border-border">
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-5 px-2 text-[10px] border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                                                    disabled={loadingDeepAnalysis[index]}
                                                    onClick={() => {
                                                      const newExpanded = new Set(expandedEvidence);
                                                      const isCurrentlyExpanded = newExpanded.has(index);
                                                      
                                                      if (isCurrentlyExpanded) {
                                                        newExpanded.delete(index);
                                                      } else {
                                                        newExpanded.add(index);
                                                        // Fetch deep analysis if not already loaded
                                                        const hasDeepData = deepAnalysisData[index]?.word_contributions?.length > 0;
                                                        const hasBasicData = explanation?.word_contributions?.length > 0;
                                                        if (!hasDeepData && !hasBasicData) {
                                                          fetchDeepAnalysis(index, `${post.title} ${post.selftext || ''}`);
                                                        }
                                                      }
                                                      setExpandedEvidence(newExpanded);
                                                    }}
                                                  >
                                                    {loadingDeepAnalysis[index] ? (
                                                      <>
                                                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        Analyzing...
                                                      </>
                                                    ) : isExpanded ? (
                                                      <>
                                                        <Eye className="h-2.5 w-2.5" />
                                                        Hide Details
                                                      </>
                                                    ) : (
                                                      <>
                                                        <BarChart3 className="h-2.5 w-2.5" />
                                                        Show Details
                                                      </>
                                                    )}
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 px-2 text-[10px] text-muted-foreground hover:bg-muted"
                                                    onClick={() => setPreviewPost(post)}
                                                  >
                                                    Show Original
                                                  </Button>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        
                                        {/* Post Footer with Reddit-style Voting */}
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                                          {/* Reddit-style Voting Bar */}
                                          <div className="flex items-center gap-1 bg-muted rounded-full px-2 py-1">
                                            <button 
                                              className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-orange-500 transition-colors"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 4l-8 8h16l-8-8z"/>
                                              </svg>
                                            </button>
                                            <span className="text-[11px] font-semibold text-foreground min-w-[1.5rem] text-center">
                                              {post.score >= 1000 ? (post.score / 1000).toFixed(1) + 'K' : post.score || 0}
                                            </span>
                                            <button 
                                              className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-blue-400 transition-colors"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 20l8-8H4l8 8z"/>
                                              </svg>
                                            </button>
                                          </div>
                                          
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300 gap-1.5"
                                            asChild
                                          >
                                            <a href={`https://www.reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer">
                                              <ExternalLink className="h-3.5 w-3.5" />
                                              Open on Reddit
                                            </a>
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    {/* Related Subreddits Network */}
                    {communityData.relatedSubreddits && communityData.relatedSubreddits.length > 0 && (
                      <Card className="border border-border overflow-hidden">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Network className="h-4 w-4 text-forensic-accent" />
                            Related Subreddits Network
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Drag nodes freely • Scroll to zoom • Double-click to analyze • Right-click for options
                          </p>
                        </CardHeader>
                        <CardContent className="p-4">
                          <div className="w-full" style={{ height: '450px' }}>
                            <RelatedSubredditsGraph
                              centerSubreddit={communityData.displayName || communityData.name?.replace('r/', '') || ''}
                              relatedSubreddits={communityData.relatedSubreddits}
                              onSubredditClick={(name: string) => {
                                handleCommunityAnalysis(name);
                              }}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* RIGHT SIDE - Analytics / Charts / Word Intelligence (30%) */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* Sentiment Analysis Card */}
                    <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)]">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="h-4 w-4 text-forensic-accent" />
                            Sentiment Distribution
                          </CardTitle>
                          {sentimentFilter !== 'all' && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Filtering by:</span>
                              <span className={sentimentFilter === 'positive' ? 'text-green-600 font-medium' : sentimentFilter === 'negative' ? 'text-red-600 font-medium' : 'text-gray-600 font-medium'}>
                                {sentimentFilter.charAt(0).toUpperCase() + sentimentFilter.slice(1)}
                              </span>
                              <button 
                                onClick={() => setSentimentFilter('all')}
                                className="text-blue-500 hover:text-blue-700 underline ml-1"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const currentPosts = communityPostsFilter === 'recent20' 
                            ? communityData.recent20Posts || []
                            : communityData.top20Posts || [];

                          const counts = { positive: 0, neutral: 0, negative: 0 };
                          currentPosts.forEach((post: any) => {
                            if (post._sentiment) {
                              const label = post._sentiment.toLowerCase() as keyof typeof counts;
                              if (label in counts) counts[label]++;
                              else counts.neutral++;
                            }
                          });

                          const total = currentPosts.length || 1;
                          const sentimentData = [
                            { name: 'Positive', value: Math.round((counts.positive / total) * 100), color: '#10b981', count: counts.positive },
                            { name: 'Neutral', value: Math.round((counts.neutral / total) * 100), color: '#9ca3af', count: counts.neutral },
                            { name: 'Negative', value: Math.round((counts.negative / total) * 100), color: '#ef4444', count: counts.negative },
                          ];

                          return (
                            <div className="space-y-3">
                              {/* Donut Chart */}
                              <div className="h-44">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={sentimentData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={45}
                                      outerRadius={70}
                                      dataKey="value"
                                      strokeWidth={3}
                                      stroke="#fff"
                                    >
                                      {sentimentData.map((entry, index) => (
                                        <Cell 
                                          key={`cell-${index}`} 
                                          fill={entry.color} 
                                          className="cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() => setSentimentFilter(sentimentFilter === entry.name.toLowerCase() ? 'all' : entry.name.toLowerCase() as any)}
                                        />
                                      ))}
                                    </Pie>
                                    <RechartsTooltip />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>

                              {/* POSTS Label */}
                              <div className="text-center text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                POSTS
                              </div>

                              {/* Clickable Legend */}
                              <div className="flex items-center justify-center gap-4 text-xs">
                                {sentimentData.map((item) => (
                                  <button
                                    key={item.name}
                                    onClick={() => setSentimentFilter(sentimentFilter === item.name.toLowerCase() ? 'all' : item.name.toLowerCase() as any)}
                                    className={`flex items-center gap-1.5 transition-opacity ${sentimentFilter !== 'all' && sentimentFilter !== item.name.toLowerCase() ? 'opacity-40' : 'hover:opacity-80'}`}
                                  >
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                    <span style={{ color: item.color }}>{item.name}</span>
                                  </button>
                                ))}
                              </div>

                              <div className="text-center text-xs text-muted-foreground mt-1">
                                Click a color to filter feed
                              </div>
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    {/* Keyword Intelligence Card */}
                    <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)]">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-forensic-accent" />
                          Keyword Intelligence
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const currentPosts = communityPostsFilter === 'recent20' 
                            ? communityData.recent20Posts || []
                            : communityData.top20Posts || [];

                          const filteredPosts = sentimentFilter === 'all' 
                            ? currentPosts
                            : currentPosts.filter((post: any) => post._sentiment === sentimentFilter);

                          // Build word frequency from filtered posts
                          const textContent = filteredPosts.map((p: any) => `${p.title} ${p.selftext || ''}`).join(' ');
                          const words = textContent.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
                          const wordFreq: { [key: string]: number } = {};
                          const stopWords = ['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'what', 'when', 'where', 'just', 'like', 'more', 'would', 'could', 'should', 'about', 'there', 'which', 'them', 'these', 'than', 'then', 'also', 'only'];
                          
                          words.forEach(word => {
                            if (!stopWords.includes(word)) {
                              wordFreq[word] = (wordFreq[word] || 0) + 1;
                            }
                          });

                          const topWords = Object.entries(wordFreq)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 10)
                            .map(([word, freq]) => ({ word, frequency: freq }));

                          const maxFreq = topWords[0]?.frequency || 1;

                          return (
                            <div className="space-y-2">
                              {topWords.map((item, index) => (
                                <div key={index} className="flex items-center gap-3">
                                  <span className="text-sm font-medium w-24 truncate">{item.word}</span>
                                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                                    <div 
                                      className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full flex items-center justify-end pr-2"
                                      style={{ width: `${(item.frequency / maxFreq) * 100}%` }}
                                    >
                                    </div>
                                  </div>
                                  <span className="text-xs font-semibold text-gray-600 w-6 text-right">{item.frequency}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          )}

          {!communityData && !isLoading && (
            <div className="space-y-4">
              {savedCommunity.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-muted-foreground">Previously Analyzed Communities</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Deduplicate communities - keep only most recent for each unique community */}
                    {(() => {
                      const seen = new Set<string>();
                      return savedCommunity.filter((item) => {
                        const target = item.target?.toLowerCase().replace(/^r\//, '');
                        if (seen.has(target)) return false;
                        seen.add(target);
                        return true;
                      });
                    })().map((item) => {
                      const rd = item.result_data as any;
                      const displayName = item.target?.startsWith('r/') ? item.target : `r/${item.target}`;
                      const subscribers = rd?.subscribers ?? 0;
                      const iconImg = rd?.iconImg || '';
                      return (
                        <Card key={item.id} className="overflow-hidden hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer group border-border">
                          <div className="relative bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 px-4 pt-4 pb-10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-white font-bold text-sm truncate">{displayName}</span>
                              <span className="flex items-center gap-1 text-white/90 text-[11px] font-semibold bg-white/20 rounded-full px-2 py-0.5 backdrop-blur-sm">
                                <Users className="h-3 w-3" />
                                {subscribers.toLocaleString()}
                              </span>
                            </div>
                            <p className="text-white/60 text-[10px]">{item.analyzed_at ? new Date(item.analyzed_at).toLocaleString() : ''}</p>
                          </div>
                          <div className="flex justify-center -mt-8 relative z-10">
                            <div className="w-16 h-16 rounded-full border-4 border-card bg-card shadow-lg overflow-hidden">
                              {iconImg ? (
                                <img src={iconImg} alt={displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).classList.remove('hidden'); }} />
                              ) : null}
                              <div className={`w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${iconImg ? 'hidden' : ''}`}>
                                <Users className="h-7 w-7 text-white" />
                              </div>
                            </div>
                          </div>
                          <CardContent className="pt-3 pb-3 text-center space-y-2">
                            <a href={`https://www.reddit.com/${displayName}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm hover:text-primary transition-colors flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {displayName}
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                            <p className="text-xs text-muted-foreground">{subscribers.toLocaleString()} subscribers</p>
                            <div className="flex gap-2 pt-1">
                              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => loadSavedAnalysis(item)}>
                                <Eye className="h-3 w-3 mr-1" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteSavedAnalysis(item.id, 'community'); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
              <Card className="border-dashed border-muted-foreground/30">
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Enter a subreddit name above to begin community analysis</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Link Analysis Tab - Premium UI */}
        <TabsContent value="link" className="space-y-6">
          <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-forensic-accent" />
                Link Analysis
              </CardTitle>
              <CardDescription>
                Enter a Reddit username to analyze cross-community connections (e.g., "spez", "u/spez")
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">u/</span>
                <Input
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLinkAnalysis()}
                  className="pl-8 pr-20"
                />
                {username && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-10 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setUsername('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => handleLinkAnalysis()}
                  disabled={isLoading || !username.trim()}
                >
                  <Search className="h-4 w-4" />
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

              {/* === MAIN GRID: 65/35 SPLIT === */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* === LEFT SIDE: Network Graph (65%) === */}
                <div className="lg:col-span-8">
                  <UserCommunityNetworkGraph
                    title="User to Community Network Graph"
                    primaryUserId="user1"
                    height={580}
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
                    onAnalyzeCommunity={(communityName) => {
                      const cleanName = communityName.replace(/^r\//, '');
                      setActiveTab('community');
                      handleCommunityAnalysis(cleanName);
                    }}
                  />
                  {selectedCommunity && (
                    <div className="mt-2 text-center">
                      <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200">
                        Filtering by: {selectedCommunity}
                        <button className="ml-2 text-blue-600 hover:text-blue-800" onClick={() => setSelectedCommunity(null)}>×</button>
                      </Badge>
                    </div>
                  )}
                </div>

                {/* === RIGHT SIDE: Analytics Cards (35%) === */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Community Distribution Donut Chart */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-2.5 border-b border-slate-100">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <BarChart3 className="h-4 w-4 text-blue-600" /> Community Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      {(linkData.communityDistribution || []).length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={linkData.communityDistribution}
                              cx="50%"
                              cy="45%"
                              innerRadius={35}
                              outerRadius={60}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, percent }) => `${name}`}
                              labelLine={{ stroke: '#94a3b8', strokeWidth: 0.5 }}
                              style={{ fontSize: '9px', fontWeight: 500 }}
                            >
                              {linkData.communityDistribution?.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'][index % 8]} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(value: any, name: any) => [`${value} posts`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">No distribution data</div>
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
                              className={`transition-colors ${selectedCommunity === item.community ? 'bg-blue-50 rounded-lg p-2 -mx-2' : ''}`}
                            >
                              <div className="flex items-center justify-between text-xs mb-1">
                                <a 
                                  href={`https://www.reddit.com/${item.community}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-slate-700 hover:text-blue-600 hover:underline transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {item.community}
                                </a>
                                <span className="text-slate-500 font-mono">{item.totalActivity}</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600" style={{ width: `${item.activity}%` }} />
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

                </div>
              </div>
            </>
          )}

          {!linkData && !isLoading && (
            <div className="space-y-4">
              {savedLink.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-muted-foreground">Previously Analyzed Links</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {savedLink.map((item) => {
                      const rd = item.result_data as any;
                      const displayName = item.target?.startsWith('u/') ? item.target : `u/${item.target}`;
                      const totalKarma = rd?.totalKarma ?? 0;
                      return (
                        <Card key={item.id} className="overflow-hidden hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 cursor-pointer group border-border">
                          <div className="relative bg-gradient-to-br from-orange-500 via-red-500 to-rose-600 px-4 pt-4 pb-10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-white font-bold text-sm truncate">{displayName}</span>
                              <span className="flex items-center gap-1 text-white/90 text-[11px] font-semibold bg-white/20 rounded-full px-2 py-0.5 backdrop-blur-sm">
                                <Network className="h-3 w-3" />
                                {totalKarma.toLocaleString()}
                              </span>
                            </div>
                            <p className="text-white/60 text-[10px]">{item.analyzed_at ? new Date(item.analyzed_at).toLocaleString() : ''}</p>
                          </div>
                          <div className="flex justify-center -mt-8 relative z-10">
                            <div className="w-16 h-16 rounded-full border-4 border-card bg-card shadow-lg flex items-center justify-center bg-gradient-to-br from-orange-500 via-red-500 to-rose-600">
                              <Network className="h-7 w-7 text-white" />
                            </div>
                          </div>
                          <CardContent className="pt-3 pb-3 text-center space-y-2">
                            <a href={`https://www.reddit.com/user/${item.target?.replace(/^u\//, '')}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm hover:text-primary transition-colors flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {displayName}
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                            <p className="text-xs text-muted-foreground">{totalKarma.toLocaleString()} karma</p>
                            <div className="flex gap-2 pt-1">
                              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => loadSavedAnalysis(item)}>
                                <Eye className="h-3 w-3 mr-1" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteSavedAnalysis(item.id, 'link'); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
              <Card className="border-dashed border-muted-foreground/30">
                <CardContent className="py-12 text-center">
                  <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Enter a username to analyze their community connections</p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Post Preview Dialog - like Monitoring */}
      <Dialog open={!!previewPost} onOpenChange={(open) => !open && setPreviewPost(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">
              📄 Post Preview
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1">
              <Badge variant="outline" className="text-xs">{previewPost?.subreddit}</Badge>
              <span className="text-xs">{previewPost?.timestamp}</span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-3 pr-4">
              <h3 className="font-semibold text-sm">{previewPost?.title}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>by u/{previewPost?.author}</span>
                <Badge variant="secondary" className="text-xs">▲ {previewPost?.score}</Badge>
              </div>
              {previewPost?.body ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewPost.body}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No additional content available.</p>
              )}
            </div>
          </ScrollArea>
          <div className="pt-3 border-t">
            <a href={previewPost?.url} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button className="w-full gap-2">
                <ExternalLink className="h-4 w-4" />
                View on Reddit
              </Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};

export default Analysis;