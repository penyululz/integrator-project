
import React, { useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Plus, 
  Clock, 
  MapPin, 
  AlertCircle,
  CheckCircle2,
  User,
  Building2,
  Tag,
  MoreVertical,
  X,
  Search,
  LayoutGrid,
  List,
  CalendarDays,
  Settings2
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  subDays,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
  parseISO,
  isWithinInterval,
  addWeeks,
  subWeeks,
  getHours,
  setHours,
  startOfHour
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ViewMode = 'month' | 'week' | 'day';

export function CalendarSystem() {
  const { 
    bookings, 
    tickets, 
    facilities, 
    members, 
    teams, 
    departments,
    updateBooking,
    updateTicket
  } = useStore();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  
  // Detail Modal
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Helper to get events for a day
  const getEventsForInterval = (start: Date, end: Date) => {
    const dayBookings = bookings.filter(b => {
      const bStart = parseISO(b.startTime);
      const bEnd = parseISO(b.endTime);
      return (bStart >= start && bStart <= end) || (bEnd >= start && bEnd <= end) || (bStart <= start && bEnd >= end);
    }).map(b => ({ ...b, type: 'booking', color: 'indigo' }));

    const dayTickets = tickets.filter(t => {
      const tDate = parseISO(t.createdAt);
      return tDate >= start && tDate <= end;
    }).map(t => ({ ...t, type: 'maintenance', color: 'rose' }));

    let allEvents = [...dayBookings, ...dayTickets];

    // Apply filters
    if (typeFilter !== 'all') {
      allEvents = allEvents.filter(e => e.type === typeFilter);
    }
    if (facilityFilter !== 'all') {
      allEvents = allEvents.filter(e => e.type === 'booking' && e.facilityId === facilityFilter);
    }
    if (deptFilter !== 'all') {
      // This is a bit complex as we need to check if the user belongs to the department
      // For now, let's simplify or skip if it's too deep for mock data
    }

    return allEvents;
  };

  // Navigation
  const next = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const prev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const today = () => setCurrentDate(new Date());

  // Render Month View
  const renderMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const dateFormat = "d";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        const events = getEventsForInterval(startOfDay(day), endOfDay(day));
        
        days.push(
          <div
            key={day.toString()}
            className={cn(
              "min-h-[120px] p-2 border-r border-b border-zinc-800 last:border-r-0 group hover:bg-zinc-800/20 transition-colors",
              !isSameMonth(day, monthStart) && "bg-zinc-950/30 opacity-40"
            )}
            onClick={() => {}}
          >
            <div className={cn(
              "text-sm font-medium mb-2 w-7 h-7 flex items-center justify-center rounded-full transition-colors",
              isSameDay(day, new Date()) ? "bg-indigo-600 text-white" : "text-zinc-500 group-hover:text-zinc-300"
            )}>
              {formattedDate}
            </div>
            <div className="space-y-1">
              {events.slice(0, 4).map((event: any, idx) => (
                <div 
                  key={idx} 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(event);
                    setIsDetailOpen(true);
                  }}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium truncate border cursor-pointer hover:brightness-125 transition-all",
                    event.type === 'booking' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  )}
                >
                  {event.title}
                </div>
              ))}
              {events.length > 4 && (
                <div className="text-[10px] text-zinc-600 pl-1">+{events.length - 4} more</div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="bg-zinc-900">{rows}</div>;
  };

  // Render Week View
  const renderWeek = () => {
    const startDate = startOfWeek(currentDate);
    const weekDays = eachDayOfInterval({
      start: startDate,
      end: addDays(startDate, 6)
    });

    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="flex flex-col h-[700px] overflow-hidden bg-zinc-900">
        <div className="grid grid-cols-8 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <div className="p-4 border-r border-zinc-800"></div>
          {weekDays.map(day => (
            <div key={day.toString()} className="p-4 text-center border-r border-zinc-800 last:border-r-0">
              <div className="text-xs text-zinc-500 uppercase font-bold">{format(day, 'EEE')}</div>
              <div className={cn(
                "text-lg font-bold mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full",
                isSameDay(day, new Date()) ? "bg-indigo-600 text-white" : "text-zinc-200"
              )}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-8">
            <div className="flex flex-col">
              {hours.map(hour => (
                <div key={hour} className="h-20 border-b border-zinc-800 border-r border-zinc-800 p-2 text-[10px] text-zinc-600 text-right pr-4">
                  {format(setHours(new Date(), hour), 'h a')}
                </div>
              ))}
            </div>
            {weekDays.map(day => (
              <div key={day.toString()} className="relative border-r border-zinc-800 last:border-r-0">
                {hours.map(hour => (
                  <div key={hour} className="h-20 border-b border-zinc-800"></div>
                ))}
                {getEventsForInterval(startOfDay(day), endOfDay(day)).map((event: any, idx) => {
                  const start = parseISO(event.startTime || event.createdAt);
                  const end = event.endTime ? parseISO(event.endTime) : addDays(start, 0); // Maintenance is point in time for now
                  
                  const top = (start.getHours() * 80) + (start.getMinutes() / 60 * 80);
                  const duration = event.endTime ? (end.getTime() - start.getTime()) / (1000 * 60 * 60) : 1;
                  const height = Math.max(duration * 80, 30);

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedEvent(event);
                        setIsDetailOpen(true);
                      }}
                      className={cn(
                        "absolute left-1 right-1 rounded p-2 text-[10px] font-bold border cursor-pointer hover:brightness-110 transition-all z-0 overflow-hidden",
                        event.type === 'booking' ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                      )}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="truncate">{event.title}</div>
                      {height > 40 && <div className="opacity-60 font-normal mt-1">{format(start, 'h:mm a')}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render Day View
  const renderDay = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const events = getEventsForInterval(startOfDay(currentDate), endOfDay(currentDate));

    return (
      <div className="flex flex-col h-[700px] overflow-hidden bg-zinc-900">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900 text-center">
          <div className="text-sm text-zinc-500 uppercase font-bold">{format(currentDate, 'EEEE')}</div>
          <div className="text-2xl font-bold text-white mt-1">{format(currentDate, 'MMMM d, yyyy')}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[100px_1fr]">
            <div className="flex flex-col">
              {hours.map(hour => (
                <div key={hour} className="h-24 border-b border-zinc-800 border-r border-zinc-800 p-4 text-xs text-zinc-600 text-right pr-6">
                  {format(setHours(new Date(), hour), 'h a')}
                </div>
              ))}
            </div>
            <div className="relative">
              {hours.map(hour => (
                <div key={hour} className="h-24 border-b border-zinc-800"></div>
              ))}
              {events.map((event: any, idx) => {
                const start = parseISO(event.startTime || event.createdAt);
                const end = event.endTime ? parseISO(event.endTime) : addDays(start, 0);
                
                const top = (start.getHours() * 96) + (start.getMinutes() / 60 * 96);
                const duration = event.endTime ? (end.getTime() - start.getTime()) / (1000 * 60 * 60) : 1;
                const height = Math.max(duration * 96, 40);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedEvent(event);
                      setIsDetailOpen(true);
                    }}
                    className={cn(
                      "absolute left-4 right-4 rounded-xl p-4 text-xs font-bold border cursor-pointer hover:brightness-110 transition-all z-0 shadow-lg",
                      event.type === 'booking' ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    )}
                    style={{ top: `${top}px`, height: `${height}px` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{event.title}</span>
                      <span className="opacity-60 font-normal">{format(start, 'h:mm a')} - {event.endTime ? format(end, 'h:mm a') : 'Point in time'}</span>
                    </div>
                    {height > 80 && (
                      <div className="mt-2 text-zinc-400 font-normal line-clamp-2">
                        {event.description || 'No description provided.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Operational Calendar</h1>
          <p className="text-zinc-500 mt-1">Unified view of facility bookings and maintenance schedules.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800 mr-2">
            <Button variant="ghost" size="sm" onClick={prev} className="h-8 w-8 p-0 text-zinc-400"><ChevronLeft size={16} /></Button>
            <Button variant="ghost" size="sm" onClick={today} className="h-8 px-3 text-xs font-bold text-zinc-300">Today</Button>
            <Button variant="ghost" size="sm" onClick={next} className="h-8 w-8 p-0 text-zinc-400"><ChevronRight size={16} /></Button>
          </div>
          
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
            <TabsList className="bg-transparent h-8">
              <TabsTrigger value="month" className="h-6 text-[10px] uppercase font-bold">Month</TabsTrigger>
              <TabsTrigger value="week" className="h-6 text-[10px] uppercase font-bold">Week</TabsTrigger>
              <TabsTrigger value="day" className="h-6 text-[10px] uppercase font-bold">Day</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 h-10">
            <Plus size={18} />
            New Event
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-400 text-sm mr-4">
          <Filter size={16} />
          <span className="font-medium">Filters:</span>
        </div>
        
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 bg-zinc-950 border-zinc-800 h-9 text-zinc-300">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="booking">Bookings</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>

        <Select value={facilityFilter} onValueChange={setFacilityFilter}>
          <SelectTrigger className="w-48 bg-zinc-950 border-zinc-800 h-9 text-zinc-300">
            <SelectValue placeholder="Facility" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
            <SelectItem value="all">All Facilities</SelectItem>
            {facilities.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-48 bg-zinc-950 border-zinc-800 h-9 text-zinc-300">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="text-xs text-zinc-500">Bookings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500"></div>
            <span className="text-xs text-zinc-500">Maintenance</span>
          </div>
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden shadow-2xl">
        <CardHeader className="border-b border-zinc-800 bg-zinc-950/50 py-4 px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : viewMode === 'week' ? "'Week of' MMMM d, yyyy" : 'MMMM d, yyyy')}
            </h2>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {viewMode === 'month' && (
            <>
              <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/50">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="py-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-r border-zinc-800 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              {renderMonth()}
            </>
          )}
          {viewMode === 'week' && renderWeek()}
          {viewMode === 'day' && renderDay()}
        </CardContent>
      </Card>

      {/* Event Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200 sm:max-w-[500px]">
          {selectedEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Badge className={cn(
                    "text-[10px] uppercase font-bold",
                    selectedEvent.type === 'booking' ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                  )}>
                    {selectedEvent.type}
                  </Badge>
                  <span className="text-zinc-500 text-xs">#{selectedEvent.id}</span>
                </div>
                <DialogTitle className="text-2xl font-bold text-white">{selectedEvent.title}</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  {selectedEvent.type === 'booking' ? 'Facility Reservation' : 'Maintenance Ticket'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-zinc-500">Date</Label>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <CalendarIcon size={14} className="text-zinc-500" />
                      <span className="text-sm">{format(parseISO(selectedEvent.startTime || selectedEvent.createdAt), 'MMMM d, yyyy')}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-zinc-500">Time</Label>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Clock size={14} className="text-zinc-500" />
                      <span className="text-sm">
                        {format(parseISO(selectedEvent.startTime || selectedEvent.createdAt), 'h:mm a')}
                        {selectedEvent.endTime && ` - ${format(parseISO(selectedEvent.endTime), 'h:mm a')}`}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedEvent.type === 'booking' && (
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-zinc-500">Facility</Label>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Building2 size={14} className="text-zinc-500" />
                      <span className="text-sm">{facilities.find(f => f.id === selectedEvent.facilityId)?.name || 'Unknown Facility'}</span>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-zinc-500">Status</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-[10px] uppercase font-bold",
                      selectedEvent.status === 'approved' || selectedEvent.status === 'resolved' ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" :
                      selectedEvent.status === 'pending' || selectedEvent.status === 'open' ? "text-amber-500 border-amber-500/20 bg-amber-500/5" :
                      "text-rose-500 border-rose-500/20 bg-rose-500/5"
                    )}>
                      {selectedEvent.status}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-zinc-500">Reported/Booked By</Label>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <User size={14} className="text-zinc-500" />
                    <span className="text-sm">{selectedEvent.bookedBy || selectedEvent.reportedBy || 'Unknown'}</span>
                  </div>
                </div>

                {selectedEvent.description && (
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-zinc-500">Description</Label>
                    <p className="text-sm text-zinc-400 bg-zinc-950 p-3 rounded-lg border border-zinc-800 leading-relaxed">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="bg-zinc-800 border-zinc-700">Close</Button>
                {selectedEvent.type === 'booking' && selectedEvent.status === 'pending' && (
                  <Button onClick={() => {
                    updateBooking(selectedEvent.id, { status: 'approved' });
                    toast.success("Booking approved");
                    setIsDetailOpen(false);
                  }} className="bg-emerald-600 hover:bg-emerald-700">Approve Booking</Button>
                )}
                {selectedEvent.type === 'maintenance' && selectedEvent.status !== 'resolved' && (
                  <Button onClick={() => {
                    updateTicket(selectedEvent.id, { status: 'resolved' });
                    toast.success("Ticket resolved");
                    setIsDetailOpen(false);
                  }} className="bg-emerald-600 hover:bg-emerald-700">Resolve Ticket</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
