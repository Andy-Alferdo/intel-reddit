import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { User, Users, Calendar, TrendingUp, FileText, MessageSquare, ExternalLink, StopCircle, ArrowLeft, BarChart3, Hash, CheckCircle } from 'lucide-react';
import { AnalyticsChart } from '@/components/AnalyticsChart';
import DailyPostBreakdownChart from './DailyPostBreakdownChart';
import { useInvestigation } from '@/contexts/InvestigationContext';
import { useToast } from '@/hooks/use-toast';

interface RedditActivity {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body?: string;
  subreddit: string;
  timestamp: string;
  created_utc: number;
  url: string;
  score?: number;
}

interface ProfileData {
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

interface MonitoringDetailViewProps {
  profileData: ProfileData;
  activities: RedditActivity[];
  wordCloudData: any[];
  isMonitoring: boolean;
  isFetching: boolean;
  lastFetchTime: string;
  newActivityCount: number;
  onStop: () => void;
  onStart?: () => void;
  onBack: () => void;
}

// Horizontal Bar Chart for Keyword Intelligence
interface WordData { word: string; frequency: number; category: 'high' | 'medium' | 'low'; }

const KeywordBarChart = ({ words }: { words: WordData[] }) => {
  const topWords = words.slice(0, 8); // Show top 8 keywords
  const maxFrequency = Math.max(...topWords.map(w => w.frequency), 1);

  if (!words.length) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No significant keywords detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {topWords.map((word, index) => {
        const percentage = (word.frequency / maxFrequency) * 100;
        return (
          <div key={word.word} className="flex items-center gap-3">
            <span className="text-xs font-medium text-foreground min-w-[60px] truncate">
              {word.word}
            </span>
            <div className="flex-1 relative">
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground min-w-[20px] text-right">
              {word.frequency}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Posts vs Comments Comparison Chart
const ActivityComparisonChart = ({ postsCount, commentsCount, isUser }: { postsCount: number; commentsCount: number; isUser: boolean }) => {
  if (isUser) {
    // USER: Show both Posts and Comments bars
    const maxValue = Math.max(postsCount, commentsCount, 1);
    const postsHeight = (postsCount / maxValue) * 120;
    const commentsHeight = (commentsCount / maxValue) * 120;

    return (
      <div className="flex items-end justify-center gap-8 h-40">
        {/* Posts Bar */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg font-bold text-blue-600">{postsCount}</span>
          <div className="w-16 bg-gradient-to-t from-blue-600 to-blue-500 rounded-t-md transition-all duration-500 hover:from-blue-700 hover:to-blue-600"
               style={{ height: `${Math.max(postsHeight, 4)}px` }} />
          <span className="text-sm font-medium text-foreground">Posts</span>
        </div>

        {/* Comments Bar */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg font-bold text-green-600">{commentsCount}</span>
          <div className="w-16 bg-gradient-to-t from-green-600 to-green-500 rounded-t-md transition-all duration-500 hover:from-green-700 hover:to-green-600"
               style={{ height: `${Math.max(commentsHeight, 4)}px` }} />
          <span className="text-sm font-medium text-foreground">Comments</span>
        </div>
      </div>
    );
  } else {
    // COMMUNITY: Show only Posts bar (centered)
    return (
      <div className="flex items-end justify-center h-40">
        {/* Posts Bar - Centered */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg font-bold text-blue-600">{postsCount}</span>
          <div className="w-16 bg-gradient-to-t from-blue-600 to-blue-500 rounded-t-md transition-all duration-500 hover:from-blue-700 hover:to-blue-600"
               style={{ height: `${Math.max(120, 4)}px` }} />
          <span className="text-sm font-medium text-foreground">Posts</span>
        </div>
      </div>
    );
  }
};

export const MonitoringDetailView = ({
  profileData,
  activities,
  wordCloudData,
  isMonitoring,
  isFetching,
  lastFetchTime,
  newActivityCount,
  onStop,
  onStart,
  onBack,
}: MonitoringDetailViewProps) => {
  const [previewActivity, setPreviewActivity] = useState<RedditActivity | null>(null);
  const navigate = useNavigate();
  const [visiblePosts, setVisiblePosts] = useState(10);
  const [visibleComments, setVisibleComments] = useState(10);
  const { toast } = useToast();
  const { userProfiles, communityAnalyses } = useInvestigation();

  const isUser = !!profileData.username;
  const isCommunity = !!profileData.communityName;
  const targetName = profileData.username || profileData.communityName || '';

  // Check if user is already analyzed (local state or database)
  const checkUserAnalysisExists = useCallback((username: string): boolean => {
    const cleanUsername = username.replace(/^u\//, '');
    return userProfiles.some(profile => 
      profile.username.toLowerCase() === cleanUsername.toLowerCase()
    );
  }, [userProfiles]);

  // Check if community is already analyzed (local state or database)
  const checkCommunityAnalysisExists = useCallback((subreddit: string): boolean => {
    const cleanSubreddit = subreddit.replace(/^r\//, '');
    return communityAnalyses.some(analysis => 
      analysis.name.toLowerCase() === cleanSubreddit.toLowerCase()
    );
  }, [communityAnalyses]);

  const handleAddToUserProfiling = () => {
    const cleanUsername = profileData.username?.replace(/^u\//, '') || '';
    
    // Check if user is already analyzed
    if (checkUserAnalysisExists(cleanUsername)) {
      toast({
        title: 'Already Analyzed',
        description: 'Opening existing analysis results...',
      });
      // Navigate to user profiling with pre-filled username to view results
      navigate('/user-profiling', { 
        state: { 
          prefillUsername: cleanUsername,
          viewOnly: true
        } 
      });
      return;
    }

    // User not analyzed - trigger analysis
    toast({
      title: 'Starting Analysis',
      description: `Initiating user profiling for u/${cleanUsername}...`,
    });
    navigate('/user-profiling', { 
      state: { 
        prefillUsername: cleanUsername,
        autoAnalyze: true
      } 
    });
  };

  const handleAddToCommunityAnalysis = () => {
    const cleanCommunity = profileData.communityName?.replace(/^r\//, '') || '';

    // Check if community is already analyzed
    if (checkCommunityAnalysisExists(cleanCommunity)) {
      toast({
        title: 'Already Analyzed',
        description: 'Opening existing community analysis results...',
      });
      // Navigate to analysis page with community tab active to view results
      navigate('/analysis', {
        state: {
          prefillCommunity: cleanCommunity,
          activeTab: 'community',
          viewOnly: true
        }
      });
      return;
    }

    // Community not analyzed - trigger analysis
    toast({
      title: 'Starting Analysis',
      description: `Initiating community analysis for r/${cleanCommunity}...`,
    });
    navigate('/analysis', {
      state: {
        prefillCommunity: cleanCommunity,
        activeTab: 'community',
        autoAnalyze: true
      }
    });
  };

  // Stats calculations
  const postsCount = activities.filter(a => a.type === 'post').length;
  const commentsCount = activities.filter(a => a.type === 'comment').length;

  // Activity breakdown data for chart (monthly distribution)
  const activityChartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthData = months.map(m => ({ name: m, value: 0 }));
    activities.forEach(a => {
      const date = new Date(a.created_utc * 1000);
      const monthIdx = date.getMonth();
      monthData[monthIdx].value++;
    });
    return monthData;
  }, [activities]);

  // Recent posts and comments with pagination
  const allPosts = useMemo(() => {
    const posts = activities.filter(a => a.type === 'post');
    if (!isUser) {
      // For community: show posts from past 3 days
      const threeDaysAgo = Date.now() / 1000 - (3 * 24 * 60 * 60);
      return posts.filter(a => a.created_utc >= threeDaysAgo);
    } else {
      // For user: show all posts
      return posts;
    }
  }, [activities, isUser]);
  
  const allComments = useMemo(() => activities.filter(a => a.type === 'comment'), [activities]);
  
  const recentPosts = useMemo(() => allPosts.slice(0, visiblePosts), [allPosts, visiblePosts]);
  const recentComments = useMemo(() => allComments.slice(0, visibleComments), [allComments, visibleComments]);

  // Word cloud data with categories
  const processedWordCloudData = useMemo(() => {
    if (!wordCloudData || wordCloudData.length === 0) return [];
    return wordCloudData.map((w: any) => ({
      word: w.word,
      frequency: w.frequency,
      category: w.category || (w.frequency > 50 ? 'high' : w.frequency > 20 ? 'medium' : 'low'),
    }));
  }, [wordCloudData]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. TOP BACK NAVIGATION */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground hover:text-foreground px-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to Overview</span>
        </Button>
      </div>

      {/* 2. PROFILE HEADER CARD (FULL WIDTH) */}
      <Card className="rounded-xl border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {/* Banner for communities */}
          {profileData.communityName && profileData.bannerImg && (
            <div className="relative h-20 w-full bg-muted">
              <img 
                src={profileData.bannerImg} 
                alt={`${profileData.communityName} banner`}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          
          <div className="p-5">
            <div className="flex items-start justify-between">
              {/* LEFT SIDE: Avatar + Target Info */}
              <div className="flex items-center gap-4">
                {/* Avatar/Icon */}
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-3 border-background bg-muted overflow-hidden shadow-md flex items-center justify-center">
                    {profileData.iconImg ? (
                      <img 
                        src={profileData.iconImg} 
                        alt={`${targetName} avatar`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : null}
                    <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/40 ${profileData.iconImg ? 'hidden' : ''}`}>
                      {isUser ? <User className="h-7 w-7 text-primary" /> : <Users className="h-7 w-7 text-primary" />}
                    </div>
                  </div>
                </div>

                {/* Target Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-foreground">
                      <a 
                        href={`https://reddit.com/${targetName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1"
                      >
                        {targetName}
                        <ExternalLink className="h-4 w-4 inline" />
                      </a>
                    </h1>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-md line-clamp-2">
                    {isUser 
                      ? (profileData.description || '')
                      : (profileData.description || `${profileData.memberCount || 'Unknown'} members in this community`)
                    }
                  </p>
                </div>
              </div>

              {/* RIGHT SIDE: Monitoring Status + Toggle Button */}
              <div className="flex items-center gap-3">
                {isMonitoring ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" style={{ animation: 'blink 4s infinite' }} />
                      <span className="text-sm font-medium text-green-700">MONITORING ACTIVE</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button 
                        onClick={onStop} 
                        size="sm"
                        className="bg-black text-white hover:bg-zinc-800 gap-1.5 rounded-xl shadow-md"
                      >
                        <StopCircle className="h-4 w-4" />
                        Stop Monitoring
                      </Button>
                      {isUser && !isCommunity && (
                        <Button 
                          onClick={handleAddToUserProfiling} 
                          size="sm"
                          variant="outline"
                          className={checkUserAnalysisExists(profileData.username?.replace(/^u\//, '') || '') 
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-black gap-1.5 rounded-xl" 
                            : "border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-black gap-1.5 rounded-xl"}
                        >
                          {checkUserAnalysisExists(profileData.username?.replace(/^u\//, '') || '') ? (
                            <><CheckCircle className="h-4 w-4" /> View Analysis</>
                          ) : (
                            <><User className="h-4 w-4" /> Add to User Profiling</>
                          )}
                        </Button>
                      )}
                      {isCommunity && (
                        <Button 
                          onClick={handleAddToCommunityAnalysis} 
                          size="sm"
                          variant="outline"
                          className={checkCommunityAnalysisExists(profileData.communityName?.replace(/^r\//, '') || '') 
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-black gap-1.5 rounded-xl" 
                            : "border-green-200 text-green-700 hover:bg-green-50 hover:text-black gap-1.5 rounded-xl"}
                        >
                          {checkCommunityAnalysisExists(profileData.communityName?.replace(/^r\//, '') || '') ? (
                            <><CheckCircle className="h-4 w-4" /> View Analysis</>
                          ) : (
                            <><Users className="h-4 w-4" /> Add to Community Analysis</>
                          )}
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full">
                      <span className="h-2 w-2 rounded-full bg-gray-500" />
                      <span className="text-sm font-medium text-gray-700">MONITORING PAUSED</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button 
                        onClick={onStart || onStop} 
                        size="sm"
                        className="bg-black text-white hover:bg-zinc-800 gap-1.5 rounded-xl shadow-md"
                      >
                        <TrendingUp className="h-4 w-4" />
                        Start Monitoring
                      </Button>
                      {isUser && !isCommunity && (
                        <Button 
                          onClick={handleAddToUserProfiling} 
                          size="sm"
                          variant="outline"
                          className={checkUserAnalysisExists(profileData.username?.replace(/^u\//, '') || '') 
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-black gap-1.5 rounded-xl" 
                            : "border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-black gap-1.5 rounded-xl"}
                        >
                          {checkUserAnalysisExists(profileData.username?.replace(/^u\//, '') || '') ? (
                            <><CheckCircle className="h-4 w-4" /> View Analysis</>
                          ) : (
                            <><User className="h-4 w-4" /> Add to User Profiling</>
                          )}
                        </Button>
                      )}
                      {isCommunity && (
                        <Button 
                          onClick={handleAddToCommunityAnalysis} 
                          size="sm"
                          variant="outline"
                          className={checkCommunityAnalysisExists(profileData.communityName?.replace(/^r\//, '') || '') 
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-black gap-1.5 rounded-xl" 
                            : "border-green-200 text-green-700 hover:bg-green-50 hover:text-black gap-1.5 rounded-xl"}
                        >
                          {checkCommunityAnalysisExists(profileData.communityName?.replace(/^r\//, '') || '') ? (
                            <><CheckCircle className="h-4 w-4" /> View Analysis</>
                          ) : (
                            <><Users className="h-4 w-4" /> Add to Community Analysis</>
                          )}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 3. HEADER METRICS ROW */}
            <div className="mt-5 pt-4 border-t grid grid-cols-4 gap-4">
              {/* Metric 1: Karma/Members */}
              <div className="flex items-center gap-3 border-r border-border/50 pr-4">
                <div className="p-2 bg-muted rounded-lg">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isUser ? 'Karma' : 'Members'}</p>
                  <p className="text-lg font-bold">
                    {isUser 
                      ? (profileData.totalKarma ? `${(profileData.totalKarma / 1000).toFixed(1)}K` : '0')
                      : (profileData.memberCount || '0')
                    }
                  </p>
                </div>
              </div>

              {/* Metric 2: Account Age / Created Date */}
              <div className="flex items-center gap-3 border-r border-border/50 pr-4">
                <div className="p-2 bg-muted rounded-lg">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isUser ? 'Account Age' : 'Created Date'}</p>
                  <p className="text-lg font-bold">
                    {isUser ? (profileData.accountAge || 'N/A') : (profileData.createdDate || 'N/A')}
                  </p>
                </div>
              </div>

              {/* Metric 3: Posts (show for both users and communities) */}
              <div className="flex items-center gap-3 border-r border-border/50 pr-4">
                <div className="p-2 bg-muted rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Posts</p>
                  <p className="text-lg font-bold">{postsCount}</p>
                </div>
              </div>

              {/* Metric 4: Comments (show for both users and communities) */}
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Comments</p>
                  <p className="text-lg font-bold">{commentsCount}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. MAIN CONTENT GRID: 68% Left / 32% Right */}
      <div className="grid grid-cols-12 gap-4">
        {/* LEFT COLUMN = 68% */}
        <div className="col-span-8">
          {/* Live Activity Feed */}
          <Card className="rounded-xl border shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-3 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">Live Activity Feed</h2>
                  {newActivityCount > 0 && (
                    <Badge className="bg-blue-500 text-white text-xs">
                      {newActivityCount} NEW
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isMonitoring && (
                    <>
                      {isFetching && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                      <span>{isFetching ? 'Checking...' : `Last: ${lastFetchTime}`}</span>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-hidden">
              {isUser ? (
                // USER: Show both Posts and Comments columns
                <div className="grid grid-cols-2 gap-4" style={{ minHeight: '400px' }}>
                  {/* Posts Column */}
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 flex-shrink-0">
                      <FileText className="h-4 w-4 text-blue-500" />
                      Posts
                      <span className="text-xs text-muted-foreground">({recentPosts.length}/{allPosts.length})</span>
                    </h3>
                    <div className="flex-1 flex flex-col" style={{ minHeight: '300px' }}>
                      <ScrollArea className="flex-1" style={{ minHeight: '250px', maxHeight: '400px' }}>
                        <div className="space-y-1.5 pr-2 pb-3">
                          {recentPosts.length > 0 ? recentPosts.map((activity, idx) => (
                            <div 
                              key={activity.id} 
                              onClick={() => setPreviewActivity(activity)}
                              className="group cursor-pointer border-l-4 border-l-blue-500 bg-muted/30 hover:bg-muted/60 transition-all rounded-r-md p-2"
                            >
                              <p className="text-sm font-medium line-clamp-2 leading-snug">{activity.title}</p>
                              <div className="flex flex-col gap-1 mt-1.5">
                                <div className="flex items-center justify-between">
                                  <a 
                                    href={`https://reddit.com/r/${activity.subreddit.replace(/^r\//, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 font-medium hover:text-blue-800 hover:underline transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {activity.subreddit}
                                  </a>
                                  <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                                </div>
                                {activity.author && (
                                  <a 
                                    href={`https://reddit.com/u/${activity.author}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-muted-foreground hover:text-blue-600 hover:underline transition-colors w-fit"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    by u/{activity.author}
                                  </a>
                                )}
                              </div>
                            </div>
                          )) : (
                            <div className="text-sm text-muted-foreground text-center py-8">No posts found</div>
                          )}
                        </div>
                      </ScrollArea>
                      <div className="mt-2 pt-2 border-t flex flex-col gap-1 flex-shrink-0">
                        {allPosts.length > visiblePosts && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVisiblePosts(prev => Math.min(prev + 10, allPosts.length))}
                            className="text-xs"
                          >
                            Load 10 more posts ({Math.min(10, allPosts.length - visiblePosts)} remaining)
                          </Button>
                        )}
                        {visiblePosts < allPosts.length && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisiblePosts(allPosts.length)}
                            className="text-xs text-muted-foreground"
                          >
                            Load all posts ({allPosts.length - visiblePosts} remaining)
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comments Column */}
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 flex-shrink-0">
                      <MessageSquare className="h-4 w-4 text-green-500" />
                      Comments
                      <span className="text-xs text-muted-foreground">({recentComments.length}/{allComments.length})</span>
                    </h3>
                    <div className="flex-1 flex flex-col" style={{ minHeight: '300px' }}>
                      <ScrollArea className="flex-1" style={{ minHeight: '250px', maxHeight: '400px' }}>
                        <div className="space-y-1.5 pr-2 pb-3">
                          {recentComments.length > 0 ? recentComments.map((activity, idx) => (
                            <div
                              key={activity.id}
                              onClick={() => setPreviewActivity(activity)}
                              className="group cursor-pointer border-l-4 border-l-green-500 bg-muted/30 hover:bg-muted/60 transition-all rounded-r-md p-2"
                            >
                              <p className="text-sm font-medium line-clamp-2 leading-snug">{activity.title}</p>
                              <div className="flex flex-col gap-1 mt-1.5">
                                <div className="flex items-center justify-between">
                                  <a 
                                    href={`https://reddit.com/r/${activity.subreddit.replace(/^r\//, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 font-medium hover:text-blue-800 hover:underline transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {activity.subreddit}
                                  </a>
                                  <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                                </div>
                                {activity.author && (
                                  <a 
                                    href={`https://reddit.com/u/${activity.author}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-muted-foreground hover:text-blue-600 hover:underline transition-colors w-fit"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    by u/{activity.author}
                                  </a>
                                )}
                              </div>
                            </div>
                          )) : profileData?.isPrivateProfile ? (
                            <div className="text-sm text-amber-600 text-center py-8 bg-amber-50/50 rounded border border-dashed border-amber-200">
                              Comments not fetched due to Reddit's Security Policy
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground text-center py-8">No recent comments available</div>
                          )}
                        </div>
                      </ScrollArea>
                      <div className="mt-2 pt-2 border-t flex flex-col gap-1 flex-shrink-0">
                        {allComments.length > visibleComments && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVisibleComments(prev => Math.min(prev + 10, allComments.length))}
                            className="text-xs"
                          >
                            Load 10 more comments ({Math.min(10, allComments.length - visibleComments)} remaining)
                          </Button>
                        )}
                        {visibleComments < allComments.length && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleComments(allComments.length)}
                            className="text-xs text-muted-foreground"
                          >
                            Load all comments ({allComments.length - visibleComments} remaining)
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // COMMUNITY: Show only Posts column (full width)
                <div className="flex flex-col h-full">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 flex-shrink-0">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Posts
                    <span className="text-xs text-muted-foreground">({recentPosts.length}/{allPosts.length})</span>
                  </h3>
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <ScrollArea className="flex-1">
                      <div className="space-y-1.5 pr-2 pb-3">
                        {recentPosts.length > 0 ? recentPosts.map((activity, idx) => (
                          <div 
                            key={activity.id} 
                            onClick={() => setPreviewActivity(activity)}
                            className="group cursor-pointer border-l-4 border-l-blue-500 bg-muted/30 hover:bg-muted/60 transition-all rounded-r-md p-2"
                          >
                            <p className="text-sm font-medium line-clamp-2 leading-snug">{activity.title}</p>
                            <div className="flex flex-col gap-1 mt-1.5">
                              <div className="flex items-center justify-between">
                                <a 
                                  href={`https://reddit.com/r/${activity.subreddit.replace(/^r\//, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 font-medium hover:text-blue-800 hover:underline transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {activity.subreddit}
                                </a>
                                <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                              </div>
                              {activity.author && (
                                <a 
                                  href={`https://reddit.com/u/${activity.author}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-muted-foreground hover:text-blue-600 hover:underline transition-colors w-fit"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  by u/{activity.author}
                                </a>
                              )}
                            </div>
                          </div>
                        )) : (
                          <div className="text-sm text-muted-foreground text-center py-8">No posts found</div>
                        )}
                      </div>
                    </ScrollArea>
                    <div className="mt-2 pt-2 border-t flex flex-col gap-1 flex-shrink-0">
                        {allPosts.length > visiblePosts && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVisiblePosts(prev => Math.min(prev + 10, allPosts.length))}
                            className="text-xs"
                          >
                            Load 10 more posts ({Math.min(10, allPosts.length - visiblePosts)} remaining)
                          </Button>
                        )}
                        {visiblePosts < allPosts.length && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisiblePosts(allPosts.length)}
                            className="text-xs text-muted-foreground"
                          >
                            Load all posts ({allPosts.length - visiblePosts} remaining)
                          </Button>
                        )}
                      </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN = 32% */}
        <div className="col-span-4 space-y-4">
          {/* Keyword Intelligence */}
          <Card className="rounded-xl border shadow-sm h-[280px] flex flex-col">
            <CardHeader className="pb-2 flex-shrink-0">
              <h2 className="text-base font-semibold">Keyword Intelligence</h2>
            </CardHeader>
            <CardContent className="pt-0 flex-1 overflow-hidden">
              <KeywordBarChart words={processedWordCloudData} />
            </CardContent>
          </Card>

          {/* Activity Chart - Conditional based on target type */}
          {isUser ? (
            // USER: Show Posts vs Comments Activity Distribution
            <Card className="rounded-xl border shadow-sm h-[280px] flex flex-col">
              <CardHeader className="pb-2 flex-shrink-0">
                <h2 className="text-base font-semibold">Activity Distribution</h2>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col justify-center">
                <div className="space-y-2">
                  <ActivityComparisonChart postsCount={postsCount} commentsCount={commentsCount} isUser={isUser} />
                </div>
              </CardContent>
            </Card>
          ) : (
            // COMMUNITY: Show Daily Post Breakdown
            <Card className="rounded-xl border shadow-sm h-[340px] flex flex-col">
              <CardHeader className="pb-2 flex-shrink-0">
                <h2 className="text-base font-semibold">Activity Breakdown</h2>
                <p className="text-sm text-gray-500">Daily post distribution</p>
              </CardHeader>
              <CardContent className="pt-0 flex-1 p-4">
                <DailyPostBreakdownChart posts={recentPosts} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewActivity} onOpenChange={(open) => !open && setPreviewActivity(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">
              {previewActivity?.type === 'post' ? '📄 Post' : '💬 Comment'} Preview
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1">
              <Badge variant="outline" className="text-xs">{previewActivity?.subreddit}</Badge>
              <span className="text-xs">{previewActivity?.timestamp}</span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-3 pr-4">
              <h3 className="font-semibold text-sm">{previewActivity?.title}</h3>
              {previewActivity?.body && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewActivity.body}</p>
              )}
              {!previewActivity?.body && (
                <p className="text-sm text-muted-foreground italic">No additional content available.</p>
              )}
            </div>
          </ScrollArea>
          <div className="pt-3 border-t">
            <a href={previewActivity?.url} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button className="w-full gap-2 rounded-lg">
                <ExternalLink className="h-4 w-4" />
                View on Reddit
              </Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
