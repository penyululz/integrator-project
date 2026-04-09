
import React from 'react';
import { 
  Search, 
  Plus, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Cloud,
  CreditCard,
  HardDrive,
  Github,
  Hash
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { mockIntegrations } from '@/lib/mock-data';

const iconMap: Record<string, any> = {
  MessageSquare,
  Cloud,
  CreditCard,
  HardDrive,
  Github,
  Hash
};

export function Integrations({ onAddCustom }: { onAddCustom: () => void }) {
  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Integrations</h1>
          <p className="text-zinc-500 mt-1">Connect your favorite apps and services.</p>
        </div>
        <Button 
          onClick={onAddCustom}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
        >
          <Plus size={18} />
          Add Custom Integration
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-zinc-900 p-4 rounded-lg border border-zinc-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <Input 
            placeholder="Search apps..." 
            className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-200 h-10 focus-visible:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          {['All', 'Communication', 'CRM', 'Payments', 'Storage'].map((cat) => (
            <Button key={cat} variant="ghost" size="sm" className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockIntegrations.map((app) => {
          const Icon = iconMap[app.icon] || Cloud;
          return (
            <Card key={app.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all group">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 group-hover:border-zinc-700 transition-colors">
                  <Icon size={24} className={app.connected ? "text-indigo-500" : "text-zinc-600"} />
                </div>
                {app.connected ? (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded-full">
                    <CheckCircle2 size={12} />
                    Connected
                  </div>
                ) : (
                  <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider bg-zinc-800 px-2 py-1 rounded-full">
                    Not Connected
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <CardTitle className="text-white">{app.name}</CardTitle>
                  <CardDescription className="text-zinc-500 text-xs mt-1">{app.category}</CardDescription>
                </div>
                <div className="flex gap-2 pt-2">
                  {app.connected ? (
                    <>
                      <Button variant="outline" size="sm" className="flex-1 bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white text-xs">
                        Configure
                      </Button>
                      <Button variant="outline" size="sm" className="bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white px-2">
                        <ExternalLink size={14} />
                      </Button>
                    </>
                  ) : (
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">
                      Connect {app.name}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
