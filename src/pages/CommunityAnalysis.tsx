import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  Search, Users, Calendar, Shield, MessageSquare, Loader2, TrendingUp, 
  UserCheck, Activity, Eye, CheckCircle, BarChart3, Info, Hash, 
  ExternalLink, Brain, ChevronDown, Trash2, User, Globe, Share2, Network,
  ThumbsUp, Target, Zap, Clock, MoreVertical, UserPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { WordCloud } from '@/components/WordCloud';
import { AnalyticsChart } from '@/components/AnalyticsChart';
import { RelatedSubredditsGraph } from '@/components/RelatedSubredditsGraph';
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInvestigation } from "@/contexts/InvestigationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toZonedTime, format as formatTz } from "date-fns-tz";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { analyzeDeep, analyzeWithHuggingFace } from '@/integrations/huggingface/client';

interface SubredditData {
  display_name: string;
  title: string;
  public_description: string;
  subscribers: number;
  accounts_active: number;
  created_utc: number;
  over18: boolean;
  banner_img?: string;
  icon_img?: string;
  community_icon?: string;
}

interface RedditPost {
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  score: number;
  num_comments: number;
  permalink: string;
  subreddit: string;
  _sentiment?: 'positive' | 'negative' | 'neutral';
  _sentimentExplanation?: any;
}

interface RelatedSub {
  name: string;
  subscribers?: number;
  description?: string;
}

