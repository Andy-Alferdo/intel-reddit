import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RankedProgressBarCard } from './RankedProgressBarCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, X, ExternalLink, Clock, TrendingUp, Users, BarChart3,
  MessageSquare, Brain, Activity, Hash, ArrowLeft, Target, Filter,
  Sparkles, Eye, Monitor, MoreVertical, User
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toZonedTime, format } from 'date-fns-tz';
import { useInvestigation } from '@/contexts/InvestigationContext';
import { useMonitoring } from '@/contexts/MonitoringContext';
import { useNavigate } from 'react-router-dom';
import { analyzeDeep } from '@/integrations/huggingface/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface SentimentItem {
  text: string;
  body?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

interface Post {
  id: string;
  title: string;
  selftext?: string;
  subreddit: string;
  author: string;
  created_utc: number;
  score: number;
  permalink: string;
  num_comments?: number;
  _sentiment?: 'positive' | 'negative' | 'neutral';
  _sentimentExplanation?: any;
}

interface KeywordData {
  keyword: string;
  totalMentions: number;
  topSubreddits: { name: string; mentions: number }[];
  wordCloud: { word: string; frequency: number; category: string }[];
  trendData: { name: string; value: number }[];
  recent20Posts: Post[];
  top20Posts: Post[];
  sentimentChartData: { name: string; value: number }[];
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  postSentiments: SentimentItem[];
}

// Format timestamp to display: Apr 18, 2026 | 08:42 PM PKT | 03:42 PM UTC
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

