
export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  lastRun: string;
  runsCount: number;
  successRate: number;
  nodes?: any[];
  edges?: any[];
}

export const mockOrgMembers = [
  { id: '1', name: 'Faris Malek', email: 'faris@integrator.io', role: 'Owner', status: 'Active', joinDate: '2024-01-15' },
  { id: '2', name: 'Sarah Chen', email: 'sarah@integrator.io', role: 'Admin', status: 'Active', joinDate: '2024-02-01' },
  { id: '3', name: 'Alex Rivera', email: 'alex@integrator.io', role: 'Member', status: 'Active', joinDate: '2024-02-15' },
  { id: '4', name: 'Jordan Smith', email: 'jordan@integrator.io', role: 'Member', status: 'Inactive', joinDate: '2024-03-01' },
];

export const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Customer Onboarding',
    description: 'Automated welcome email and CRM update for new signups.',
    status: 'active',
    lastRun: '2 mins ago',
    runsCount: 1240,
    successRate: 99.2,
    nodes: [],
    edges: []
  },
  {
    id: '2',
    name: 'Invoice Processing',
    description: 'Extract data from PDF invoices and push to QuickBooks.',
    status: 'inactive',
    lastRun: '1 hour ago',
    runsCount: 850,
    successRate: 94.5,
    nodes: [],
    edges: []
  },
  {
    id: '3',
    name: 'Slack Alerts',
    description: 'Send critical system alerts to #ops-channel.',
    status: 'active',
    lastRun: 'Just now',
    runsCount: 5420,
    successRate: 100,
    nodes: [],
    edges: []
  },
  {
    id: '4',
    name: 'Data Backup',
    description: 'Nightly backup of production database to S3.',
    status: 'draft',
    lastRun: 'Never',
    runsCount: 0,
    successRate: 0,
    nodes: [],
    edges: []
  }
];

export const mockIntegrations = [
  { id: 'slack', name: 'Slack', icon: 'MessageSquare', status: 'connected', connected: true, category: 'Communication' },
  { id: 'github', name: 'GitHub', icon: 'Github', status: 'connected', connected: true, category: 'Development' },
  { id: 'stripe', name: 'Stripe', icon: 'CreditCard', status: 'disconnected', connected: false, category: 'Payments' },
  { id: 'google-sheets', name: 'Google Sheets', icon: 'Table', status: 'connected', connected: true, category: 'Data' },
];

export const mockNotifications = [
  { id: '1', title: 'Workflow Failed', description: 'Customer Onboarding failed at step 3', time: '5m ago', type: 'error' },
  { id: '2', title: 'New Member', description: 'Jordan Smith joined the team', time: '1h ago', type: 'info' },
  { id: '3', title: 'System Update', description: 'Integrator v2.4 is now live', time: '2h ago', type: 'success' },
];

export const mockRuns = [
  { id: 'r1', workflow: 'Customer Onboarding', workflowName: 'Customer Onboarding', status: 'success', duration: '1.2s', time: '2 mins ago', trigger: 'Webhook', startTime: '2026-04-09 08:16:00' },
  { id: 'r2', workflow: 'Invoice Processing', workflowName: 'Invoice Processing', status: 'failed', duration: '0.8s', time: '1 hour ago', trigger: 'Schedule', startTime: '2026-04-09 07:18:00' },
  { id: 'r3', workflow: 'Slack Alerts', workflowName: 'Slack Alerts', status: 'success', duration: '0.5s', time: 'Just now', trigger: 'Event', startTime: '2026-04-09 08:18:00' },
];

export const mockAlerts = [
  { id: 'a1', title: 'High CPU Usage', workflowName: 'System Monitor', message: 'CPU usage exceeded 90% for 5 minutes', severity: 'warning', time: '10m ago' },
  { id: 'a2', title: 'Database Connection Lost', workflowName: 'DB Sync', message: 'Failed to connect to production database', severity: 'critical', time: '1h ago' },
];

export const mockAuditLogs = [
  { id: 'l1', user: 'Faris Malek', action: 'Created Workflow', target: 'Customer Onboarding', time: '2h ago', ip: '192.168.1.1', changes: 'Initial creation', userAgent: 'Mozilla/5.0' },
  { id: 'l2', user: 'Sarah Chen', action: 'Updated Settings', target: 'Billing', time: '4h ago', ip: '192.168.1.2', changes: 'Updated billing email', userAgent: 'Mozilla/5.0' },
];

export const mockApprovals = [
  { id: 'ap1', title: 'New Facility Booking', requester: 'Alex Rivera', requestedBy: 'Alex Rivera', time: '3h ago', priority: 'Medium', workflowName: 'Facility Approval', details: 'Booking for Conference Room A', impact: 'Low', riskLevel: 'Low' },
];

export const mockDocs: Doc[] = [
  { id: 'd1', title: 'Project Roadmap', type: 'doc', lastModified: '2 days ago', content: 'Roadmap content here...' },
  { id: 'd2', title: 'Budget Q2', type: 'sheet', lastModified: '1 week ago', content: 'Budget data here...' },
];

export interface Doc {
  id: string;
  title: string;
  type: 'doc' | 'sheet' | 'note';
  lastModified: string;
  content?: string;
  owner?: string;
  category?: string;
}
