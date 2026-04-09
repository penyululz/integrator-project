
import React from 'react';
import { 
  User, 
  Mail, 
  Shield, 
  Key, 
  Bell, 
  Globe, 
  Camera,
  LogOut,
  CheckCircle2,
  Github,
  Twitter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function Profile() {
  const handleSave = () => {
    toast.success("Profile updated successfully");
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Profile Settings</h1>
          <p className="text-zinc-500 mt-1">Manage your personal information and account security.</p>
        </div>
        <Button variant="outline" className="text-rose-400 border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300">
          <LogOut size={16} className="mr-2" /> Log out
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Avatar & Quick Info */}
        <div className="space-y-6">
          <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
            <CardContent className="relative pt-0 text-center">
              <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                <div className="relative group">
                  <Avatar className="w-24 h-24 border-4 border-zinc-900 shadow-xl">
                    <AvatarImage src="https://github.com/farismalek.png" />
                    <AvatarFallback className="text-2xl">FM</AvatarFallback>
                  </Avatar>
                  <button className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 rounded-full text-white border-2 border-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-14 space-y-1">
                <h2 className="text-xl font-bold text-white">Faris Malek</h2>
                <p className="text-sm text-zinc-500">faris@integrator.io</p>
                <div className="flex justify-center gap-2 mt-4">
                  <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">Owner</Badge>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Verified</Badge>
                </div>
              </div>
              
              <Separator className="my-6 bg-zinc-800" />
              
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Member since</span>
                  <span className="text-zinc-300">Jan 2024</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Workflows</span>
                  <span className="text-zinc-300">12 Active</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Storage used</span>
                  <span className="text-zinc-300">45% of 2GB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm">Connected Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <Github size={16} className="text-white" />
                  <span className="text-xs text-zinc-300">GitHub</span>
                </div>
                <CheckCircle2 size={14} className="text-emerald-500" />
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
                <div className="flex items-center gap-2">
                  <Twitter size={16} className="text-sky-400" />
                  <span className="text-xs text-zinc-300">Twitter</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-indigo-400">Connect</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">General Information</CardTitle>
              <CardDescription className="text-zinc-500">Update your basic profile details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-zinc-400">First Name</Label>
                  <Input id="firstName" defaultValue="Faris" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-zinc-400">Last Name</Label>
                  <Input id="lastName" defaultValue="Malek" className="bg-zinc-950 border-zinc-800 text-zinc-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-400">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                  <Input id="email" defaultValue="faris@integrator.io" className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-zinc-400">Bio</Label>
                <textarea 
                  id="bio" 
                  className="w-full min-h-[100px] p-3 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-200 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Tell us about yourself..."
                  defaultValue="Product designer and automation enthusiast. Building the future of self-hosted workflows."
                />
              </div>
              <div className="pt-4 flex justify-end">
                <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Changes</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Security</CardTitle>
              <CardDescription className="text-zinc-500">Manage your password and authentication methods.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                    <Key size={16} className="text-zinc-500" /> Password
                  </p>
                  <p className="text-xs text-zinc-500">Last changed 3 months ago</p>
                </div>
                <Button variant="outline" size="sm" className="bg-zinc-950 border-zinc-800 text-zinc-300">Update</Button>
              </div>
              
              <Separator className="bg-zinc-800" />
              
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                    <Shield size={16} className="text-zinc-500" /> Two-Factor Authentication
                  </p>
                  <p className="text-xs text-zinc-500">Secure your account with 2FA</p>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Enabled</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell size={18} className="text-zinc-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Email Notifications</p>
                    <p className="text-xs text-zinc-500">Receive weekly reports and alerts</p>
                  </div>
                </div>
                <div className="w-10 h-5 bg-indigo-600 rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe size={18} className="text-zinc-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Language</p>
                    <p className="text-xs text-zinc-500">Select your preferred language</p>
                  </div>
                </div>
                <select className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2 py-1 outline-none">
                  <option>English (US)</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
