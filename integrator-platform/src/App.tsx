/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Workflows } from './pages/Workflows';
import { WorkflowBuilder } from './pages/WorkflowBuilder';
import { Integrations } from './pages/Integrations';
import { ActivityCenter, AuditLogs, Approvals } from './pages/OperationsPages';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Organization } from './pages/Organization';
import { Docs } from './pages/Docs';
import { Communication } from './pages/Communication';
import { Onboarding } from './pages/Onboarding';
import { FacilityManagement } from './pages/FacilityManagement';
import { MaintenanceSystem } from './pages/MaintenanceSystem';
import { CalendarSystem } from './pages/CalendarSystem';
import { Files } from './pages/Files';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Workflow } from '@/lib/mock-data';

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const handleCreateWorkflow = () => {
    setEditingWorkflow(null);
    setIsBuilderOpen(true);
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setIsBuilderOpen(true);
  };

  // Simple "router"
  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard 
            onCreateWorkflow={handleCreateWorkflow} 
            onBrowseTemplates={() => toast.info("Template library coming soon in Live Mode!")}
          />
        );
      case 'workflows':
        return (
          <Workflows 
            onCreateWorkflow={handleCreateWorkflow} 
            onEditWorkflow={handleEditWorkflow}
          />
        );
      case 'integrations':
        return (
          <Integrations 
            onAddCustom={() => toast.info("Custom integration builder coming soon!")} 
          />
        );
      case 'activity':
        return <ActivityCenter />;
      case 'audit':
        return <AuditLogs />;
      case 'approvals':
        return <Approvals />;
      case 'profile':
        return <Profile />;
      case 'settings':
        return <Settings />;
      case 'organization':
        return <Organization />;
      case 'docs':
        return <Docs />;
      case 'communication':
        return <Communication />;
      case 'facility':
        return <FacilityManagement />;
      case 'maintenance':
        return <MaintenanceSystem />;
      case 'calendar':
        return <CalendarSystem />;
      case 'files':
        return <Files />;
      default:
        return (
          <Dashboard 
            onCreateWorkflow={handleCreateWorkflow} 
            onBrowseTemplates={() => toast.info("Template library coming soon in Live Mode!")}
          />
        );
    }
  };

  // Intercept "New Workflow" or clicking a workflow to open builder
  useEffect(() => {
    const handleOpenBuilder = () => setIsBuilderOpen(true);
    // In a real app, we'd use a router. Here we just listen for a custom event or check state.
    // For the prototype, let's just make a button in Workflows trigger this.
  }, []);

  if (showOnboarding) {
    return (
      <TooltipProvider>
        <Onboarding onComplete={() => setShowOnboarding(false)} />
        <Toaster position="top-right" theme="dark" />
      </TooltipProvider>
    );
  }

  if (isBuilderOpen) {
    return (
      <TooltipProvider>
        <WorkflowBuilder 
          workflow={editingWorkflow} 
          onBack={() => setIsBuilderOpen(false)} 
        />
        <Toaster position="top-right" theme="dark" />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <MainLayout 
        activePage={activePage} 
        setActivePage={setActivePage}
        onNewWorkflow={handleCreateWorkflow}
      >
        {renderPage()}
      </MainLayout>
      <Toaster position="top-right" theme="dark" />
    </TooltipProvider>
  );
}
