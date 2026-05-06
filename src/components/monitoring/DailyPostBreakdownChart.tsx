import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DailyPostBreakdownChartProps {
  posts: any[]; // Raw posts data from the subreddit
}

const DailyPostBreakdownChart: React.FC<DailyPostBreakdownChartProps> = ({ posts }) => {
  // Generate the last 3 days (including today)
  const today = new Date();
  const last3Days = [];
  
  for (let i = 2; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    last3Days.push(date);
  }

  // Group posts by day and count them
  const dailyCounts = posts.reduce((acc, post) => {
    const postDate = new Date(post.created_utc * 1000);
    const dateStr = postDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
    acc[dateStr] = (acc[dateStr] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Create chart data for exactly the last 3 days
  const chartData = last3Days.map(date => {
    const dateStr = date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
    return {
      date: dateStr,
      count: dailyCounts[dateStr] || 0
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-blue-600 text-sm">Total Posts: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
          data={chartData} 
          margin={{
            top: 10,
            right: 10,
            left: 0,
            bottom: 30,
          }}
        >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              angle={-35} 
              textAnchor="end" 
              height={70} 
              tick={{ fill: '#6b7280', fontSize: 11 }}
              interval={0}
            />
            <YAxis 
              allowDecimals={false} 
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(29, 143, 225, 0.1)' }} />
            <Bar 
              dataKey="count" 
              fill="#1d8fe1" 
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DailyPostBreakdownChart;
