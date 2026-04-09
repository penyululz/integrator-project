
import React from 'react';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Play, 
  Edit2, 
  Trash2,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Workflow, mockWorkflows } from '@/lib/mock-data';

export function Workflows({ onCreateWorkflow, onEditWorkflow }: { onCreateWorkflow: () => void, onEditWorkflow: (workflow: Workflow) => void }) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const filteredWorkflows = mockWorkflows.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         w.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Workflows</h1>
          <p className="text-zinc-500 mt-1">Manage and monitor your automated processes.</p>
        </div>
        <Button 
          onClick={onCreateWorkflow}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
        >
          <Plus size={18} />
          Create Workflow
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <Input 
            placeholder="Search workflows..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase font-bold">Status:</span>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-zinc-950/50">
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider">Workflow Name</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider">Status</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider">Last Run</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider text-right">Runs</TableHead>
              <TableHead className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider text-right">Success Rate</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorkflows.map((workflow) => (
              <TableRow key={workflow.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors group">
                <TableCell>
                  <div>
                    <p className="font-medium text-zinc-200 group-hover:text-white">{workflow.name}</p>
                    <p className="text-xs text-zinc-500 line-clamp-1">{workflow.description}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    "text-[10px] uppercase font-bold",
                    workflow.status === 'active' ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5" :
                    workflow.status === 'inactive' ? "border-zinc-500/20 text-zinc-500 bg-zinc-500/5" :
                    "border-indigo-500/20 text-indigo-500 bg-indigo-500/5"
                  )}>
                    {workflow.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-400 text-sm">{workflow.lastRun}</TableCell>
                <TableCell className="text-right text-zinc-400 text-sm">{workflow.runsCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500" 
                        style={{ width: `${workflow.successRate}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-zinc-400">{workflow.successRate}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-zinc-500 hover:text-white hover:bg-zinc-800")}>
                      <MoreVertical size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <DropdownMenuItem className="gap-2 focus:bg-zinc-800">
                        <Play size={14} /> Run Now
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onEditWorkflow(workflow)}
                        className="gap-2 focus:bg-zinc-800 cursor-pointer"
                      >
                        <Edit2 size={14} /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-rose-400 focus:bg-rose-950 focus:text-rose-300">
                        <Trash2 size={14} /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
