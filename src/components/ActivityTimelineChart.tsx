import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TimelineData {
  date: string;
  posts: number;
  comments: number;
}

interface ActivityTimelineChartProps {
  data: TimelineData[];
  height?: number;
}

export const ActivityTimelineChart = ({ data, height = 300 }: ActivityTimelineChartProps) => {
  return (
    <Card className="border-border/40 bg-white shadow-sm hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Posting Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                angle={-15}
                textAnchor="end"
                height={30}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  padding: '8px 12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                formatter={(value: number, name: string) => [value, name === 'posts' ? 'Posts' : 'Comments']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey="posts" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, stroke: '#fff', r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                name="posts"
              />
              <Line 
                type="monotone" 
                dataKey="comments" 
                stroke="#10b981" 
                strokeWidth={2}
                dot={{ fill: '#10b981', strokeWidth: 2, stroke: '#fff', r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                name="comments"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs font-medium text-gray-600">Posts</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs font-medium text-gray-600">Comments</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
