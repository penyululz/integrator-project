
import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Phone, 
  Video, 
  Monitor, 
  MoreVertical, 
  Search, 
  Plus, 
  Hash, 
  AtSign, 
  Send, 
  Paperclip, 
  Smile, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Users, 
  Settings,
  Circle,
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  HardDrive,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { mockOrgMembers } from '@/lib/mock-data';
import { toast } from 'sonner';

// --- Types ---

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  type: 'text' | 'file' | 'image';
  fileUrl?: string;
  fileName?: string;
}

interface Conversation {
  id: string;
  name: string;
  type: 'team' | 'department' | 'dm';
  members: string[];
  lastMessage?: string;
  unreadCount?: number;
  avatar?: string;
  status?: 'online' | 'offline' | 'away' | 'busy';
}

interface CallSession {
  id: string;
  type: 'voice' | 'video';
  participants: string[];
  startTime: number;
  isScreenSharing: boolean;
  sharerId?: string;
}

// --- Mock Data ---

const mockConversations: Conversation[] = [
  { id: 'c1', name: 'Engineering', type: 'department', members: ['1', '2', '3'], lastMessage: 'The new API is live!', unreadCount: 2 },
  { id: 'c2', name: 'Product Launch', type: 'team', members: ['1', '2'], lastMessage: 'Check the roadmap.', unreadCount: 0 },
  { id: 'c3', name: 'Sarah Chen', type: 'dm', members: ['1', '2'], lastMessage: 'Can we call?', unreadCount: 0, status: 'online' },
  { id: 'c4', name: 'Alex Rivera', type: 'dm', members: ['1', '3'], lastMessage: 'Got the logs.', unreadCount: 1, status: 'away' },
  { id: 'c5', name: 'Design Team', type: 'team', members: ['1', '2', '3'], lastMessage: 'New mockups are ready.', unreadCount: 0 },
];

const mockMessages: Record<string, Message[]> = {
  'c1': [
    { id: 'm1', senderId: '2', content: 'Hey team, how is the progress on the communication module?', timestamp: '10:30 AM', type: 'text' },
    { id: 'm2', senderId: '3', content: 'Almost done with the UI components.', timestamp: '10:32 AM', type: 'text' },
    { id: 'm3', senderId: '1', content: 'The new API is live!', timestamp: '10:45 AM', type: 'text' },
  ],
  'c3': [
    { id: 'm4', senderId: '2', content: 'Hi Faris, do you have a moment for a quick sync?', timestamp: 'Yesterday', type: 'text' },
    { id: 'm5', senderId: '1', content: 'Sure, what is on your mind?', timestamp: 'Yesterday', type: 'text' },
    { id: 'm6', senderId: '2', content: 'Can we call?', timestamp: '9:15 AM', type: 'text' },
  ]
};

// --- Components ---

