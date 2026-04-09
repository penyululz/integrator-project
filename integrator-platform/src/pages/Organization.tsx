import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Settings, 
  MoreVertical, 
  Mail, 
  ShieldCheck, 
  Plus, 
  Search, 
  Filter, 
  Folder, 
  LayoutGrid, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  Building2,
  UserCheck,
  UserMinus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function Organization() {
  const { 
    members, 
    teams, 
    departments, 
    addMember, 
    updateMember, 
    removeMember,
    addTeam,
    updateTeam,
    removeTeam,
    addDepartment,
    updateDepartment,
    removeDepartment
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('members');

  // Modal States
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Form States
  const [memberForm, setMemberForm] = useState({ name: '', email: '', role: 'Member', status: 'Active' });
  const [teamForm, setTeamForm] = useState({ name: '', role: '', members: [] as string[] });
  const [deptForm, setDeptForm] = useState({ name: '', teams: [] as string[] });

  // Filtering
  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTeams = teams.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDepts = departments.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handlers - Members
  const handleSaveMember = () => {
    if (!memberForm.name || !memberForm.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (editingItem) {
      updateMember(editingItem.id, memberForm);
      toast.success("Member updated successfully");
    } else {
      addMember({ ...memberForm, id: `m_${Date.now()}`, joinedAt: new Date().toLocaleDateString() });
      toast.success("Member invited successfully");
    }
    setIsMemberModalOpen(false);
    setEditingItem(null);
    setMemberForm({ name: '', email: '', role: 'Member', status: 'Active' });
  };

  const handleDeleteMember = (id: string) => {
    removeMember(id);
    toast.success("Member removed from organization");
  };

  // Handlers - Teams
  const handleSaveTeam = () => {
    if (!teamForm.name) {
      toast.error("Team name is required");
      return;
    }

    if (editingItem) {
      updateTeam(editingItem.id, teamForm);
      toast.success("Team updated successfully");
    } else {
      addTeam({ ...teamForm, id: `t_${Date.now()}` });
      toast.success("Team created successfully");
    }
    setIsTeamModalOpen(false);
    setEditingItem(null);
    setTeamForm({ name: '', role: '', members: [] });
  };

  const handleDeleteTeam = (id: string) => {
    removeTeam(id);
    toast.success("Team deleted");
  };

  // Handlers - Departments
  const handleSaveDept = () => {
    if (!deptForm.name) {
      toast.error("Department name is required");
      return;
    }

    if (editingItem) {
      updateDepartment(editingItem.id, deptForm);
      toast.success("Department updated successfully");
    } else {
      addDepartment({ ...deptForm, id: `d_${Date.now()}` });
      toast.success("Department created successfully");
    }
    setIsDeptModalOpen(false);
    setEditingItem(null);
    setDeptForm({ name: '', teams: [] });
  };

  const handleDeleteDept = (id: string) => {
    removeDepartment(id);
    toast.success("Department deleted");
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Organization</h1>
          <p className="text-zinc-500 mt-1">Manage team members, roles, and workspace permissions.</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'members' && (
            <Button onClick={() => { setEditingItem(null); setIsMemberModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <UserPlus size={18} />
              Invite Member
            </Button>
          )}
          {activeTab === 'teams' && (
            <Button onClick={() => { setEditingItem(null); setIsTeamModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Plus size={18} />
              New Team
            </Button>
          )}
          {activeTab === 'departments' && (
            <Button onClick={() => { setEditingItem(null); setIsDeptModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Plus size={18} />
              New Department
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
          <TabsTrigger value="members" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
            <Users size={14} /> Members
          </TabsTrigger>
          <TabsTrigger value="teams" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
            <LayoutGrid size={14} /> Teams
          </TabsTrigger>
          <TabsTrigger value="departments" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
            <Folder size={14} /> Departments
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <Input 
              placeholder={`Search ${activeTab}...`} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200"
            />
          </div>
          <Button variant="outline" className="bg-zinc-900 border-zinc-800 text-zinc-400 gap-2">
            <Filter size={16} /> Filter
          </Button>
        </div>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6 mt-6">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-950/50">
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Member</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Role</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Status</TableHead>
                  <TableHead className="text-zinc-400 font-bold uppercase text-[10px]">Joined</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length > 0 ? filteredMembers.map((member) => (
                  <TableRow key={member.id} className="border-zinc-800 hover:bg-zinc-800/50 group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 border border-zinc-700">
                          {member.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{member.name}</p>
                          <p className="text-xs text-zinc-500">{member.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {member.role === 'Admin' || member.role === 'Owner' ? <ShieldCheck size={14} className="text-indigo-400" /> : <Shield size={14} className="text-zinc-500" />}
                        <span className="text-xs text-zinc-300">{member.role}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "text-[10px] uppercase",
                        member.status === 'Active' ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5" : "border-zinc-700 text-zinc-500"
                      )}>
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">{member.joinedAt || member.joinDate}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white" />}>
                          <MoreVertical size={16} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          <DropdownMenuItem onClick={() => { setEditingItem(member); setMemberForm({ name: member.name, email: member.email, role: member.role, status: member.status }); setIsMemberModalOpen(true); }} className="gap-2 focus:bg-zinc-800">
                            <Edit2 size={14} /> Edit Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 focus:bg-zinc-800">
                            <Mail size={14} /> Send Message
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteMember(member.id)} className="gap-2 text-rose-400 focus:bg-rose-950 focus:text-rose-300">
                            <UserMinus size={14} /> Remove Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-zinc-500">
                      No members found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Teams Tab */}
        <TabsContent value="teams" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {filteredTeams.length > 0 ? filteredTeams.map((team) => (
              <Card key={team.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all group">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-white">{team.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500" />}>
                        <MoreVertical size={14} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                        <DropdownMenuItem onClick={() => { setEditingItem(team); setTeamForm({ name: team.name, role: team.role, members: team.members }); setIsTeamModalOpen(true); }} className="gap-2 focus:bg-zinc-800">
                          <Edit2 size={14} /> Edit Team
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteTeam(team.id)} className="gap-2 text-rose-400 focus:bg-rose-950 focus:text-rose-300">
                          <Trash2 size={14} /> Delete Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="text-zinc-500">{team.role || 'General Team'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex -space-x-2 overflow-hidden">
                      {team.members.map((memberId: string) => {
                        const member = members.find(m => m.id === memberId);
                        return (
                          <div key={memberId} className="inline-block h-8 w-8 rounded-full ring-2 ring-zinc-900 bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 border border-zinc-700" title={member?.name}>
                            {member?.name?.[0] || '?'}
                          </div>
                        );
                      })}
                      {team.members.length === 0 && <span className="text-xs text-zinc-600 italic">No members assigned</span>}
                    </div>
                    <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">{team.members.length} Members</span>
                      <Button variant="link" className="h-auto p-0 text-indigo-400 text-xs" onClick={() => { setEditingItem(team); setTeamForm({ name: team.name, role: team.role, members: team.members }); setIsTeamModalOpen(true); }}>
                        Manage Members
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <div className="col-span-full py-12 text-center bg-zinc-900 rounded-lg border border-zinc-800">
                <LayoutGrid size={48} className="mx-auto text-zinc-800 mb-4" />
                <h3 className="text-lg font-medium text-zinc-400">No teams found</h3>
                <p className="text-zinc-600 mt-1">Create a new team to start organizing your members.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments" className="mt-6">
          <div className="space-y-4">
            {filteredDepts.length > 0 ? filteredDepts.map((dept) => (
              <Card key={dept.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{dept.name}</h3>
                      <p className="text-sm text-zinc-500">
                        {dept.teams.length} teams • {dept.teams.reduce((acc: number, tId: string) => acc + (teams.find(t => t.id === tId)?.members.length || 0), 0)} members
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2">
                      {dept.teams.map((tId: string) => (
                        <Badge key={tId} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-400">
                          {teams.find(t => t.id === tId)?.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditingItem(dept); setDeptForm({ name: dept.name, teams: dept.teams }); setIsDeptModalOpen(true); }} className="bg-zinc-950 border-zinc-800 text-zinc-400">Edit</Button>
                      <Button variant="outline" size="icon" onClick={() => handleDeleteDept(dept.id)} className="bg-zinc-950 border-zinc-800 text-rose-500 hover:bg-rose-950">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <div className="py-12 text-center bg-zinc-900 rounded-lg border border-zinc-800">
                <Folder size={48} className="mx-auto text-zinc-800 mb-4" />
                <h3 className="text-lg font-medium text-zinc-400">No departments found</h3>
                <p className="text-zinc-600 mt-1">Departments help group teams and manage large organizations.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Member Modal */}
      <Dialog open={isMemberModalOpen} onOpenChange={setIsMemberModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Member' : 'Invite New Member'}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              {editingItem ? 'Update member details and permissions.' : 'Send an invitation to join your workspace.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="m-name">Full Name</Label>
              <Input 
                id="m-name" 
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                placeholder="e.g. John Doe" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-email">Email Address</Label>
              <Input 
                id="m-email" 
                type="email"
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                placeholder="john@example.com" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="m-role">Role</Label>
                <Select value={memberForm.role} onValueChange={(v) => setMemberForm({ ...memberForm, role: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="Owner">Owner</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Member">Member</SelectItem>
                    <SelectItem value="Guest">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-status">Status</Label>
                <Select value={memberForm.status} onValueChange={(v) => setMemberForm({ ...memberForm, status: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMemberModalOpen(false)} className="bg-zinc-800 border-zinc-700">Cancel</Button>
            <Button onClick={handleSaveMember} className="bg-indigo-600 hover:bg-indigo-700">{editingItem ? 'Save Changes' : 'Send Invite'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Modal */}
      <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Team' : 'Create New Team'}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Define team name, role, and assign members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="t-name">Team Name</Label>
              <Input 
                id="t-name" 
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                placeholder="e.g. Frontend Engineering" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-role">Team Role/Description</Label>
              <Input 
                id="t-role" 
                value={teamForm.role}
                onChange={(e) => setTeamForm({ ...teamForm, role: e.target.value })}
                placeholder="e.g. UI Development" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid gap-2">
              <Label>Assign Members</Label>
              <div className="max-h-40 overflow-y-auto space-y-2 p-2 bg-zinc-950 rounded border border-zinc-800">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 hover:bg-zinc-900 rounded group">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">{m.name[0]}</div>
                      <span className="text-sm">{m.name}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className={cn(
                        "h-7 w-7 p-0",
                        teamForm.members.includes(m.id) ? "text-emerald-500" : "text-zinc-600"
                      )}
                      onClick={() => {
                        const newMembers = teamForm.members.includes(m.id)
                          ? teamForm.members.filter(id => id !== m.id)
                          : [...teamForm.members, m.id];
                        setTeamForm({ ...teamForm, members: newMembers });
                      }}
                    >
                      {teamForm.members.includes(m.id) ? <UserCheck size={16} /> : <Plus size={16} />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTeamModalOpen(false)} className="bg-zinc-800 border-zinc-700">Cancel</Button>
            <Button onClick={handleSaveTeam} className="bg-indigo-600 hover:bg-indigo-700">{editingItem ? 'Save Changes' : 'Create Team'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Department Modal */}
      <Dialog open={isDeptModalOpen} onOpenChange={setIsDeptModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Department' : 'Create New Department'}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Group teams under a department for better organization.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="d-name">Department Name</Label>
              <Input 
                id="d-name" 
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                placeholder="e.g. Product & Engineering" 
                className="bg-zinc-950 border-zinc-800" 
              />
            </div>
            <div className="grid gap-2">
              <Label>Assign Teams</Label>
              <div className="max-h-40 overflow-y-auto space-y-2 p-2 bg-zinc-950 rounded border border-zinc-800">
                {teams.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2 hover:bg-zinc-900 rounded group">
                    <div className="flex items-center gap-2">
                      <LayoutGrid size={14} className="text-zinc-500" />
                      <span className="text-sm">{t.name}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className={cn(
                        "h-7 w-7 p-0",
                        deptForm.teams.includes(t.id) ? "text-emerald-500" : "text-zinc-600"
                      )}
                      onClick={() => {
                        const newTeams = deptForm.teams.includes(t.id)
                          ? deptForm.teams.filter(id => id !== t.id)
                          : [...deptForm.teams, t.id];
                        setDeptForm({ ...deptForm, teams: newTeams });
                      }}
                    >
                      {deptForm.teams.includes(t.id) ? <Check size={16} /> : <Plus size={16} />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeptModalOpen(false)} className="bg-zinc-800 border-zinc-700">Cancel</Button>
            <Button onClick={handleSaveDept} className="bg-indigo-600 hover:bg-indigo-700">{editingItem ? 'Save Changes' : 'Create Department'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
