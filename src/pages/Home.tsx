import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardTitle, CardDescription, CardHeader } from '@/components/ui/card';
import { FolderOpen, Search, Folder, CheckCircle, Clock, ArrowRight, TrendingUp, PieChart, BarChart3, Plus, Calendar, ChevronDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import folderSearchIcon from '@/assets/folder-search-icon.png';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Area,
  AreaChart,
} from 'recharts';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachHourOfInterval, eachDayOfInterval, eachWeekOfInterval, isSameDay, subDays, subWeeks, subMonths } from 'date-fns';

interface CaseItem {
  id: string;
  case_name: string;
  case_number: string;
  status: string;
  created_at: string;
  description: string;
  department: string | null;
}

const useCountUp = (end: number, duration = 1200, start = 0) => {
  const [value, setValue] = useState(start);
  const ref = useRef<number>();

  useEffect(() => {
    if (end === start) { setValue(start); return; }
    const startTime = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (end - start) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [end, duration, start]);

  return value;
};

type TimeFilter = 'day' | 'week' | 'month' | 'custom';

interface ActivityDataPoint {
  label: string;
  cases: number;
}

const Home = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Activity trend filter states
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [activityData, setActivityData] = useState<ActivityDataPoint[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const { data, error } = await supabase
          .from('investigation_cases')
          .select('id, case_name, case_number, status, created_at, description, department')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCases(data || []);
      } catch (error) {
        console.error('Error fetching cases:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCases();
  }, []);

  const handleSelectCase = (caseItem: CaseItem) => {
    const selectedCase = {
      id: caseItem.id,
      name: caseItem.case_number,
      description: caseItem.case_name,
      status: caseItem.status,
      date: new Date(caseItem.created_at).toLocaleDateString()
    };
    localStorage.setItem('selectedCase', JSON.stringify(selectedCase));
    window.dispatchEvent(new Event('storage'));
    setIsDialogOpen(false);
    navigate('/dashboard');
  };

  const filteredCases = cases.filter(c =>
    c.case_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.case_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-forensic-success/20 text-forensic-success border-forensic-success/30';
      case 'closed': return 'bg-muted text-muted-foreground border-muted-foreground/30';
      default: return 'bg-forensic-warning/20 text-forensic-warning border-forensic-warning/30';
    }
  };

  const totalCount = useCountUp(isLoading ? 0 : cases.length);
  const activeCount = useCountUp(isLoading ? 0 : cases.filter(c => c.status?.toLowerCase() === 'active').length);
  const closedCount = useCountUp(isLoading ? 0 : cases.filter(c => c.status?.toLowerCase() === 'closed').length);

  const recentCases = cases.slice(0, 3);

  // Fetch case creation data based on time filter
  const fetchActivityData = async () => {
    if (cases.length === 0) return;
    
    setIsActivityLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;
      
      switch (timeFilter) {
        case 'day':
          startDate = startOfDay(customDate);
          endDate = endOfDay(customDate);
          break;
        case 'week':
          startDate = startOfWeek(customDate, { weekStartsOn: 1 });
          endDate = endOfWeek(customDate, { weekStartsOn: 1 });
          break;
        case 'month':
          startDate = startOfMonth(customDate);
          endDate = endOfMonth(customDate);
          break;
        case 'custom':
          startDate = startOfDay(customDate);
          endDate = endOfDay(customDate);
          break;
        default:
          startDate = startOfMonth(customDate);
          endDate = endOfMonth(customDate);
      }
      
      // Fetch only case creation data from investigation_cases
      const { data: casesData, error } = await supabase
        .from('investigation_cases')
        .select('created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (error) throw error;
      
      // Process data based on time filter - only count cases created
      const data: ActivityDataPoint[] = [];
      
      if (timeFilter === 'day' || timeFilter === 'custom') {
        // Group by hours (00:00 - 23:00)
        const hours = eachHourOfInterval({ start: startDate, end: endDate });
        hours.forEach(hour => {
          const hourLabel = format(hour, 'HH:00');
          const hourStart = hour.getTime();
          const hourEnd = hourStart + 3600000; // +1 hour
          
          const caseCount = (casesData || []).filter(c => {
            const t = new Date(c.created_at).getTime();
            return t >= hourStart && t < hourEnd;
          }).length;
          
          data.push({
            label: hourLabel,
            cases: caseCount
          });
        });
      } else if (timeFilter === 'week') {
        // Group by days (Mon-Sun)
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        days.forEach(day => {
          const dayLabel = format(day, 'EEE');
          const dayStart = startOfDay(day).getTime();
          const dayEnd = endOfDay(day).getTime();
          
          const caseCount = (casesData || []).filter(c => {
            const t = new Date(c.created_at).getTime();
            return t >= dayStart && t <= dayEnd;
          }).length;
          
          data.push({
            label: dayLabel,
            cases: caseCount
          });
        });
      } else if (timeFilter === 'month') {
        // Group by dates (1-31)
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        days.forEach(day => {
          const dayLabel = format(day, 'd');
          const dayStart = startOfDay(day).getTime();
          const dayEnd = endOfDay(day).getTime();
          
          const caseCount = (casesData || []).filter(c => {
            const t = new Date(c.created_at).getTime();
            return t >= dayStart && t <= dayEnd;
          }).length;
          
          data.push({
            label: dayLabel,
            cases: caseCount
          });
        });
      }
      
      setActivityData(data);
    } catch (error) {
      console.error('Error fetching case data:', error);
    } finally {
      setIsActivityLoading(false);
    }
  };
  
  // Fetch activity data when filter changes
  useEffect(() => {
    if (!isLoading && cases.length > 0) {
      fetchActivityData();
    }
  }, [timeFilter, customDate, cases, isLoading]);
  
  // Legacy chart data (kept for other charts)
  const activityTrendData = useMemo(() => {
    if (cases.length === 0) return [];
    
    const dateMap = new Map<string, number>();
    
    cases.forEach(c => {
      if (!c.created_at) return;
      const date = new Date(c.created_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      dateMap.set(monthKey, (dateMap.get(monthKey) || 0) + 1);
    });
    
    return Array.from(dateMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => {
        const dateA = new Date(`01 ${a.month}`);
        const dateB = new Date(`01 ${b.month}`);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(-12); // Last 12 months
  }, [cases]);

  const statusData = useMemo(() => {
    const active = cases.filter(c => c.status?.toLowerCase() === 'active').length;
    const closed = cases.filter(c => c.status?.toLowerCase() === 'closed').length;
    const pending = cases.filter(c => !c.status || (c.status?.toLowerCase() !== 'active' && c.status?.toLowerCase() !== 'closed')).length;
    return [
      { name: 'Open', value: active, color: '#3b82f6' },
      { name: 'Closed', value: closed, color: '#10b981' },
      { name: 'Pending', value: pending, color: '#f59e0b' },
    ].filter(item => item.value > 0);
  }, [cases]);

  // Case Insights calculations
  const insights = useMemo(() => {
    if (cases.length === 0) return null;

    // 1. Most Active Month
    const monthMap = new Map<string, number>();
    cases.forEach(c => {
      if (!c.created_at) return;
      const date = new Date(c.created_at);
      const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
    });
    const mostActiveMonth = Array.from(monthMap.entries())
      .sort((a, b) => b[1] - a[1])[0];

    // 2. Most Recent Case
    const mostRecentCase = cases.reduce((latest, current) => {
      return new Date(current.created_at) > new Date(latest.created_at) ? current : latest;
    }, cases[0]);

    // 3. Monthly Growth
    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const currentMonthCount = monthMap.get(currentMonth) || 0;
    const prevMonthCount = monthMap.get(prevMonth) || 0;
    const growth = currentMonthCount - prevMonthCount;

    // 4. Status Distribution
    const activeCount = cases.filter(c => c.status?.toLowerCase() === 'active').length;
    const closedCount = cases.filter(c => c.status?.toLowerCase() === 'closed').length;
    const activePercentage = Math.round((activeCount / cases.length) * 100);
    const dominantStatus = activePercentage > 50 ? 'Active' : 'Closed';

    return {
      mostActiveMonth: mostActiveMonth ? { month: mostActiveMonth[0], count: mostActiveMonth[1] } : null,
      mostRecentCase,
      monthlyGrowth: { current: currentMonthCount, previous: prevMonthCount, growth },
      statusDistribution: { activePercentage, dominantStatus }
    };
  }, [cases]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Reddit estimated user growth data (2010-2026)
const redditUserData = [
  { year: '2010', users: 15 },
  { year: '2011', users: 22 },
  { year: '2012', users: 35 },
  { year: '2013', users: 55 },
  { year: '2014', users: 75 },
  { year: '2015', users: 110 },
  { year: '2016', users: 170 },
  { year: '2017', users: 250 },
  { year: '2018', users: 330 },
  { year: '2019', users: 430 },
  { year: '2020', users: 520 },
  { year: '2021', users: 610 },
  { year: '2022', users: 700 },
  { year: '2023', users: 850 },
  { year: '2024', users: 910 },
  { year: '2025', users: 953 },
  { year: '2026', users: 1020 },
];

const formatUserCount = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} Billion`;
  }
  return `${value} Million`;
};

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      <div className="flex-1 overflow-hidden flex flex-col items-center p-2 md:p-3">
        <div className="w-full max-w-7xl flex-1 overflow-hidden flex flex-col space-y-2">

          {/* Metrics Row - 3 separate cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 animate-fade-in-up flex-shrink-0">
            <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Total Cases</p>
                    <p className="text-xl font-bold text-foreground">{isLoading ? '–' : totalCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Active Cases</p>
                    <p className="text-xl font-bold text-foreground">{isLoading ? '–' : activeCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Closed Cases</p>
                    <p className="text-xl font-bold text-foreground">{isLoading ? '–' : closedCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 animate-fade-in-up flex-shrink-0" style={{ animationDelay: '0.1s' }}>
            <Card className="rounded-xl border border-border/40 bg-primary/5 hover:bg-primary/10 hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer" onClick={() => navigate('/new-case')}>
              <CardContent className="p-2 flex flex-col items-center text-center space-y-1">
                <Plus className="h-5 w-5 text-primary" />
                <CardTitle className="text-xs font-semibold">Create New Case</CardTitle>
                <p className="text-[11px] text-muted-foreground">Launch a New Intelligence Case</p>
              </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Card className="rounded-xl border border-border/40 bg-primary/5 hover:bg-primary/10 hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer">
                  <CardContent className="p-2 flex flex-col items-center text-center space-y-1">
                    <Folder className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xs font-semibold">Open Existing Case</CardTitle>
                    <p className="text-[11px] text-muted-foreground">{cases.length} cases available</p>
                  </CardContent>
                </Card>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Select a Case</DialogTitle>
                </DialogHeader>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search cases..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <ScrollArea className="h-[400px] pr-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner text="" size="md" showPercentage={false} />
                    </div>
                  ) : filteredCases.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {cases.length === 0 ? 'No cases found. Create a new case to get started.' : 'No matching cases found.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCases.map((caseItem) => (
                        <Card
                          key={caseItem.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleSelectCase(caseItem)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="font-medium">{caseItem.case_number}</div>
                                <div className="text-sm text-muted-foreground">{caseItem.case_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  Created: {new Date(caseItem.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <Badge variant="outline" className={getStatusColor(caseItem.status)}>
                                {caseItem.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>

          {/* Activity Trend Line Chart with Dynamic Filters */}
          {!isLoading && cases.length > 0 && (
            <div className="animate-fade-in-up flex-shrink-0" style={{ animationDelay: '0.2s' }}>
              <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-1 pt-2 px-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-medium">Cases Created Over Time</CardTitle>
                  
                  {/* Filter Controls */}
                  <div className="flex items-center gap-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] font-medium">
                          {timeFilter === 'day' && 'By Day'}
                          {timeFilter === 'week' && 'By Week'}
                          {timeFilter === 'month' && 'By Month'}
                          {timeFilter === 'custom' && 'Custom Date'}
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[120px]">
                        <DropdownMenuItem onClick={() => setTimeFilter('day')} className="text-xs">
                          By Day
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTimeFilter('week')} className="text-xs">
                          By Week
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTimeFilter('month')} className="text-xs">
                          By Month
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTimeFilter('custom')} className="text-xs">
                          Custom Date
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    {(timeFilter === 'day' || timeFilter === 'custom') && (
                      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(customDate, 'MMM d')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <CalendarComponent
                            mode="single"
                            selected={customDate}
                            onSelect={(date) => {
                              if (date) {
                                setCustomDate(date);
                                setIsCalendarOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                    
                    {timeFilter === 'week' && (
                      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                            <Calendar className="h-3 w-3 mr-1" />
                            Week of {format(startOfWeek(customDate, { weekStartsOn: 1 }), 'MMM d')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <CalendarComponent
                            mode="single"
                            selected={customDate}
                            onSelect={(date) => {
                              if (date) {
                                setCustomDate(date);
                                setIsCalendarOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                    
                    {timeFilter === 'month' && (
                      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(customDate, 'MMM yyyy')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <CalendarComponent
                            mode="single"
                            selected={customDate}
                            onSelect={(date) => {
                              if (date) {
                                setCustomDate(date);
                                setIsCalendarOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="h-[140px] w-full">
                    {isActivityLoading ? (
                      <div className="h-full flex items-center justify-center">
                        <LoadingSpinner text="" size="sm" showPercentage={false} />
                      </div>
                    ) : activityData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        No activity data for selected period
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activityData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.75}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis 
                            dataKey="label" 
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            tickLine={false}
                            axisLine={false}
                            interval={timeFilter === 'day' ? 2 : 0}
                          />
                          <YAxis 
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            width={20}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '11px',
                              padding: '8px 12px',
                            }}
                            formatter={(value: number) => [value, 'Cases Created']}
                            labelFormatter={(label) => {
                              if (timeFilter === 'day' || timeFilter === 'custom') {
                                return `Time: ${label}`;
                              }
                              return `Date: ${label}`;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="cases" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorCases)" 
                            name="cases"
                            animationDuration={500}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="cases" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            dot={{ fill: '#3b82f6', strokeWidth: 2, stroke: '#fff', r: 3 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            name="cases"
                            animationDuration={600}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                      <span className="text-[10px] text-muted-foreground">Cases Created</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Secondary Charts Row */}
          {!isLoading && cases.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 animate-fade-in-up flex-shrink-0" style={{ animationDelay: '0.3s' }}>
              {/* Case Status Donut Chart */}
              <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-1 pt-2 px-3">
                  <CardTitle className="text-xs font-medium">Case Status</CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="flex items-center justify-center h-full gap-3">
                    <div className="h-[130px] w-[130px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={42}
                            outerRadius={62}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '11px',
                              padding: '4px 8px',
                            }}
                          />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-foreground">{cases.length}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-[70px]">
                      {statusData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
                            <span className="text-[11px] text-muted-foreground">{item.name}</span>
                          </div>
                          <span className="text-[11px] font-medium">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Case Insights Panel */}
              <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-1 pt-2 px-3">
                  <CardTitle className="text-xs font-medium">Case Insights</CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="space-y-2">
                    {/* Most Active Period */}
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded bg-primary/10 mt-0.5">
                        <TrendingUp className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-muted-foreground">Most Active Period</p>
                        <p className="text-xs font-semibold text-foreground">
                          {insights?.mostActiveMonth 
                            ? `${insights.mostActiveMonth.month} (${insights.mostActiveMonth.count} cases)`
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Most Recent Case */}
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded bg-green-500/10 mt-0.5">
                        <Clock className="h-3 w-3 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-muted-foreground">Most Recent Case</p>
                        <p className="text-xs font-semibold text-foreground truncate">
                          {insights?.mostRecentCase.case_number}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {insights?.mostRecentCase.case_name}
                        </p>
                      </div>
                    </div>

                    {/* Monthly Growth */}
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded bg-blue-500/10 mt-0.5">
                        <Plus className="h-3 w-3 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-muted-foreground">Monthly Growth</p>
                        <p className="text-xs font-semibold text-foreground">
                          {(() => {
                            const growth = insights?.monthlyGrowth.growth ?? 0;
                            if (growth > 0) return `+${growth} new cases this month`;
                            if (growth < 0) return `${Math.abs(growth)} fewer cases than last month`;
                            return 'No change from last month';
                          })()}
                        </p>
                      </div>
                    </div>

                    {/* Status Distribution */}
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded bg-amber-500/10 mt-0.5">
                        <PieChart className="h-3 w-3 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-muted-foreground">Case Status Overview</p>
                        <p className="text-xs font-semibold text-foreground">
                          {insights?.statusDistribution.dominantStatus} majority ({insights?.statusDistribution.activePercentage}%)
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reddit Users Growth Chart */}
              <Card className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-1 pt-2 px-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xs font-medium">Reddit Estimated Users Across Years</CardTitle>
                      <p className="text-[10px] text-muted-foreground">Estimated platform growth (2010–2026)</p>
                    </div>
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="h-[110px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={redditUserData} margin={{ top: 5, right: 15, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="year"
                          tick={{ fontSize: 8, fill: '#6b7280' }}
                          tickLine={false}
                          axisLine={false}
                          interval={3}
                        />
                        <YAxis
                          tick={{ fontSize: 8, fill: '#6b7280' }}
                          tickLine={false}
                          axisLine={false}
                          width={30}
                          tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}B` : `${value}M`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '11px',
                            padding: '8px 12px',
                          }}
                          formatter={(value: number) => [formatUserCount(value), 'Estimated Users']}
                          labelFormatter={(label) => `${label}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="users"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorUsers)"
                          animationDuration={800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Cases */}
          {!isLoading && recentCases.length > 0 && (
            <div className="space-y-1 animate-fade-in-up flex-shrink-0 mb-0 pb-0" style={{ animationDelay: '0.4s' }}>
              <h2 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent Cases
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {recentCases.map((c) => (
                  <Card
                    key={c.id}
                    className="rounded-xl border border-border/40 backdrop-blur-md bg-card/70 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer group min-h-[80px]"
                    onClick={() => handleSelectCase(c)}
                  >
                    <CardContent className="p-2 flex flex-col justify-center space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">{c.case_number}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${getStatusColor(c.status)}`}>
                          {c.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{c.case_name}</p>
                      <p className="text-[10px] text-muted-foreground/70">{new Date(c.created_at).toLocaleDateString()}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Home;
