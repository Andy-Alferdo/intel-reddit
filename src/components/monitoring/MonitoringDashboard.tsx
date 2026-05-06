import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import { 
  ArrowLeft, 
  StopCircle, 
  FileText, 
  MessageSquare, 
  Users, 
  TrendingUp,
  ExternalLink,
  Activity,
  Clock,
  Hash,
  BarChart3,
  PieChart as PieChartIcon,
  Activity as ActivityIcon,
  Filter,
  Calendar
} from 'lucide-react';

interface RedditActivity {
  id: string;
  type: 'post' | 'comment';
  title: string;
  body?: string;
  subreddit: string;
  timestamp: string;
  created_utc: number;
  url: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface KeywordData {
  word: string;
  frequency: number;
  trend: 'up' | 'down' | 'stable';
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
  iconImg?: string;
}

interface TimeSeriesData {
  timestamp: string;
  posts: number;
  comments: number;
}

interface MonitoringDashboardProps {
  profileData: ProfileData;
  activities: RedditActivity[];
  keywordData: KeywordData[];
  isMonitoring: boolean;
  isFetching: boolean;
  lastFetchTime: string;
  newActivityCount: number;
  onStop: () => void;
  onBack: () => void;
}

const COLORS = {
  primary: '#3b82f6',
  secondary: '#64748b',
  accent: '#0ea5e9',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  neutral: '#94a3b8',
  background: '#0f172a',
  border: '#1e293b',
};

const defaultKeywords: KeywordData[] = [
  { word: "technology", frequency: 89, trend: 'up' },
  { word: "innovation", frequency: 76, trend: 'up' },
  { word: "discussion", frequency: 55, trend: 'stable' },
  { word: "update", frequency: 48, trend: 'down' },
  { word: "community", frequency: 42, trend: 'stable' },
  { word: "analysis", frequency: 35, trend: 'up' },
  { word: "trends", frequency: 28, trend: 'down' },
  { word: "insights", frequency: 22, trend: 'stable' },
];

export const MonitoringDashboard = ({
  profileData,
  activities,
  keywordData,
  isMonitoring,
  isFetching,
  lastFetchTime,
  newActivityCount,
  onStop,
  onBack,
}: MonitoringDashboardProps) => {
  const [previewActivity, setPreviewActivity] = useState<RedditActivity | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [contentFilter, setContentFilter] = useState<'all' | 'posts' | 'comments'>('all');

  // Calculate metrics
  const metrics = useMemo(() => {
    const posts = activities.filter(a => a.type === 'post');
    const comments = activities.filter(a => a.type === 'comment');
    const uniqueSubreddits = new Set(activities.map(a => a.subreddit)).size;
    
    // Calculate trend (comparing last 24h to previous 24h)
    const now = Date.now() / 1000;
    const last24h = activities.filter(a => a.created_utc > now - 86400).length;
    const prev24h = activities.filter(a => 
      a.created_utc > now - 172800 && a.created_utc <= now - 86400
    ).length;
    const trend = last24h > prev24h ? 'up' : last24h < prev24h ? 'down' : 'stable';
    
    return {
      posts: posts.length,
      comments: comments.length,
      subreddits: uniqueSubreddits,
      trend,
      trendValue: prev24h > 0 ? Math.round(((last24h - prev24h) / prev24h) * 100) : 0,
    };
  }, [activities]);

  // Generate time series data
  const timeSeriesData = useMemo(() => {
    const data: TimeSeriesData[] = [];
    const now = new Date();
    const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 30;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0)).getTime() / 1000;
      const dayEnd = dayStart + 86400;
      
      const dayPosts = activities.filter(
        a => a.type === 'post' && a.created_utc >= dayStart && a.created_utc < dayEnd
      ).length;
      const dayComments = activities.filter(
        a => a.type === 'comment' && a.created_utc >= dayStart && a.created_utc < dayEnd
      ).length;
      
      data.push({
        timestamp: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        posts: dayPosts,
        comments: dayComments,
      });
    }
    return data;
  }, [activities, timeRange]);

  // Subreddit distribution
  const subredditData = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach(a => {
      counts[a.subreddit] = (counts[a.subreddit] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [activities]);

  // Sentiment data (mock for now, can be enhanced)
  const sentimentData = useMemo(() => {
    const data = [];
    const days = 7;
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        timestamp: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        positive: Math.floor(Math.random() * 30) + 10,
        negative: Math.floor(Math.random() * 20) + 5,
        neutral: Math.floor(Math.random() * 40) + 20,
      });
    }
    return data;
  }, []);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    let filtered = activities;
    if (contentFilter === 'posts') {
      filtered = activities.filter(a => a.type === 'post');
    } else if (contentFilter === 'comments') {
      filtered = activities.filter(a => a.type === 'comment');
    }
    return filtered.sort((a, b) => b.created_utc - a.created_utc);
  }, [activities, contentFilter]);

  const keywords = keywordData.length > 0 ? keywordData : defaultKeywords;

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (trend === 'down') return <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />;
    return <Activity className="h-3 w-3 text-slate-500" />;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Control Bar */}
      <div className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-3">
            {profileData.iconImg ? (
              <img 
                src={profileData.iconImg} 
                alt="" 
                className="w-8 h-8 rounded-full border border-slate-700"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                {profileData.username ? <Users className="h-4 w-4 text-slate-400" /> : <Hash className="h-4 w-4 text-slate-400" />}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-slate-200">
                {profileData.username || profileData.communityName}
              </p>
              <p className="text-xs text-slate-500">
                {profileData.username ? 'User' : 'Community'} Monitoring
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-xs text-slate-400">
              {isMonitoring ? (isFetching ? 'Syncing...' : 'Active') : 'Stopped'}
            </span>
          </div>
          {lastFetchTime && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              {lastFetchTime}
            </div>
          )}
          {isMonitoring && (
            <Button onClick={onStop} size="sm" variant="outline" className="h-7 text-xs border-red-900/50 text-red-400 hover:bg-red-950/30 hover:text-red-300">
              <StopCircle className="h-3 w-3 mr-1" />
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 p-3 bg-slate-800/80 border border-slate-700/80 rounded-lg">
        <Filter className="h-4 w-4 text-slate-500" />
        <span className="text-xs text-slate-500 font-medium">FILTERS</span>
        <div className="h-3 w-px bg-slate-800" />
        
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
          <SelectTrigger className="h-7 w-28 text-xs bg-slate-900 border-slate-700">
            <Calendar className="h-3 w-3 mr-2 text-slate-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={contentFilter} onValueChange={(v) => setContentFilter(v as any)}>
          <SelectTrigger className="h-7 w-28 text-xs bg-slate-900 border-slate-700">
            <FileText className="h-3 w-3 mr-2 text-slate-500" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all">All content</SelectItem>
            <SelectItem value="posts">Posts only</SelectItem>
            <SelectItem value="comments">Comments only</SelectItem>
          </SelectContent>
        </Select>

        {newActivityCount > 0 && (
          <Badge variant="outline" className="ml-auto text-xs bg-blue-950/30 text-blue-400 border-blue-900/50">
            {newActivityCount} new
          </Badge>
        )}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Posts</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-semibold text-slate-100">{metrics.posts}</span>
            {metrics.trend === 'up' && metrics.trendValue > 0 && (
              <span className="text-xs text-green-400">+{metrics.trendValue}%</span>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Comments</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-semibold text-slate-100">{metrics.comments}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Subreddits</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-semibold text-slate-100">{metrics.subreddits}</span>
          </div>
        </div>

        <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <ActivityIcon className="h-4 w-4 text-green-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Activity</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-semibold text-slate-100">{activities.length}</span>
            <div className="flex items-center gap-1">
              {getTrendIcon(metrics.trend)}
              <span className="text-xs text-slate-400">24h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Time Series Chart */}
      <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Activity Over Time</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-slate-500">Posts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-cyan-400" />
              <span className="text-slate-500">Comments</span>
            </div>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeSeriesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorComments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} opacity={0.5} />
              <XAxis 
                dataKey="timestamp" 
                stroke={COLORS.secondary}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: COLORS.border }}
              />
              <YAxis 
                stroke={COLORS.secondary}
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: COLORS.border }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: COLORS.background, 
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
                itemStyle={{ color: COLORS.neutral }}
              />
              <Area 
                type="monotone" 
                dataKey="posts" 
                stroke={COLORS.primary} 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorPosts)" 
              />
              <Area 
                type="monotone" 
                dataKey="comments" 
                stroke={COLORS.accent} 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorComments)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Middle Row: Activity Feed + Keyword Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Log */}
        <div className="lg:col-span-2 p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Activity Log</span>
              <span className="text-xs text-slate-600">({filteredActivities.length} entries)</span>
            </div>
          </div>
          <ScrollArea className="h-80">
            <div className="space-y-0">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-sm">
                  No activities recorded
                </div>
              ) : (
                filteredActivities.map((activity, idx) => (
                  <div 
                    key={activity.id}
                    onClick={() => setPreviewActivity(activity)}
                    className={`flex items-start gap-3 py-2.5 px-2 hover:bg-slate-800/50 cursor-pointer transition-colors group ${idx !== filteredActivities.length - 1 ? 'border-b border-slate-800/50' : ''}`}
                  >
                    <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${activity.type === 'post' ? 'bg-blue-500' : 'bg-cyan-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                          {activity.type}
                        </span>
                        <span className="text-xs text-slate-600">•</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-slate-900/50 border-slate-700 text-slate-500">
                          {activity.subreddit}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-300 line-clamp-1 group-hover:text-slate-200">
                        {activity.title}
                      </p>
                      {activity.body && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                          {activity.body}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0">
                      {activity.timestamp}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Keyword Analysis - Horizontal Bar Chart */}
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Top Keywords</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={keywords.slice(0, 8)} 
                layout="vertical"
                margin={{ top: 0, right: 30, left: 60, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} opacity={0.3} horizontal={false} />
                <XAxis 
                  type="number" 
                  stroke={COLORS.secondary}
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.border }}
                />
                <YAxis 
                  type="category" 
                  dataKey="word" 
                  stroke={COLORS.secondary}
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.border }}
                  width={55}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: COLORS.background, 
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
                <Bar 
                  dataKey="frequency" 
                  fill={COLORS.primary}
                  radius={[0, 2, 2, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Subreddit Distribution + Sentiment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subreddit Distribution */}
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Subreddit Distribution</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={subredditData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {subredditData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={[COLORS.primary, COLORS.accent, COLORS.success, COLORS.warning, COLORS.danger, COLORS.secondary][index % 6]}
                      stroke={COLORS.background}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: COLORS.background, 
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {subredditData.slice(0, 4).map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div 
                  className="h-2 w-2 rounded-sm" 
                  style={{ backgroundColor: [COLORS.primary, COLORS.accent, COLORS.success, COLORS.warning][idx] }}
                />
                <span className="text-xs text-slate-500">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sentiment Over Time */}
        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <ActivityIcon className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Sentiment Trend</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sentimentData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} opacity={0.3} />
                <XAxis 
                  dataKey="timestamp" 
                  stroke={COLORS.secondary}
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.border }}
                />
                <YAxis 
                  stroke={COLORS.secondary}
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.border }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: COLORS.background, 
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="positive" 
                  stackId="1"
                  stroke={COLORS.success} 
                  fill="url(#colorPos)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="negative" 
                  stackId="1"
                  stroke={COLORS.danger} 
                  fill="url(#colorNeg)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-green-500" />
              <span className="text-xs text-slate-500">Positive</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-red-500" />
              <span className="text-xs text-slate-500">Negative</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewActivity} onOpenChange={(open) => !open && setPreviewActivity(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug text-slate-200">
              {previewActivity?.type === 'post' ? 'Post' : 'Comment'} Preview
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-1 text-slate-500">
              <Badge variant="outline" className="text-xs bg-slate-900 border-slate-700 text-slate-400">
                {previewActivity?.subreddit}
              </Badge>
              <span className="text-xs">{previewActivity?.timestamp}</span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-3 pr-4">
              <h3 className="font-semibold text-sm text-slate-300">{previewActivity?.title}</h3>
              {previewActivity?.body && (
                <p className="text-sm text-slate-400 whitespace-pre-wrap">{previewActivity.body}</p>
              )}
              {!previewActivity?.body && (
                <p className="text-sm text-slate-500 italic">No additional content available.</p>
              )}
            </div>
          </ScrollArea>
          <div className="pt-3 border-t border-slate-800">
            <a href={previewActivity?.url} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white">
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
