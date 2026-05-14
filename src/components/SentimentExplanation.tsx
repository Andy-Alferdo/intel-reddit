import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Brain, TrendingUp, AlertTriangle, MessageSquare, Zap } from 'lucide-react';
import { analyzeDeep } from '@/integrations/huggingface/client';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

interface SentimentKeyword {
  word: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface SentimentExplanation {
  confidence: string;
  reasoning: string;
  key_words: SentimentKeyword[];
  text_length: number;
  prediction_confidence: number;
  word_contributions?: Array<{ word: string; sentiment: string; importance?: number; contribution?: number }>;
  importance_scores?: Array<{ word: string; score: number }>;
  explanation_method?: string;
}

interface SentimentExplanationProps {
  sentiment: string;
  explanation: SentimentExplanation | string;
  text: string;
}

interface DeepAnalysisResponse {
  text: string;
  sentiment: string;
  basic_explanation: SentimentExplanation;
  deep_explanation: {
    reasoning: string;
    word_contributions: Array<{ word: string; sentiment: string; contribution?: number }>;
    importance_scores: Array<{ word: string; score: number }>;
    explanation_method: string;
    analysis_depth: string;
  };
}

export const SentimentExplanation = ({ sentiment, explanation, text }: SentimentExplanationProps) => {
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysisResponse | null>(null);
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);

  const handleDeepAnalysis = async () => {
    setIsDeepAnalyzing(true);
    try {
      const hfResult = await analyzeDeep(text);

      const result: DeepAnalysisResponse = {
        text: hfResult.text,
        sentiment: hfResult.overall_sentiment,
        basic_explanation: {} as any, // Mock basic if needed
        deep_explanation: {
          reasoning: hfResult.explanation,
          word_contributions: hfResult.word_importance.map((w: any) => ({
            word: w.word,
            sentiment: w.sentiment_contribution,
            contribution: w.importance
          })),
          importance_scores: [],
          explanation_method: 'Saliency',
          analysis_depth: 'Gradient-based'
        }
      };
      
      setDeepAnalysis(result);
      setShowDeepAnalysis(true);
      toast({
        title: "Deep Analysis Complete",
        description: "Advanced XAI analysis has been performed on this text.",
      });
    } catch (error) {
      console.error('Deep analysis error:', error);
      toast({
        title: "Deep Analysis Failed",
        description: "Could not perform deep analysis. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeepAnalyzing(false);
    }
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

  const getBarColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive':
        return 'bg-green-500';
      case 'negative':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
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

  const explanationObj = typeof explanation === 'string' ? null : explanation;
  const confidence = explanationObj?.prediction_confidence || 0;
  const wordContributions = explanationObj?.word_contributions || [];
  const importanceScores = explanationObj?.importance_scores || [];

  // Combine word contributions and importance scores for word signals
  const wordSignals = wordContributions.length > 0 
    ? wordContributions.map(w => ({
        word: w.word,
        contribution: w.contribution || w.importance || 0,
        sentiment: w.sentiment
      }))
    : importanceScores.map(w => ({
        word: w.word,
        contribution: w.score,
        sentiment: w.score > 0 ? 'positive' : w.score < 0 ? 'negative' : 'neutral'
      }));

  // Sort by absolute contribution
  const sortedWordSignals = wordSignals
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  const maxContribution = sortedWordSignals.length > 0 
    ? Math.max(...sortedWordSignals.map(s => Math.abs(s.contribution)))
    : 1;

  return (
    <Card className="mt-4 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Sentiment analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sentiment Badge and Confidence */}
        <div className="flex items-center justify-between">
          <Badge 
            variant="outline" 
            className={`text-sm font-medium px-3 py-1 ${getSentimentColor(sentiment)}`}
          >
            {sentiment?.charAt(0).toUpperCase() + sentiment?.slice(1)}
          </Badge>
          <span className="text-2xl font-bold text-gray-900">
            {Math.round(confidence * 100)}%
          </span>
        </div>

        {/* WORD SIGNALS Section */}
        {sortedWordSignals.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">WORD SIGNALS</h4>
            <div className="space-y-3">
              {sortedWordSignals.map((signal, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 w-20">{signal.word}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getBarColor(signal.sentiment)}`}
                      style={{ width: `${(Math.abs(signal.contribution) / maxContribution) * 100}%` }}
                    />
                  </div>
                  <span className={`text-xs ${getPullColor(signal.contribution)}`}>
                    {getPullDirection(signal.contribution)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Informational Note */}
        <p className="text-xs text-gray-500 leading-relaxed">
          This analysis identifies key words that influence the sentiment prediction. Words with higher bars have stronger impact on the classification.
        </p>

        {/* Deep Analysis Button */}
        {explanationObj?.explanation_method && (
          <Button
            onClick={handleDeepAnalysis}
            disabled={isDeepAnalyzing}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <Zap className="h-3 w-3 mr-1" />
            {isDeepAnalyzing ? 'Analyzing...' : 'Deep Analysis'}
          </Button>
        )}

        {/* Deep Analysis Results */}
        {showDeepAnalysis && deepAnalysis && (
          <Card className="mt-4 border-l-4 border-l-purple-500 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-600" />
                Deep Analysis Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Deep Analysis Method */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Deep Method:</span>
                <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200">
                  {deepAnalysis.deep_explanation.explanation_method === 'LIME' ? '🍋 LIME' : '📝 Enhanced Rule-based'}
                </Badge>
                <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200">
                  {deepAnalysis.deep_explanation.analysis_depth}
                </Badge>
              </div>

              {/* Deep Reasoning */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  Deep AI Reasoning
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed bg-purple-50 p-3 rounded-lg border border-purple-200">
                  {deepAnalysis.deep_explanation.reasoning}
                </p>
              </div>

              {/* Word Contributions from Deep Analysis */}
              {deepAnalysis.deep_explanation.word_contributions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-600" />
                    Word-Level Contributions (Deep Analysis)
                  </h4>
                  <div className="space-y-2">
                    {deepAnalysis.deep_explanation.word_contributions.slice(0, 10).map((contrib, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-purple-50 rounded border border-purple-200">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{contrib.word}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs px-2 py-1 ${getSentimentColor(contrib.sentiment)}`}
                          >
                            {contrib.sentiment}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground">
                            {contrib.contribution ? `Score: ${contrib.contribution.toFixed(3)}` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hide Deep Analysis Button */}
              <Button
                onClick={() => setShowDeepAnalysis(false)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Hide Deep Analysis
              </Button>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
