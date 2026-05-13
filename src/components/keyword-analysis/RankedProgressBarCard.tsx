import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, MoreVertical, ExternalLink, Users, Eye } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface SubredditData {
  name: string;
  mentions: number;
}

interface RankedProgressBarCardProps {
  data: SubredditData[];
  title?: string;
  onAddToCommunityAnalysis?: (subreddit: string) => void;
}

export const RankedProgressBarCard: React.FC<RankedProgressBarCardProps> = ({ 
  data, 
  title = "Top Subreddits",
  onAddToCommunityAnalysis 
}) => {
  const [animatedData, setAnimatedData] = useState<SubredditData[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Calculate ranks with ties
  const getRankedData = (data: SubredditData[]) => {
    if (data.length === 0) return [];
    
    const sortedData = [...data].sort((a, b) => b.mentions - a.mentions);
    const rankedData = sortedData.map((item, index) => {
      let rank = index + 1;
      
      // Check for ties with previous items
      for (let i = index - 1; i >= 0; i--) {
        if (sortedData[i].mentions === item.mentions) {
          rank = i + 1;
        } else {
          break;
        }
      }
      
      return { ...item, rank };
    });
    
    return rankedData;
  };

  const rankedData = getRankedData(data);
  const maxValue = Math.max(...data.map(d => d.mentions), 1);

  // Trigger animation when data changes
  useEffect(() => {
    setIsAnimating(true);
    setAnimatedData([]);
    
    // Small delay before starting animation
    const timer = setTimeout(() => {
      setAnimatedData(data);
      setIsAnimating(false);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [data]);

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 2:
        return 'text-slate-600 bg-slate-50 border-slate-200';
      case 3:
        return 'text-orange-700 bg-orange-50 border-orange-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getProgressColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-amber-400 to-amber-500';
      case 2:
        return 'bg-gradient-to-r from-slate-400 to-slate-500';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-500';
      default:
        return 'bg-gradient-to-r from-blue-400 to-blue-500';
    }
  };

  const handleSubredditClick = (subredditName: string) => {
    const cleanSubreddit = subredditName.replace(/^r\//, '');
    window.open(`https://reddit.com/r/${cleanSubreddit}`, '_blank');
  };

  const handleAddToCommunityAnalysis = (subredditName: string) => {
    const cleanSubreddit = subredditName.replace(/^r\//, '');
    
    // Navigate to Analysis page with community tab and prefill the subreddit
    navigate('/analysis', { 
      state: { 
        activeTab: 'community', 
        prefillCommunity: cleanSubreddit 
      } 
    });
    
    toast({
      title: "Navigating to Community Analysis",
      description: `Analyzing r/${cleanSubreddit}...`,
    });
  };

  const handleAddToMonitoring = (subredditName: string) => {
    const cleanSubreddit = subredditName.replace(/^r\//, '');
    
    // Navigate to Monitoring page with prefill community
    navigate('/monitoring', { 
      state: { 
        prefillCommunity: cleanSubreddit 
      } 
    });
    
    toast({
      title: "Navigating to Monitoring",
      description: `Adding r/${cleanSubreddit} to monitoring...`,
    });
  };

  if (data.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2.5 border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-blue-600" /> {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="h-32 flex items-center justify-center text-slate-400">
            <span className="text-sm">No subreddit data available</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2.5 border-b border-slate-100">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-blue-600" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {rankedData.map((item, index) => {
          const animatedItem = animatedData.find(d => d.name === item.name);
          const progressWidth = animatedItem ? (animatedItem.mentions / maxValue) * 100 : 0;
          const isAnimated = animatedItem && !isAnimating;
          
          return (
            <div
              key={`${item.name}-${item.mentions}`}
              className="group relative rounded-lg border border-slate-100 bg-white p-3 transition-all duration-200 hover:border-slate-200 hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    onClick={() => handleSubredditClick(item.name)}
                    className="text-sm font-medium text-slate-800 hover:text-blue-600 truncate max-w-[120px] transition-colors duration-200 text-left"
                    title={`Open ${item.name} on Reddit`}
                  >
                    {item.name}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {item.mentions} {item.mentions === 1 ? 'post' : 'posts'}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1 hover:bg-slate-100 rounded-md transition-colors duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3 w-3 text-slate-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => handleAddToMonitoring(item.name)}
                        className="cursor-pointer"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Add to Monitoring
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleAddToCommunityAnalysis(item.name)}
                        className="cursor-pointer"
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Add to Community Analysis
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              
              <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(item.rank)}`}
                  style={{
                    width: isAnimated ? `${progressWidth}%` : '0%',
                    transitionDelay: isAnimating ? `${index * 100}ms` : '0ms'
                  }}
                >
                  <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
