import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ChartData {
  name: string;
  value: number;
}

interface PremiumDonutChartProps {
  data: ChartData[];
  title: string;
  height?: number;
  onSegmentClick?: (segment: string) => void;
  activeFilter?: string | null;
}

const COLORS = {
  'Positive': '#10b981',
  'Neutral': '#6b7280', 
  'Negative': '#ef4444'
};

export const PremiumDonutChart = ({ data, title, height = 300, onSegmentClick, activeFilter }: PremiumDonutChartProps) => {
  const handleSegmentClick = (data: any) => {
    if (onSegmentClick && data) {
      onSegmentClick(data.name);
    }
  };

  return (
    <Card className="border-border/40 bg-white shadow-sm hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={height * 0.22}
                outerRadius={height * 0.4}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                onClick={handleSegmentClick}
                style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[entry.name as keyof typeof COLORS] || '#6b7280'}
                    opacity={activeFilter && activeFilter !== entry.name ? 0.3 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  padding: '8px 12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                formatter={(value: number) => [`${value}%`, 'Percentage']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4">
          {data.map((item) => (
            <div 
              key={item.name}
              className="flex items-center gap-2"
              onClick={() => onSegmentClick?.(item.name)}
              style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ 
                  backgroundColor: COLORS[item.name as keyof typeof COLORS] || '#6b7280',
                  opacity: activeFilter && activeFilter !== item.name ? 0.3 : 1
                }}
              />
              <span className={`text-xs font-medium ${
                activeFilter === item.name ? 'text-blue-600' : 'text-gray-600'
              }`}>
                {item.name}
              </span>
              <span className="text-xs text-gray-900 font-semibold">{item.value}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
