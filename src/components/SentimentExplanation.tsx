import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, Zap } from 'lucide-react';
import { analyzeDeep } from '@/integrations/huggingface/client';
import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WordImportance {
  word: string;
  importance: number;
  sentiment_contribution: 'positive' | 'negative' | 'neutral';
}

interface SentimentExplanationProps {
  sentiment: string;
  explanation: any;   // may be string or object — we no longer rely on its shape
  text: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const getSentimentColor = (s: string) => {
  switch (s?.toLowerCase()) {
    case 'positive': return 'bg-green-100 text-green-700 border-green-300';
    case 'negative': return 'bg-red-100 text-red-700 border-red-300';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
};

const getBarColor = (s: string) => {
  switch (s?.toLowerCase()) {
    case 'positive': return 'bg-green-500';
    case 'negative': return 'bg-red-500';
    default:         return 'bg-muted-foreground';
  }
};

// ── Component ─────────────────────────────────────────────────────────────────

export const SentimentExplanation = ({ sentiment, explanation, text }: SentimentExplanationProps) => {
  const [isLoading, setIsLoading]     = useState(false);
  const [wordSignals, setWordSignals] = useState<WordImportance[]>([]);
  const [reasoning, setReasoning]     = useState('');
  const [fetched, setFetched]         = useState(false);

  // Derive confidence from wherever it lives (string explanation or object)
  const confidence: number = (() => {
    if (typeof explanation === 'object' && explanation !== null) {
      return explanation.prediction_confidence ?? explanation.confidence ?? 0;
    }
    // Parse "confidence: 87%" from the string the parent builds in client.ts
    const match = String(explanation ?? '').match(/confidence[:\s]+(\d+)/i);
    return match ? parseInt(match[1]) / 100 : 0;
  })();

  // Auto-fetch word signals as soon as we have text
  useEffect(() => {
    if (text?.trim() && !fetched && !isLoading) {
      fetchWordSignals();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const fetchWordSignals = async () => {
    if (!text?.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const result = await analyzeDeep(text);

      const signals = (result.word_importance ?? [])
        .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
        .slice(0, 6) as WordImportance[];

      setWordSignals(signals);
      setReasoning(result.explanation ?? '');
      setFetched(true);
    } catch (err) {
      console.error('[SentimentExplanation] deep analysis error:', err);
      toast({
        title: 'Word analysis failed',
        description: 'Could not load word importance scores.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const maxImportance = wordSignals.length
    ? Math.max(...wordSignals.map(s => Math.abs(s.importance)))
    : 1;

  return (
    <Card className="mt-4 shadow-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Sentiment analysis</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Badge + Confidence ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={`text-sm font-medium px-3 py-1 ${getSentimentColor(sentiment)}`}
          >
            {sentiment?.charAt(0).toUpperCase() + sentiment?.slice(1)}
          </Badge>
          <span className="text-2xl font-bold text-foreground">
            {Math.round(confidence * 100)}%
          </span>
        </div>

        {/* ── Loading state ───────────────────────────────────────────────── */}
        {isLoading && (
          <p className="text-xs text-muted-foreground animate-pulse">
            Computing word importance…
          </p>
        )}

        {/* ── Word Signals ────────────────────────────────────────────────── */}
        {!isLoading && wordSignals.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              WORD SIGNALS
            </h4>
            <div className="space-y-3">
              {wordSignals.map((signal, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-24 truncate">
                    {signal.word}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getBarColor(signal.sentiment_contribution)}`}
                      style={{
                        width: `${(Math.abs(signal.importance) / maxImportance) * 100}%`,
                      }}
                    />
                  </div>
                  <span className={`text-xs w-24 text-right ${
                    signal.importance > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {signal.importance > 0 ? 'pull positive' : 'pull negative'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Explanation / note ──────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {reasoning || 'Words with longer bars have stronger influence on the sentiment prediction. Scores use gradient × embedding saliency on DistilBERT.'}
        </p>

        {/* ── Retry button (shown if fetch failed) ────────────────────────── */}
        {!isLoading && fetched && wordSignals.length === 0 && (
          <Button onClick={fetchWordSignals} variant="outline" size="sm" className="text-xs">
            <Zap className="h-3 w-3 mr-1" />
            Retry Analysis
          </Button>
        )}

        {/* ── Refresh button (shown after successful load) ─────────────────── */}
        {!isLoading && wordSignals.length > 0 && (
          <Button
            onClick={fetchWordSignals}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
          >
            <Brain className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
