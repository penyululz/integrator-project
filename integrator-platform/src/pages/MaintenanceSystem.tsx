
import React, { useState, useMemo } from 'react';
import { 
  Wrench, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  MessageSquare, 
  MoreVertical, 
  UserPlus,
  Calendar,
  Tag,
  History,
  Send,
  Trash2,
  Check,
  X,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function MaintenanceSystem() {
  const { 
    tickets, 
    members, 
    addTicket, 
    updateTicket, 
    removeTicket,
    addTicketComment 
  } = useStore();
  
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  
  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  // Form States
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assignedTo: '',
    category: 'General'
  });
  
  const [newComment, setNewComment] = useState('');

  // Filtering
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      
      if (activeTab === 'my') {
        return matchesSearch && matchesStatus && matchesPriority && t.assignedTo === '1'; // Assuming '1' is current user
      }
      if (activeTab === 'resolved') {
        return matchesSearch && matchesPriority && t.status === 'resolved';
      }
      
      return matchesSearch && matchesStatus && matchesPriority;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tickets, searchQuery, statusFilter, priorityFilter, activeTab]);

  const handleCreateTicket = () => {
    if (!newTicket.title || !newTicket.description) {
      toast.error("Please fill in all required fields");
      return;
    }

    addTicket({
      id: `t_${Date.now()}`,
      ...newTicket,
      status: 'open',
      createdAt: new Date().toISOString(),
      reportedBy: 'Faris Malek',
      comments: []
    });

    toast.success("Maintenance ticket created successfully");
    setIsCreateModalOpen(false);
    setNewTicket({ title: '', description: '', priority: 'medium', assignedTo: '', category: 'General' });
  };

  const handleAddComment = (ticketId: string) => {
    if (!newComment.trim()) return;
    
    addTicketComment(ticketId, {
      text: newComment,
      author: 'Faris Malek'
    });
    
    setNewComment('');
    toast.success("Comment added");
  };

  const handleStatusChange = (id: string, status: string) => {
    updateTicket(id, { status });
    toast.success(`Ticket status updated to ${status}`);
  };

  const handleDeleteTicket = (id: string) => {
    removeTicket(id);
    toast.success("Ticket deleted");
    setIsDetailModalOpen(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      default: return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'in-progress': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'closed': return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
      default: return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Maintenance System</h1>
          <p className="text-zinc-500 mt-1">Manage facility repairs, equipment maintenance, and team reports.</p>
        </div>
        
        <Button onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Plus size={18} />
          Report Issue
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Tickets', value: tickets.length, icon: Tag, color: 'text-indigo-500' },
          { label: 'Open', value: tickets.filter(t => t.status === 'open').length, icon: Clock, color: 'text-amber-500' },
          { label: 'In Progress', value: tickets.filter(t => t.status === 'in-progress').length, icon: History, color: 'text-blue-500' },
          { label: 'Resolved', value: tickets.filter(t => t.status === 'resolved').length, icon: CheckCircle2, color: 'text-emerald-500' },
        ].map((stat, i) => (
          <Card key={i} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={cn("p-3 rounded-lg bg-zinc-950 border border-zinc-800", stat.color)}>
                <stat.icon size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1 self-start">
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">All Tickets</TabsTrigger>
            <TabsTrigger value="my" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Assigned to Me</TabsTrigger>
            <TabsTrigger value="resolved" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Resolved</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <Input 
                placeholder="Search tickets..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 bg-zinc-900 border-zinc-800 h-9 text-zinc-400">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-32 bg-zinc-900 border-zinc-800 h-9 text-zinc-400">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value={activeTab} className="space-y-4">
          {filteredTickets.length > 0 ? (
            <div className="grid gap-4">
              {filteredTickets.map((ticket) => {
                const assignedUser = members.find(m => m.id === ticket.assignedTo);
                return (
                  <Card 
                    key={ticket.id} 
                    className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group"
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "p-3 rounded-xl border",
                          getPriorityColor(ticket.priority)
                        )}>
                          <Wrench size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h4 className="font-bold text-zinc-100 text-lg">{ticket.title}</h4>
                            <Badge variant="outline" className={cn("text-[10px] uppercase font-bold", getStatusColor(ticket.status))}>
                              {ticket.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 mt-2">
                            <span className="flex items-center gap-1.5"><Calendar size={12} /> {new Date(ticket.createdAt).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1.5"><User size={12} /> {assignedUser?.name || 'Unassigned'}</span>
                            <span className="flex items-center gap-1.5"><Tag size={12} /> {ticket.category || 'General'}</span>
                            <span className="flex items-center gap-1.5"><MessageSquare size={12} /> {ticket.comments?.length || 0} comments</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end mr-4">
                          <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-wider">Priority</span>
                          <span className={cn("text-xs font-bold", ticket.priority === 'urgent' ? "text-rose-500" : "text-zinc-400")}>
                            {ticket.priority.toUpperCase()}
                          </span>
                        </div>
                        <ChevronRight className="text-zinc-700 group-hover:text-zinc-400 transition-colors" size={20} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-800">
              <div className="bg-zinc-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                <Wrench size={24} className="text-zinc-700" />
              </div>
              <h3 className="text-lg font-medium text-zinc-400">No maintenance tickets found</h3>
              <p className="text-zinc-600 mt-1 max-w-xs mx-auto">Adjust your filters or report a new issue to get started.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Ticket Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Report Maintenance Issue</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Provide details about the issue to help our team resolve it quickly.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Issue Title</Label>
              <Input 
                id="title" 
                placeholder="e.g. Leaking pipe in Kitchen" 
                className="bg-zinc-950 border-zinc-800" 
                value={newTicket.title}
                onChange={(e) => setNewTicket({...newTicket, title: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select value={newTicket.category} onValueChange={(v) => setNewTicket({...newTicket, category: v})}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Plumbing">Plumbing</SelectItem>
                  <SelectItem value="Electrical">Electrical</SelectItem>
                  <SelectItem value="HVAC">HVAC</SelectItem>
                  <SelectItem value="Furniture">Furniture</SelectItem>
                  <SelectItem value="IT Hardware">IT Hardware</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Detailed Description</Label>
              <Textarea 
                id="description" 
                placeholder="Describe the problem, location, and any other relevant info..." 
                className="bg-zinc-950 border-zinc-800 min-h-[100px]" 
                value={newTicket.description}
                onChange={(e) => setNewTicket({...newTicket, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority Level</Label>
                <Select value={newTicket.priority} onValueChange={(v) => setNewTicket({...newTicket, priority: v})}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assign">Assign To</Label>
                <Select value={newTicket.assignedTo} onValueChange={(v) => setNewTicket({...newTicket, assignedTo: v})}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="">Unassigned</SelectItem>
                    {members.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} className="bg-zinc-800 border-zinc-700">Cancel</Button>
            <Button onClick={handleCreateTicket} className="bg-indigo-600 hover:bg-indigo-700">Submit Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200 sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          {selectedTicket && (
            <>
              <DialogHeader className="flex flex-row items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-[10px] uppercase font-bold", getPriorityColor(selectedTicket.priority))}>
                      {selectedTicket.priority} Priority
                    </Badge>
                    <span className="text-zinc-500 text-xs">#{selectedTicket.id}</span>
                  </div>
                  <DialogTitle className="text-2xl font-bold text-white">{selectedTicket.title}</DialogTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="text-zinc-500" />}>
                    <MoreVertical size={20} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <DropdownMenuItem onClick={() => handleDeleteTicket(selectedTicket.id)} className="text-rose-500 focus:bg-rose-950 gap-2">
                      <Trash2 size={14} /> Delete Ticket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-6">
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <h5 className="text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Description</h5>
                    <p className="text-zinc-300 leading-relaxed bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      {selectedTicket.description}
                    </p>
                  </div>

                  <div>
                    <h5 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider">Activity & Comments</h5>
                    <div className="space-y-4 mb-6">
                      {selectedTicket.comments?.length > 0 ? (
                        selectedTicket.comments.map((comment: any) => (
                          <div key={comment.id} className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                              {comment.author[0]}
                            </div>
                            <div className="flex-1 bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-zinc-300">{comment.author}</span>
                                <span className="text-[10px] text-zinc-500">{new Date(comment.createdAt).toLocaleDateString()}</span>
                              </div>
                              <p className="text-sm text-zinc-400">{comment.text}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-600 italic">No comments yet.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Add a comment..." 
                        className="bg-zinc-950 border-zinc-800" 
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment(selectedTicket.id)}
                      />
                      <Button size="icon" onClick={() => handleAddComment(selectedTicket.id)} className="bg-indigo-600 hover:bg-indigo-700 shrink-0">
                        <Send size={16} />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-zinc-500 mb-2 block">Status</Label>
                      <Select value={selectedTicket.status} onValueChange={(v) => handleStatusChange(selectedTicket.id, v)}>
                        <SelectTrigger className={cn("w-full border-zinc-800", getStatusColor(selectedTicket.status))}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[10px] uppercase font-bold text-zinc-500 mb-2 block">Assignee</Label>
                      <Select 
                        value={selectedTicket.assignedTo} 
                        onValueChange={(v) => updateTicket(selectedTicket.id, { assignedTo: v })}
                      >
                        <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-300">
                          <SelectValue placeholder="Assign member" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          <SelectItem value="">Unassigned</SelectItem>
                          {members.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="pt-4 border-t border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Reported By</span>
                        <span className="text-zinc-300 font-medium">{selectedTicket.reportedBy}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Category</span>
                        <span className="text-zinc-300 font-medium">{selectedTicket.category}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Created</span>
                        <span className="text-zinc-300 font-medium">{new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {selectedTicket.status !== 'resolved' && (
                    <Button 
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                      onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}
                    >
                      <CheckCircle2 size={18} />
                      Resolve Issue
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
