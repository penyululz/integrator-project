
import React, { useState } from 'react';
import { Settings as SettingsIcon, Globe, Lock, Users, Database, Zap, HardDrive, Bell, Shield, CreditCard, Cloud, Key, Layout, User, Building, Share2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SettingsTab = 'profile' | 'account' | 'org' | 'communication' | 'cloud' | 'notifications' | 'security' | 'apps' | 'appearance' | 'billing';

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Workspace Settings</h1>
        <p className="text-zinc-500 mt-1">Configure your workspace environment and global defaults.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-1">
          <SettingsNavItem 
            icon={User} 
            label="Profile" 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
          />
          <SettingsNavItem 
            icon={Key} 
            label="Account" 
            active={activeTab === 'account'} 
            onClick={() => setActiveTab('account')} 
          />
          <SettingsNavItem 
            icon={Building} 
            label="Organization Preferences" 
            active={activeTab === 'org'} 
            onClick={() => setActiveTab('org')} 
          />
          <SettingsNavItem 
            icon={Share2} 
            label="Communication" 
            active={activeTab === 'communication'} 
            onClick={() => setActiveTab('communication')} 
          />
          <SettingsNavItem 
            icon={Cloud} 
            label="Cloud & Storage" 
            active={activeTab === 'cloud'} 
            onClick={() => setActiveTab('cloud')} 
          />
          <SettingsNavItem 
            icon={Bell} 
            label="Notifications" 
            active={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')} 
          />
          <SettingsNavItem 
            icon={Shield} 
            label="Security" 
            active={activeTab === 'security'} 
            onClick={() => setActiveTab('security')} 
          />
          <SettingsNavItem 
            icon={Smartphone} 
            label="Connected Apps" 
            active={activeTab === 'apps'} 
            onClick={() => setActiveTab('apps')} 
          />
          <SettingsNavItem 
            icon={Layout} 
            label="Appearance" 
            active={activeTab === 'appearance'} 
            onClick={() => setActiveTab('appearance')} 
          />
          <SettingsNavItem 
            icon={CreditCard} 
            label="Billing" 
            active={activeTab === 'billing'} 
            onClick={() => setActiveTab('billing')} 
          />
        </aside>

        <div className="lg:col-span-3 space-y-8">
          {activeTab === 'profile' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Profile Settings</CardTitle>
                <CardDescription className="text-zinc-500">Manage your personal information and how others see you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-400">
                    FM
                  </div>
                  <Button variant="outline" className="bg-zinc-800 border-zinc-700 text-zinc-200">Change Avatar</Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Full Name</Label>
                    <Input defaultValue="Faris Malek" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Display Name</Label>
                    <Input defaultValue="farismalek" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Bio</Label>
                  <textarea className="w-full h-24 px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Tell us about yourself..." />
                </div>
                <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Profile</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'account' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Account Settings</CardTitle>
                <CardDescription className="text-zinc-500">Manage your account credentials and security.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Email Address</Label>
                  <Input defaultValue="faris@integrator.io" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                </div>
                <Separator className="bg-zinc-800" />
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-white">Change Password</h4>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Current Password</Label>
                    <Input type="password" placeholder="••••••••" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400">New Password</Label>
                      <Input type="password" placeholder="••••••••" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Confirm New Password</Label>
                      <Input type="password" placeholder="••••••••" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                    </div>
                  </div>
                </div>
                <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">Update Account</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'org' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Organization Preferences</CardTitle>
                <CardDescription className="text-zinc-500">Configure global settings for your entire organization.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Organization Name</Label>
                  <Input defaultValue="Integrator Corp" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Primary Domain</Label>
                  <Input defaultValue="integrator.io" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Default Timezone</Label>
                  <select className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>UTC (Coordinated Universal Time)</option>
                    <option>EST (Eastern Standard Time)</option>
                    <option>PST (Pacific Standard Time)</option>
                  </select>
                </div>
                <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Preferences</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'communication' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Communication Settings</CardTitle>
                <CardDescription className="text-zinc-500">Manage how your team communicates within the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Enable Real-time Chat</p>
                    <p className="text-xs text-zinc-500">Allow users to message each other instantly.</p>
                  </div>
                  <div className="w-10 h-5 bg-indigo-600 rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Video Conferencing</p>
                    <p className="text-xs text-zinc-500">Enable built-in video calls for meetings.</p>
                  </div>
                  <div className="w-10 h-5 bg-indigo-600 rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                  </div>
                </div>
                <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Communication Settings</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'cloud' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Cloud & Storage</CardTitle>
                <CardDescription className="text-zinc-500">Manage your file storage and cloud integrations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database size={18} className="text-indigo-500" />
                      <span className="text-sm font-medium text-zinc-200">Storage Usage</span>
                    </div>
                    <Badge variant="outline" className="text-zinc-500 border-zinc-800">24% Used</Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Total Capacity</span>
                      <span className="text-zinc-300">1.2 GB / 5 GB</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 w-[24%]"></div>
                    </div>
                  </div>
                </div>
                <Button variant="outline" className="w-full border-zinc-800 text-zinc-300">Upgrade Storage Plan</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Security Settings</CardTitle>
                <CardDescription className="text-zinc-500">Protect your account and organization data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Two-Factor Authentication (2FA)</p>
                    <p className="text-xs text-zinc-500">Add an extra layer of security to your account.</p>
                  </div>
                  <Button variant="outline" size="sm" className="bg-zinc-900 border-zinc-800 text-zinc-400">Enable</Button>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Session Management</p>
                    <p className="text-xs text-zinc-500">View and manage your active sessions.</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-zinc-400">View Sessions</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'apps' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Connected Apps</CardTitle>
                <CardDescription className="text-zinc-500">Manage third-party applications and API access.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-400">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">Slack Integration</p>
                      <p className="text-xs text-zinc-500">Connected on Oct 12, 2023</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-rose-500">Disconnect</Button>
                </div>
                <Button variant="outline" className="w-full border-zinc-800 text-zinc-300">Browse App Directory</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'billing' && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Billing & Subscription</CardTitle>
                <CardDescription className="text-zinc-500">Manage your plan, invoices, and payment methods.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Current Plan</p>
                    <p className="text-xl font-bold text-white">Pro Enterprise</p>
                  </div>
                  <Badge className="bg-indigo-500 text-white border-none px-3 py-1">Active</Badge>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-white">Payment Method</h4>
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard size={20} className="text-zinc-500" />
                      <p className="text-sm text-zinc-300">Visa ending in 4242</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-zinc-400">Update</Button>
                  </div>
                </div>
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">Manage Subscription</Button>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}

function SettingsNavItem({ icon: Icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
        active ? "bg-zinc-900 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      )}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function Badge({ children, variant, className }: any) {
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-bold border",
      variant === 'outline' ? "bg-transparent" : "bg-zinc-800",
      className
    )}>
      {children}
    </span>
  );
}
