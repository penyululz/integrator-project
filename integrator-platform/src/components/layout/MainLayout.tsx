
import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface MainLayoutProps {
  children: React.ReactNode;
  activePage: string;
  setActivePage: (page: string) => void;
  onNewWorkflow: () => void;
}

export function MainLayout({ children, activePage, setActivePage, onNewWorkflow }: MainLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        collapsed={isSidebarCollapsed}
        setCollapsed={setIsSidebarCollapsed}
        onProfileClick={() => setActivePage('profile')}
        onSettingsClick={() => setActivePage('settings')}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar 
          onNewWorkflow={onNewWorkflow} 
        />
        <main className="flex-1 overflow-y-auto bg-zinc-950">
          {children}
        </main>
      </div>
    </div>
  );
}