export function Communication() {
  const [activeConvId, setActiveConvId] = useState<string>('c1');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);
  
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);

  const handleShareFile = (file: any) => {
    toast.success(`Shared ${file.name} in chat`);
    setShowFilePicker(false);
  };
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && !isMessageSearchOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConvId, messages, isMessageSearchOpen]);

  const activeConv = mockConversations.find(c => c.id === activeConvId);
  const currentMessages = messages[activeConvId] || [];

  const filteredMessages = currentMessages.filter(msg => 
    msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;

    const newMessage: Message = {
      id: `m${Date.now()}`,
      senderId: '1', // Current user
      content: messageInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text'
    };

    setMessages(prev => ({
      ...prev,
      [activeConvId]: [...(prev[activeConvId] || []), newMessage]
    }));
    setMessageInput('');
  };

  const startCall = (type: 'voice' | 'video') => {
    if (activeCall) return;
    
    const newCall: CallSession = {
      id: `call-${Date.now()}`,
      type,
      participants: ['1', ...(activeConv?.members.filter(m => m !== '1') || [])],
      startTime: Date.now(),
      isScreenSharing: false
    };
    
    setActiveCall(newCall);
    toast.success(`Starting ${type} call with ${activeConv?.name}...`);
  };

  const endCall = () => {
    setActiveCall(null);
    setIsScreenSharing(false);
    toast.info("Call ended");
  };

  const toggleScreenShare = () => {
    if (!activeCall) return;
    setIsScreenSharing(!isScreenSharing);
    if (!isScreenSharing) {
      toast.info("Screen sharing started");
    } else {
      toast.info("Screen sharing stopped");
    }
  };

  const filteredConversations = mockConversations.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950/50">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Messages</h2>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
              <Plus size={20} />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <Input 
              placeholder="Search conversations..." 
              className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 py-2 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600">Departments</div>
            {filteredConversations.filter(c => c.type === 'department').map(conv => (
              <ConversationItem 
                key={conv.id} 
                conv={conv} 
                active={activeConvId === conv.id} 
                onClick={() => setActiveConvId(conv.id)} 
              />
            ))}

            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600 mt-4">Teams</div>
            {filteredConversations.filter(c => c.type === 'team').map(conv => (
              <ConversationItem 
                key={conv.id} 
                conv={conv} 
                active={activeConvId === conv.id} 
                onClick={() => setActiveConvId(conv.id)} 
              />
            ))}

            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600 mt-4">Direct Messages</div>
            {filteredConversations.filter(c => c.type === 'dm').map(conv => (
              <ConversationItem 
                key={conv.id} 
                conv={conv} 
                active={activeConvId === conv.id} 
                onClick={() => setActiveConvId(conv.id)} 
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/50 backdrop-blur-sm z-10">
              <div className="flex items-center gap-3">
                {activeConv.type === 'dm' ? (
                  <div className="relative">
                    <Avatar className="h-10 w-10 border border-zinc-800">
                      <AvatarImage src={`https://picsum.photos/seed/${activeConv.name}/200`} />
                      <AvatarFallback>{activeConv.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "absolute bottom-0 right-0 w-3 h-3 border-2 border-zinc-950 rounded-full",
                      activeConv.status === 'online' ? "bg-emerald-500" : 
                      activeConv.status === 'away' ? "bg-amber-500" : "bg-zinc-600"
                    )} />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                    {activeConv.type === 'team' ? <Users size={20} /> : <Hash size={20} />}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-white">{activeConv.name}</h3>
                  <p className="text-xs text-zinc-500">
                    {activeConv.type === 'dm' ? activeConv.status : `${activeConv.members.length} members`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-zinc-400 hover:text-white"
                  onClick={() => startCall('voice')}
                >
                  <Phone size={20} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-zinc-400 hover:text-white"
                  onClick={() => startCall('video')}
                >
                  <Video size={20} />
                </Button>
                <Separator orientation="vertical" className="h-6 mx-2 border-zinc-800" />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("text-zinc-400 hover:text-white", isMessageSearchOpen && "text-indigo-500 bg-indigo-500/10")}
                  onClick={() => {
                    setIsMessageSearchOpen(!isMessageSearchOpen);
                    if (isMessageSearchOpen) setMessageSearchQuery('');
                  }}
                >
                  <Search size={20} />
                </Button>
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                  <MoreVertical size={20} />
                </Button>
              </div>
            </div>

            {/* Message Search Bar */}
            <AnimatePresence>
              {isMessageSearchOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/20 overflow-hidden"
                >
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <Input 
                      placeholder={`Search in ${activeConv.name}...`} 
                      className="pl-9 bg-zinc-950 border-zinc-800 text-zinc-200 h-8 text-xs"
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {messageSearchQuery && (
                      <button 
                        onClick={() => setMessageSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
            >
              {filteredMessages.map((msg, idx) => {
                const sender = mockOrgMembers.find(m => m.id === msg.senderId);
                const isMe = msg.senderId === '1';
                const showAvatar = idx === 0 || currentMessages[idx - 1].senderId !== msg.senderId;

                return (
                  <div key={msg.id} className={cn("flex gap-4 group", isMe && "flex-row-reverse")}>
                    {!isMe && (
                      <div className="w-10 shrink-0">
                        {showAvatar && (
                          <Avatar className="h-10 w-10 border border-zinc-800">
                            <AvatarImage src={`https://picsum.photos/seed/${sender?.name}/200`} />
                            <AvatarFallback>{sender?.name[0]}</AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}
                    <div className={cn("flex flex-col max-w-[70%]", isMe && "items-end")}>
                      {showAvatar && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-zinc-200">{sender?.name}</span>
                          <span className="text-[10px] text-zinc-600">{msg.timestamp}</span>
                        </div>
                      )}
                      <div className={cn(
                        "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                        isMe 
                          ? "bg-indigo-600 text-white rounded-tr-none" 
                          : "bg-zinc-900 text-zinc-200 rounded-tl-none border border-zinc-800"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Area */}
            <div className="p-6 bg-zinc-950/50">
              <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-indigo-500/50 transition-colors shadow-lg">
                <div className="flex items-center gap-2 p-2 border-b border-zinc-800/50">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300">
                    <AtSign size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300">
                    <Smile size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300" onClick={() => setShowFilePicker(true)}>
                    <HardDrive size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300">
                    <Paperclip size={16} />
                  </Button>
                  <div className="flex-1" />
                  <Badge variant="outline" className="text-[10px] border-zinc-800 text-zinc-600">Markdown supported</Badge>
                </div>
                <div className="flex items-end p-2 gap-2">
                  <textarea 
                    rows={1}
                    placeholder={`Message ${activeConv.name}...`}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-zinc-200 resize-none py-2 px-2 max-h-32 outline-none"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button 
                    size="icon" 
                    className={cn(
                      "h-9 w-9 rounded-lg transition-all",
                      messageInput.trim() ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-zinc-800 text-zinc-500"
                    )}
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                  >
                    <Send size={18} />
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center text-zinc-700 mb-6">
              <MessageSquare size={40} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Your Workspace Chat</h2>
            <p className="text-zinc-500 max-w-md">
              Select a conversation from the sidebar to start collaborating with your team in real-time.
            </p>
          </div>
        )}

        {/* Call Overlay */}
        <AnimatePresence>
          {activeCall && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="absolute inset-4 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden"
            >
              <div className="p-6 flex items-center justify-between border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600/10 text-indigo-500 rounded-lg">
                    {activeCall.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">
                      {activeCall.type === 'video' ? 'Video Call' : 'Voice Call'}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {activeCall.isScreenSharing ? 'Screen sharing active' : 'Active session'} • 00:42
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                    <Maximize2 size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-rose-500" onClick={endCall}>
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 p-8 flex flex-col items-center justify-center">
                {isScreenSharing ? (
                  <div className="w-full h-full max-w-4xl bg-zinc-950 rounded-2xl border border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-indigo-600/5 animate-pulse" />
                    <Monitor size={64} className="text-indigo-500 mb-4 relative z-10" />
                    <p className="text-lg font-bold text-white relative z-10">You are sharing your screen</p>
                    <p className="text-sm text-zinc-500 relative z-10">Others can see everything you present</p>
                    <Button 
                      className="mt-6 bg-rose-600 hover:bg-rose-700 text-white relative z-10"
                      onClick={toggleScreenShare}
                    >
                      Stop Sharing
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-8 w-full max-w-4xl">
                    {activeCall.participants.map(pid => {
                      const member = mockOrgMembers.find(m => m.id === pid);
                      return (
                        <div key={pid} className="flex flex-col items-center gap-4">
                          <div className="relative">
                            <Avatar className="h-24 w-24 border-4 border-zinc-800">
                              <AvatarImage src={`https://picsum.photos/seed/${member?.name}/200`} />
                              <AvatarFallback>{member?.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-emerald-500">
                              <Volume2 size={14} />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-white">{member?.name}</p>
                            <p className="text-xs text-zinc-500">{pid === '1' ? 'You' : 'Participant'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Call Controls */}
              <div className="p-8 flex items-center justify-center gap-4 bg-zinc-950/50 border-t border-zinc-800">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className={cn(
                    "h-14 w-14 rounded-full border-zinc-800 transition-all",
                    isMuted ? "bg-rose-600/10 border-rose-600/50 text-rose-500" : "bg-zinc-900 text-zinc-400 hover:text-white"
                  )}
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </Button>
                
                {activeCall.type === 'video' && (
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className={cn(
                      "h-14 w-14 rounded-full border-zinc-800 transition-all",
                      isCameraOff ? "bg-rose-600/10 border-rose-600/50 text-rose-500" : "bg-zinc-900 text-zinc-400 hover:text-white"
                    )}
                    onClick={() => setIsCameraOff(!isCameraOff)}
                  >
                    {isCameraOff ? <Video size={24} className="opacity-50" /> : <Video size={24} />}
                  </Button>
                )}

                <Button 
                  variant="outline" 
                  size="icon" 
                  className={cn(
                    "h-14 w-14 rounded-full border-zinc-800 transition-all",
                    isScreenSharing ? "bg-indigo-600 text-white border-indigo-600" : "bg-zinc-900 text-zinc-400 hover:text-white"
                  )}
                  onClick={toggleScreenShare}
                >
                  <Monitor size={24} />
                </Button>

                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-14 w-14 rounded-full bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white transition-all"
                >
                  <Users size={24} />
                </Button>

                <Button 
                  className="h-14 w-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-lg shadow-rose-600/20"
                  onClick={endCall}
                >
                  <PhoneOff size={24} />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showFilePicker && (
          <FilePickerModal 
            onClose={() => setShowFilePicker(false)} 
            onSelect={handleShareFile} 
          />
        )}
      </div>
    </div>
  );
}

const ConversationItem: React.FC<{ conv: Conversation, active: boolean, onClick: () => void }> = ({ conv, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group",
        active 
          ? "bg-indigo-600/10 text-white" 
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      )}
    >
      <div className="relative">
        {conv.type === 'dm' ? (
          <Avatar className="h-10 w-10 border border-zinc-800 group-hover:border-zinc-700 transition-colors">
            <AvatarImage src={`https://picsum.photos/seed/${conv.name}/200`} />
            <AvatarFallback>{conv.name[0]}</AvatarFallback>
          </Avatar>
        ) : (
          <div className={cn(
            "h-10 w-10 rounded-xl border flex items-center justify-center transition-colors",
            active ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-500" : "bg-zinc-900 border-zinc-800 text-zinc-500 group-hover:border-zinc-700"
          )}>
            {conv.type === 'team' ? <Users size={20} /> : <Hash size={20} />}
          </div>
        )}
        {conv.type === 'dm' && (
          <div className={cn(
            "absolute bottom-0 right-0 w-3 h-3 border-2 border-zinc-950 rounded-full",
            conv.status === 'online' ? "bg-emerald-500" : 
            conv.status === 'away' ? "bg-amber-500" : "bg-zinc-600"
          )} />
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={cn("text-sm font-bold truncate", active ? "text-white" : "text-zinc-300")}>{conv.name}</span>
          {conv.unreadCount ? (
            <Badge className="bg-indigo-600 text-white border-none h-4 px-1 min-w-[16px] flex items-center justify-center text-[10px]">
              {conv.unreadCount}
            </Badge>
          ) : (
            <span className="text-[10px] text-zinc-600">10:45 AM</span>
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate">{conv.lastMessage}</p>
      </div>
    </button>
  );
}

function FilePickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (file: any) => void }) {
  const [search, setSearch] = useState('');
  
  const pickerFiles = [
    { id: 'p1', name: 'Q4_Strategy.pdf', type: 'pdf', size: '2.4 MB' },
    { id: 'p2', name: 'Brand_Guidelines.zip', type: 'zip', size: '45 MB' },
    { id: 'p3', name: 'User_Research.docx', type: 'doc', size: '1.2 MB' },
    { id: 'p4', name: 'Product_Demo.mp4', type: 'video', size: '120 MB' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={18} className="text-indigo-400" />
            <h3 className="font-bold text-white text-sm">Share from Files</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            <Input 
              placeholder="Search your drive..." 
              className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {pickerFiles.map(file => (
              <button 
                key={file.id}
                onClick={() => onSelect(file)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-indigo-400">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                  <p className="text-[10px] text-zinc-500">{file.type.toUpperCase()} • {file.size}</p>
                </div>
                <Send size={14} className="text-zinc-700 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
          <p className="text-[10px] text-zinc-500 italic">Select a file to share it in this chat</p>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}
