
import React from 'react';
import { 
  LayoutDashboard, 
  GitBranch, 
  Plug2, 
  Activity, 
  AlertCircle, 
  History, 
  CheckSquare, 
  Settings,
  ChevronRight,
  Zap,
  Users,
  FileText,
  MessageSquare,
  Calendar,
  User,
  LogOut,
  HardDrive
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  onProfileClick: () => void;
  onSettingsClick: () => void;
}

const navGroups = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ]
  },
  {
    label: 'AUTOMATION',
    items: [
      { id: 'workflows', label: 'Workflows', icon: GitBranch },
      { id: 'integrations', label: 'Integrations', icon: Plug2 },
    ]
  },
  {
    label: 'OPERATIONS',
    items: [
      { id: 'facility', label: 'Facility', icon: LayoutDashboard },
      { id: 'maintenance', label: 'Maintenance', icon: Zap },
      { id: 'calendar', label: 'Calendar', icon: Calendar },
      { id: 'activity', label: 'Activity', icon: Activity },
    ]
  },
  {
    label: 'COLLABORATION',
    items: [
      { id: 'communication', label: 'Communication', icon: MessageSquare },
      { id: 'docs', label: 'Docs & Notes', icon: FileText },
      { id: 'files', label: 'Cloud / Files', icon: HardDrive },
    ]
  },
  {
    label: 'ORGANIZATION',
    items: [
      { id: 'organization', label: 'Organization', icon: Users },
      { id: 'approvals', label: 'Approvals', icon: CheckSquare },
    ]
  },
  {
    label: 'MONITORING',
    items: [
      { id: 'audit', label: 'Audit Logs', icon: History },
    ]
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
    ]
  }
];

export function Sidebar({ activePage, setActivePage, collapsed, setCollapsed, onProfileClick, onSettingsClick }: SidebarProps) {
  return (
    <div className={cn(
      "bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen text-zinc-400 transition-all duration-300 relative shrink-0",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className={cn("p-6 flex items-center gap-3", collapsed && "px-4")}>
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0">
          <Zap size={20} fill="currentColor" />
        </div>
        {!collapsed && <span className="font-bold text-white text-lg tracking-tight uppercase">Integrator</span>}
      </div>

      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white z-20"
      >
        <ChevronRight size={14} className={cn("transition-transform", !collapsed && "rotate-180")} />
      </button>

      <nav className="flex-1 px-4 space-y-6 overflow-y-auto overflow-x-hidden pt-4">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-2 px-2">{group.label}</div>}
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  activePage === item.id 
                    ? "bg-zinc-900 text-white" 
                    : "hover:bg-zinc-900 hover:text-zinc-200",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && activePage === item.id && <ChevronRight size={14} className="ml-auto text-indigo-500" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className={cn("p-4 border-t border-zinc-800 bg-zinc-900/30", collapsed && "px-2")}>
        <div className="flex items-center gap-3">
          <button 
            onClick={onProfileClick}
            className="flex items-center gap-3 flex-1 min-w-0 outline-none group hover:bg-zinc-800/40 p-1 -m-1 rounded-lg transition-all"
          >
            <div className="relative shrink-0">
              <Avatar className={cn("border border-zinc-800 transition-all", collapsed ? "h-8 w-8" : "h-9 w-9")}>
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>FM</AvatarFallback>
              </Avatar>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-zinc-950 rounded-full" />
            </div>
            {!collapsed && (
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">Faris Malek</p>
                <p className="text-xs text-zinc-500 truncate">Online</p>
              </div>
            )}
          </button>
          
          {!collapsed && (
            <div className="flex items-center gap-0.5">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-zinc-500 hover:text-white hover:bg-zinc-800 h-8 w-8"
                onClick={onSettingsClick}
              >
                <Settings size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
