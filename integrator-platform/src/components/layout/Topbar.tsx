
import React from 'react';
import { 
  Search, 
  Bell, 
  Building2,
  Check,
  PlusCircle,
  User,
  Settings as SettingsIcon,
  LogOut
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mockNotifications } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface TopbarProps {
  onNewWorkflow: () => void;
}

export function Topbar({ onNewWorkflow }: TopbarProps) {
  const [activeWorkspace, setActiveWorkspace] = React.useState('Main Workspace');
  const [notifications, setNotifications] = React.useState(mockNotifications);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <Input 
            placeholder="Search workflows, runs, integrations..." 
            className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200 h-9 focus-visible:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger className="p-2 text-zinc-400 hover:text-white transition-colors relative outline-none">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-zinc-950"></span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 bg-zinc-900 border-zinc-800 p-0 text-zinc-200 shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold">Notifications</h3>
              <button onClick={markAllAsRead} className="text-xs text-indigo-400 hover:text-indigo-300">Mark all as read</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map(n => (
                  <div key={n.id} className={cn("p-4 border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors cursor-pointer", !n.read && "bg-indigo-500/5")}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        n.type === 'error' ? "text-rose-500" : 
                        n.type === 'warning' ? "text-amber-500" : 
                        n.type === 'success' ? "text-emerald-500" : "text-indigo-500"
                      )}>{n.type}</span>
                      <span className="text-[10px] text-zinc-500">{n.time}</span>
                    </div>
                    <h4 className="text-sm font-medium text-zinc-200">{n.title}</h4>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{n.message}</p>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-zinc-500 text-sm">No notifications</div>
              )}
            </div>
            <div className="p-2 text-center border-t border-zinc-800">
              <Button variant="ghost" size="sm" className="w-full text-xs text-zinc-400">View all activity</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
