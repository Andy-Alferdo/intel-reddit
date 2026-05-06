// Temporary fix for UserProfiling.tsx - this replaces the problematic section
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, MessageSquare, MoreHorizontal, Plus, Search, User, Zap } from 'lucide-react';
import { WordCloud } from '@/components/WordCloud';
import { AnalyticsChart } from '@/components/AnalyticsChart';
import { SentimentExplanation } from '@/components/SentimentExplanation';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toZonedTime } from 'date-fns-tz';
import { useInvestigation } from '@/contexts/InvestigationContext';
import { useCallback } from 'react';

// Types for our data structures
interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  created_at: string;
  text: string;
  url: string;
  score: number;
  num_comments: number;
}

interface RedditComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
  score: number;
  link_id?: string;
  post_id: string;
}

interface SentimentResult {
  text: string;
  sentiment: string;
  explanation: string;
}

interface DeepAnalysisResponse {
  text: string;
  sentiment: string;
  basic_explanation: string;
  deep_explanation?: {
    reasoning: string;
    word_contributions: Array<{
      word: string;
      contribution: number;
      sentiment_impact: string;
    }>;
    explanation_method: string;
    analysis_depth: string;
  };
  success?: boolean;
}

// Constants
const INITIAL_VISIBLE = 5;
const LABELS = ['negative', 'neutral', 'positive'];

// Clean UserProfiling component with only LIME deep analysis
export default function UserProfiling() {
  const [error, setError] = useState<string | null>(null);
  const [visiblePosts, setVisiblePosts] = useState(INITIAL_VISIBLE);
  const [visibleComments, setVisibleComments] = useState(INITIAL_VISIBLE);
  const { toast } = useToast();
  const { addUserProfile, saveUserProfileToDb, currentCase } = useInvestigation();
  const [savedProfiles, setSavedProfiles] = useState<any[]>([]);
  
  // Per-item deep analysis state
  const [deepAnalysisStates, setDeepAnalysisStates] = useState<Map<string, { isAnalyzing: boolean; result: any; showDeep: boolean; analysisType: 'lime' }>>(new Map());

  const handleDeepAnalysis = async (text: string, itemKey: string) => {
    // Update state for this specific item
    setDeepAnalysisStates(prev => new Map(prev.set(itemKey, { 
      isAnalyzing: true, 
      result: null, 
      showDeep: false,
      analysisType: 'lime'
    })));

    try {
      const response = await fetch('http://localhost:5000/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`Deep analysis failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Update state with result
      setDeepAnalysisStates(prev => new Map(prev.set(itemKey, { 
        isAnalyzing: false, 
        result, 
        showDeep: true,
        analysisType: 'lime'
      })));

      toast({
        title: "Deep Analysis Complete",
        description: "Advanced LIME analysis has been performed on this text.",
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

  const toggleDeepAnalysis = (itemKey: string) => {
    setDeepAnalysisStates(prev => {
      const current = prev.get(itemKey);
      if (current) {
        return new Map(prev.set(itemKey, { 
          ...current,
          showDeep: !current.showDeep,
        }));
      } else {
        return new Map(prev);
      }
    });
  };

  // Rest of the component remains the same...
  // [All the existing code for data fetching, rendering, etc.]
