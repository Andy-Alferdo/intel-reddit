import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search, X, ExternalLink, Clock, TrendingUp, Users, BarChart3, 
  MessageSquare, Brain, Activity, Hash, Calendar, ArrowLeft
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toZonedTime, format } from 'date-fns-tz';
import { useInvestigation } from '@/contexts/InvestigationContext';
import { analyzeWithHuggingFace, SentimentItem as HFSentimentItem } from '@/integrations/huggingface/client';

interface SentimentItem {
  text: string;
  body?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

// Premium Post Card Component
const KeywordPostCard = ({ post, keyword }: { post: any; keyword: string }) => {
  const formatTimestamp = (utc?: number): string => {
    if (!utc) return '';
    const date = new Date(utc * 1000);
    const dateStr = format(date, 'MMM d, yyyy');
    const pktTime = format(toZonedTime(date, 'Asia/Karachi'), 'hh:mm a');
    const utcTime = format(toZonedTime(date, 'UTC'), 'hh:mm a');
    return `${dateStr} | ${pktTime} PKT | ${utcTime} UTC`;
  };

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

  return (
    <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
      <CardContent className="p-4">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">r/{post.subreddit}</span>
            </div>
            <span className="text-xs text-gray-500">•</span>
            <span className="text-sm text-gray-600">u/{post.author}</span>
          </div>
          <div className="flex items-center gap-2">
            {getSentimentBadge(post._sentiment)}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-500 mb-2">
          {formatTimestamp(post.created_utc)}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-gray-900 mb-2 leading-tight">
          {post.title}
        </h3>

        {/* Body Preview */}
        {post.selftext && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">
            {post.selftext}
          </p>
        )}

        {/* AI Summary */}
        {post._sentimentExplanation && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-900">AI Analysis</span>
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">
              {post._sentimentExplanation}
            </p>
          </div>
        )}