const CommunityAnalysis = () => {
  const { saveRedditContentToDb, communityAnalyses } = useInvestigation();
  const location = useLocation();
  const navigate = useNavigate();
  const [subreddit, setSubreddit] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [subredditData, setSubredditData] = useState<SubredditData | null>(null);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [relatedSubreddits, setRelatedSubreddits] = useState<RelatedSub[]>([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [previewPost, setPreviewPost] = useState<RedditPost | null>(null);
  
  // New states for standardized UI
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [communityPostsFilter, setCommunityPostsFilter] = useState<'recent20' | 'top20'>('recent20');
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);
  
  // Ref to store pending navigation actions
  const pendingNavRef = useRef<{ prefillCommunity: string; viewOnly?: boolean; autoAnalyze?: boolean } | null>(null);
  
  // Check if community is already analyzed
  const checkCommunityAnalysisExists = useCallback((name: string): boolean => {
    const cleanName = name.replace(/^r\//, '');
    return communityAnalyses.some(analysis => 
      analysis.name.toLowerCase() === cleanName.toLowerCase()
    );
  }, [communityAnalyses]);
  
  // Load saved analysis data
  const loadSavedAnalysis = useCallback((analysis: any) => {
    setSubreddit(analysis.name);
    setSubredditData({
      display_name: analysis.name,
      title: analysis.name,
      public_description: analysis.description || '',
      subscribers: analysis.subscribers || 0,
      accounts_active: analysis.activeUsers || 0,
      created_utc: new Date(analysis.created).getTime() / 1000 || Date.now() / 1000,
      over18: false,
      banner_img: analysis.bannerImg,
      icon_img: analysis.iconImg,
      community_icon: analysis.iconImg,
    });
    setPosts(analysis.recentPosts || analysis.allPosts || []);
    setRelatedSubreddits(analysis.relatedSubreddits || []);
    setActiveUsers(analysis.activeUsers || 0);
    setHasSearched(true);
    toast.success(`Loaded saved analysis for r/${analysis.name}`);
  }, []);
  
  // Handle navigation from Monitoring - capture intent
  useEffect(() => {
    const state = location.state as any;
    const prefillCommunity = state?.prefillCommunity as string | undefined;
    const viewOnly = state?.viewOnly as boolean | undefined;
    const autoAnalyze = state?.autoAnalyze as boolean | undefined;
    
    if (!prefillCommunity) return;
    
    setSubreddit(prefillCommunity);
    
    // Clear navigation state to prevent re-triggering
    window.history.replaceState({}, document.title);
    
    // Store for processing after handleSearch is available
    pendingNavRef.current = { prefillCommunity, viewOnly, autoAnalyze };
  }, [location.state]);
  
  // Process pending navigation
  useEffect(() => {
    if (!pendingNavRef.current) return;
    
    const { prefillCommunity, viewOnly, autoAnalyze } = pendingNavRef.current;
    pendingNavRef.current = null;
    
    // Case 1: View Only - Load existing analysis
    if (viewOnly) {
      const existing = communityAnalyses.find(
        a => a.name.toLowerCase() === prefillCommunity.toLowerCase()
      );
      if (existing) {
        loadSavedAnalysis(existing);
      } else {
        // Try to fetch from database
        (async () => {
          try {
            const { data, error } = await supabase
              .from('analysis_results')
              .select('*')
              .eq('analysis_type', 'community')
              .ilike('target', prefillCommunity)
              .order('analyzed_at', { ascending: false })
              .limit(1)
              .maybeSingle();
              
            if (error) throw error;
            if (data) {
              loadSavedAnalysis(data.result_data);
            } else {
              toast.error('No saved analysis found. Starting new analysis...');
              setTimeout(() => handleSearch(prefillCommunity), 100);
            }
          } catch (e: any) {
            toast.error('Error loading saved analysis');
            setTimeout(() => handleSearch(prefillCommunity), 100);
          }
        })();
      }
      return;
    }
    
    // Case 2: Auto Analyze
    if (autoAnalyze) {
      setTimeout(() => handleSearch(prefillCommunity), 100);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityAnalyses, loadSavedAnalysis]);

  // Derive weekly contributors from posts (unique authors in last 7 days)
  const weeklyContributors = useMemo(() => {
    const sevenDaysAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
    const recentAuthors = new Set<string>();
    posts.forEach(p => {
      if (p.created_utc >= sevenDaysAgo && p.author && p.author !== '[deleted]') {
        recentAuthors.add(p.author);
      }
    });
    return recentAuthors.size;
  }, [posts]);

  // Word cloud from post titles
  const communityWordCloud = useMemo(() => {
    if (posts.length === 0) return [];
    const freq: Record<string, number> = {};
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'with', 'by', 'from', 'it', 'this', 'that', 'i', 'you', 'we', 'they', 'my', 'your', 'just', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'about', 'been', 'so', 'if', 'be', 'as', 'what', 'how', 'why', 'who', 'when', 'where', 'no', 'all', 'its', 'get', 'got', 'me', 'like', 'up', 'out', 'more', 'one', 'new', 'also', 'than', 'now', 'am', 'some', 'any', 'over', 'after', 'into', 'our', 'their', 'there', 'here']);
    posts.forEach(p => {
      const words = (p.title + ' ' + (p.selftext || '')).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
      words.forEach(w => {
        if (w.length > 2 && !stopWords.has(w)) {
          freq[w] = (freq[w] || 0) + 1;
        }
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, frequency]) => ({
        word,
        frequency,
        category: (frequency > 10 ? 'high' : frequency > 5 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      }));
  }, [posts]);

  // Post frequency by day
  const postFrequencyData = useMemo(() => {
    if (posts.length === 0) return [];
    const today = new Date();
    const counts: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = subDays(today, i);
      counts[format(d, 'yyyy-MM-dd')] = 0;
    }
    posts.forEach(p => {
      const d = format(new Date(p.created_utc * 1000), 'yyyy-MM-dd');
      if (d in counts) counts[d]++;
    });
    return Object.entries(counts).map(([date, value]) => {
      const d = new Date(date);
      return { name: `${format(d, 'EEE')}, ${format(d, 'dd-MM-yyyy')}`, value };
    });
  }, [posts]);

  // Top contributors
  const topContributors = useMemo(() => {
    const authorMap: Record<string, { posts: number; totalScore: number }> = {};
    posts.forEach(p => {
      if (!p.author || p.author === '[deleted]') return;
      if (!authorMap[p.author]) authorMap[p.author] = { posts: 0, totalScore: 0 };
      authorMap[p.author].posts++;
      authorMap[p.author].totalScore += p.score;
    });
    return Object.entries(authorMap)
      .sort((a, b) => b[1].posts - a[1].posts)
      .slice(0, 10)
      .map(([author, data]) => ({ author, ...data }));
  }, [posts]);

  // Recent posts sorted by time
  const recentPosts = useMemo(() => {
    return [...posts].sort((a, b) => b.created_utc - a.created_utc).slice(0, 5);
  }, [posts]);

  // Top posts by score
  const topPosts = useMemo(() => {
    return [...posts].sort((a, b) => b.score - a.score).slice(0, 5);
  }, [posts]);

  const formatTzTimestamp = (utc?: number): string => {
    if (!utc) return '';
    const date = new Date(utc * 1000);
    const dateStr = format(date, 'MMM d, yyyy');
    const pktTime = formatTz(toZonedTime(date, 'Asia/Karachi'), 'hh:mm a');
    const utcTime = formatTz(toZonedTime(date, 'UTC'), 'hh:mm a');
    return `${dateStr} | ${pktTime} PKT | ${utcTime} UTC`;
  };

  const sentimentTone = (s?: string) => {
    if (s === 'positive') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'negative') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const getSentimentColor = (sent: string) => {
    switch (sent?.toLowerCase()) {
      case 'positive': return 'bg-green-100 text-green-700 border-green-300';
      case 'negative': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
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

  const filterTokens = (tokens: any[]) => {
    const stopWords = new Set(['is', 'in', 'the', 'a', 'an', 'we', 'this', 'that', 'has', 'are', 'was', 'were', 'been', 'have', 'had', 'do', 'does', 'did', 'but', 'or', 'and', 'for', 'to', 'of', 'with', 'by', 'at', 'on']);
    return (tokens || [])
      .filter(token => {
        const score = Math.abs(token.contribution || token.score || token.weight || token.value || 0);
        return !stopWords.has(token.word?.toLowerCase()) || score > 0.005;
      })
      .sort((a, b) => Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0));
  };

  const toggleEvidence = (index: number) => {
    setExpandedEvidence(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSearch = useCallback(async (searchTerm?: string) => {
    const term = (searchTerm || subreddit).trim().replace(/^r\//, '');
    if (!term) return;

    setSubreddit(term);
    setIsSearching(true);
    setHasSearched(false);
    setSentimentFilter('all');

    try {
      const { data, error } = await supabase.functions.invoke('reddit-scraper', {
        body: { type: 'community', subreddit: term },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.message || 'Failed to fetch subreddit data');
        setIsSearching(false);
        return;
      }

      const fetchedPosts = data.posts || [];
      setSubredditData(data.subreddit);
      setPosts(fetchedPosts);
      setRelatedSubreddits(data.relatedSubreddits || []);
      setActiveUsers(data.activeUsers || data.weeklyVisitors || 0);
      setHasSearched(true);
      
      // Perform sentiment analysis on posts
      if (fetchedPosts.length > 0) {
        setIsAnalyzingSentiment(true);
        try {
          const analyzed = await Promise.all(fetchedPosts.slice(0, 20).map(async (p: any) => {
            try {
              const res = await analyzeDeep(p.title + ' ' + (p.selftext || ''));
              return { 
                ...p, 
                _sentiment: res.sentiment.toLowerCase(),
                _sentimentExplanation: res.explanation || res
              };
            } catch {
              return { ...p, _sentiment: 'neutral' };
            }
          }));
          setPosts(prev => {
            const updated = [...prev];
            analyzed.forEach((ap, i) => {
              updated[i] = ap;
            });
            return updated;
          });
        } catch (err) {
          console.error('Sentiment analysis failed:', err);
        } finally {
          setIsAnalyzingSentiment(false);
        }
      }

      // Save Reddit content to database
      try {
        await saveRedditContentToDb(data.posts || [], data.comments || [], 'community_analysis');
      } catch (error: any) {
        console.error('Community Analysis: Failed to save Reddit content:', error);
      }
    } catch (err: any) {
      console.error('Community analysis error:', err);
      toast.error('Failed to analyze community. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [subreddit, saveRedditContentToDb]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleSubredditClick = (name: string) => {
    handleSearch(name);
  };

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  };

  const formatTimestamp = (utc: number) => {
    const diff = Date.now() / 1000 - utc;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="min-h-screen bg-background p-6 relative">
      {isSearching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-8 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Analyzing community...</p>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-primary">Community Analysis</h1>
          <p className="text-muted-foreground">
            Analyze Reddit communities for forensic investigation
          </p>
        </div>

        {/* Search */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Community Analysis
            </CardTitle>
            <CardDescription>
              Enter a subreddit name to analyze (e.g., "technology", "AskReddit")
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">r/</span>
                <Input
                  placeholder="subreddit name"
                  value={subreddit}
                  onChange={(e) => setSubreddit(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-8"
                />
              </div>
              <Button onClick={() => handleSearch()} disabled={isSearching || !subreddit.trim()} className="px-6">
                <Search className="h-4 w-4 mr-2" />
                {isSearching ? "Analyzing..." : "Analyze"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {hasSearched && subredditData && (
          <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-primary/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Members</p>
                    <p className="text-xl font-bold">{formatNumber(subredditData.subscribers)}</p>
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
                     <p className="text-xl font-bold">{weeklyContributors}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/10">
                    <UserCheck className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Top Contributors</p>
                    <p className="text-xl font-bold">{topContributors.length}</p>
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
                    <p className="text-xl font-bold">{posts.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Community Info + Intelligence Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-6">
                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Community Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-lg">r/{subredditData.display_name}</h3>
                      {subredditData.title && (
                        <p className="text-sm text-muted-foreground">{subredditData.title}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">{formatNumber(subredditData.subscribers)} members</Badge>
                        {subredditData.over18 && <Badge variant="destructive">NSFW</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Created: {format(new Date(subredditData.created_utc * 1000), 'MMMM d, yyyy')}
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-sm text-muted-foreground line-clamp-4">
                        {subredditData.public_description || 'No description available.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Sentiment Distribution Chart */}
                <Card className="border-primary/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Sentiment Distribution
                      </CardTitle>
                      {sentimentFilter !== 'all' && (
                        <button 
                          onClick={() => setSentimentFilter('all')}
                          className="text-[10px] text-blue-500 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isAnalyzingSentiment ? (
                      <div className="h-40 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <p className="text-[10px] text-muted-foreground">Analyzing sentiments...</p>
                      </div>
                    ) : (
                      (() => {
                        const counts = { positive: 0, neutral: 0, negative: 0 };
                        posts.slice(0, 20).forEach((post: any) => {
                          if (post._sentiment) {
                            counts[post._sentiment as keyof typeof counts]++;
                          }
                        });

                        const total = posts.slice(0, 20).filter(p => p._sentiment).length || 1;
                        const sentimentData = [
                          { name: 'Positive', value: Math.round((counts.positive / total) * 100), color: '#10b981' },
                          { name: 'Neutral', value: Math.round((counts.neutral / total) * 100), color: '#9ca3af' },
                          { name: 'Negative', value: Math.round((counts.negative / total) * 100), color: '#ef4444' },
                        ].filter(d => d.value > 0);

                        if (sentimentData.length === 0) {
                          return <div className="h-40 flex items-center justify-center text-[10px] text-muted-foreground">No sentiment data available</div>;
                        }

                        return (
                          <div className="space-y-4">
                            <div className="h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={sentimentData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={35}
                                    outerRadius={55}
                                    dataKey="value"
                                  >
                                    {sentimentData.map((entry, index) => (
                                      <Cell 
                                        key={`cell-${index}`} 
                                        fill={entry.color} 
                                        className="cursor-pointer hover:opacity-80 transition-opacity"
                                        stroke={sentimentFilter === entry.name.toLowerCase() ? '#1e40af' : 'none'}
                                        strokeWidth={2}
                                        onClick={() => setSentimentFilter(sentimentFilter === entry.name.toLowerCase() ? 'all' : entry.name.toLowerCase() as any)}
                                      />
                                    ))}
                                  </Pie>
                                  <RTooltip formatter={(v: any) => `${v}%`} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex justify-center gap-3 text-[10px] font-medium">
                              {sentimentData.map((d) => (
                                <div key={d.name} className="flex items-center gap-1 cursor-pointer" onClick={() => setSentimentFilter(d.name.toLowerCase() as any)}>
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                                  <span className={sentimentFilter === d.name.toLowerCase() ? 'text-primary font-bold' : 'text-slate-600'}>{d.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>

                {/* Word Cloud Card */}
                <Card className="border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Trending Topics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <WordCloud data={communityWordCloud} height={200} />
                  </CardContent>
                </Card>
              </div>

              {/* Intelligence Feed (80%) */}
              <div className="lg:col-span-8 space-y-6">
                <Card className="border-primary/20 shadow-[0_0_20px_rgba(59,130,246,0.05)]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4 text-primary" />
                        Community Intelligence Feed
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">FEED:</span>
                          <Badge 
                            variant={communityPostsFilter === 'recent20' ? 'default' : 'outline'} 
                            className="cursor-pointer text-[10px] h-6" 
                            onClick={() => setCommunityPostsFilter('recent20')}
                          >
                            Recent
                          </Badge>
                          <Badge 
                            variant={communityPostsFilter === 'top20' ? 'default' : 'outline'} 
                            className="cursor-pointer text-[10px] h-6" 
                            onClick={() => setCommunityPostsFilter('top20')}
                          >
                            Top
                          </Badge>
                        </div>
                        {sentimentFilter !== 'all' && (
                          <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600 border-blue-100 flex items-center gap-1 h-6">
                            Filtered: {sentimentFilter}
                            <button onClick={() => setSentimentFilter('all')}>×</button>
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[750px]">
                      <div className="divide-y divide-border/50">
                        {(() => {
                          const sorted = [...posts].sort((a, b) => {
                            if (communityPostsFilter === 'top20') return b.score - a.score;
                            return b.created_utc - a.created_utc;
                          }).slice(0, 20);

                          const filtered = sentimentFilter === 'all' 
                            ? sorted 
                            : sorted.filter(p => p._sentiment === sentimentFilter);

                          if (filtered.length === 0) {
                            return (
                              <div className="p-20 text-center text-muted-foreground">
                                <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">No posts match the "{sentimentFilter}" filter in the {communityPostsFilter === 'recent20' ? 'Recent' : 'Top'} feed.</p>
                                <Button variant="link" size="sm" onClick={() => setSentimentFilter('all')} className="mt-2">
                                  Clear Filter
                                </Button>
                              </div>
                            );
                          }

                          return filtered.map((post, index) => {
                            const isExpanded = expandedEvidence.has(index);
                            const explanation = post._sentimentExplanation;
                            const tokens = filterTokens(explanation?.word_contributions || explanation?.tokens || []);

                            return (
                              <div key={index} className="p-5 hover:bg-muted/30 transition-all border-l-4 border-l-transparent hover:border-l-primary/30">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0 border border-primary/20 shadow-sm">
                                    {post.author.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <span className="font-bold text-sm hover:text-primary transition-colors cursor-pointer">u/{post.author}</span>
                                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> {formatTimestamp(post.created_utc)}
                                      </span>
                                      {post._sentiment && (
                                        <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0 ml-auto border shadow-sm ${sentimentTone(post._sentiment)}`}>
                                          {post._sentiment.toUpperCase()}
                                        </Badge>
                                      )}
                                    </div>
                                    <h4 
                                      className="font-bold text-base leading-tight cursor-pointer hover:text-primary transition-colors mb-2 line-clamp-2"
                                      onClick={() => setPreviewPost(post)}
                                    >
                                      {post.title}
                                    </h4>
                                    {post.selftext && (
                                      <p className="text-sm text-slate-600 line-clamp-3 mb-3 leading-relaxed bg-slate-50/30 p-2 rounded border border-slate-100/50">
                                        {post.selftext}
                                      </p>
                                    )}

                                    {/* Intelligence Analysis Block */}
                                    {post._sentiment && (
                                      <div className="mb-4 bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm group">
                                        <div className="px-3 py-2 bg-muted/30 border-b border-border/60 flex items-center justify-between">
                                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <Brain className="h-3.5 w-3.5 text-primary" /> Forensic Analysis
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10"
                                            onClick={() => toggleEvidence(index)}
                                          >
                                            {isExpanded ? (
                                              <><ChevronDown className="h-3 w-3 mr-1 rotate-180 transition-transform" /> Hide Details</>
                                            ) : (
                                              <><ChevronDown className="h-3 w-3 mr-1 transition-transform" /> Show Details</>
                                            )}
                                          </Button>
                                        </div>
                                        {isExpanded && (
                                          <div className="p-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-300">
                                            {tokens.length > 0 && (
                                              <div>
                                                <div className="text-[9px] font-black text-slate-400 mb-3 uppercase tracking-tighter">Emotional Markers</div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                  {tokens.slice(0, 6).map((token: any, i: number) => {
                                                    const score = token.contribution || token.score || 0;
                                                    const absScore = Math.abs(score);
                                                    const maxScore = Math.max(...tokens.map((t: any) => Math.abs(t.contribution || t.score || 0.1)));
                                                    const width = (absScore / maxScore) * 100;
                                                    return (
                                                      <div key={i} className="flex items-center gap-2 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100">
                                                        <span className="text-[11px] font-bold w-20 truncate text-slate-700">{token.word}</span>
                                                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                          <div className={`h-full ${getBarColor(score)} transition-all duration-500`} style={{ width: `${width}%` }} />
                                                        </div>
                                                        <span className={`text-[10px] font-black min-w-[32px] text-right ${getPullColor(score)}`}>
                                                          {score > 0 ? '+POS' : '-NEG'}
                                                        </span>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                            <div className="bg-blue-50/30 p-3 rounded-lg border border-blue-100/50">
                                              <p className="text-xs text-slate-600 leading-relaxed italic">
                                                "{explanation?.reasoning || 'AI-detected sentiment markers indicate a consistent tone throughout the content, reflecting specific user intent and behavioral patterns.'}"
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="flex items-center gap-5">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100/50 px-2 py-1 rounded-full">
                                        <ThumbsUp className="h-3.5 w-3.5 text-orange-500" /> {post.score.toLocaleString()}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100/50 px-2 py-1 rounded-full">
                                        <MessageSquare className="h-3.5 w-3.5 text-blue-500" /> {post.num_comments.toLocaleString()}
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 ml-auto h-7 px-2"
                                        asChild
                                      >
                                        <a href={`https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                          REDDIT LINK <ExternalLink className="h-3 w-3 ml-1" />
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

                {/* Second Row KPIs and related subreddits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-primary/20 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <UserCheck className="h-4 w-4 text-primary" />
                        Top Contributors
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border/50">
                        {topContributors.map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-3.5 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-slate-400 w-4">{i+1}</span>
                              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                {c.author.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-bold text-slate-700">u/{c.author}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] font-bold bg-slate-100 text-slate-600">{c.posts} posts</Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => navigate('/user-profiling', { state: { prefillUsername: c.author } })}>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Analyze User
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/20 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <Network className="h-4 w-4 text-primary" />
                        Related Network
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 flex flex-col items-center justify-center min-h-[250px]">
                       {relatedSubreddits.length > 0 ? (
                         <div className="w-full text-center">
                            <div className="p-4 bg-primary/5 rounded-2xl mb-5 border border-primary/10">
                              <p className="text-3xl font-black text-primary mb-1">{relatedSubreddits.length}</p>
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Network Associations</p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2 max-h-[120px] overflow-hidden">
                              {relatedSubreddits.slice(0, 12).map((sub, i) => (
                                <Badge 
                                  key={i} 
                                  variant="outline" 
                                  className="cursor-pointer hover:bg-primary hover:text-white transition-all text-[10px] font-bold py-1"
                                  onClick={() => handleSubredditClick(sub.name)}
                                >
                                  r/{sub.name}
                                </Badge>
                              ))}
                              {relatedSubreddits.length > 12 && <span className="text-[10px] text-muted-foreground font-bold">+{relatedSubreddits.length - 12} more</span>}
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-6 text-primary text-[10px] font-black border-primary/30 hover:bg-primary/5 rounded-full px-6" 
                              onClick={() => {
                                const el = document.getElementById('network-graph-section');
                                el?.scrollIntoView({ behavior: 'smooth' });
                              }}
                            >
                              EXPLORE INTERACTIVE NETWORK
                            </Button>
                         </div>
                       ) : (
                         <div className="text-center opacity-40">
                           <Network className="h-10 w-10 mx-auto mb-3" />
                           <p className="text-xs font-bold italic">No associations detected.</p>
                         </div>
                       )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            {/* Network Graph Section */}
            <div id="network-graph-section" className="pt-6">
              <Card className="border-primary/20 shadow-2xl overflow-hidden rounded-2xl border-2">
                <CardHeader className="bg-slate-50/80 border-b border-border/50 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl font-black text-slate-800">
                        <Network className="h-6 w-6 text-primary" />
                        Community Association Network
                      </CardTitle>
                      <CardDescription className="font-medium">
                        Visualizing forensic connections between r/{subredditData.display_name} and its network
                      </CardDescription>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20 px-3 py-1 font-bold">
                      {relatedSubreddits.length + 1} NODES DETECTED
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0 bg-slate-950">
                  <RelatedSubredditsGraph
                    centerSubreddit={subredditData.display_name}
                    relatedSubreddits={relatedSubreddits}
                    onSubredditClick={handleSubredditClick}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Item Preview Dialog - matching User Profiling design */}
      <Dialog open={!!previewPost} onOpenChange={(open) => !open && setPreviewPost(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border-blue-100 shadow-2xl p-0 gap-0">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30 font-bold uppercase tracking-widest text-[9px]">
                r/{previewPost?.subreddit}
              </Badge>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-100 uppercase">
                <Clock className="h-3 w-3" /> {previewPost?.created_utc ? formatTzTimestamp(previewPost.created_utc) : ''}
              </div>
            </div>
            <h3 className="font-black text-xl leading-tight tracking-tight drop-shadow-sm line-clamp-3">{previewPost?.title}</h3>
          </div>
          
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="p-6 space-y-6 pb-10">
              <div className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-sm shadow-sm">
                  {previewPost?.author.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-black text-slate-800">u/{previewPost?.author}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Post Author</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-lg font-black text-orange-600 flex items-center gap-1 justify-end">
                    <ThumbsUp className="h-4 w-4" /> {previewPost?.score.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Impact Score</div>
                </div>
              </div>

              {previewPost?.selftext ? (
                <div className="space-y-3">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Content Intelligence</div>
                  <div className="text-sm text-slate-700 leading-relaxed bg-white p-5 rounded-2xl border border-slate-200 shadow-sm whitespace-pre-wrap font-medium">
                    {previewPost.selftext}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center">
                  <Info className="h-8 w-8 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-400 font-bold italic">
                    This intelligence package contains only a title or media link.
                  </p>
                </div>
              )}
              
              {previewPost?._sentiment && (
                <div className={`p-5 rounded-2xl border shadow-md transition-all ${sentimentTone(previewPost._sentiment)}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 rounded-lg bg-white/50 border border-current">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Sentiment Verdict</div>
                      <div className="text-sm font-black uppercase tracking-tighter">{previewPost._sentiment} Tone Detected</div>
                    </div>
                    <Badge className="ml-auto font-black shadow-sm px-3">{previewPost._sentiment.toUpperCase()}</Badge>
                  </div>
                  <div className="bg-white/40 p-3 rounded-xl border border-current/10">
                    <p className="text-xs leading-relaxed font-bold italic">
                      "{previewPost._sentimentExplanation?.reasoning || 'Advanced AI analysis of the linguistic patterns indicates a ' + previewPost._sentiment + ' bias in this communication.'}"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-6 bg-slate-50 border-t border-slate-200 flex gap-3">
            <Button 
              variant="outline"
              className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 font-black uppercase tracking-widest text-xs"
              onClick={() => setPreviewPost(null)}
            >
              Dismiss
            </Button>
            <Button 
              className="flex-[2] h-12 gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xl transition-all shadow-blue-200 font-black uppercase tracking-widest text-xs"
              onClick={() => previewPost?.permalink && window.open(`https://reddit.com${previewPost.permalink}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              Analyze Source
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommunityAnalysis;