// xAI Deep Analysis Panel Component - matching new design
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
  // Get short explanation based on sentiment
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

  // Smart token filtering
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

  const getSentimentColor = (sent: string) => {
    switch (sent?.toLowerCase()) {
      case 'positive':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'negative':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getBarColor = (contribution: number) => {
    if (contribution > 0) return 'bg-green-500';
    if (contribution < 0) return 'bg-red-500';
    return 'bg-gray-400';
  };

  const getPullDirection = (contribution: number) => {
    if (contribution > 0) return 'pull positive';
    if (contribution < 0) return 'pull negative';
    return 'neutral';
  };

  const getPullColor = (contribution: number) => {
    if (contribution > 0) return 'text-green-600';
    if (contribution < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  const filteredTokens = filterTokens(contributions);
  const topTokens = filteredTokens.slice(0, 5);
  const displaySentiment = sentiment || 'neutral';
  const maxContribution = topTokens.length > 0 
    ? Math.max(...topTokens.map(t => Math.abs(t.contribution || t.score || t.weight || t.value || 0)))
    : 1;

  // Loading state
  if (isAnalyzing) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden mt-2">
        <div className="px-3 py-4 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Analyzing...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden mt-2">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs font-semibold text-foreground">Sentiment analysis</div>
      </div>

      {/* Content */}
      <div className="px-3 py-3 space-y-3">
        {/* Sentiment Badge and Confidence */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${getSentimentColor(displaySentiment)}`}>
            {displaySentiment.charAt(0).toUpperCase() + displaySentiment.slice(1)}
          </span>
        </div>

        {/* WORD SIGNALS Section */}
        {topTokens.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-gray-600 mb-2 uppercase tracking-wide">WORD SIGNALS</div>
            <div className="space-y-2">
              {topTokens.map((token, i) => {
                const score = token.contribution || token.score || token.weight || token.value || 0;
                const barWidth = maxContribution > 0 ? (Math.abs(score) / maxContribution) * 100 : 0;
                
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 w-16 truncate">{token.word}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
        <p className="text-[10px] text-gray-500 leading-relaxed">
          This analysis identifies key words that influence the sentiment prediction.
        </p>

        {/* Toggle Button */}
        <Button
          size="sm"
          variant="outline"
          className="h-5 px-2 text-[10px] border-blue-200 text-blue-700 hover:bg-blue-50"
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

// Premium Post Card Component with Deep Analysis
const PostCard = ({ 
  post, 
  deepAnalysisState, 
  onRequestDeepAnalysis,
  onToggleDeepAnalysis 
}: { 
  post: Post;
  deepAnalysisState?: { isAnalyzing: boolean; result: any; showDeep: boolean };
  onRequestDeepAnalysis: (text: string, postId: string) => void;
  onToggleDeepAnalysis: (postId: string) => void;
}) => {
  const [showBasicXAI, setShowBasicXAI] = useState(false);

  // Get contributions from deep analysis result
  const getContributions = () => {
    if (deepAnalysisState?.showDeep && deepAnalysisState.result) {
      return deepAnalysisState.result.deep_explanation?.word_contributions || 
             deepAnalysisState.result.shap_explanation?.word_contributions ||
             deepAnalysisState.result.word_contributions || [];
    }
    return [];
  };

  // Get explanation text
  const getExplanation = () => {
    if (deepAnalysisState?.result) {
      return deepAnalysisState.result.deep_explanation?.explanation ||
             deepAnalysisState.result.explanation ||
             deepAnalysisState.result.reasoning;
    }
    return typeof post._sentimentExplanation === 'string' 
      ? post._sentimentExplanation 
      : post._sentimentExplanation?.reasoning;
  };

  const hasDeepAnalysis = !!deepAnalysisState?.result;
  const isAnalyzing = deepAnalysisState?.isAnalyzing || false;
  const showDeep = deepAnalysisState?.showDeep || false;

  return (
    <div className="group relative rounded-lg border border-border bg-card p-3 hover:border-blue-400 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        {/* Reddit-style Voting Column */}
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button 
            className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-orange-500 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4l-8 8h16l-8-8z"/>
            </svg>
          </button>
          <span className="text-[11px] font-semibold text-slate-700 min-w-[2rem] text-center">
            {post.score >= 1000 ? (post.score / 1000).toFixed(1) + 'K' : post.score || 0}
          </span>
          <button 
            className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 20l8-8H4l8 8z"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <span className="font-medium text-blue-400 truncate">r/{post.subreddit}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-blue-300">u/{post.author}</span>
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sentimentTone(post._sentiment)}`}>
              {post._sentiment || 'neutral'}
            </Badge>
          </div>

          {/* Timestamp */}
          <div className="text-[10px] text-muted-foreground mb-1.5">
            {formatTimestamp(post.created_utc)}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1.5 group-hover:text-blue-400 transition-colors">
            {post.title}
          </h3>

          {/* Body Preview */}
          {post.selftext && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {post.selftext}
            </p>
          )}

          {/* xAI Deep Analysis Panel */}
          {(hasDeepAnalysis || showBasicXAI) && (
            <div className="mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <XAIDeepAnalysis
                sentiment={post._sentiment || 'neutral'}
                explanation={hasDeepAnalysis ? getExplanation() : (typeof post._sentimentExplanation === 'string' ? post._sentimentExplanation : post._sentimentExplanation?.reasoning)}
                contributions={getContributions()}
                isExpanded={showDeep}
                onToggleExpand={() => onToggleDeepAnalysis(post.id)}
                isAnalyzing={isAnalyzing}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              {/* XAI Button - requests deep analysis if not done yet */}
              <Button
                size="sm"
                variant={hasDeepAnalysis || showBasicXAI ? 'secondary' : 'ghost'}
                className={`h-6 px-2 text-[10px] ${hasDeepAnalysis || showBasicXAI ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasDeepAnalysis && !showBasicXAI) {
                    // First click - request deep analysis
                    const text = `${post.title} ${post.selftext || ''}`;
                    onRequestDeepAnalysis(text, post.id);
                    setShowBasicXAI(true);
                  } else if (hasDeepAnalysis && !showDeep) {
                    // Has deep analysis, toggle expand
                    onToggleDeepAnalysis(post.id);
                  } else {
                    // Hide the panel
                    setShowBasicXAI(false);
                    if (hasDeepAnalysis) {
                      onToggleDeepAnalysis(post.id);
                    }
                  }
                }}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <><div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-1" /> Analyzing...</>
                ) : (
                  <><Brain className="h-3 w-3 mr-1" /> {hasDeepAnalysis ? (showDeep ? 'Hide Details' : 'Show Details') : 'XAI'}</>
                )}
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://reddit.com${post.permalink}`, '_blank');
              }}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Reddit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Loading Skeleton for Post Cards
const PostCardSkeleton = () => (
  <div className="rounded-lg border border-border bg-card p-3">
    <div className="flex items-start gap-2.5">
      <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        <Skeleton className="h-2 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    </div>
  </div>
);

interface KeywordAnalysisDashboardProps {
  onBack?: () => void;
}

const KeywordAnalysisDashboard = ({ onBack }: KeywordAnalysisDashboardProps) => {
  const [keyword, setKeyword] = useState('');
  const [keywordData, setKeywordData] = useState<KeywordData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [targetProgress, setTargetProgress] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<'recent' | 'top'>('recent');
  const [activeSentiment, setActiveSentiment] = useState<'positive' | 'neutral' | 'negative' | 'all' | null>('all');
  const [savedKeywords, setSavedKeywords] = useState<any[]>([]);
  // Per-post deep analysis state - matching User Profiling
  const [deepAnalysisStates, setDeepAnalysisStates] = useState<Map<string, { isAnalyzing: boolean; result: any; showDeep: boolean }>>(new Map());
  const { toast } = useToast();
  const { addKeywordAnalysis, saveKeywordAnalysisToDb, saveRedditContentToDb, currentCase } = useInvestigation();
  const { targets } = useMonitoring();
  const navigate = useNavigate();

  // Request deep analysis for a post - matching User Profiling
  const handleDeepAnalysis = useCallback(async (text: string, postId: string) => {
    // Set analyzing state
    setDeepAnalysisStates(prev => new Map(prev.set(postId, { 
      isAnalyzing: true, 
      result: null, 
      showDeep: false 
    })));

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
      
      // Update state with result
      setDeepAnalysisStates(prev => new Map(prev.set(postId, { 
        isAnalyzing: false, 
        result, 
        showDeep: true 
      })));

      toast({
        title: "Deep Analysis Complete",
        description: "Advanced analysis has been performed on this text.",
      });
    } catch (error) {
      console.error('Deep analysis error:', error);
      
      // Reset state for this post on error
      setDeepAnalysisStates(prev => {
        const newMap = new Map(prev);
        newMap.delete(postId);
        return newMap;
      });
      
      toast({
        title: "Deep Analysis Failed",
        description: "Could not perform deep analysis. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Toggle deep analysis visibility
  const toggleDeepAnalysis = useCallback((postId: string) => {
    setDeepAnalysisStates(prev => {
      const current = prev.get(postId);
      if (current) {
        return new Map(prev.set(postId, { 
          ...current, 
          showDeep: !current.showDeep 
        }));
      }
      return prev;
    });
  }, []);

  // Fetch saved keyword analyses
  const fetchSavedKeywords = useCallback(async () => {
    if (!currentCase?.id) { setSavedKeywords([]); return; }
    try {
      const { data } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('case_id', currentCase.id)
        .eq('analysis_type', 'keyword')
        .order('analyzed_at', { ascending: false });
      
      if (data) {
        // Deduplicate by target field (keyword name), keeping only the most recent analysis
        const uniqueKeywords = new Map();
        data.forEach(item => {
          const keyword = item.target?.toLowerCase().trim();
          if (keyword && !uniqueKeywords.has(keyword)) {
            uniqueKeywords.set(keyword, item);
          }
        });
        setSavedKeywords(Array.from(uniqueKeywords.values()));
      }
    } catch (err) {
      console.error('Failed to fetch saved keywords:', err);
    }
  }, [currentCase?.id]);

  // Load saved keywords on mount
  useEffect(() => {
    fetchSavedKeywords();
  }, [fetchSavedKeywords]);

  // Load a saved keyword analysis
  const loadSavedKeyword = (item: any) => {
    const resultData = item.result_data as KeywordData;
    if (resultData) {
      setKeyword(item.target);
      setKeywordData(resultData);
    }
  };

  // Delete a saved keyword analysis
  const deleteSavedKeyword = async (id: string) => {
    try {
      const { error } = await supabase.from('analysis_results').delete().eq('id', id);
      if (error) throw error;
      setSavedKeywords(prev => prev.filter(i => i.id !== id));
      toast({ title: 'Analysis removed', description: 'Saved analysis has been deleted' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete analysis', variant: 'destructive' });
    }
  };

  // Get filtered posts based on selected filter and sentiment
  const filteredPosts = useMemo(() => {
    if (!keywordData) return [];

    let posts = selectedFilter === 'top' ? keywordData.top20Posts : keywordData.recent20Posts;
    if (!posts) posts = [];

    // Apply sentiment filter if active (and not 'all')
    if (activeSentiment && activeSentiment !== 'all') {
      posts = posts.filter((post: Post) => post._sentiment === activeSentiment);
    }

    return posts.slice(0, 20);
  }, [keywordData, selectedFilter, activeSentiment]);

  // Calculate sentiment distribution from all posts
  const sentimentData = useMemo(() => {
    if (!keywordData) return [];

    const allPosts = [...(keywordData.recent20Posts || []), ...(keywordData.top20Posts || [])];
    const uniquePosts = Array.from(new Map(allPosts.map(p => [p.id, p])).values());

    const counts = { positive: 0, neutral: 0, negative: 0 };
    uniquePosts.forEach((post: Post) => {
      const sentiment = post._sentiment || 'neutral';
      if (sentiment in counts) counts[sentiment as keyof typeof counts]++;
    });

    const total = uniquePosts.length || 1;
    return [
      { name: 'Positive', value: Math.round((counts.positive / total) * 100), color: SENT_COLORS.positive },
      { name: 'Neutral', value: Math.round((counts.neutral / total) * 100), color: SENT_COLORS.neutral },
      { name: 'Negative', value: Math.round((counts.negative / total) * 100), color: SENT_COLORS.negative }
    ];
  }, [keywordData]);

  // Get sentiment percentage
  const getSentimentPercentage = (sentiment: 'positive' | 'neutral' | 'negative') => {
    const item = sentimentData.find(d => d.name.toLowerCase() === sentiment);
    return item?.value || 0;
  };

  // Calculate top subreddits from filtered posts
  const topSubredditsData = useMemo(() => {
    if (!filteredPosts.length) return [];

    const subredditCounts: { [key: string]: number } = {};
    filteredPosts.forEach((post: Post) => {
      subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
    });

    return Object.entries(subredditCounts)
      .map(([name, mentions]) => ({ name: `r/${name}`, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5);
  }, [filteredPosts]);

  // Calculate keyword intelligence (top words from posts)
  const keywordIntelligence = useMemo(() => {
    if (!filteredPosts.length) return [];

    const textContent = filteredPosts.map((p: Post) => `${p.title} ${p.selftext || ''}`).join(' ');
    const words = textContent.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordFreq: { [key: string]: number } = {};
    const stopWords = ['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'what', 'when', 'where', 'just', 'like', 'more', 'would', 'could', 'should', 'about', 'there', 'which', 'them', 'these', 'than', 'then', 'also', 'only', 'they', 'their', 'them', 'than', 'then', 'after', 'before', 'being', 'having', 'were', 'been', 'being', 'have', 'has', 'had', 'does', 'did', 'doing', 'done'];
    const keywordLower = keyword.toLowerCase();

    words.forEach(word => {
      if (!stopWords.includes(word) && word !== keywordLower) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
  }, [filteredPosts, keyword]);

  // Calculate top users
  const topUsers = useMemo(() => {
    if (!filteredPosts.length) return [];

    const userCounts: { [key: string]: number } = {};
    filteredPosts.forEach((post: Post) => {
      if (post.author && post.author !== '[deleted]') {
        userCounts[post.author] = (userCounts[post.author] || 0) + 1;
      }
    });

    return Object.entries(userCounts)
      .map(([username, count]) => ({ username: `u/${username}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredPosts]);

  // Handle sentiment filter click
  const handleSentimentClick = (sentiment: 'positive' | 'neutral' | 'negative' | 'all') => {
    setActiveSentiment(activeSentiment === sentiment ? 'all' : sentiment);
  };

  // Check if user is already being monitored
  const isUserMonitored = (username: string) => {
    const cleanUsername = username.replace(/^u\//, '');
    return targets.some(target => 
      target.type === 'user' && 
      target.name.replace(/^u\//, '').toLowerCase() === cleanUsername.toLowerCase()
    );
  };

  // Handle "Add to Monitoring" action
  const handleAddToMonitoring = (username: string) => {
    const cleanUsername = username.replace(/^u\//, '');
    
    if (isUserMonitored(username)) {
      // Find existing target and navigate to it
      const existingTarget = targets.find(target => 
        target.type === 'user' && 
        target.name.replace(/^u\//, '').toLowerCase() === cleanUsername.toLowerCase()
      );
      
      if (existingTarget) {
        navigate('/monitoring', { 
          state: { 
            prefillUser: cleanUsername,
            selectTargetId: existingTarget.id 
          } 
        });
        toast({
          title: "User already monitored",
          description: `${username} is already being monitored. Navigating to existing card.`,
        });
      }
    } else {
      // Navigate to monitoring with prefill
      navigate('/monitoring', { 
        state: { prefillUser: cleanUsername } 
      });
    }
  };

  // Handle "Add to User Profiling" action
  const handleAddToUserProfiling = (username: string) => {
    const cleanUsername = username.replace(/^u\//, '');
    
    // Check if user is already profiled by checking the investigation context
    // Note: We'll use a simpler approach and let UserProfiling handle the existence check
    navigate('/user-profiling', { 
      state: { prefillUsername: cleanUsername } 
    });
  };

  // Handle keyword analysis
  const handleKeywordAnalysis = async () => {
    if (!keyword.trim()) return;

    setIsLoading(true);
    setTargetProgress(0);
    setKeywordData(null);
    setActiveSentiment(null);

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
      setTargetProgress(75);

      // Count subreddit mentions
      const subredditCounts: { [key: string]: number } = {};
      posts.forEach((post: any) => {
        subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
      });

      const topSubreddits = Object.entries(subredditCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, mentions]) => ({ name: `r/${name}`, mentions }));

      // Generate word cloud from matching posts
      const textContent = posts.map((p: any) => `${p.title} ${p.selftext || ''}`).join(' ');
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
        .sort(([, a], [, b]) => b - a)
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

      posts.forEach((post: any) => {
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

      // Sort posts by time and score
      const tempSortedByTime = [...posts].sort((a: any, b: any) => (b.created_utc || 0) - (a.created_utc || 0));
      const tempWithKeyword = posts.filter((p: any) => (p.title || '').toLowerCase().includes(keywordLower));
      const tempSortedByScore = [...tempWithKeyword].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

      // Deduplicate: combine recent20 + top20, removing duplicates
      const recent20Pre = tempSortedByTime.slice(0, 20);
      const top20Pre = tempSortedByScore.slice(0, 20);
      const seenIds = new Set(recent20Pre.map((p: any) => p.id || p.name));
      const uniqueTop = top20Pre.filter((p: any) => !seenIds.has(p.id || p.name));
      const postsForAnalysis = [...recent20Pre, ...uniqueTop];

      // Analyze sentiment for posts
      let keywordSentimentData = null;
      let sentimentBreakdown = null;
      let postSentiments: SentimentItem[] = [];

      try {
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-content', {
          body: {
            posts: postsForAnalysis.map((p: any) => ({ title: p.title || '', selftext: p.selftext || '', subreddit: p.subreddit || '' })),
            comments: []
          }
        });

        if (!analysisError && analysisData) {
          postSentiments = analysisData.postSentiments || [];

          // Attach sentiment to each post by index
          postsForAnalysis.forEach((post: any, idx: number) => {
            if (postSentiments[idx]) {
              post._sentiment = postSentiments[idx].sentiment;
              post._sentimentExplanation = typeof postSentiments[idx].explanation === 'string'
                ? { reasoning: postSentiments[idx].explanation }
                : postSentiments[idx].explanation;
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

      const analysisResult: KeywordData = {
        keyword,
        totalMentions: posts.length,
        topSubreddits,
        wordCloud: wordCloudData,
        trendData: trendData.length > 0 ? trendData : [{ name: 'Recent', value: posts.length }],
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
        await saveRedditContentToDb(posts, [], 'keyword_analysis');
        console.log(`Keyword Analysis: Saved ${posts.length} Reddit posts for keyword "${keyword}"`);
      } catch (error: any) {
        console.error('Keyword Analysis: Failed to save Reddit content:', error);
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
        description: `Found ${posts.length} mentions of "${keyword}"`,
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

  return (
    <div className="space-y-5">
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-8 py-6">
            <LoadingSpinner text="Analyzing keyword..." size="md" targetProgress={targetProgress} />
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Keyword Analysis</h2>
          <p className="text-muted-foreground text-sm">
            Track keywords across Reddit and analyze sentiment patterns
          </p>
        </div>
        {keywordData && (
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600" onClick={() => { setKeywordData(null); setKeyword(''); }}>
            <ArrowLeft className="h-4 w-4" /> Back to Search
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Input
                placeholder="Enter keyword to analyze (e.g. cybersecurity, AI, bitcoin)"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleKeywordAnalysis()}
                className="pr-10 h-10 border-border bg-background text-foreground"
              />
              {keyword && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setKeyword('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              onClick={handleKeywordAnalysis}
              disabled={isLoading || !keyword.trim()}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Search className="h-4 w-4 mr-1.5" /> Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {keywordData && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-border shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Hash className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{keywordData.totalMentions}</div>
                  <div className="text-xs text-muted-foreground">Total Mentions</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{getSentimentPercentage('positive')}%</div>
                  <div className="text-xs text-muted-foreground">Positive</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{getSentimentPercentage('neutral')}%</div>
                  <div className="text-xs text-muted-foreground">Neutral</div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{getSentimentPercentage('negative')}%</div>
                  <div className="text-xs text-muted-foreground">Negative</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* === MAIN GRID: 70/30 === */}
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
            {/* === LEFT: UNIFIED INTELLIGENCE FEED (70%) === */}
            <div className="lg:col-span-7">
              <Card className="border-border shadow-sm h-full">
                <CardHeader className="pb-3 border-b border-border">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Target className="h-4 w-4 text-blue-600" />
                      Unified Intelligence Feed
                      <Badge variant="outline" className="text-[10px] font-normal ml-2 bg-slate-50">
                        POSTS
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {/* Filter Dropdown */}
                      <Select value={selectedFilter} onValueChange={(v) => setSelectedFilter(v as 'recent' | 'top')}>
                        <SelectTrigger className="h-8 w-[130px] text-xs border-slate-200">
                          <Filter className="h-3 w-3 mr-1.5" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recent" className="text-xs">Recent 20 Posts</SelectItem>
                          <SelectItem value="top" className="text-xs">Top 20 Posts</SelectItem>
                        </SelectContent>
                      </Select>

                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <ScrollArea className="h-[700px]">
                    <div className="space-y-3">
                      {isLoading ? (
                        // Loading skeletons
                        Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />)
                      ) : filteredPosts.length > 0 ? (
                        filteredPosts.map((post: Post, index: number) => (
                          <PostCard 
                            key={post.id || index} 
                            post={post} 
                            deepAnalysisState={deepAnalysisStates.get(post.id || String(index))}
                            onRequestDeepAnalysis={handleDeepAnalysis}
                            onToggleDeepAnalysis={toggleDeepAnalysis}
                          />
                        ))
                      ) : (
                        <div className="text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-lg">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                          <p>No posts match the current filters</p>
                          {activeSentiment && activeSentiment !== 'all' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => setActiveSentiment('all')}
                            >
                              Clear Sentiment Filter
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* === RIGHT SIDEBAR (30%) === */}
            <div className="lg:col-span-3 space-y-5">
              {/* Top Subreddits Card */}
              <RankedProgressBarCard data={topSubredditsData} />

              {/* Sentiment Analysis Card */}
              <Card className="border-primary/20 border-forensic-accent/30 shadow-[0_0_20px_rgba(0,255,198,0.15)]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 text-forensic-accent" />
                      Sentiment Distribution
                    </CardTitle>
                    {activeSentiment && activeSentiment !== 'all' && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Filtering by:</span>
                        <span className={activeSentiment === 'positive' ? 'text-green-600 font-medium' : activeSentiment === 'negative' ? 'text-red-600 font-medium' : 'text-gray-600 font-medium'}>
                          {activeSentiment.charAt(0).toUpperCase() + activeSentiment.slice(1)}
                        </span>
                        <button 
                          onClick={() => handleSentimentClick('all')}
                          className="text-blue-500 hover:text-blue-700 underline ml-1"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Donut Chart */}
                    <div className="h-44">
                      {sentimentData.length > 0 ? (
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
                                  fill={entry.color || SENT_COLORS[entry.name.toLowerCase() as keyof typeof SENT_COLORS]} 
                                  className="cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => handleSentimentClick(activeSentiment === entry.name.toLowerCase() ? 'all' : entry.name.toLowerCase() as any)}
                                />
                              ))}
                            </Pie>
                            <RTooltip
                              contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                fontSize: '11px'
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                          <BarChart3 className="h-6 w-6" />
                          <span className="ml-2 text-xs">No sentiment data</span>
                        </div>
                      )}
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
                          onClick={() => handleSentimentClick(activeSentiment === item.name.toLowerCase() ? 'all' : item.name.toLowerCase() as any)}
                          className={`flex items-center gap-1.5 transition-opacity ${activeSentiment !== 'all' && activeSentiment !== item.name.toLowerCase() ? 'opacity-40' : 'hover:opacity-80'}`}
                        >
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color || SENT_COLORS[item.name.toLowerCase() as keyof typeof SENT_COLORS] }}></div>
                          <span style={{ color: item.color || SENT_COLORS[item.name.toLowerCase() as keyof typeof SENT_COLORS] }}>{item.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="text-center text-xs text-muted-foreground mt-1">
                      Click a color to filter feed
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* === SECOND ROW: FULL WIDTH === */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Keyword Intelligence */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2.5 border-b border-border">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-blue-600" /> Keyword Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {keywordIntelligence.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={keywordIntelligence}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                        <YAxis
                          dataKey="word"
                          type="category"
                          tick={{ fontSize: 11 }}
                          width={55}
                          stroke="#64748b"
                        />
                        <RTooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '11px'
                          }}
                          formatter={(value: any) => [`${value} occurrences`, 'Count']}
                        />
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-slate-400">
                    <span className="text-xs">No keyword intelligence data available</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Users Using Keyword */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2.5 border-b border-border">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-blue-600" /> Top Users Using Keyword
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {topUsers.length > 0 ? (
                  <div className="space-y-3">
                    {topUsers.map((user, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600 flex-shrink-0">
                            {index + 1}
                          </div>
                          <a
                            href={`https://www.reddit.com/user/${user.username.replace(/^u\//, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {user.username}
                          </a>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${(user.count / topUsers[0].count) * 100}%` }}
                            />
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {user.count}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToMonitoring(user.username);
                                }}
                                className="cursor-pointer"
                              >
                                <Monitor className="h-4 w-4 mr-2" />
                                Add to Monitoring
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToUserProfiling(user.username);
                                }}
                                className="cursor-pointer"
                              >
                                <User className="h-4 w-4 mr-2" />
                                Add to User Profiling
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-slate-400">
                    <span className="text-xs">No user data available</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Saved Keywords Section - shown when no keyword data */}
      {!keywordData && !isLoading && (
        <>
          {savedKeywords.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Previously Analyzed Keywords</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {savedKeywords.map((item) => {
                  const mentions = ((item.result_data as any)?.totalMentions ?? 0).toLocaleString();
                  return (
                    <Card
                      key={item.id}
                      className="group relative overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                      onClick={() => loadSavedKeyword(item)}
                    >
                      {/* Gradient header */}
                      <div className="relative bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 px-4 pt-4 pb-8">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white font-bold text-sm truncate">{item.target}</span>
                          <span className="flex items-center gap-1 text-white/90 text-[11px] font-semibold bg-white/20 rounded-full px-2 py-0.5 backdrop-blur-sm shrink-0">
                            <TrendingUp className="h-3 w-3" />
                            {mentions}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-white/70 bg-white/10 rounded-full px-2 py-0.5">
                          KEYWORD
                        </span>
                      </div>

                      {/* Avatar */}
                      <div className="flex justify-center -mt-6 relative z-10">
                        <div className="w-12 h-12 rounded-full border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                          <Hash className="h-5 w-5 text-white" />
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="px-4 pt-2 pb-3">
                        <div className="text-center p-2 rounded-lg bg-muted border border-border mb-2">
                          <p className="text-lg font-extrabold text-foreground leading-none">{mentions}</p>
                          <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">Mentions</p>
                        </div>
                        {item.analyzed_at && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            {new Date(item.analyzed_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex border-t border-border">
                        <Button variant="ghost" size="sm" className="flex-1 rounded-none text-xs h-9 hover:bg-slate-50"
                          onClick={(e) => { e.stopPropagation(); loadSavedKeyword(item); }}>
                          <Search className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                        <div className="w-px bg-slate-100" />
                        <Button variant="ghost" size="sm"
                          className="rounded-none text-xs h-9 px-3 text-slate-500 hover:text-red-600 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); deleteSavedKeyword(item.id); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {savedKeywords.length === 0 && (
            <Card className="border-dashed border-border bg-card/50">
              <CardContent className="py-12 text-center">
                <Hash className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">Enter a keyword to perform detailed analysis</p>
                <p className="text-muted-foreground/70 text-xs mt-1">Previous analyses will appear here</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default KeywordAnalysisDashboard;
