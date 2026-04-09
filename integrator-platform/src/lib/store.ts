
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  mockOrgMembers, 
  mockWorkflows, 
  mockIntegrations,
  Workflow
} from './mock-data';

interface AppState {
  // Organization
  members: any[];
  teams: any[];
  departments: any[];
  
  // Facility Management
  bookings: any[];
  facilities: any[];
  
  // Maintenance
  tickets: any[];
  
  // Workflows
  workflows: Workflow[];
  integrations: any[];
  
  // Actions
  addMember: (member: any) => void;
  removeMember: (id: string) => void;
  updateMember: (id: string, updates: any) => void;
  
  addTeam: (team: any) => void;
  updateTeam: (id: string, updates: any) => void;
  removeTeam: (id: string) => void;
  
  addDepartment: (dept: any) => void;
  updateDepartment: (id: string, updates: any) => void;
  removeDepartment: (id: string) => void;
  
  addBooking: (booking: any) => void;
  updateBooking: (id: string, updates: any) => void;
  removeBooking: (id: string) => void;
  
  addFacility: (facility: any) => void;
  updateFacility: (id: string, updates: any) => void;
  removeFacility: (id: string) => void;
  
  addTicket: (ticket: any) => void;
  updateTicket: (id: string, updates: any) => void;
  removeTicket: (id: string) => void;
  addTicketComment: (ticketId: string, comment: any) => void;
  
  saveWorkflow: (workflow: Workflow) => void;
  deleteWorkflow: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      members: mockOrgMembers,
      teams: [
        { id: 't1', name: 'Engineering', role: 'Dev', members: ['1', '2'] },
        { id: 't2', name: 'Design', role: 'UI/UX', members: ['3'] },
      ],
      departments: [
        { id: 'd1', name: 'Product', teams: ['t1', 't2'], members: [] },
      ],
      bookings: [
        { id: 'b1', facilityId: 'f1', title: 'Team Sync', startTime: '2026-04-10T10:00:00', endTime: '2026-04-10T11:00:00', status: 'approved', userId: '1' },
      ],
      facilities: [
        { id: 'f1', name: 'Conference Room A', capacity: 10 },
        { id: 'f2', name: 'Lab 1', capacity: 5 },
      ],
      tickets: [
        { id: 'tk1', title: 'AC leaking', priority: 'high', status: 'open', assignedTo: '2', createdAt: '2026-04-09T08:00:00' },
      ],
      workflows: mockWorkflows,
      integrations: mockIntegrations,

      addMember: (member) => set((state) => ({ members: [...state.members, member] })),
      removeMember: (id) => set((state) => ({ 
        members: state.members.filter(m => m.id !== id),
        teams: state.teams.map(t => ({ ...t, members: t.members.filter((mId: string) => mId !== id) }))
      })),
      updateMember: (id, updates) => set((state) => ({
        members: state.members.map(m => m.id === id ? { ...m, ...updates } : m)
      })),

      addTeam: (team) => set((state) => ({ teams: [...state.teams, team] })),
      updateTeam: (id, updates) => set((state) => ({
        teams: state.teams.map(t => t.id === id ? { ...t, ...updates } : t)
      })),
      removeTeam: (id) => set((state) => ({ 
        teams: state.teams.filter(t => t.id !== id),
        departments: state.departments.map(d => ({ ...d, teams: d.teams.filter((tId: string) => tId !== id) }))
      })),

      addDepartment: (dept) => set((state) => ({ departments: [...state.departments, dept] })),
      updateDepartment: (id, updates) => set((state) => ({
        departments: state.departments.map(d => d.id === id ? { ...d, ...updates } : d)
      })),
      removeDepartment: (id) => set((state) => ({ departments: state.departments.filter(d => d.id !== id) })),

      addBooking: (booking) => set((state) => ({ bookings: [...state.bookings, booking] })),
      updateBooking: (id, updates) => set((state) => ({
        bookings: state.bookings.map(b => b.id === id ? { ...b, ...updates } : b)
      })),
      removeBooking: (id) => set((state) => ({
        bookings: state.bookings.filter(b => b.id !== id)
      })),

      addFacility: (facility) => set((state) => ({ facilities: [...state.facilities, facility] })),
      updateFacility: (id, updates) => set((state) => ({
        facilities: state.facilities.map(f => f.id === id ? { ...f, ...updates } : f)
      })),
      removeFacility: (id) => set((state) => ({
        facilities: state.facilities.filter(f => f.id !== id),
        bookings: state.bookings.filter(b => b.facilityId !== id)
      })),
      
      addTicket: (ticket) => set((state) => ({ tickets: [...state.tickets, { ...ticket, comments: [] }] })),
      updateTicket: (id, updates) => set((state) => ({
        tickets: state.tickets.map(t => t.id === id ? { ...t, ...updates } : t)
      })),
      removeTicket: (id) => set((state) => ({
        tickets: state.tickets.filter(t => t.id !== id)
      })),
      addTicketComment: (ticketId, comment) => set((state) => ({
        tickets: state.tickets.map(t => t.id === ticketId ? { 
          ...t, 
          comments: [...(t.comments || []), { ...comment, id: Date.now().toString(), createdAt: new Date().toISOString() }] 
        } : t)
      })),

      saveWorkflow: (workflow) => set((state) => {
        const exists = state.workflows.find(w => w.id === workflow.id);
        if (exists) {
          return {
            workflows: state.workflows.map(w => w.id === workflow.id ? workflow : w)
          };
        }
        return { workflows: [...state.workflows, workflow] };
      }),
      deleteWorkflow: (id) => set((state) => ({
        workflows: state.workflows.filter(w => w.id !== id)
      })),
    }),
    {
      name: 'integrator-storage',
    }
  )
);
