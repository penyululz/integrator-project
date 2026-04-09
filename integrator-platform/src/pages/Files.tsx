
import React, { useState, useMemo } from 'react';
import { 
  File, 
  Folder, 
  Star, 
  Clock, 
  Users, 
  Trash2, 
  Search, 
  Grid, 
  List, 
  MoreVertical, 
  Download, 
  Share2, 
  Info, 
  Plus, 
  Upload, 
  ChevronRight, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Music, 
  Archive,
  ExternalLink,
  Copy,
  Move,
  Edit2,
  History,
  MessageSquare,
  Shield,
  HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// --- Types ---

type FileType = 'file' | 'folder';
type AccessLevel = 'view' | 'edit' | 'manage' | 'owner';

interface FileItem {
  id: string;
  name: string;
  type: FileType;
  extension?: string;
  size?: number; // in bytes
  updatedAt: string;
  owner: {
    name: string;
    avatar?: string;
  };
  starred: boolean;
  shared: boolean;
  parentId: string | null;
  permissions: AccessLevel;
  description?: string;
  version?: number;
}

interface Category {
  id: string;
  label: string;
  icon: React.ElementType;
}

// --- Mock Data ---

const MOCK_FILES: FileItem[] = [
  {
    id: 'f1',
    name: 'Project Documents',
    type: 'folder',
    updatedAt: '2024-03-20T10:00:00Z',
    owner: { name: 'Faris Malek' },
    starred: true,
    shared: false,
    parentId: null,
    permissions: 'owner'
  },
  {
    id: 'f2',
    name: 'Marketing Assets',
    type: 'folder',
    updatedAt: '2024-03-19T15:30:00Z',
    owner: { name: 'Sarah Chen' },
    starred: false,
    shared: true,
    parentId: null,
    permissions: 'edit'
  },
  {
    id: 'f3',
    name: 'Q1 Report.pdf',
    type: 'file',
    extension: 'pdf',
    size: 2400000,
    updatedAt: '2024-03-21T09:15:00Z',
    owner: { name: 'Faris Malek' },
    starred: false,
    shared: false,
    parentId: 'f1',
    permissions: 'owner',
    version: 2
  },
  {
    id: 'f4',
    name: 'Logo_Final.svg',
    type: 'file',
    extension: 'svg',
    size: 45000,
    updatedAt: '2024-03-18T11:20:00Z',
    owner: { name: 'Alex Rivera' },
    starred: true,
    shared: true,
    parentId: 'f2',
    permissions: 'view'
  },
  {
    id: 'f5',
    name: 'Product Roadmap.xlsx',
    type: 'file',
    extension: 'xlsx',
    size: 1200000,
    updatedAt: '2024-03-22T14:00:00Z',
    owner: { name: 'Faris Malek' },
    starred: false,
    shared: false,
    parentId: null,
    permissions: 'owner'
  },
  {
    id: 'f6',
    name: 'Team Photos',
    type: 'folder',
    updatedAt: '2024-03-15T16:45:00Z',
    owner: { name: 'Faris Malek' },
    starred: false,
    shared: false,
    parentId: null,
    permissions: 'owner'
  },
  {
    id: 'f7',
    name: 'Meeting_Notes.docx',
    type: 'file',
    extension: 'docx',
    size: 850000,
    updatedAt: '2024-03-23T10:30:00Z',
    owner: { name: 'Faris Malek' },
    starred: false,
    shared: false,
    parentId: 'f1',
    permissions: 'owner'
  }
];

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All Files', icon: HardDrive },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'shared', label: 'Shared with me', icon: Users },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

// --- Helper Functions ---

const formatSize = (bytes?: number) => {
  if (!bytes) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const getFileIcon = (item: FileItem) => {
  if (item.type === 'folder') return <Folder className="text-indigo-400 fill-indigo-400/20" />;
  
  const ext = item.extension?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || '')) return <ImageIcon className="text-emerald-400" />;
  if (['mp4', 'mov', 'avi'].includes(ext || '')) return <Film className="text-rose-400" />;
  if (['mp3', 'wav'].includes(ext || '')) return <Music className="text-amber-400" />;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) return <FileText className="text-blue-400" />;
  if (['zip', 'rar', '7z'].includes(ext || '')) return <Archive className="text-orange-400" />;
  
  return <File className="text-zinc-400" />;
};

// --- Main Component ---

