
import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Activity, 
  AlertTriangle, 
  User, 
  Clock,
  ArrowRight,
  Filter,
  Download,
  RotateCcw,
  Check,
  X,
  Search,
  Eye,
  Terminal,
  ShieldAlert,
  Info
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { mockRuns, mockAlerts, mockAuditLogs, mockApprovals } from '@/lib/mock-data';
import { cn as utilsCn } from '@/lib/utils';

// --- Activity Center (Combined Runs & Alerts) ---
export function ActivityCenter() {
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredRuns = mockRuns.filter(run => 
    run.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    run.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAlerts = mockAlerts.filter(alert => 
    alert.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    alert.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Activity Center</h1>
          <p className="text-zinc-500 mt-1">Monitor execution runs and system alerts in real-time.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            <Input 
              placeholder="Search activity..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
            />
          </div>
          <Button variant="outline" className="bg-zinc-900 border-zinc-800 text-zinc-400 gap-2">
            <Download size={16} /> Export
          </Button>
        </div>
      </div>

      <Tabs defaultValue="runs" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
          <TabsTrigger value="runs" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
            <Activity size={14} /> Execution Runs
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
            <AlertTriangle size={14} /> Alerts & Incidents
            {mockAlerts.length > 0 && (
              <Badge className="bg-rose-500 text-white border-none h-4 px-1 min-w-[16px] flex items-center justify-center text-[10px]">
                {mockAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-6">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-950/50">
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Run ID</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Workflow</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Status</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Trigger</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Start Time</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px] text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => (
                  <TableRow key={run.id} className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer group">
                    <TableCell className="font-mono text-[10px] text-zinc-500">{run.id}</TableCell>
                    <TableCell className="font-medium text-zinc-200">{run.workflowName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {run.status === 'success' ? <CheckCircle2 size={14} className="text-emerald-500" /> :
                         run.status === 'failed' ? <XCircle size={14} className="text-rose-500" /> :
                         <Activity size={14} className="text-indigo-500 animate-pulse" />}
                        <span className={utilsCn(
                          "text-xs font-medium capitalize",
                          run.status === 'success' ? "text-emerald-500" :
                          run.status === 'failed' ? "text-rose-500" :
                          "text-indigo-500"
                        )}>{run.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-xs">{run.trigger}</TableCell>
                    <TableCell className="text-zinc-400 text-xs">{run.startTime}</TableCell>
                    <TableCell className="text-right text-zinc-400 text-xs">{run.duration}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <div className="grid gap-4">
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className="bg-zinc-900 border-zinc-800 border-l-4 border-l-rose-500">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-rose-500/10 text-rose-500">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-zinc-200">{alert.workflowName}</h3>
                        <Badge variant="outline" className="text-[10px] border-rose-500/20 text-rose-500 uppercase">{alert.severity}</Badge>
                      </div>
                      <p className="text-sm text-zinc-400 mt-0.5">{alert.message}</p>
                      <p className="text-[10px] text-zinc-600 mt-1 flex items-center gap-1">
                        <Clock size={10} /> {alert.time}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800">
                      Dismiss
                    </Button>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                      <RotateCcw size={14} /> Retry Run
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredAlerts.length === 0 && (
              <div className="p-12 text-center bg-zinc-900 rounded-lg border border-zinc-800">
                <CheckCircle2 size={48} className="mx-auto text-emerald-500/20 mb-4" />
                <h3 className="text-lg font-medium text-zinc-200">All clear!</h3>
                <p className="text-zinc-500">No active alerts or incidents found.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Audit Logs Page ---
export function AuditLogs() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Audit Logs</h1>
          <p className="text-zinc-500 mt-1">Full security audit trail for all workspace actions.</p>
        </div>
        <Button variant="outline" className="bg-zinc-900 border-zinc-800 text-zinc-400 gap-2">
          <Download size={16} /> Export CSV
        </Button>
      </div>
      
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-zinc-950/50">
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">User</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Action</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Target</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">IP Address</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] text-right">Time</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockAuditLogs.map((log) => (
              <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/50">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">
                      {log.user[0]}
                    </div>
                    <span className="text-sm font-medium text-zinc-200">{log.user}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-400">{log.action}</Badge>
                </TableCell>
                <TableCell className="text-sm text-zinc-200 font-medium">{log.target}</TableCell>
                <TableCell className="text-xs text-zinc-500 font-mono">{log.ip}</TableCell>
                <TableCell className="text-right text-zinc-500 text-xs">{log.time}</TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger className="h-8 w-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors outline-none">
                      <Info size={14} />
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <DialogHeader>
                        <DialogTitle>Audit Log Details</DialogTitle>
                        <DialogDescription className="text-zinc-500">Detailed report for event {log.id}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold">User</p>
                            <p className="mt-1">{log.user}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold">Time</p>
                            <p className="mt-1">{log.time}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold">Action</p>
                            <p className="mt-1">{log.action}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 text-xs uppercase font-bold">IP Address</p>
                            <p className="mt-1 font-mono">{log.ip}</p>
                          </div>
                        </div>
                        <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                          <p className="text-zinc-500 text-xs uppercase font-bold mb-2">Changes</p>
                          <p className="text-sm text-zinc-300 leading-relaxed">{log.changes}</p>
                        </div>
                        <div className="text-[10px] text-zinc-600">
                          User Agent: {log.userAgent}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Approvals Page ---
export function Approvals() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Pending Approvals</h1>
          <p className="text-zinc-500 mt-1">Review and authorize sensitive workflow actions.</p>
        </div>
        <Badge className="bg-indigo-600 text-white px-3 py-1">{mockApprovals.length} Pending</Badge>
      </div>
      
      <div className="grid gap-6">
        {mockApprovals.map((approval) => (
          <Card key={approval.id} className="bg-zinc-900 border-zinc-800 overflow-hidden">
            <div className={utilsCn(
              "h-1 w-full",
              approval.priority === 'high' ? "bg-rose-500" : "bg-indigo-500"
            )} />
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-6">
                  <div className={utilsCn(
                    "p-3 rounded-xl",
                    approval.priority === 'high' ? "bg-rose-500/10 text-rose-500" : "bg-indigo-500/10 text-indigo-500"
                  )}>
                    <ShieldAlert size={24} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-white">{approval.workflowName}</h3>
                      <Badge variant="outline" className={utilsCn(
                        "text-[10px] uppercase",
                        approval.priority === 'high' ? "border-rose-500/20 text-rose-500" : "border-indigo-500/20 text-indigo-500"
                      )}>{approval.priority} Priority</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-500">
                      <span className="flex items-center gap-1"><User size={14} /> {approval.requestedBy}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Clock size={14} /> {approval.time}</span>
                    </div>
                    <div className="mt-4 p-4 bg-zinc-950 rounded-lg border border-zinc-800 max-w-2xl">
                      <p className="text-sm text-zinc-300 leading-relaxed">{approval.details}</p>
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-800">
                        <div>
                          <p className="text-[10px] font-bold text-zinc-600 uppercase">Impact Area</p>
                          <p className="text-xs text-zinc-400">{approval.impact}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-600 uppercase">Risk Level</p>
                          <p className="text-xs text-zinc-400">{approval.riskLevel}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row lg:flex-col gap-3 shrink-0">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 w-full">
                    <Check size={16} /> Approve Action
                  </Button>
                  <Button variant="outline" className="bg-zinc-950 border-zinc-800 text-rose-400 hover:bg-rose-950 hover:text-rose-300 gap-2 w-full">
                    <X size={16} /> Reject Request
                  </Button>
                  <Button variant="ghost" className="text-zinc-500 hover:text-white gap-2 w-full">
                    <Terminal size={14} /> View Payload
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CheckSquare({ size, className }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></svg>;
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