        {/* Reddit-style Voting Bar + Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-gray-100 rounded-full px-2 py-1">
            <button 
              className="p-0.5 rounded hover:bg-white text-gray-400 hover:text-orange-500 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l-8 8h16l-8-8z"/>
              </svg>
            </button>
            <span className="text-[11px] font-semibold text-gray-700 min-w-[1.5rem] text-center">
              {post.score >= 1000 ? (post.score / 1000).toFixed(1) + 'K' : post.score || 0}
            </span>
            <button 
              className="p-0.5 rounded hover:bg-white text-gray-400 hover:text-blue-500 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 20l8-8H4l8 8z"/>
              </svg>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 px-3"
              onClick={() => window.open(`https://reddit.com${post.permalink}`, '_blank')}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Reddit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-3 text-blue-600 hover:text-blue-700"
            >
              Show Detailed Evidence
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

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
  const { toast } = useToast();
  const { addKeywordAnalysis, addCommunityAnalysis, addLinkAnalysis, saveKeywordAnalysisToDb, saveCommunityAnalysisToDb, saveLinkAnalysisToDb, saveRedditContentToDb, currentCase } = useInvestigation();

  const [savedKeyword, setSavedKeyword] = useState<any[]>([]);
  const [savedCommunity, setSavedCommunity] = useState<any[]>([]);
  const [savedLink, setSavedLink] = useState<any[]>([]);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [selectedKeywordView, setSelectedKeywordView] = useState<'recent20' | 'top20'>('recent20');
  const [selectedCommunityView, setSelectedCommunityView] = useState<'recent20' | 'top20' | null>(null);
  const [selectedSubreddit, setSelectedSubreddit] = useState<string | null>(null);
  const [selectedSentiment, setSelectedSentiment] = useState<'positive' | 'neutral' | 'negative' | null>(null);

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

  // Helper functions for the new design
  const getFilteredPosts = () => {
    if (!keywordData) return [];
    
    let posts = selectedKeywordView === 'top20' ? keywordData.top20Posts : keywordData.recent20Posts;
    if (!posts) posts = [];
    
    // Filter by subreddit if selected
    if (selectedSubreddit) {
      posts = posts.filter((post: any) => post.subreddit === selectedSubreddit.replace('r/', ''));
    }
    
    // Filter by sentiment if selected
    if (selectedSentiment) {
      posts = posts.filter((post: any) => post._sentiment === selectedSentiment);
    }
    
    return posts;
  };

  const getFilteredSubreddits = () => {
    if (!keywordData?.topSubreddits) return [];
    
    const posts = getFilteredPosts();
    const subredditCounts: { [key: string]: number } = {};
    
    posts.forEach((post: any) => {
      subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
    });
    
    return Object.entries(subredditCounts)
      .map(([name, mentions]) => ({ name: `r/${name}`, mentions }))
      .sort(([,a], [,b]) => b - a);
  };

  const getTimelineData = () => {
    const posts = getFilteredPosts();
    const now = new Date();
    const timelineData: { time: string; mentions: number }[] = [];
    
    // Generate last 12 hours
    for (let i = 11; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const timeStr = hour.getHours().toString().padStart(2, '0') + ':00';
      
      const count = posts.filter((post: any) => {
        const postDate = new Date(post.created_utc * 1000);
        return postDate.getHours() === hour.getHours() && 
               postDate.getDate() === hour.getDate();
      }).length;
      
      timelineData.push({ time: timeStr, mentions: count });
    }
    
    return timelineData;
  };

  const getSentimentData = () => {
    const posts = getFilteredPosts();
    const counts = { positive: 0, neutral: 0, negative: 0 };
    
    posts.forEach((post: any) => {
      const sentiment = post._sentiment || 'neutral';
      if (sentiment in counts) counts[sentiment as keyof typeof counts]++;
    });
    
    const total = posts.length || 1;
    return [
      { name: 'Positive', value: Math.round((counts.positive / total) * 100) },
      { name: 'Neutral', value: Math.round((counts.neutral / total) * 100) },
      { name: 'Negative', value: Math.round((counts.negative / total) * 100) }
    ];
  };

  const getSentimentPercentage = (sentiment: 'positive' | 'neutral' | 'negative') => {
    const data = getSentimentData();
    const item = data.find(d => d.name.toLowerCase() === sentiment);
    return item?.value || 0;
  };

  const getKeywordCloud = () => {
    if (!keywordData?.wordCloud) return [];
    return keywordData.wordCloud;
  };

  const filterBySubreddit = (subredditName: string) => {
    setSelectedSubreddit(selectedSubreddit === subredditName ? null : subredditName);
    setSelectedSentiment(null);
  };

  const filterBySentiment = (sentiment: 'positive' | 'neutral' | 'negative') => {
    setSelectedSentiment(selectedSentiment === sentiment ? null : sentiment);
    setSelectedSubreddit(null);
  };

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

  // Format timestamp to display: Apr 18, 2026 | 08:42 PM PKT | 03:42 PM UTC
  const formatTimestamp = (utc?: number): string => {
    if (!utc) return '';
    const date = new Date(utc * 1000);
    const dateStr = format(date, 'MMM d, yyyy');
    const pktTime = format(toZonedTime(date, 'Asia/Karachi'), 'hh:mm a');
    const utcTime = format(toZonedTime(date, 'UTC'), 'hh:mm a');
    return `${dateStr} | ${pktTime} PKT | ${utcTime} UTC`;
  };

  const handleKeywordAnalysis = async () => {
    if (!keyword.trim()) return;
    
    setIsLoading(true);
    setLoadingProgress(0);
    setTargetProgress(0);
    setKeywordData(null);
    setSelectedKeywordView('recent20');
    setSelectedSubreddit(null);
    setSelectedSentiment(null);

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

      const posts = redditData.posts || [];
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
        const analysisData = await analyzeWithHuggingFace(
          postsForAnalysis.map((p: any) => ({ title: p.title || '', selftext: p.selftext || '', subreddit: p.subreddit || '' })),
          []
        );

        if (analysisData) {
          // Handle both old and new AI response structures
          if (analysisData.postSentiments && Array.isArray(analysisData.postSentiments)) {
            // Old structure: array of sentiment objects
            postSentiments = analysisData.postSentiments;
            
            // Attach sentiment to each post by index (AI returns in same order as sent)
            postsForAnalysis.forEach((post: any, idx: number) => {
              if (postSentiments[idx]) {
                post._sentiment = postSentiments[idx].sentiment;
                post._sentimentExplanation = postSentiments[idx].explanation || '';
              }
            });
          } else if (analysisData.key_words || analysisData.reasoning) {
            // New structure: single analysis object with key_words, reasoning, confidence, etc.
            // Convert to expected postSentiments format
            postSentiments = postsForAnalysis.map((post: any, idx: number) => ({
              text: post.title || '',
              body: post.selftext || '',
              sentiment: analysisData.confidence > 0.6 ? 'positive' : analysisData.confidence < 0.4 ? 'negative' : 'neutral',
              explanation: analysisData.reasoning || 'Analysis completed'
            }));
            
            // Attach sentiment to each post
            postsForAnalysis.forEach((post: any, idx: number) => {
              if (postSentiments[idx]) {
                post._sentiment = postSentiments[idx].sentiment;
                post._sentimentExplanation = postSentiments[idx].explanation || '';
              }
            });
          }
          
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

  // Placeholder functions for other analysis types
  const handleCommunityAnalysis = async () => {
    toast({ title: "Coming Soon", description: "Community analysis is being redesigned" });
  };

  const handleLinkAnalysis = async () => {
    toast({ title: "Coming Soon", description: "Link analysis is being redesigned" });
  };

  return (
    <div className="p-6 space-y-6 relative">
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-8 py-6">
            <LoadingSpinner text="Analyzing..." size="md" targetProgress={targetProgress} />
          </div>
        </div>
      )}

      {/* Premium Header Section */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Analysis Tools
        </h1>
        <p className="text-gray-600 text-sm">
          Comprehensive Reddit intelligence analysis platform
        </p>
      </div>

      {/* Analysis Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card 
          className={`cursor-pointer transition-all duration-200 ${
            activeTab === 'keyword' 
              ? 'border-blue-500 bg-blue-50 shadow-md' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('keyword')}
        >
          <CardContent className="p-4 text-center">
            <Hash className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Keyword Analysis</h3>
            <p className="text-sm text-gray-600 mt-1">Track keywords across Reddit</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all duration-200 ${
            activeTab === 'community' 
              ? 'border-blue-500 bg-blue-50 shadow-md' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('community')}
        >
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Community Analysis</h3>
            <p className="text-sm text-gray-600 mt-1">Analyze subreddit communities</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all duration-200 ${
            activeTab === 'link' 
              ? 'border-blue-500 bg-blue-50 shadow-md' 
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('link')}
        >
          <CardContent className="p-4 text-center">
            <Activity className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Link Analysis</h3>
            <p className="text-sm text-gray-600 mt-1">Map user connections</p>
          </CardContent>
        </Card>
      </div>

      {/* Keyword Analysis Tab */}
      {activeTab === 'keyword' && (
        <>
          {/* Search Section */}
          <div className="mb-8">
            <Card className="border-gray-200 shadow-sm max-w-2xl mx-auto">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Enter keyword to analyze (e.g. cocaine, AI, bitcoin)"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleKeywordAnalysis()}
                      className="pr-24 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                    />
                    {keyword && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-gray-600"
                        onClick={() => setKeyword('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Button
                    onClick={handleKeywordAnalysis}
                    disabled={isLoading || !keyword.trim()}
                    className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm hover:shadow-md transition-all"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid - Show when data available */}
          {keywordData && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT SIDE - Unified Keyword Intelligence Feed (70%) */}
              <div className="lg:col-span-8">
                <Card className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-bold text-gray-900">
                        Unified Keyword Intelligence Feed
                      </CardTitle>
                      <Select value={selectedKeywordView} onValueChange={(value: 'recent20' | 'top20') => setSelectedKeywordView(value)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent20">Recent 20</SelectItem>
                          <SelectItem value="top20">Top 20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-4">
                        {getFilteredPosts().map((post: any, index: number) => (
                          <KeywordPostCard key={index} post={post} keyword={keyword} />
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT SIDE - Analytics Cards (30%) */}
              <div className="lg:col-span-4 space-y-6">
                {/* Top Subreddits Card */}
                <Card className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Top Subreddits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {getFilteredSubreddits().slice(0, 8).map((sub: any, index: number) => (
                        <div 
                          key={index}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            selectedSubreddit === sub.name ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => filterBySubreddit(sub.name)}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              selectedSubreddit === sub.name ? 'bg-blue-500' : 'bg-blue-400'
                            }`}></div>
                            <span className="text-sm font-medium text-gray-900">{sub.name}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {sub.mentions} mentions
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Mentions Timeline Card */}
                <Card className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Mentions Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getTimelineData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis 
                            dataKey="time" 
                            tick={{ fontSize: 11 }}
                            stroke="#666"
                          />
                          <YAxis 
                            tick={{ fontSize: 11 }}
                            stroke="#666"
                          />
                          <RTooltip 
                            contentStyle={{ 
                              backgroundColor: 'white', 
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="mentions" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            dot={{ fill: '#3b82f6', r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Sentiment Analysis Card */}
                <Card className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Sentiment Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="h-48">
                      {getSentimentData().length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={getSentimentData()}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              <Cell fill="#10b981" cursor="pointer" onClick={() => filterBySentiment('positive')} />
                              <Cell fill="#6b7280" cursor="pointer" onClick={() => filterBySentiment('neutral')} />
                              <Cell fill="#ef4444" cursor="pointer" onClick={() => filterBySentiment('negative')} />
                            </Pie>
                            <RTooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                          <BarChart3 className="h-8 w-8" />
                          <span className="ml-2 text-sm">No sentiment data</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <div 
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedSentiment === 'positive' ? 'bg-green-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => filterBySentiment('positive')}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="text-sm text-gray-600">Positive</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {getSentimentPercentage('positive')}%
                        </span>
                      </div>
                      <div 
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedSentiment === 'neutral' ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => filterBySentiment('neutral')}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                          <span className="text-sm text-gray-600">Neutral</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {getSentimentPercentage('neutral')}%
                        </span>
                      </div>
                      <div 
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedSentiment === 'negative' ? 'bg-red-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => filterBySentiment('negative')}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span className="text-sm text-gray-600">Negative</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {getSentimentPercentage('negative')}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Keyword Cloud Card */}
                <Card className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      Related Terms / Keyword Cloud
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="h-48 flex flex-wrap gap-2 items-center justify-center">
                      {getKeywordCloud().slice(0, 20).map((term: any, index: number) => (
                        <span
                          key={index}
                          className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:scale-105 ${
                            term.frequency > 10 
                              ? 'bg-blue-100 text-blue-700 text-sm' 
                              : term.frequency > 5 
                              ? 'bg-gray-100 text-gray-700' 
                              : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          {term.word}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* Placeholder for other tabs */}
      {activeTab === 'community' && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <Users className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Community Analysis</h3>
            <p className="text-gray-600 mb-4">This feature is being redesigned with the new premium OSINT dashboard style.</p>
            <Button onClick={handleCommunityAnalysis}>Coming Soon</Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'link' && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <Activity className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Link Analysis</h3>
            <p className="text-gray-600 mb-4">This feature is being redesigned with the new premium OSINT dashboard style.</p>
            <Button onClick={handleLinkAnalysis}>Coming Soon</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Analysis;
