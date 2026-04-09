
import React, { useState, useCallback } from 'react';
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  MiniMap,
  Connection,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  Panel,
  updateEdge,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Play, 
  Save, 
  ChevronLeft, 
  Zap, 
  MessageSquare, 
  Database, 
  Clock, 
  ShieldCheck,
  Plus,
  Settings2,
  X,
  Globe,
  Code,
  Cpu,
  Webhook,
  Trash2,
  ChevronRight,
  HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { mockIntegrations } from '@/lib/mock-data';
import { toast } from 'sonner';

import { Workflow } from '@/lib/mock-data';
import { useStore } from '@/lib/store';

const initialNodes: Node[] = [
  { 
    id: 'cron', 
    type: 'input', 
    data: { label: 'Cron (Every Minute)' }, 
    position: { x: 50, y: 200 },
    style: { background: '#18181b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'config', 
    data: { label: 'Dashboard Configuration' }, 
    position: { x: 250, y: 200 },
    style: { background: '#18181b', color: '#fff', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'docker_data', 
    data: { label: 'Retrieve Docker Data' }, 
    position: { x: 500, y: 100 },
    style: { background: '#18181b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'npm_data', 
    data: { label: 'Retrieve npm Data' }, 
    position: { x: 500, y: 300 },
    style: { background: '#18181b', color: '#fff', border: '1px solid #3f3f46', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'massage_docker', 
    data: { label: 'Massage Docker Data' }, 
    position: { x: 750, y: 100 },
    style: { background: '#18181b', color: '#fff', border: '1px solid #fbbf24', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'massage_npm', 
    data: { label: 'Massage npm Data' }, 
    position: { x: 750, y: 300 },
    style: { background: '#18181b', color: '#fff', border: '1px solid #fbbf24', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'docker_pulls', 
    type: 'output',
    data: { label: 'Update: Docker Pulls' }, 
    position: { x: 1000, y: 50 },
    style: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px' }
  },
  { 
    id: 'docker_stars', 
    type: 'output',
    data: { label: 'Update: Docker Stars' }, 
    position: { x: 1000, y: 150 },
    style: { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px' }
  },
];

const initialEdges: Edge[] = [
  { id: 'e-cron-config', source: 'cron', target: 'config', animated: true },
  { id: 'e-config-docker', source: 'config', target: 'docker_data', animated: true },
  { id: 'e-config-npm', source: 'config', target: 'npm_data', animated: true },
  { id: 'e-docker-massage', source: 'docker_data', target: 'massage_docker', animated: true },
  { id: 'e-npm-massage', source: 'npm_data', target: 'massage_npm', animated: true },
  { id: 'e-massage-pulls', source: 'massage_docker', target: 'docker_pulls', animated: true },
  { id: 'e-massage-stars', source: 'massage_docker', target: 'docker_stars', animated: true },
];

export function WorkflowBuilder({ workflow, onBack }: { workflow: Workflow | null, onBack: () => void }) {
  const { saveWorkflow } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow?.nodes || initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.edges || initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [nodeName, setNodeName] = useState('');

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' } }, eds)),
    [setEdges]
  );

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => setEdges((els) => updateEdge(oldEdge, newConnection, els)),
    [setEdges]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
      toast.success("Connection removed");
    }
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
      toast.success("Node removed");
    }
  }, [selectedEdge, selectedNode, setEdges, setNodes]);

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setNodeName(node.data.label);
    setSelectedEdge(null);
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const handleApplyChanges = () => {
    if (selectedNode) {
      setNodes((nds) => nds.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: nodeName } } : n));
      toast.success("Changes applied to node");
    }
  };

  const handleSave = () => {
    const updatedWorkflow: Workflow = {
      id: workflow?.id || `wf_${Date.now()}`,
      name: workflow?.name || 'Untitled Workflow',
      description: workflow?.description || 'No description',
      status: (workflow?.status as any) || 'draft',
      lastRun: workflow?.lastRun || 'Never',
      runsCount: workflow?.runsCount || 0,
      successRate: workflow?.successRate || 0,
      nodes: nodes,
      edges: edges,
    };
    saveWorkflow(updatedWorkflow);
    toast.success("Workflow saved successfully");
  };

  const updateEdgeStyle = (type: 'smoothstep' | 'step' | 'default') => {
    if (selectedEdge) {
      setEdges((eds) => eds.map((e) => e.id === selectedEdge.id ? { ...e, type } : e));
      toast.success(`Edge style updated to ${type}`);
    }
  };

  const onPaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      handleDeleteSelected();
    }
  }, [handleDeleteSelected]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      // check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = { x: event.clientX - 200, y: event.clientY - 100 };
      const newNode = {
        id: `node_${nodes.length + 1}`,
        type: type === 'Webhook' || type === 'Schedule' || type === 'Email' || type === 'File Uploaded' ? 'input' : 
              type === 'Slack' || type === 'Save to Drive' ? 'output' : 'default',
        position,
        data: { label: `${type} Node` },
        style: { 
          background: (type === 'Slack' || type === 'Save to Drive') ? '#4f46e5' : '#18181b', 
          color: '#fff', 
          border: (type === 'Slack' || type === 'Save to Drive') ? 'none' : '1px solid #3f3f46', 
          borderRadius: '8px', 
          padding: '10px' 
        }
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [nodes, setNodes]
  );

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Builder Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-zinc-400 hover:text-white">
            <ChevronLeft size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white">
              <Zap size={14} fill="currentColor" />
            </div>
            <h2 className="font-bold text-zinc-200">{workflow ? workflow.name : 'Untitled Workflow'}</h2>
            <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-500 ml-2">
              {workflow ? workflow.status : 'Draft'}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800">
            <Settings2 size={16} className="mr-2" />
            Settings
          </Button>
          <Button variant="outline" size="sm" className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800">
            <Play size={16} className="mr-2" />
            Test Run
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSave}>
            <Save size={16} className="mr-2" />
            Save Changes
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-950 p-4 space-y-6 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-4">Triggers</h3>
            <div className="space-y-2">
              <PaletteItem icon={Clock} label="Cron" color="text-amber-500" />
              <PaletteItem icon={Zap} label="Webhook" color="text-blue-500" />
              <PaletteItem icon={MessageSquare} label="Email" color="text-emerald-500" />
              <PaletteItem icon={HardDrive} label="File Uploaded" color="text-indigo-400" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-4">Core Nodes</h3>
            <div className="space-y-2">
              <PaletteItem icon={Settings2} label="Set" color="text-zinc-400" />
              <PaletteItem icon={Globe} label="HTTP Request" color="text-indigo-500" />
              <PaletteItem icon={Code} label="Function" color="text-amber-400" />
              <PaletteItem icon={Cpu} label="AI Agent" color="text-purple-500" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-4">Integrations</h3>
            <div className="space-y-2">
              <PaletteItem icon={HardDrive} label="Save to Drive" color="text-indigo-400" />
              {mockIntegrations.filter(i => i.connected).map(integration => (
                <div key={integration.id}>
                  <PaletteItem 
                    icon={Zap} 
                    label={integration.name} 
                    color="text-indigo-400" 
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
            <p className="text-xs text-zinc-500 text-center">Drag and drop nodes onto the canvas to build your flow.</p>
          </div>
        </aside>

        {/* Canvas */}
        <div 
          className="flex-1 relative bg-zinc-900/20 outline-none" 
          onDragOver={onDragOver} 
          onDrop={onDrop}
          onKeyDown={onKeyDown}
          tabIndex={0}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeUpdate={onEdgeUpdate}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            theme="dark"
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background color="#27272a" gap={20} />
            <Controls className="bg-zinc-900 border-zinc-800 fill-zinc-400" />
            <MiniMap 
              className="bg-zinc-900 border-zinc-800"
              maskColor="rgba(0, 0, 0, 0.5)"
              nodeColor="#3f3f46"
            />
            <Panel position="top-right" className="bg-zinc-900/80 backdrop-blur border border-zinc-800 p-2 rounded-lg text-[10px] text-zinc-500">
              Double click edge to delete • Drag to connect
            </Panel>
          </ReactFlow>
        </div>

        {/* Inspector Panel */}
        <aside className={cn(
          "w-80 border-l border-zinc-800 bg-zinc-950 transition-all duration-300 overflow-hidden flex flex-col",
          (selectedNode || selectedEdge) ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 absolute right-0"
        )}>
          {selectedNode && (
            <>
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-zinc-200">Node Settings</h3>
                <Button variant="ghost" size="icon" onClick={() => setSelectedNode(null)} className="text-zinc-500 hover:text-white">
                  <X size={18} />
                </Button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Node Name</Label>
                  <Input 
                    value={nodeName} 
                    onChange={(e) => setNodeName(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200" 
                  />
                </div>

                <Separator className="bg-zinc-800" />

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600">Configuration</h4>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input readOnly value="https://api.integrator.io/wh/..." className="bg-zinc-900 border-zinc-800 text-zinc-400 text-xs" />
                      <Button size="sm" variant="outline" className="bg-zinc-800 border-zinc-700">Copy</Button>
                    </div>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                <div className="pt-4">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500 hover:text-white"
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 size={14} className="mr-2" />
                    Delete Node
                  </Button>
                </div>
              </div>
              <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleApplyChanges}>Apply Changes</Button>
              </div>
            </>
          )}

          {selectedEdge && (
            <>
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-zinc-200">Connection</h3>
                <Button variant="ghost" size="icon" onClick={() => setSelectedEdge(null)} className="text-zinc-500 hover:text-white">
                  <X size={18} />
                </Button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto space-y-6">
                <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Source</span>
                    <span className="text-zinc-200 font-medium">{nodes.find(n => n.id === selectedEdge.source)?.data.label}</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <ChevronRight size={14} className="text-zinc-700 rotate-90" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Target</span>
                    <span className="text-zinc-200 font-medium">{nodes.find(n => n.id === selectedEdge.target)?.data.label}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600">Edge Style</h4>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={cn("flex-1 bg-zinc-900 border-zinc-800 text-xs", selectedEdge.type === 'smoothstep' && "bg-indigo-600 border-indigo-500")}
                      onClick={() => updateEdgeStyle('smoothstep')}
                    >
                      Smooth
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={cn("flex-1 bg-zinc-900 border-zinc-800 text-xs", selectedEdge.type === 'step' && "bg-indigo-600 border-indigo-500")}
                      onClick={() => updateEdgeStyle('step')}
                    >
                      Step
                    </Button>
                  </div>
                </div>

                <Separator className="bg-zinc-800" />

                <div className="pt-4">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500 hover:text-white"
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 size={14} className="mr-2" />
                    Delete Connection
                  </Button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function PaletteItem({ icon: Icon, label, color }: { icon: any, label: string, color: string }) {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div 
      draggable
      onDragStart={(event) => onDragStart(event, label)}
      className="flex items-center gap-3 p-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-grab active:cursor-grabbing transition-colors group"
    >
      <div className={cn("p-1.5 rounded bg-zinc-950 border border-zinc-800", color)}>
        <Icon size={14} />
      </div>
      <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200">{label}</span>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
