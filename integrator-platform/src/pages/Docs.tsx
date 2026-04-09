
import React, { useState } from 'react';
import { 
  FileText, 
  StickyNote, 
  Plus, 
  Search, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  Clock, 
  User, 
  ChevronLeft,
  MessageSquare,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  Image as ImageIcon,
  Type,
  Maximize2,
  Share2,
  History,
  Layout,
  Grid,
  List as ListIcon,
  Folder,
  Star,
  MoreHorizontal,
  Table as TableIcon,
  Filter,
  Sigma,
  ChevronDown,
  Link as LinkIcon,
  HardDrive
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockDocs, Doc } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function Docs() {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [docs, setDocs] = useState<Doc[]>(mockDocs);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'All' | 'Personal' | 'Shared'>('All');
  const [activeTab, setActiveTab] = useState<'docs' | 'notes'>('docs');
  const [showFilePicker, setShowFilePicker] = useState(false);

  const handleLinkFile = (file: any) => {
    toast.success(`Linked ${file.name} to document`);
    setShowFilePicker(false);
  };

  const handleCreate = (type: 'doc' | 'note' | 'sheet') => {
    const newDoc: Doc = {
      id: `new-${Date.now()}`,
      title: type === 'doc' ? 'Untitled Document' : type === 'sheet' ? 'Untitled Spreadsheet' : 'Untitled Note',
      content: '',
      lastModified: 'Just now',
      owner: 'Faris Malek',
      type: type === 'sheet' ? 'doc' : type, // Sheets are treated as docs for routing
      category: 'Personal'
    };
    // Special handling for sheet type
    if (type === 'sheet') {
      (newDoc as any).subType = 'sheet';
    }
    setSelectedDoc(newDoc);
    setView('editor');
  };

  const handleOpen = (doc: Doc) => {
    setSelectedDoc(doc);
    setView('editor');
  };

  const handleDelete = (id: string) => {
    setDocs(docs.filter(d => d.id !== id));
    toast.success("Deleted successfully");
  };

  const filteredDocs = docs.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'All' || d.category === filter;
    const matchesTab = (activeTab === 'docs' && d.type === 'doc') || (activeTab === 'notes' && d.type === 'note');
    return matchesSearch && matchesFilter && matchesTab;
  });

  if (view === 'editor' && selectedDoc) {
    if ((selectedDoc as any).subType === 'sheet') {
      return <GoogleSheetsEditor doc={selectedDoc} onBack={() => setView('list')} />;
    }
    return selectedDoc.type === 'doc' ? (
      <GoogleDocsEditor doc={selectedDoc} onBack={() => setView('list')} onLinkFile={() => setShowFilePicker(true)} />
    ) : (
      <AppFlowyEditor doc={selectedDoc} onBack={() => setView('list')} onLinkFile={() => setShowFilePicker(true)} />
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {showFilePicker && (
        <FilePickerModal 
          onClose={() => setShowFilePicker(false)} 
          onSelect={handleLinkFile} 
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Docs & Notes</h1>
          <p className="text-zinc-500 mt-1">Collaborative workspace for your team's knowledge.</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={() => handleCreate('doc')}
            variant="outline" 
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 gap-2"
          >
            <FileText size={18} className="text-blue-500" />
            New Document
          </Button>
          <Button 
            onClick={() => handleCreate('sheet')}
            variant="outline" 
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 gap-2"
          >
            <TableIcon size={18} className="text-emerald-500" />
            New Sheet
          </Button>
          <Button 
            onClick={() => handleCreate('note')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <StickyNote size={18} />
            New Note
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
            <TabsTrigger value="docs" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
              <FileText size={14} /> Documents
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white gap-2">
              <StickyNote size={14} /> Notes
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <Input 
                placeholder={`Search ${activeTab === 'docs' ? 'documents' : 'notes'}...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200"
              />
            </div>
            <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              {(['All', 'Personal', 'Shared'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                    filter === f ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <TabsContent value="docs" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDocs.map((doc) => (
              <DocCard key={doc.id} doc={doc} onOpen={handleOpen} onDelete={handleDelete} />
            ))}
            {filteredDocs.length === 0 && <EmptyState type="docs" />}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDocs.map((doc) => (
              <DocCard key={doc.id} doc={doc} onOpen={handleOpen} onDelete={handleDelete} />
            ))}
            {filteredDocs.length === 0 && <EmptyState type="notes" />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const DocCard: React.FC<{ doc: Doc, onOpen: (doc: Doc) => void, onDelete: (id: string) => void }> = ({ doc, onOpen, onDelete }) => {
  return (
    <Card 
      className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all group cursor-pointer overflow-hidden"
      onClick={() => onOpen(doc)}
    >
      <div className="h-32 bg-zinc-950 border-b border-zinc-800 p-4 flex flex-col justify-between relative">
        <div className="flex justify-between items-start">
          {doc.type === 'doc' ? (
            <FileText size={24} className="text-blue-500" />
          ) : (
            <StickyNote size={24} className="text-indigo-500" />
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc.id);
            }}
            className="p-1.5 text-zinc-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[8px] uppercase border-zinc-800 text-zinc-500 px-1">
              {doc.category}
            </Badge>
          </div>
        </div>
      </div>
      <CardContent className="p-4">
        <h3 className="font-bold text-zinc-200 group-hover:text-white transition-colors line-clamp-1">{doc.title}</h3>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <User size={10} />
            <span>{doc.owner}</span>
          </div>
          <span className="text-[10px] text-zinc-600">{doc.lastModified}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ type }: { type: 'docs' | 'notes' }) {
  return (
    <div className="col-span-full py-20 text-center">
      <Folder size={48} className="mx-auto text-zinc-800 mb-4" />
      <h3 className="text-zinc-400 font-medium">No {type === 'docs' ? 'documents' : 'notes'} found</h3>
      <p className="text-zinc-600 text-sm mt-1">Try adjusting your search or filters.</p>
    </div>
  );
}

// --- Google Sheets Style Editor ---
function GoogleSheetsEditor({ doc, onBack }: { doc: Doc, onBack: () => void }) {
  const rows = Array.from({ length: 50 });
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-4 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full text-zinc-600">
            <ChevronLeft size={20} />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <TableIcon size={20} className="text-emerald-600" />
              <input 
                defaultValue={doc.title} 
                className="text-lg font-medium text-zinc-800 bg-transparent border-none outline-none focus:ring-0 w-64"
              />
              <Star size={16} className="text-zinc-400 cursor-pointer hover:text-amber-400" />
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500 -mt-1">
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">File</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Edit</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">View</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Insert</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Format</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Data</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Tools</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 gap-2 border-none">
            <Share2 size={16} />
            Share
          </Button>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold ml-2">
            FM
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="h-10 flex items-center gap-1 px-4 bg-[#f9fbfd] border-b border-zinc-200 overflow-x-auto">
        <ToolbarButton icon={Bold} />
        <ToolbarButton icon={Italic} />
        <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-300" />
        <ToolbarButton icon={AlignCenter} />
        <ToolbarButton icon={Filter} />
        <ToolbarButton icon={Sigma} />
        <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-300" />
        <div className="flex items-center gap-2 px-2 text-xs text-zinc-600 font-medium">
          <span>100%</span>
          <ChevronDown size={12} />
        </div>
      </div>

      {/* Formula Bar */}
      <div className="h-9 flex items-center px-4 border-b border-zinc-200 gap-2">
        <div className="w-12 text-xs text-zinc-500 font-mono text-center">A1</div>
        <Separator orientation="vertical" className="h-6 bg-zinc-200" />
        <div className="text-zinc-400 italic text-sm px-2">fx</div>
        <input className="flex-1 h-full bg-transparent border-none outline-none text-sm text-zinc-800" />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-[#f8f9fa]">
        <table className="border-collapse bg-white">
          <thead>
            <tr>
              <th className="w-10 h-6 bg-zinc-100 border border-zinc-200 sticky top-0 left-0 z-20"></th>
              {cols.map(col => (
                <th key={col} className="w-24 h-6 bg-zinc-100 border border-zinc-200 text-[10px] font-medium text-zinc-500 sticky top-0 z-10">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((_, i) => (
              <tr key={i}>
                <td className="w-10 h-6 bg-zinc-100 border border-zinc-200 text-[10px] font-medium text-zinc-500 text-center sticky left-0 z-10">
                  {i + 1}
                </td>
                {cols.map(col => (
                  <td key={col} className="w-24 h-6 border border-zinc-200 outline-none focus:ring-2 focus:ring-emerald-500 focus:z-30" contentEditable></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Tabs */}
      <div className="h-9 bg-white border-t border-zinc-200 flex items-center px-4 gap-4">
        <div className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium border-t-2 border-emerald-600">
          Sheet1
          <ChevronDown size={10} />
        </div>
        <Plus size={14} className="text-zinc-500 cursor-pointer" />
      </div>
    </div>
  );
}

// --- Google Docs Style Editor ---
function GoogleDocsEditor({ doc, onBack, onLinkFile }: { doc: Doc, onBack: () => void, onLinkFile: () => void }) {
  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa]">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-4 bg-white border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full text-zinc-600">
            <ChevronLeft size={20} />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-blue-500" />
              <input 
                defaultValue={doc.title} 
                className="text-lg font-medium text-zinc-800 bg-transparent border-none outline-none focus:ring-0 w-64"
              />
              <Star size={16} className="text-zinc-400 cursor-pointer hover:text-amber-400" />
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500 -mt-1">
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">File</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Edit</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">View</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Insert</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Format</span>
              <span className="cursor-pointer hover:bg-zinc-100 px-1 rounded">Tools</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-zinc-600 gap-2" onClick={onLinkFile}>
            <HardDrive size={16} />
            Link File
          </Button>
          <Button variant="ghost" size="sm" className="text-zinc-600 gap-2">
            <History size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="text-zinc-600 gap-2">
            <MessageSquare size={16} />
          </Button>
          <Button className="bg-blue-100 text-blue-700 hover:bg-blue-200 gap-2 border-none">
            <Share2 size={16} />
            Share
          </Button>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold ml-2">
            FM
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="h-10 flex items-center gap-1 px-4 bg-[#edf2fa] border-b border-zinc-200 overflow-x-auto">
        <ToolbarButton icon={Bold} />
        <ToolbarButton icon={Italic} />
        <ToolbarButton icon={Underline} />
        <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-300" />
        <ToolbarButton icon={AlignLeft} />
        <ToolbarButton icon={AlignCenter} />
        <ToolbarButton icon={AlignRight} />
        <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-300" />
        <ToolbarButton icon={List} />
        <ToolbarButton icon={ImageIcon} />
        <ToolbarButton icon={Type} />
        <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-300" />
        <div className="flex items-center gap-2 px-2 text-xs text-zinc-600 font-medium">
          <span>Arial</span>
          <ChevronDown size={12} />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-300" />
        <div className="flex items-center gap-2 px-2 text-xs text-zinc-600 font-medium">
          <span>11</span>
          <ChevronDown size={12} />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        {/* Ruler Placeholder */}
        <div className="w-[816px] h-4 bg-white border border-zinc-200 mb-1 rounded-t shadow-sm"></div>
        
        {/* Paper */}
        <div className="w-[816px] min-h-[1056px] bg-white shadow-md border border-zinc-200 p-[96px] outline-none" contentEditable suppressContentEditableWarning={true}>
          <div dangerouslySetInnerHTML={{ __html: doc.content }} />
        </div>
      </div>
    </div>
  );
}

// --- AppFlowy / Notion Style Editor ---
function AppFlowyEditor({ doc, onBack, onLinkFile }: { doc: Doc, onBack: () => void, onLinkFile: () => void }) {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white">
              <StickyNote size={14} />
            </div>
            <span className="font-bold text-sm">Notes</span>
          </div>
          <button onClick={onBack} className="p-1 hover:bg-zinc-800 rounded text-zinc-500">
            <ChevronLeft size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider px-2 py-2">Quick Links</div>
          <SidebarNoteItem icon={Star} label="Favorites" />
          <SidebarNoteItem icon={Clock} label="Recent" />
          <SidebarNoteItem icon={HardDrive} label="Linked Files" onClick={onLinkFile} />
          <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider px-2 py-4">Your Notes</div>
          {mockDocs.filter(d => d.type === 'note').map(n => (
            <div key={n.id}>
              <SidebarNoteItem 
                icon={FileText} 
                label={n.title} 
                active={n.id === doc.id} 
              />
            </div>
          ))}
        </div>
      </aside>

      {/* Editor Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 flex items-center justify-between px-6 border-b border-zinc-800/50">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Workspace</span>
            <span>/</span>
            <span>Notes</span>
            <span>/</span>
            <span className="text-zinc-200">{doc.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-white">Share</Button>
            <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-white">
              <MoreHorizontal size={18} />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-20 px-10 space-y-8">
            <div className="group relative">
              <div className="absolute -left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1 text-zinc-600 hover:text-zinc-400"><Plus size={20} /></button>
              </div>
              <input 
                defaultValue={doc.title} 
                className="text-5xl font-bold bg-transparent border-none outline-none focus:ring-0 w-full text-white placeholder:text-zinc-800"
                placeholder="Untitled"
              />
            </div>

            <div className="space-y-4 text-zinc-400 leading-relaxed text-lg outline-none" contentEditable suppressContentEditableWarning={true}>
              {doc.content ? (
                <div dangerouslySetInnerHTML={{ __html: doc.content.replace(/\n/g, '<br/>') }} />
              ) : (
                <p className="text-zinc-700">Type '/' for commands...</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ToolbarButton({ icon: Icon }: { icon: any }) {
  return (
    <button className="p-1.5 hover:bg-zinc-200 rounded text-zinc-600 transition-colors">
      <Icon size={16} />
    </button>
  );
}

function SidebarNoteItem({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
        active ? "bg-zinc-800 text-white" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
      )}
    >
      <Icon size={14} className={active ? "text-indigo-400" : ""} />
      <span className="truncate">{label}</span>
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
            <h3 className="font-bold text-white text-sm">Link from Files</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <Plus className="rotate-45" size={20} />
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
                <LinkIcon size={14} className="text-zinc-700 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
          <p className="text-[10px] text-zinc-500 italic">Select a file to link it to this document</p>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}