export function Files() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [files, setFiles] = useState<FileItem[]>(MOCK_FILES);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      toast.success(`Uploading ${droppedFiles.length} files...`);
    }
  };

  // Filtered files logic
  const filteredFiles = useMemo(() => {
    let result = files;

    // Category filtering
    if (activeCategory === 'starred') result = result.filter(f => f.starred);
    else if (activeCategory === 'shared') result = result.filter(f => f.shared);
    else if (activeCategory === 'recent') {
      result = [...result].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 10);
    } else if (activeCategory === 'all') {
      result = result.filter(f => f.parentId === currentFolderId);
    }

    // Search filtering
    if (searchQuery) {
      result = result.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    return result;
  }, [files, activeCategory, currentFolderId, searchQuery]);

  const currentFolder = files.find(f => f.id === currentFolderId);
  const selectedFile = files.find(f => f.id === selectedItems[0]);

  // Breadcrumbs logic
  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let current = currentFolder;
    while (current) {
      crumbs.unshift(current);
      current = files.find(f => f.id === current?.parentId);
    }
    return crumbs;
  }, [currentFolder, files]);

  const toggleSelect = (id: string, multi: boolean) => {
    if (multi) {
      setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelectedItems([id]);
    }
  };

  const handleAction = (action: string, item?: FileItem) => {
    const target = item || selectedFile;
    if (!target) return;

    switch (action) {
      case 'star':
        setFiles(prev => prev.map(f => f.id === target.id ? { ...f, starred: !f.starred } : f));
        toast.success(target.starred ? 'Removed from favorites' : 'Added to favorites');
        break;
      case 'delete':
        setFiles(prev => prev.filter(f => f.id !== target.id));
        toast.error(`${target.name} moved to trash`);
        break;
      case 'download':
        toast.success(`Downloading ${target.name}...`);
        break;
      case 'share':
        setShowShareModal(true);
        break;
      default:
        break;
    }
  };

  return (
    <div 
      className="flex h-[calc(100vh-64px)] bg-zinc-950 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-indigo-600/20 backdrop-blur-sm border-4 border-dashed border-indigo-500 flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="bg-zinc-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white animate-bounce">
                <Upload size={40} />
              </div>
              <h2 className="text-2xl font-bold text-white">Drop to upload</h2>
              <p className="text-zinc-400">Release your files to start the upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Drive Sidebar */}
      <div className="w-64 border-r border-zinc-800 flex flex-col bg-zinc-950/50">
        <div className="p-4 space-y-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                <Plus size={18} /> New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-zinc-900 border-zinc-800 text-zinc-200">
              <DropdownMenuItem className="gap-2 cursor-pointer">
                <Folder size={16} /> New Folder
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem className="gap-2 cursor-pointer">
                <Upload size={16} /> Upload File
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer">
                <Upload size={16} /> Upload Folder
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem className="gap-2 cursor-pointer">
                <FileText size={16} /> Google Doc
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer">
                <ImageIcon size={16} /> Google Sheet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <nav className="space-y-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setCurrentFolderId(null);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  activeCategory === cat.id ? "bg-zinc-900 text-white" : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
                )}
              >
                <cat.icon size={18} />
                {cat.label}
              </button>
            ))}
          </nav>

          <Separator className="bg-zinc-800" />
          
          <div className="px-2">
            <button
              onClick={() => setActiveCategory('admin')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                activeCategory === 'admin' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200"
              )}
            >
              <Shield size={18} />
              Admin Controls
            </button>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-zinc-800">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Storage</span>
              <span className="text-zinc-400 font-medium">12.4 GB of 100 GB</span>
            </div>
            <Progress value={12.4} className="h-1.5 bg-zinc-800" />
            <Button variant="link" className="p-0 h-auto text-xs text-indigo-400 hover:text-indigo-300">
              Upgrade Storage
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeCategory === 'admin' ? (
          <div className="flex-1 flex flex-col">
            <div className="h-14 border-b border-zinc-800 flex items-center px-6 bg-zinc-950/50">
              <h2 className="font-bold text-white">Admin Storage & Audit</h2>
            </div>
            <ScrollArea className="flex-1">
              <AdminStorageView />
            </ScrollArea>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/50">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex items-center gap-1 text-sm">
                  <button 
                    onClick={() => setCurrentFolderId(null)}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    My Drive
                  </button>
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight size={14} className="text-zinc-600" />
                      <button 
                        onClick={() => setCurrentFolderId(crumb.id)}
                        className={cn(
                          "transition-colors",
                          idx === breadcrumbs.length - 1 ? "text-white font-medium" : "text-zinc-400 hover:text-white"
                        )}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                
                <div className="relative max-w-xs w-full ml-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                  <Input 
                    placeholder="Search in Drive..." 
                    className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-900 rounded-md p-1 border border-zinc-800">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-7 w-7", viewMode === 'grid' ? "bg-zinc-800 text-white" : "text-zinc-500")}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid size={14} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-7 w-7", viewMode === 'list' ? "bg-zinc-800 text-white" : "text-zinc-500")}
                    onClick={() => setViewMode('list')}
                  >
                    <List size={14} />
                  </Button>
                </div>
                <Separator orientation="vertical" className="h-6 bg-zinc-800" />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-8 w-8", showDetails ? "text-indigo-400 bg-indigo-500/10" : "text-zinc-500")}
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <Info size={18} />
                </Button>
              </div>
            </div>

            {/* File Browser Area */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                {filteredFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-700 mb-4">
                      <Folder size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-white">No files found</h3>
                    <p className="text-sm text-zinc-500 mt-1">Try searching for something else or upload a new file.</p>
                    <Button variant="outline" className="mt-6 border-zinc-800 text-zinc-400 hover:text-white">
                      Upload your first file
                    </Button>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {filteredFiles.map(file => (
                      <FileCard 
                        key={file.id} 
                        file={file} 
                        selected={selectedItems.includes(file.id)}
                        onSelect={(multi) => toggleSelect(file.id, multi)}
                        onOpen={() => file.type === 'folder' ? setCurrentFolderId(file.id) : handleAction('download', file)}
                        onAction={(action) => handleAction(action, file)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="min-w-full">
                    <div className="grid grid-cols-[1fr_150px_150px_100px_40px] gap-4 px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                      <div>Name</div>
                      <div>Owner</div>
                      <div>Last Modified</div>
                      <div>File Size</div>
                      <div></div>
                    </div>
                    <div className="divide-y divide-zinc-900">
                      {filteredFiles.map(file => (
                        <FileRow 
                          key={file.id} 
                          file={file} 
                          selected={selectedItems.includes(file.id)}
                          onSelect={(multi) => toggleSelect(file.id, multi)}
                          onOpen={() => file.type === 'folder' ? setCurrentFolderId(file.id) : handleAction('download', file)}
                          onAction={(action) => handleAction(action, file)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* Details Sidebar */}
      <AnimatePresence>
        {showDetails && (
          <motion.div 
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            className="w-80 border-l border-zinc-800 bg-zinc-950 flex flex-col"
          >
            <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4">
              <h3 className="font-bold text-white">Details</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500" onClick={() => setShowDetails(false)}>
                <Plus className="rotate-45" size={18} />
              </Button>
            </div>

            {selectedFile ? (
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-8">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                      {React.cloneElement(getFileIcon(selectedFile) as React.ReactElement, { size: 48 })}
                    </div>
                    <h4 className="font-bold text-lg text-white break-all">{selectedFile.name}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="outline" size="sm" className="h-8 border-zinc-800 text-zinc-400 gap-2" onClick={() => handleAction('share')}>
                        <Share2 size={14} /> Share
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 border-zinc-800 text-zinc-400 gap-2" onClick={() => handleAction('download')}>
                        <Download size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Properties</h5>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-indigo-400">Edit</Button>
                    </div>
                    <div className="space-y-3">
                      <PropertyRow label="Type" value={selectedFile.type === 'folder' ? 'Folder' : `${selectedFile.extension?.toUpperCase()} File`} />
                      <PropertyRow label="Size" value={formatSize(selectedFile.size)} />
                      <PropertyRow label="Location" value={currentFolder?.name || 'My Drive'} />
                      <PropertyRow label="Owner" value={selectedFile.owner.name} />
                      <PropertyRow label="Modified" value={new Date(selectedFile.updatedAt).toLocaleDateString()} />
                      <PropertyRow label="Permissions" value={selectedFile.permissions} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Activity</h5>
                    <div className="space-y-4">
                      <ActivityItem 
                        user="Faris Malek" 
                        action="uploaded version 2" 
                        time="2 hours ago" 
                        icon={Upload}
                      />
                      <ActivityItem 
                        user="Sarah Chen" 
                        action="shared with Engineering" 
                        time="Yesterday" 
                        icon={Users}
                      />
                      <ActivityItem 
                        user="Faris Malek" 
                        action="renamed from Draft.pdf" 
                        time="3 days ago" 
                        icon={Edit2}
                      />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <Info size={48} className="mb-4 opacity-20" />
                <p className="text-sm">Select a file or folder to view its properties and activity.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      {showShareModal && selectedFile && (
        <ShareModal file={selectedFile} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}

function ShareModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<AccessLevel>('view');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center">
              {React.cloneElement(getFileIcon(file) as React.ReactElement, { size: 20 })}
            </div>
            <div>
              <h3 className="font-bold text-white">Share "{file.name}"</h3>
              <p className="text-xs text-zinc-500">Manage access and permissions</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-500">
            <Plus className="rotate-45" size={20} />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Add people or groups</label>
            <div className="flex gap-2">
              <Input 
                placeholder="Email or name..." 
                className="bg-zinc-950 border-zinc-800 text-zinc-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-zinc-800 text-zinc-400 capitalize w-24">
                    {access}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  {(['view', 'edit', 'manage'] as AccessLevel[]).map(level => (
                    <DropdownMenuItem key={level} onClick={() => setAccess(level)} className="capitalize">
                      {level}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => {
                if (email) {
                  toast.success(`Shared with ${email}`);
                  setEmail('');
                }
              }}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">People with access</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>FM</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-white">Faris Malek (you)</p>
                    <p className="text-xs text-zinc-500">faris@example.com</p>
                  </div>
                </div>
                <span className="text-xs text-zinc-500 font-medium">Owner</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarFallback>SC</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-white">Sarah Chen</p>
                    <p className="text-xs text-zinc-500">sarah@example.com</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="text-xs text-indigo-400 hover:text-indigo-300 font-medium outline-none">
                    Editor
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <DropdownMenuItem>Viewer</DropdownMenuItem>
                    <DropdownMenuItem>Editor</DropdownMenuItem>
                    <DropdownMenuItem>Manager</DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem className="text-rose-400">Remove access</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 size={14} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-200">General access</span>
              </div>
              <Badge variant="outline" className="text-[10px] border-zinc-800 text-zinc-500">Restricted</Badge>
            </div>
            <p className="text-xs text-zinc-500">Only people with access can open with the link</p>
            <Button variant="link" className="p-0 h-auto text-xs text-indigo-400 gap-1" onClick={() => {
              navigator.clipboard.writeText(`https://drive.integrator.io/s/${file.id}`);
              toast.success('Link copied to clipboard');
            }}>
              <Copy size={12} /> Copy link
            </Button>
          </div>
        </div>

        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex justify-end">
          <Button onClick={onClose} className="bg-zinc-800 hover:bg-zinc-700 text-white">Done</Button>
        </div>
      </motion.div>
    </div>
  );
}

function AdminStorageView() {
  return (
    <div className="p-6 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Total Storage</h4>
          <div className="text-2xl font-bold text-white">1.2 TB</div>
          <p className="text-[10px] text-emerald-500 mt-1">+12% from last month</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Active Users</h4>
          <div className="text-2xl font-bold text-white">248</div>
          <p className="text-[10px] text-zinc-500 mt-1">Across 12 departments</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Files Shared</h4>
          <div className="text-2xl font-bold text-white">4.2k</div>
          <p className="text-[10px] text-indigo-500 mt-1">1.2k public links</p>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-bold text-white">Storage by Department</h4>
        <div className="space-y-4">
          <DeptStorageRow name="Engineering" usage="450 GB" percentage={45} color="bg-blue-500" />
          <DeptStorageRow name="Marketing" usage="280 GB" percentage={28} color="bg-emerald-500" />
          <DeptStorageRow name="Operations" usage="190 GB" percentage={19} color="bg-amber-500" />
          <DeptStorageRow name="Legal" usage="80 GB" percentage={8} color="bg-rose-500" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">System Audit Log</h4>
          <Button variant="outline" size="sm" className="h-7 text-[10px] border-zinc-800">Export CSV</Button>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800">
                <th className="p-3 font-bold text-zinc-500">User</th>
                <th className="p-3 font-bold text-zinc-500">Action</th>
                <th className="p-3 font-bold text-zinc-500">Target</th>
                <th className="p-3 font-bold text-zinc-500">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              <AuditRow user="Admin" action="Changed Permissions" target="Legal_Archive" time="10m ago" />
              <AuditRow user="Faris M." action="Deleted Folder" target="Old_Drafts" time="45m ago" />
              <AuditRow user="Sarah C." action="Shared File" target="Q2_Strategy.pdf" time="2h ago" />
              <AuditRow user="System" action="Auto-Archive" target="Logs_2023" time="5h ago" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DeptStorageRow({ name, usage, percentage, color }: { name: string; usage: string; percentage: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-300 font-medium">{name}</span>
        <span className="text-zinc-500">{usage}</span>
      </div>
      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function AuditRow({ user, action, target, time }: { user: string; action: string; target: string; time: string }) {
  return (
    <tr className="hover:bg-zinc-800/50 transition-colors">
      <td className="p-3 text-zinc-300 font-medium">{user}</td>
      <td className="p-3 text-zinc-400">{action}</td>
      <td className="p-3 text-zinc-500 italic">{target}</td>
      <td className="p-3 text-zinc-600">{time}</td>
    </tr>
  );
}


const FileCard: React.FC<{ 
  file: FileItem; 
  selected: boolean; 
  onSelect: (multi: boolean) => void;
  onOpen: () => void;
  onAction: (action: string) => void;
}> = ({ file, selected, onSelect, onOpen, onAction }) => {
  return (
    <div 
      onClick={(e) => onSelect(e.metaKey || e.ctrlKey)}
      onDoubleClick={onOpen}
      className={cn(
        "group relative p-3 rounded-xl border transition-all cursor-pointer select-none",
        selected ? "bg-indigo-500/10 border-indigo-500/50" : "bg-zinc-900/40 border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900/60"
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-full aspect-square rounded-lg bg-zinc-950/50 flex items-center justify-center relative overflow-hidden">
          {React.cloneElement(getFileIcon(file) as React.ReactElement, { size: 40 })}
          
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800">
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800 text-zinc-200">
                <DropdownMenuItem onClick={() => onOpen()} className="gap-2 cursor-pointer">
                  <ExternalLink size={14} /> Open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction('download')} className="gap-2 cursor-pointer">
                  <Download size={14} /> Download
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem onClick={() => onAction('star')} className="gap-2 cursor-pointer">
                  <Star size={14} className={file.starred ? "fill-amber-400 text-amber-400" : ""} /> 
                  {file.starred ? 'Unstar' : 'Star'}
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  <Share2 size={14} /> Share
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  <Copy size={14} /> Make a Copy
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  <Move size={14} /> Move to
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem onClick={() => onAction('delete')} className="text-rose-400 hover:bg-rose-950 hover:text-rose-300 gap-2 cursor-pointer">
                  <Trash2 size={14} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {file.shared && (
            <div className="absolute bottom-2 right-2">
              <Users size={12} className="text-zinc-500" />
            </div>
          )}
        </div>
        
        <div className="w-full min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            {file.type === 'folder' ? 'Folder' : formatSize(file.size)}
          </p>
        </div>
      </div>
    </div>
  );
}

const FileRow: React.FC<{ 
  file: FileItem; 
  selected: boolean; 
  onSelect: (multi: boolean) => void;
  onOpen: () => void;
  onAction: (action: string) => void;
}> = ({ file, selected, onSelect, onOpen, onAction }) => {
  return (
    <div 
      onClick={(e) => onSelect(e.metaKey || e.ctrlKey)}
      onDoubleClick={onOpen}
      className={cn(
        "grid grid-cols-[1fr_150px_150px_100px_40px] gap-4 px-4 py-2 items-center transition-colors cursor-pointer select-none",
        selected ? "bg-indigo-500/10" : "hover:bg-zinc-900/50"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          {React.cloneElement(getFileIcon(file) as React.ReactElement, { size: 18 })}
        </div>
        <span className="text-sm text-zinc-200 truncate">{file.name}</span>
        {file.starred && <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" />}
      </div>
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6 border border-zinc-800">
          <AvatarFallback className="text-[10px]">{file.owner.name[0]}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-zinc-400 truncate">{file.owner.name}</span>
      </div>
      <div className="text-xs text-zinc-500">
        {new Date(file.updatedAt).toLocaleDateString()}
      </div>
      <div className="text-xs text-zinc-500">
        {file.type === 'folder' ? '--' : formatSize(file.size)}
      </div>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500">
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800 text-zinc-200">
            <DropdownMenuItem onClick={() => onOpen()} className="gap-2 cursor-pointer">
              <ExternalLink size={14} /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction('download')} className="gap-2 cursor-pointer">
              <Download size={14} /> Download
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem onClick={() => onAction('star')} className="gap-2 cursor-pointer">
              <Star size={14} className={file.starred ? "fill-amber-400 text-amber-400" : ""} /> 
              {file.starred ? 'Unstar' : 'Star'}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer">
              <Share2 size={14} /> Share
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem onClick={() => onAction('delete')} className="text-rose-400 hover:bg-rose-950 hover:text-rose-300 gap-2 cursor-pointer">
              <Trash2 size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-medium">{value || '--'}</span>
    </div>
  );
}

function ActivityItem({ user, action, time, icon: Icon }: { user: string; action: string; time: string; icon: any }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-300">
          <span className="font-bold text-white">{user}</span> {action}
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{time}</p>
      </div>
    </div>
  );
}
