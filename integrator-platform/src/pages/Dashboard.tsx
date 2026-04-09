
import React from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Plus,
  ArrowUpRight,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockRuns, mockWorkflows } from '@/lib/mock-data';

export function Dashboard({ onCreateWorkflow, onBrowseTemplates }: { onCreateWorkflow: () => void, onBrowseTemplates: () => void }) {
  const stats = [
    { label: 'Total Runs', value: '12,450', icon: Activity, color: 'text-indigo-500' },
    { label: 'Success Rate', value: '98.2%', icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Failed Runs', value: '24', icon: XCircle, color: 'text-rose-500' },
    { label: 'Avg. Duration', value: '1.4s', icon: Clock, color: 'text-amber-500' },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="text-zinc-500 mt-1">Welcome back, Faris. Here's what's happening today.</p>
        </div>
        <Button 
          onClick={onCreateWorkflow}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
        >
          <Plus size={18} />
          Create Workflow
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-lg bg-zinc-950 border border-zinc-800 ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1 text-[10px] text-zinc-500">
                <span className="text-emerald-500 flex items-center font-medium">
                  <ArrowUpRight size={12} /> 12%
                </span>
                <span>vs last 7 days</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Runs */}
        <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white">Recent Runs</CardTitle>
              <CardDescription className="text-zinc-500">Latest execution history across all workflows.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-2 rounded-full",
                      run.status === 'success' ? "bg-emerald-500/10 text-emerald-500" :
                      run.status === 'failed' ? "bg-rose-500/10 text-rose-500" :
                      run.status === 'running' ? "bg-indigo-500/10 text-indigo-500 animate-pulse" :
                      "bg-zinc-500/10 text-zinc-500"
                    )}>
                      {run.status === 'success' ? <CheckCircle2 size={16} /> :
                       run.status === 'failed' ? <XCircle size={16} /> :
                       <Activity size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">{run.workflowName}</p>
                      <p className="text-xs text-zinc-500">{run.trigger} • {run.startTime}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={cn(
                      "text-[10px] uppercase font-bold",
                      run.status === 'success' ? "border-emerald-500/20 text-emerald-500" :
                      run.status === 'failed' ? "border-rose-500/20 text-rose-500" :
                      "border-indigo-500/20 text-indigo-500"
                    )}>
                      {run.status}
                    </Badge>
                    <p className="text-[10px] text-zinc-600 mt-1">{run.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions / Onboarding */}
        <div className="space-y-6">
          <Card className="bg-indigo-600 border-none text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap size={120} fill="currentColor" />
            </div>
            <CardHeader>
              <CardTitle>Ready to automate?</CardTitle>
              <CardDescription className="text-indigo-100">Start with a template to get your first workflow running in minutes.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={onBrowseTemplates}
                className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-bold"
              >
                Browse Templates
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Execution Engine</span>
                <span className="text-emerald-500 font-medium">Operational</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Database</span>
                <span className="text-emerald-500 font-medium">Operational</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Integrations API</span>
                <span className="text-emerald-500 font-medium">Operational</span>
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-600">Last incident reported 12 days ago.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper for conditional classes
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
